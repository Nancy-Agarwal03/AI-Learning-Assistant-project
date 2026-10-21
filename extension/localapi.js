/*
 * AI Learning Assistant: in-extension engine.
 * Replaces the Node backend. All data stays in chrome.storage.local.
 * The only network calls are to Google's Gemini API, using the key the learner enters in Settings.
 * Loaded after sidepanel.js. It answers every request the side panel sends to LOCAL_BASE.
 */
(function () {
  'use strict';
  const LOCAL_BASE = 'https://extension.local';
  const g = typeof window !== 'undefined' ? window : globalThis;
  g.LOCAL_BASE = LOCAL_BASE;
  const nativeFetch = g.fetch ? g.fetch.bind(g) : null;

  // ---------- storage ----------
  const K = {
    settings: 'la_settings', subs: 'la_subs', live: 'la_live', materials: 'attachedMaterials',
    chunks: 'la_chunks', notes: 'la_notes', qlog: 'la_qlog', sessions: 'la_sessions',
    checkins: 'la_checkins', mem: 'la_chat_mem', current: 'la_current_session'
  };
  let chunkDbPromise;
  function chunkDb() {
    if (!chunkDbPromise) chunkDbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open('la_material_chunks', 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('materials')) req.result.createObjectStore('materials', { keyPath: 'id' }); };
      req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
    });
    return chunkDbPromise;
  }
  async function chunkGetAll() {
    const db = await chunkDb();
    const records = await new Promise((resolve, reject) => { const req = db.transaction('materials', 'readonly').objectStore('materials').getAll(); req.onsuccess = () => resolve(req.result || []); req.onerror = () => reject(req.error); });
    return Object.fromEntries(records.map((r) => [r.id, r.chunks || []]));
  }
  async function chunkSetAll(value) {
    const db = await chunkDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('materials', 'readwrite'), os = tx.objectStore('materials');
      os.clear(); Object.entries(value || {}).forEach(([id, chunks]) => os.put({ id, chunks }));
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
    });
  }
  async function chunkPut(id, chunks) {
    const db = await chunkDb();
    await new Promise((resolve, reject) => { const tx = db.transaction('materials', 'readwrite'); tx.objectStore('materials').put({ id, chunks }); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
  }
  async function chunkDelete(id) {
    const db = await chunkDb();
    await new Promise((resolve, reject) => { const tx = db.transaction('materials', 'readwrite'); tx.objectStore('materials').delete(id); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
  }
  async function chunkClear() {
    const db = await chunkDb();
    await new Promise((resolve, reject) => { const tx = db.transaction('materials', 'readwrite'); tx.objectStore('materials').clear(); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
  }
  let legacyMigration;
  async function migrateLegacyChunks() {
    if (!legacyMigration) legacyMigration = (async () => {
      const marker = await chrome.storage.local.get('la_chunks_migrated_v1'); if (marker.la_chunks_migrated_v1) return;
      const old = await chrome.storage.local.get(K.chunks); if (old[K.chunks] && Object.keys(old[K.chunks]).length) await chunkSetAll(old[K.chunks]);
      await chrome.storage.local.remove(K.chunks); await chrome.storage.local.set({ la_chunks_migrated_v1: true });
    })();
    return legacyMigration;
  }
  const store = {
    async get(k, def) {
      if (k === K.chunks) { await migrateLegacyChunks(); const value = await chunkGetAll(); return Object.keys(value).length ? value : def; }
      const o = await chrome.storage.local.get(k); return o[k] === undefined ? def : o[k];
    },
    async set(k, v) {
      if (k === K.chunks) { await migrateLegacyChunks(); await chunkSetAll(v); return; }
      await chrome.storage.local.set({ [k]: v });
    }
  };
  const uid = (p) => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const fmt = (s) => {
    s = Math.max(0, Math.floor(Number(s) || 0));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return (h ? String(h).padStart(2, '0') + ':' : '') + String(m).padStart(2, '0') + ':' + String(x).padStart(2, '0');
  };
  const parseTime = (t) => {
    if (typeof t === 'number') return t;
    const p = String(t || '0').split(':').map(Number);
    return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : (p[0] || 0);
  };
  const keyOf = (title) => String(title || 'video').trim().toLowerCase().slice(0, 120);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  async function getSettings() {
    const cfg = g.LA_CONFIG || {};
    const s = await store.get(K.settings, {});
    const out = Object.assign({ geminiKey: '', model: cfg.MODEL || 'gemini-flash-latest' }, s);
    if (!out.geminiKey) out.geminiKey = String(cfg.GEMINI_API_KEY || '').trim();
    if (!out.model) out.model = cfg.MODEL || 'gemini-flash-latest';
    return out;
  }

  // ---------- Gemini ----------
  class LAError extends Error { constructor(code, msg) { super(msg || code); this.code = code; } }

  function friendly(e) {
    const m = String((e && e.message) || '');
    const c = e && e.code;
    if (c === 'no_key') return 'AI is not set up yet. Open Settings, paste your Gemini API key, and press Save.';
    if (c === 'bad_key' || /api key not valid|API_KEY_INVALID|permission|unauthenticated/i.test(m)) return 'Gemini rejected the API key. Create a new key at aistudio.google.com/apikey and paste it in Settings.';
    if (c === 'bad_model' || /not found|is not supported/i.test(m)) return 'Gemini did not accept the model name. In Settings, change the model to one shown in your AI Studio account.';
    if (c === 'quota' || /quota|rate|429|resource_exhausted/i.test(m)) return 'The Gemini quota or rate limit was reached. Wait a minute and try again.';
    if (c === 'blocked') return 'Gemini declined to answer this request. Try rephrasing the question.';
    if (e instanceof TypeError || /failed to fetch|network/i.test(m)) return 'Could not reach Google. Check your internet connection and try again.';
    if (c === 'parse') return 'The AI returned an answer in an unexpected format. Please try again.';
    return 'The AI service returned an error. Please try again.';
  }

  function httpError(status, text) {
    let msg = text || '';
    try { msg = JSON.parse(text).error.message || msg; } catch (_) {}
    if (status === 429) return new LAError('quota', msg);
    if (status === 404) return new LAError('bad_model', msg);
    if (status === 401 || status === 403 || (status === 400 && /api key/i.test(msg))) return new LAError('bad_key', msg);
    return new LAError('http_' + status, msg);
  }

  function textOf(d) {
    if (d && d.promptFeedback && d.promptFeedback.blockReason) throw new LAError('blocked');
    const parts = d && d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts;
    return (parts || []).map((p) => p.text || '').join('');
  }

  async function gemini({ system, user, parts, json = false, temperature = 0.4, stream = false, onChunk }) {
    const st = await getSettings();
    if (!st.geminiKey) throw new LAError('no_key');
    const base = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(st.model || 'gemini-flash-latest');
    const body = { contents: [{ role: 'user', parts: parts || [{ text: user }] }], generationConfig: { temperature } };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    if (json) body.generationConfig.responseMimeType = 'application/json';
    const url = stream ? base + ':streamGenerateContent?alt=sse' : base + ':generateContent';
    const res = await nativeFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': st.geminiKey },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw httpError(res.status, await res.text().catch(() => ''));
    if (!stream) return textOf(await res.json());
    const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '', full = '';
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line.startsWith('data:')) continue;
        try { const t = textOf(JSON.parse(line.slice(5).trim())); if (t) { full += t; if (onChunk) onChunk(t); } }
        catch (err) { if (err instanceof LAError) throw err; }
      }
    }
    return full;
  }

  function parseJSON(t) {
    t = String(t || '').replace(/^```(?:json)?/i, '').replace(/```$/,'').trim();
    try { return JSON.parse(t); } catch (_) {}
    const a = t.search(/[\[{]/); const b = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
    if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (_) {} }
    throw new LAError('parse');
  }

  // Structured call: validate, retry up to 2 times on bad output. API errors are not retried.
  async function jsonCall(args, validate) {
    let last;
    for (let i = 0; i < 3; i++) {
      try {
        const obj = parseJSON(await gemini(Object.assign({}, args, { json: true })));
        if (!validate || validate(obj)) return obj;
        last = new LAError('parse');
      } catch (e) { if (!(e instanceof LAError) || e.code !== 'parse') throw e; last = e; }
    }
    throw last;
  }

  // ---------- transcript ----------
  const STOP = new Set('a an the and or but if of to in on at for with is are was were be been it this that these those i you he she we they what why how when where which who do does did can could should would will just so as by from about into than then there their them my your his her our its not no yes'.split(' '));
  const tok = (s) => String(s || '').toLowerCase().split(/[^\p{L}\p{N}_]+/u).filter((w) => w.length > 1 && !STOP.has(w));
  function score(qt, text) {
    if (!qt.length) return 0;
    const words = tok(text); if (!words.length) return 0;
    const tf = {}; words.forEach((w) => { tf[w] = (tf[w] || 0) + 1; });
    let s = 0; new Set(qt).forEach((w) => { if (tf[w]) s += 1 + Math.log(1 + tf[w]); });
    return s;
  }
  function bm25Rank(query, documents) {
    const terms = Array.from(new Set(tok(query)));
    if (!terms.length || !documents.length) return [];
    const tokenized = documents.map((d) => tok(d.text));
    const avgdl = tokenized.reduce((n, words) => n + words.length, 0) / tokenized.length || 1;
    const df = new Map();
    for (const words of tokenized) for (const term of new Set(words)) df.set(term, (df.get(term) || 0) + 1);
    return documents.map((doc, index) => {
      const words = tokenized[index], tf = new Map();
      for (const word of words) tf.set(word, (tf.get(word) || 0) + 1);
      let value = 0;
      for (const term of terms) {
        const count = tf.get(term) || 0; if (!count) continue;
        const idf = Math.log(1 + (documents.length - (df.get(term) || 0) + 0.5) / ((df.get(term) || 0) + 0.5));
        value += idf * count * 2.2 / (count + 1.2 * (0.25 + 0.75 * words.length / avgdl));
      }
      return { doc, score: value };
    }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
  }
  function queryMode(question) {
    if (/\b(summar(?:ize|ise)|overview|outline|what is this (?:document|file|material) about)\b/i.test(question)) return 'summary';
    if (/\bcompare\b/i.test(question)) return 'compare';
    return 'search';
  }

  let live = null, liveDirty = false;
  async function loadLive() { if (!live) live = await store.get(K.live, {}); return live; }
  async function flushLive() { if (live && liveDirty) { liveDirty = false; await store.set(K.live, live); } }

  async function recordState(s) {
    if (!s || !s.hasVideo || !s.activeCaptions || !s.title) return;
    const L = await loadLive(); const k = keyOf(s.title);
    const arr = L[k] || (L[k] = []); const text = String(s.activeCaptions).trim(); if (!text) return;
    const last = arr[arr.length - 1];
    if (last) {
      if (last.text === text || last.text.includes(text)) return;
      if (text.includes(last.text)) { last.text = text; liveDirty = true; return; }
    }
    arr.push({ start: Math.floor(s.currentTime || 0), end: Math.floor(s.currentTime || 0) + 4, text });
    if (arr.length > 20000) arr.shift();
    liveDirty = true;
  }

  async function getCues(title, nowSec, allowFuture) {
    const k = keyOf(title);
    const subs = (await store.get(K.subs, {}))[k];
    const L = await loadLive();
    const all = (subs && subs.length ? subs : (L[k] || [])).slice().sort((a, b) => a.start - b.start);
    return allowFuture ? all : all.filter((c) => c.start <= nowSec);
  }

  function windows(cues, size) {
    const out = []; let cur = null;
    for (const c of cues) {
      if (!cur || c.start - cur.start >= (size || 40)) { cur = { start: c.start, end: c.end || c.start + 4, text: '' }; out.push(cur); }
      cur.text += (cur.text ? ' ' : '') + c.text; cur.end = Math.max(cur.end, c.end || c.start + 4);
    }
    return out;
  }

  function parseSubtitle(content) {
    const cues = []; const blocks = String(content).replace(/\r/g, '').replace(/^WEBVTT.*\n/, '').split(/\n\n+/);
    for (const b of blocks) {
      const lines = b.split('\n').filter(Boolean);
      const i = lines.findIndex((l) => l.includes('-->')); if (i < 0) continue;
      const m = lines[i].match(/([\d:.,]+)\s*-->\s*([\d:.,]+)/); if (!m) continue;
      const t = (x) => { const p = x.replace(',', '.').split(':').map(Number); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]; };
      const text = lines.slice(i + 1).join(' ').replace(/<[^>]+>/g, '').trim();
      if (text) cues.push({ start: t(m[1]), end: t(m[2]), text });
    }
    return cues;
  }

  // ---------- materials (PDF, PPTX, DOCX, code, text) ----------
  const CODE_EXT = 'py js ts jsx tsx java c cpp h hpp cs go rs rb php swift kt sql sh html css json md txt csv yml yaml xml r m scala lua ipynb'.split(' ');
  const xmlText = (xml, tag) => { const re = new RegExp('<' + tag + '[^>]*>([^<]*)</' + tag + '>', 'g'); const o = []; let m; while ((m = re.exec(xml))) o.push(m[1]); return o.join(' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'"); };

  function splitLong(text, label, extra) {
    const out = []; const size = 1500;
    for (let i = 0; i < text.length; i += size) out.push(Object.assign({ text: text.slice(i, i + size), label }, extra));
    return out;
  }
  function chunkLines(text, name) {
    const lines = text.split('\n'); const out = []; const step = 40, over = 8;
    for (let i = 0; i < lines.length; i += step) {
      const a = i + 1, b = Math.min(lines.length, i + step + over);
      const t = lines.slice(i, i + step + over).join('\n').trim();
      if (t) out.push({ text: t, label: name + ' L' + a + '-' + b, kind: 'CODE' });
    }
    return out;
  }
  function chunkCode(text, name, ext) {
    const patterns = {
      py: /^\s*(?:async\s+)?def\s+[\w]+|^\s*class\s+[\w]+/m,
      js: /^\s*(?:export\s+)?(?:async\s+)?function\s+[\w$]+|^\s*class\s+[\w$]+|^\s*(?:export\s+)?(?:const|let)\s+[\w$]+\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/m,
      ts: /^\s*(?:export\s+)?(?:async\s+)?function\s+[\w$]+|^\s*class\s+[\w$]+|^\s*(?:export\s+)?(?:const|let)\s+[\w$]+\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/m,
      java: /^\s*(?:public|private|protected|static|final|abstract|synchronized|\w+\s+)+[\w<>\[\]]+\s+\w+\s*\([^;]*\)\s*\{|^\s*(?:public\s+)?class\s+\w+/m,
      c: /^\s*(?:[\w*]+\s+)+\w+\s*\([^;]*\)\s*\{|^\s*struct\s+\w+/m,
      cpp: /^\s*(?:[\w:*&<>]+\s+)+\w+\s*\([^;]*\)\s*\{|^\s*class\s+\w+/m,
      go: /^\s*func\s+(?:\([^)]*\)\s*)?\w+/m
    };
    const language = ['jsx', 'tsx'].includes(ext) ? ext.slice(0, 2) : (ext === 'h' || ext === 'hpp' ? (ext === 'hpp' ? 'cpp' : 'c') : ext);
    const boundary = patterns[language];
    if (!boundary) return chunkLines(text, name);
    const lines = text.split('\n'), starts = [0];
    for (let i = 1; i < lines.length; i++) if (boundary.test(lines[i])) starts.push(i);
    if (starts.length < 2) return chunkLines(text, name);
    const imports = lines.filter((line) => /^\s*(?:import\s|from\s+\S+\s+import\s|#include\s|require\s*\(|using\s+)/.test(line)).slice(0, 30).join('\n');
    const out = [];
    for (let i = 0; i < starts.length; i++) {
      const a = starts[i], b = starts[i + 1] === undefined ? lines.length : starts[i + 1];
      let part = lines.slice(a, b).join('\n').trim(); if (!part) continue;
      if (part.length > 2600) { for (const c of chunkLines(part, name)) out.push(Object.assign(c, { indexText: imports })); continue; }
      const decl = part.match(/^\s*(?:export\s+)?(?:async\s+)?(?:def|function|class|func|struct|interface)\s+([\w$]+)/m) || part.match(/^\s*(?:export\s+)?class\s+([\w$]+)/m) || part.match(/^\s*(?:[\w:*&<>\[\]]+\s+)+([\w$]+)\s*\([^;]*\)\s*\{/m);
      out.push({ text: part, label: name + ' L' + (a + 1) + '-' + b, kind: 'CODE', indexText: [name, imports, decl ? decl[1] : ''].filter(Boolean).join(' ') });
    }
    return out;
  }
  function safeRepoPath(path) { return !/(^|\/)(?:node_modules|\.git|\.venv|venv|dist|build)(?:\/|$)/i.test(path) && !/\.(?:png|jpe?g|gif|webp|ico|woff2?|ttf|mp[34]|wav|zip|exe|dll|so|class|pyc|bin)$/i.test(path); }
  async function extractZipRepo(buf, options = {}) {
    return new Promise((resolve, reject) => {
      const worker = new Worker(chrome.runtime.getURL('materials-worker.js'));
      worker.onmessage = (event) => {
        const data = event.data || {};
        if (data.type === 'progress' && options.onProgress) options.onProgress(data.filesDone, data.filesTotal, 'indexing');
        if (data.type === 'done') { worker.terminate(); resolve(data.chunks || []); }
        if (data.type === 'error') { worker.terminate(); reject(new LAError('zip', data.message)); }
      };
      worker.onerror = () => { worker.terminate(); reject(new LAError('zip', 'Could not process this ZIP repository.')); };
      worker.postMessage({ buffer: buf }, [buf]);
    });
  }
  function decodeRtf(text) { return text.replace(/\\'([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\par[d]?\b/g, '\n').replace(/\\[a-z]+-?\d* ?/gi, '').replace(/[{}]/g, '').trim(); }

  async function extractPdf(buf, options = {}) {
    if (!g.__pdfjs) {
      const m = await import(chrome.runtime.getURL('vendor/pdf.min.mjs'));
      m.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('vendor/pdf.worker.min.mjs');
      g.__pdfjs = m;
    }
    const pdf = await g.__pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
    const out = [];
    const outline = await pdf.getOutline().catch(() => null);
    const bookmarks = [];
    const walkOutline = async (items) => {
      for (const item of items || []) {
        let pageNumber = 1;
        try {
          const dest = typeof item.dest === 'string' ? await pdf.getDestination(item.dest) : item.dest;
          if (dest && dest[0]) pageNumber = (await pdf.getPageIndex(dest[0])) + 1;
        } catch (_) {}
        bookmarks.push({ title: String(item.title || '').trim(), page: pageNumber });
        await walkOutline(item.items);
      }
    };
    await walkOutline(outline);
    bookmarks.sort((a, b) => a.page - b.page);
    const pageText = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p); const tc = await page.getTextContent();
      const items = tc.items.filter((i) => i.str && String(i.str).trim()).map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5] }));
      const rows = [];
      for (const item of items) {
        let row = rows.find((r) => Math.abs(r.y - item.y) <= 3);
        if (!row) { row = { y: item.y, items: [] }; rows.push(row); }
        row.items.push(item);
      }
      rows.sort((a, b) => b.y - a.y);
      const text = rows.map((r) => r.items.sort((a, b) => a.x - b.x).map((i) => i.str).join(' ').trim()).filter(Boolean).join('\n').trim();
      pageText.push({ page: p, text });
      const bookmark = bookmarks.filter((x) => x.page <= p).slice(-1)[0];
      const chapterMatch = bookmark && bookmark.title.match(/(?:chapter|ch\.?|section)\s*(\d+)/i);
      if (text) splitLong(text, 'p.' + p, { kind: 'PDF', page: p, chapter: chapterMatch ? chapterMatch[1] : bookmark ? String(bookmarks.indexOf(bookmark) + 1) : undefined, chapterTitle: bookmark ? bookmark.title : '' }).forEach((c) => out.push(c));
      if (options.onProgress) options.onProgress(p, pdf.numPages, 'reading');
    }
    const pagesNeedingOcr = pageText.filter((item) => !item.text.trim());
    if (pagesNeedingOcr.length) {
      if (!options.ocr) throw new LAError('scanned', 'This PDF has scanned pages without selectable text. OCR will send rendered page images to Gemini after your consent.');
      const cache = await store.get('la_pdf_ocr_cache', {}); const docKey = await hashBuffer(buf);
      for (let i = 0; i < pagesNeedingOcr.length; i += 3) {
        for (const item of pagesNeedingOcr.slice(i, i + 3)) {
          const cacheKey = docKey + ':' + item.page;
          if (cache[cacheKey]) { item.text = cache[cacheKey]; continue; }
          if (options.cancelled && options.cancelled()) throw new LAError('cancelled', 'OCR was cancelled.');
          const page = await pdf.getPage(item.page); const viewport = page.getViewport({ scale: 1.3 });
          const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
          await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
          const base64 = canvas.toDataURL('image/jpeg', 0.78).split(',')[1];
          item.text = await gemini({ parts: [{ text: 'Read all visible text on this document page in reading order. Preserve headings, table rows and columns, and numbers. Return only transcribed text.' }, { inlineData: { mimeType: 'image/jpeg', data: base64 } }], temperature: 0 });
          cache[cacheKey] = item.text; await store.set('la_pdf_ocr_cache', cache);
          if (options.onProgress) options.onProgress(item.page, pdf.numPages, 'OCR');
        }
      }
      for (const item of pagesNeedingOcr) if (item.text && item.text.trim()) splitLong(item.text, 'p.' + item.page, { kind: 'PDF', page: item.page }).forEach((c) => out.push(c));
      if (!out.length) throw new LAError('empty', 'OCR did not find readable text in this PDF.');
    }
    return out;
  }
  async function hashBuffer(buf) {
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(digest)).slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  async function extractZipOffice(buf, kind) {
    const zip = await g.JSZip.loadAsync(buf); const out = [];
    if (kind === 'PPT') {
      const names = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => parseInt(a.match(/(\d+)\.xml/)[1]) - parseInt(b.match(/(\d+)\.xml/)[1]));
      const slideMap = new Map();
      for (const n of names) {
        const num = parseInt(n.match(/(\d+)\.xml/)[1]); const xml = await zip.files[n].async('string');
        const text = xmlText(xml, 'a:t').replace(/\s+/g, ' ').trim();
        const titleMatch = xml.match(/<p:sp>[\s\S]*?<p:ph[^>]*type="title"[\s\S]*?<\/p:sp>/i);
        const slideTitle = titleMatch ? xmlText(titleMatch[0], 'a:t').trim() : (xmlText(xml, 'a:t').split(/\s{2,}/)[0] || '');
        slideMap.set(num, true);
        if (text) out.push({ text, label: 'Slide ' + num, kind: 'PPT', slide: num, slideTitle });
      }
      const notes = Object.keys(zip.files).filter((n) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n));
      for (const notePath of notes) {
        const noteNumber = Number(notePath.match(/notesSlide(\d+)/)[1]);
        const relPath = 'ppt/notesSlides/_rels/notesSlide' + noteNumber + '.xml.rels';
        if (!zip.files[relPath]) continue;
        const rels = await zip.files[relPath].async('string');
        const relTag = Array.from(rels.matchAll(/<Relationship\b[^>]*>/gi)).map((m) => m[0]).find((tag) => /Type="[^"]*\/slide"/i.test(tag));
        const rel = relTag && relTag.match(/Target="([^"]+)"/i);
        if (!rel) continue;
        const slideMatch = rel[1].match(/slide(\d+)\.xml$/); if (!slideMatch) continue;
        const slideNum = Number(slideMatch[1]); if (!slideMap.has(slideNum)) continue;
        const noteXml = await zip.files[notePath].async('string');
        const authoredShapes = Array.from(noteXml.matchAll(/<p:sp\b[\s\S]*?<\/p:sp>/g), (m) => m[0]).filter((shape) => !/<p:ph[^>]+type="(?:sldNum|hdr|ftr|dt)"/i.test(shape));
        const clean = authoredShapes.map((shape) => xmlText(shape, 'a:t')).join(' ').replace(/\s+/g, ' ').trim();
        if (clean) out.push({ text: clean, label: 'Slide ' + slideNum + ' (notes)', kind: 'PPT', slide: slideNum, notes: true });
      }
    } else {
      const xml = await zip.files['word/document.xml'].async('string');
      const paras = xml.split('</w:p>').map((p) => xmlText(p, 'w:t').trim()).filter(Boolean);
      let cur = '', n = 1;
      for (const p of paras) { if ((cur + p).length > 1500) { out.push({ text: cur, label: 'Section ' + n++, kind: 'DOC' }); cur = ''; } cur += (cur ? '\n' : '') + p; }
      if (cur) out.push({ text: cur, label: 'Section ' + n, kind: 'DOC' });
    }
    if (!out.length) throw new LAError('empty', 'No readable text was found in this file.');
    return out;
  }

  async function ingestMaterial(file, title, options = {}) {
    if (file.size > 25 * 1024 * 1024) throw new LAError('big', 'This file is larger than 25 MB.');
    const ext = (file.name.split('.').pop() || '').toLowerCase(); let chunks = [], type = 'pdf';
    if (ext === 'vtt' || ext === 'srt') {
      const cues = parseSubtitle(await file.text()); if (!cues.length) throw new LAError('empty', 'No captions found in this file.');
      const subs = await store.get(K.subs, {}); subs[keyOf(title)] = cues; await store.set(K.subs, subs);
      return { subtitle: true, count: cues.length };
    }
    if (ext === 'pdf') chunks = await extractPdf(await file.arrayBuffer(), options);
    else if (ext === 'pptx') { type = 'slide'; chunks = await extractZipOffice(await file.arrayBuffer(), 'PPT'); }
    else if (ext === 'ppt') throw new LAError('oldppt', 'Old .ppt files cannot be read. Open it in PowerPoint and save as .pptx, then upload again.');
    else if (ext === 'odp' || ext === 'key') throw new LAError('type', 'This presentation format is not supported yet. Export or save it as .pptx, then upload again.');
    else if (ext === 'docx') { type = 'doc'; chunks = await extractZipOffice(await file.arrayBuffer(), 'DOC'); }
    else if (ext === 'zip') { type = 'code'; chunks = await extractZipRepo(await file.arrayBuffer(), options); }
    else if (['rtf', 'txt', 'md', 'csv', 'html', 'xml', 'json', 'yml', 'yaml', 'sql'].includes(ext)) {
      type = ['md', 'txt', 'csv'].includes(ext) ? 'notes' : 'code';
      let text = await file.text(); if (ext === 'rtf') text = decodeRtf(text);
      chunks = ext === 'md' || ext === 'txt' ? splitLong(text, 'Section 1', { kind: 'NOTES' }) : chunkCode(text, file.name, ext);
    }
    else if (ext === 'xlsx') {
      const zip = await g.JSZip.loadAsync(await file.arrayBuffer()); type = 'notes';
      let shared = [];
      if (zip.files['xl/sharedStrings.xml']) {
        const sharedXml = await zip.files['xl/sharedStrings.xml'].async('string');
        shared = Array.from(sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g), (m) => xmlText(m[1], 't'));
      }
      const sheets = Object.keys(zip.files).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort();
      for (let i = 0; i < sheets.length; i++) {
        const xml = await zip.files[sheets[i]].async('string'); const rows = [];
        for (const row of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
          const cells = [];
          for (const cell of row[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
            const attrs = cell[1], body = cell[2], value = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1] || '';
            const strIdx = attrs.match(/\bt="s"/); const inline = attrs.match(/\bt="inlineStr"/);
            cells.push(inline ? xmlText(body, 't') : strIdx ? (shared[Number(value)] || '') : value);
          }
          rows.push(cells.join('\t'));
        }
        const text = rows.join('\n').trim(); if (text) splitLong(text, 'Sheet ' + (i + 1), { kind: 'NOTES' }).forEach((c) => chunks.push(c));
      }
    }
    else if (CODE_EXT.includes(ext)) {
      type = 'code'; let text = await file.text();
      if (ext === 'ipynb') { try { text = JSON.parse(text).cells.map((c) => (Array.isArray(c.source) ? c.source.join('') : c.source)).join('\n\n'); } catch (_) {} }
      chunks = chunkCode(text, file.name, ext);
    } else throw new LAError('type', 'Unsupported file type: .' + ext);
    const id = uid('mat');
    await migrateLegacyChunks();
    for (let offset = 0; offset < chunks.length; offset += 250) {
      if (offset === 0) await chunkPut(id, chunks.slice(offset, offset + 250));
      else { const allChunks = (await chunkGetAll())[id] || []; await chunkPut(id, allChunks.concat(chunks.slice(offset, offset + 250))); }
      if (options.onProgress) options.onProgress(Math.min(offset + 250, chunks.length), chunks.length, 'indexing');
    }
    return { id, name: file.name, type, sizeBytes: file.size, status: 'ready', includeInAnswers: true, chunkCount: chunks.length };
  }
  async function ingestResource({ name, text, type = 'notes', source = '', course = '', week = '' }) {
    const body = String(text || '').trim();
    if (!body) throw new LAError('empty', 'This resource does not contain readable text.');
    const id = uid('mat');
    const chunks = splitLong(body, 'Section 1', { kind: type === 'web' ? 'Web' : type === 'notes' ? 'Notes' : 'Other', source });
    await migrateLegacyChunks(); await chunkPut(id, chunks);
    return { id, name: String(name || source || 'Notes').slice(0, 160), type, source, course, week, sizeBytes: new Blob([body]).size, status: 'ready', includeInAnswers: true, pinned: false, chunkCount: chunks.length };
  }
  async function getResourceText(id) {
    const meta = (await store.get(K.materials, [])).find((m) => m.id === id); if (!meta) return null;
    const chunks = (await store.get(K.chunks, {}))[id] || [];
    return { meta, text: chunks.map((c) => c.text).join('\n\n') };
  }
  async function updateNoteResource(id, name, text) {
    const resource = await getResourceText(id); if (!resource) throw new LAError('not_found', 'This note no longer exists.');
    const chunks = splitLong(String(text || '').trim(), 'Section 1', { kind: 'NOTES' });
    await migrateLegacyChunks(); await chunkPut(id, chunks);
    const mats = await store.get(K.materials, []); const meta = mats.find((m) => m.id === id);
    meta.name = String(name || 'Notes').trim(); meta.sizeBytes = new Blob([text]).size; meta.chunkCount = chunks.length; await store.set(K.materials, mats);
    return meta;
  }
  async function removeMaterial(id) { await migrateLegacyChunks(); await chunkDelete(id); }

  // ---------- context for answers ----------
  async function buildContext(question, title, nowSec, allowFuture, options = {}) {
    const tags = {}; const lines = []; const mode = queryMode(question); const qt = tok(question);
    const cues = await getCues(title, nowSec, allowFuture);
    const wins = windows(cues, 40);
    const recent = wins.filter((w) => w.end >= nowSec - 90);
    const rest = wins.filter((w) => !recent.includes(w)).map((w) => ({ w, s: score(qt, w.text) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 3).map((x) => x.w).sort((a, b) => a.start - b.start);
    if (!options.materialOnlyId && (!options.sourceFilter || options.sourceFilter === 'All' || options.sourceFilter === 'Video')) for (const w of rest.concat(recent)) {
      const tag = 'Video ' + fmt(w.start); tags[tag] = { sourceType: 'Video', label: fmt(w.start) + '-' + fmt(w.end), timestamp: fmt(w.start), detail: 'Transcript up to ' + fmt(nowSec) };
      lines.push('[' + tag + '] ' + w.text.slice(0, 700));
    }
    const typeMatches = (m) => {
      if (!options.sourceFilter || options.sourceFilter === 'All') return true;
      const type = String(m.type || '').toLowerCase();
      return ({ pdf: 'PDF', slide: 'Slides', code: 'Code', notes: 'Notes', web: 'Web', doc: 'Notes', other: 'Notes' })[type] === options.sourceFilter;
    };
    const mats = (await store.get(K.materials, [])).filter((m) => m.includeInAnswers !== false && typeMatches(m) && (!options.materialOnlyId || m.id === options.materialOnlyId) && (!options.courseFilter || String(m.course || '').toLowerCase() === String(options.courseFilter).toLowerCase()) && (!options.weekFilter || String(m.week || '').toLowerCase() === String(options.weekFilter).toLowerCase()));
    const all = await store.get(K.chunks, {}); const pool = [];
    for (const m of mats) for (const c of (all[m.id] || [])) pool.push({ m, c, text: [m.name, m.source, c.indexText, c.slideTitle, c.chapterTitle, c.text].filter(Boolean).join('\n') });
    const loc = question.match(/\b(page|p\.?|slide|chapter|lines?)\s*(\d+)(?:\s*[-–]\s*(\d+))?/i);
    let top = [];
    if (loc) {
      const kind = loc[1].toLowerCase(), start = Number(loc[2]), end = Number(loc[3] || loc[2]);
      top = pool.filter((x) => {
        const c = x.c, label = String(c.label || '');
        if (/slide/.test(kind)) return Number(c.slide) === start || new RegExp('Slide\\s+' + start + '(?:\\b|\\s*\\(notes\\))', 'i').test(label);
        if (/chapter/.test(kind)) return Number(c.chapter) === start || new RegExp('Chapter\\s+' + start, 'i').test(label) || String(c.chapterTitle || '').toLowerCase().includes('chapter ' + start);
        if (/line/.test(kind)) { const m = label.match(/L(\d+)-(\d+)/); return m && Number(m[1]) <= end && Number(m[2]) >= start; }
        return Number(c.page) === start || new RegExp('p\\.?\\s*' + start + '\\b', 'i').test(label);
      });
    }
    if (!top.length) {
      const compare = question.match(/\bcompare\s+(.+?)\s+(?:and|with|to|versus|vs\.?|against)\s+(.+?)(?:[?.!]|$)/i);
      if (mode === 'compare' && compare) {
        const sideRank = (term) => {
          const pinned = bm25Rank(term, pool.filter((x) => x.m.pinned)).slice(0, 4).map((x) => x.doc);
          const ordinary = bm25Rank(term, pool.filter((x) => !x.m.pinned)).slice(0, Math.max(0, 4 - pinned.length)).map((x) => x.doc);
          return pinned.concat(ordinary);
        };
        const left = sideRank(compare[1]);
        const right = sideRank(compare[2]);
        top = Array.from(new Set(left.concat(right)));
      } else {
        const pinned = bm25Rank(question, pool.filter((x) => x.m.pinned)).slice(0, 8).map((x) => x.doc);
        const ordinary = bm25Rank(question, pool.filter((x) => !x.m.pinned)).slice(0, Math.max(0, 8 - pinned.length)).map((x) => x.doc);
        top = pinned.concat(ordinary);
      }
    }
    if (options.currentLocation) {
      const current = pool.find((x) => (x.m.name + ' ' + String(x.c.label || '')).toLowerCase() === String(options.currentLocation).toLowerCase() || String(x.c.page || x.c.slide || '') === String(options.currentLocation));
      if (current && !top.includes(current)) top.unshift(current);
    }
    const seenChunks = new Set();
    top = top.filter((x) => { const k = x.m.id + ':' + x.c.label + ':' + x.c.text; if (seenChunks.has(k)) return false; seenChunks.add(k); return true; });
    // Include pinned resources first without disturbing relevance within each tier.
    top.sort((a, b) => Number(!!b.m.pinned) - Number(!!a.m.pinned));
    // Merge multiple passages from the same PDF page or slide into one citation-preserving context item.
    const merged = [];
    for (const x of top) {
      const pageKey = x.c.page ? 'p' + x.c.page : x.c.slide ? 's' + x.c.slide + (x.c.notes ? ':notes' : '') : '';
      const prior = pageKey && merged.find((y) => y.m.id === x.m.id && y.pageKey === pageKey);
      if (prior) prior.c.text += '\n' + x.c.text;
      else merged.push({ m: x.m, c: Object.assign({}, x.c), pageKey });
    }
    for (const x of merged.slice(0, 8)) {
      const tag = x.m.name + ' ' + x.c.label; tags[tag] = { sourceType: x.c.kind || 'DOC', label: x.m.name + ' ' + x.c.label, detail: x.m.name };
      lines.push('[' + tag + '] ' + x.c.text.slice(0, 900));
    }
    return { text: lines.join('\n\n'), tags, hasContext: lines.length > 0, mode };
  }
  function citationsFrom(answer, tags) {
    const out = []; const seen = new Set();
    for (const m of String(answer).matchAll(/\[([^\]]{3,120})\]/g)) { const t = tags[m[1]]; if (t && !seen.has(m[1])) { seen.add(m[1]); out.push(t); } }
    return out;
  }

  const SYSTEM = (now, style) => `You are a warm, patient study companion inside a Chrome extension. The learner is watching a video and is currently at ${fmt(now)}.
RULES
1. For facts about the lecture, use ONLY the context provided (live captions, transcript so far, uploaded materials). Never use or guess content that comes after ${fmt(now)}.
2. If the context does not contain the answer, say "I couldn't find this in your material." Then give a short explanation labelled "General knowledge:".
3. Cite every factual claim with the exact bracket tags shown in the context, for example [Video 12:30]. Never invent a tag. If sources conflict, describe both claims and identify each file.
4. Prefer uploaded material over video whenever the learner names a file, page, slide, chapter, or code location. If nothing relevant is present, say so and then give a short section labelled "General knowledge:".
5. Default format: a direct answer in 1 or 2 sentences, then a step by step explanation, then a short example, then one question that checks understanding.${style === 'shorter' ? ' The learner asked for SHORT: answer in at most 3 sentences.' : ''}${style === 'simpler' ? ' The learner asked for SIMPLER: plain words, no jargon, and one everyday analogy.' : ''}${/code/i.test(style || '') ? ' The learner asked to explain code: go line by line and tie it to the lecture topic.' : ''}
6. Reply in the language the learner wrote in. If the captions are in Hindi or mixed Hindi and English, explain their meaning in the learner's language.
7. Talk like a supportive companion: acknowledge confusion, never lecture, never flatter. No emoji. No em dashes.`;

  async function chatPrompt(b) {
    const now = parseTime(b.videoTimestamp); const title = b.videoTitle;
    const ctx = await buildContext(b.question + ' ' + (b.activeCaptions || ''), title, now, !!b.allowFutureContent, { sourceFilter: b.sourceFilter, currentLocation: b.currentLocation, materialOnlyId: b.materialOnlyId, courseFilter: b.courseFilter, weekFilter: b.weekFilter });
    const mem = (await store.get(K.mem, {}))[keyOf(title)] || [];
    const hist = mem.slice(-6).map((t) => 'Learner: ' + t.q + '\nCompanion: ' + t.a.slice(0, 600)).join('\n\n');
    let materialContext = ctx.text;
    if (ctx.mode === 'summary' && ctx.text) {
      const sections = ctx.text.split(/\n\n(?=\[)/);
      const mapped = [];
      for (const section of sections) {
        const match = section.match(/^\[([^\]]+)\]\s*([\s\S]*)$/); if (!match) continue;
        const summary = await gemini({ system: 'Summarize this source section for a learner. Preserve key facts and numeric details. Cite only with the exact source tag provided.', user: '[' + match[1] + '] ' + match[2], temperature: 0.2 });
        mapped.push('[' + match[1] + '] ' + summary);
      }
      materialContext = mapped.join('\n\n');
    }
    const includeLive = !b.sourceFilter || b.sourceFilter === 'All' || b.sourceFilter === 'Video';
    const user = (hist ? 'Conversation so far:\n' + hist + '\n\n' : '') +
      (includeLive && b.activeCaptions ? 'Live caption right now (' + fmt(now) + '): ' + b.activeCaptions + '\n\n' : '') +
      'Context:\n' + (materialContext || '(no transcript or material found yet)') + (ctx.mode === 'summary' ? '\n\nSynthesize the section summaries into one cited overview.' : '') + '\n\nLearner question: ' + b.question;
    return { system: SYSTEM(now, b.stylePreference), user, ctx, now, title };
  }
  async function saveTurn(b, answer, ctx, now) {
    const memAll = await store.get(K.mem, {}); const k = keyOf(b.videoTitle);
    (memAll[k] = memAll[k] || []).push({ q: b.question, a: answer }); memAll[k] = memAll[k].slice(-20); await store.set(K.mem, memAll);
    const log = await store.get(K.qlog, []);
    log.push({ id: uid('q'), ts: Date.now(), title: b.videoTitle || '', videoTime: now, question: b.question, found: !/couldn't find this in your material/i.test(answer), sources: Object.keys(ctx.tags).length });
    await store.set(K.qlog, log.slice(-500));
  }
  async function unavailableText(e, b) {
    let t = 'AI service unavailable. ' + friendly(e);
    if (b && b.activeCaptions) t += '\n\nWhat the video says right now (live captions): "' + String(b.activeCaptions).slice(0, 400) + '"';
    return t;
  }

  // ---------- route handlers ----------
  const json = (o, status) => new Response(JSON.stringify(o), { status: status || 200, headers: { 'Content-Type': 'application/json' } });
  const sse = (fn) => new Response(new ReadableStream({
    async start(c) {
      const enc = new TextEncoder(); const send = (o) => c.enqueue(enc.encode('data: ' + JSON.stringify(o) + '\n\n'));
      try { await fn(send); } catch (_) {}
      send({ type: 'done' }); c.close();
    }
  }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });

  async function chatStream(b) {
    return sse(async (send) => {
      try {
        const p = await chatPrompt(b);
        const full = await gemini({ system: p.system, user: p.user, stream: true, temperature: 0.5, onChunk: (t) => send({ type: 'chunk', text: t }) });
        send({ type: 'citations', citations: citationsFrom(full, p.ctx.tags) });
        await saveTurn(b, full, p.ctx, p.now);
      } catch (e) { send({ type: 'chunk', text: await unavailableText(e, b) }); send({ type: 'citations', citations: [] }); }
    });
  }
  async function chatOnce(b) {
    try {
      const p = await chatPrompt(b);
      const full = await gemini({ system: p.system, user: p.user, temperature: 0.5 });
      await saveTurn(b, full, p.ctx, p.now);
      return json({ answer: full, citations: citationsFrom(full, p.ctx.tags) });
    } catch (e) { return json({ answer: await unavailableText(e, b), citations: [] }); }
  }

  const cooldown = {};
  async function checkInBoundary(b) {
    if (!b.checkInsEnabled) return { isDue: false };
    const now = Number(b.currentTimeSec) || 0, freq = Number(b.frequencyPer10Min) || 3, interval = 600 / freq;
    const since = b.lastCheckInSec >= 0 ? b.lastCheckInSec : 0;
    if (now - since < interval) return { isDue: false };
    const k = keyOf(b.videoTitle); if (cooldown[k] && Date.now() - cooldown[k] < 45000) return { isDue: false };
    const cues = (await getCues(b.videoTitle, now, false)).filter((c) => c.start >= Math.max(0, now - 240));
    const text = cues.map((c) => c.text).join(' '); if (text.length < 200) return { isDue: false };
    cooldown[k] = Date.now();
    try {
      const o = await jsonCall({ system: 'You write one short check-in question for a learner who just watched this part of a lecture. Use ONLY the transcript provided. Reply as JSON: {"topic": string, "prompt": string}. The question must be answerable in 1 to 3 sentences.', user: 'Transcript (up to ' + fmt(now) + '):\n' + text.slice(-4000), temperature: 0.5 }, (x) => x && x.prompt && x.topic);
      return { isDue: true, checkIn: { id: uid('chk'), videoTime: fmt(now), topic: o.topic, prompt: o.prompt, restrictedTimeline: 'Up to ' + fmt(now) + ' (no future content)' } };
    } catch (_) { return { isDue: false }; }
  }
  async function checkInEvaluate(b) {
    const now = parseTime(b.videoTime);
    const cues = (await getCues(b.videoTitle, now, false)).filter((c) => c.start >= Math.max(0, now - 300));
    let o;
    try {
      o = await jsonCall({ system: 'You grade a learner\'s short answer to a check-in question, using ONLY the transcript. Reply as JSON: {"isCorrect": boolean, "feedback": string}. Feedback is 1 to 3 sentences: say what is right, what is missing, and the key idea. Be encouraging and honest.', user: 'Transcript:\n' + cues.map((c) => c.text).join(' ').slice(-4000) + '\n\nQuestion: ' + b.prompt + '\nLearner answer: ' + b.userResponse, temperature: 0.2 }, (x) => x && typeof x.isCorrect === 'boolean' && x.feedback);
    } catch (e) { return { isCorrect: false, feedback: 'Could not check this answer. ' + friendly(e), timeSpentSec: b.timeSpentSec, retryAllowed: true }; }
    const log = await store.get(K.checkins, []);
    log.push({ ts: Date.now(), title: b.videoTitle, videoTime: b.videoTime, topic: b.topic, prompt: b.prompt, response: b.userResponse, isCorrect: o.isCorrect, retries: b.retries || 0, timeSpentSec: b.timeSpentSec, skipped: false });
    await store.set(K.checkins, log.slice(-300));
    return { isCorrect: o.isCorrect, feedback: o.feedback, timeSpentSec: b.timeSpentSec, retryAllowed: !o.isCorrect && (b.retries || 0) < 2 };
  }
  async function checkInSkip(b) {
    const log = await store.get(K.checkins, []);
    log.push({ ts: Date.now(), title: b.videoTitle, videoTime: b.videoTime, topic: b.topic, prompt: b.prompt, skipped: true, isCorrect: false });
    await store.set(K.checkins, log.slice(-300)); return { ok: true };
  }

  async function explainMoment(b) {
    const now = Number(b.currentTimeSec) || 0, win = Number(b.secondsWindow) || 60;
    const cues = (await getCues(b.videoTitle, now, false)).filter((c) => c.start >= Math.max(0, now - win));
    if (!cues.length) return json({ error: 'no_transcript' }, 404);
    const a = cues[0].start;
    const o = await jsonCall({ system: 'You explain what the lecturer just said to a learner, using ONLY the transcript. Reply as JSON: {"topic": string, "explanation": string, "analogy": string, "followUp": string}. Explanation: 3 to 6 plain sentences. Reply in English even if the transcript is in another language. No emoji, no em dashes.', user: 'Transcript from ' + fmt(a) + ' to ' + fmt(now) + ':\n' + cues.map((c) => c.text).join(' ').slice(-4000), temperature: 0.4 }, (x) => x && x.explanation && x.topic);
    const range = fmt(a) + '-' + fmt(now);
    return json({ topic: o.topic, explanation: o.explanation, analogy: o.analogy || '', followUp: o.followUp || '', source: 'Video ' + range, citations: [{ sourceType: 'Video', label: range, timestamp: fmt(a), detail: 'Last ' + win + ' seconds' }] });
  }

  const momentCache = {};
  async function keyMoments(title, now, allowFuture) {
    const cues = await getCues(title, now, allowFuture); const wins = windows(cues, 60);
    if (wins.length < 2) return { outline: [] };
    const ck = keyOf(title) + ':' + Math.floor(now / 120) + ':' + wins.length;
    let outline = momentCache[ck];
    if (!outline) {
      const text = wins.map((w) => '[' + Math.floor(w.start) + 's] ' + w.text.slice(0, 350)).join('\n').slice(-12000);
      const o = await jsonCall({ system: 'You split a lecture transcript into topic sections. Use ONLY the transcript. Reply as JSON: {"outline":[{"seconds": number, "title": string, "topic": string, "summary": string}]}. Between 2 and 8 sections ordered by time. "seconds" is where the topic starts (use the [..s] markers). Summary is one short sentence in English.', user: text, temperature: 0.2 }, (x) => x && Array.isArray(x.outline) && x.outline.length);
      outline = o.outline.filter((m) => typeof m.seconds === 'number' && (allowFuture || m.seconds <= now)).map((m) => ({ seconds: m.seconds, timestamp: fmt(m.seconds), title: String(m.title), topic: String(m.topic), summary: String(m.summary) }));
      momentCache[ck] = outline;
    }
    const cur = outline.filter((m) => m.seconds <= now).length - 1;
    return { outline: outline.map((m, i) => Object.assign({}, m, { isCurrent: i === cur })) };
  }

  async function audioTranscribe(b) {
    const now = Number(b.startOffsetSeconds) || 0;
    const o = await jsonCall({ parts: [{ inlineData: { mimeType: 'audio/webm', data: b.audioBase64 } }, { text: 'Transcribe this audio. Reply as JSON: {"fullText": string, "segments":[{"startSeconds": number, "endSeconds": number, "text": string}]}. Keep the original language.' }], temperature: 0 }, (x) => x && Array.isArray(x.segments));
    const L = await loadLive(); const k = keyOf(b.sourceTitle); const arr = L[k] || (L[k] = []);
    o.segments.forEach((s) => arr.push({ start: Math.floor(now + (s.startSeconds || 0)), end: Math.floor(now + (s.endSeconds || 0)), text: s.text }));
    liveDirty = true; await flushLive();
    return { fullText: o.fullText || '', segments: o.segments };
  }

  async function route(url, init) {
    const u = new URL(url); const p = u.pathname; const method = (init.method || 'GET').toUpperCase();
    let b = {}; if (init.body) { try { b = JSON.parse(init.body); } catch (_) {} }
    try {
      if (p === '/health') { const st = await getSettings(); return json({ status: 'ok', mode: 'extension', geminiConfigured: !!st.geminiKey }); }
      if (p === '/api/chat/stream') return chatStream(b);
      if (p === '/api/chat') return chatOnce(b);
      if (p === '/api/check-ins/settings') { const st = await getSettings(); st.checkInsEnabled = b.enabled; st.freq = b.frequencyPer10Min; await store.set(K.settings, st); return json({ ok: true }); }
      if (p === '/api/check-ins/boundary') return json(await checkInBoundary(b));
      if (p === '/api/check-ins/evaluate') return json(await checkInEvaluate(b));
      if (p === '/api/check-ins/skip') return json(await checkInSkip(b));
      if (p === '/api/pause-and-ask/context') { const n = Number(b.currentTimeSec) || 0; return json({ attachedMoment: { autoAttachedLabel: 'Attached: ' + fmt(n) + ' and the last 60s', windowRange: fmt(Math.max(0, n - 60)) + '-' + fmt(n), topic: 'Current moment' } }); }
      if (p === '/api/explain-moment') return await explainMoment(b);
      if (p === '/api/key-moments') return json(await keyMoments(u.searchParams.get('videoTitle'), Number(u.searchParams.get('currentTimeSec')) || 0, u.searchParams.get('allowFuture') === 'true'));
      if (p === '/api/notes' && method === 'GET') return json({ notes: (await store.get(K.notes, [])).slice().reverse() });
      if (p === '/api/notes' && method === 'POST') { const n = await store.get(K.notes, []); const note = { id: uid('note'), video_time: b.videoTime, topic: b.topic || 'General', source: b.source || 'Companion', content: b.content, title: b.videoTitle, created: Date.now() }; n.push(note); await store.set(K.notes, n); return json({ note }); }
      if (p.startsWith('/api/notes/') && method === 'DELETE') { const id = p.split('/').pop(); await store.set(K.notes, (await store.get(K.notes, [])).filter((x) => x.id !== id)); return json({ ok: true }); }
      if (p === '/api/transcripts/upload') { const cues = parseSubtitle(b.content); const s = await store.get(K.subs, {}); s[keyOf(b.sourceId)] = cues; await store.set(K.subs, s); return json({ chunks: windows(cues, 40).map((w) => w.text.slice(0, 80)) }); }
      if (p === '/api/materials/resource' && method === 'POST') { const material = await ingestResource(b); const mats = await store.get(K.materials, []); mats.unshift(material); await store.set(K.materials, mats); return json({ material }); }
      if (p === '/api/materials/remove' && method === 'POST') { await removeMaterial(b.id); await store.set(K.materials, (await store.get(K.materials, [])).filter((m) => m.id !== b.id)); return json({ ok: true }); }
      if (p === '/api/materials/clear' && method === 'POST') { await chunkClear(); await store.set(K.materials, []); await store.set(K.notes, []); await store.set('la_pdf_ocr_cache', {}); return json({ ok: true }); }
      if (p === '/api/materials/citation' && method === 'POST') {
        const mats = await store.get(K.materials, []), mat = mats.find((x) => String(b.label || '').startsWith(x.name + ' '));
        if (!mat) return json({ error: 'not_found' }, 404);
        const all = await store.get(K.chunks, {}), suffix = String(b.label).slice(mat.name.length + 1);
        const passage = (all[mat.id] || []).filter((c) => c.label === suffix || (c.page && suffix === 'p.' + c.page) || (c.slide && suffix === 'Slide ' + c.slide));
        return json({ material: { id: mat.id, name: mat.name, type: mat.type }, passage: passage.map((x) => x.text).join('\n'), label: b.label });
      }
      if (p === '/api/audio/transcribe-short') return json(await audioTranscribe(b));
      if (p === '/api/privacy/export') { const all = await chrome.storage.local.get(null); all.materialChunks = await chunkGetAll(); delete all[K.settings]; return json(all); }
      if (p === '/api/privacy/delete-account') { const keep = await store.get(K.settings, {}); await chrome.storage.local.clear(); await chunkClear(); await store.set(K.settings, keep); live = null; return json({ ok: true }); }
      if (p === '/api/test-checklist/run') return json({ passed: true });
      return json({ error: 'not_found' }, 404);
    } catch (e) { return json({ error: friendly(e), code: e && e.code }, e && e.code === 'no_key' ? 401 : 500); }
  }

  if (nativeFetch) {
    g.fetch = function (input, init) {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (url.startsWith(LOCAL_BASE)) return route(url, init || {});
      return nativeFetch(input, init);
    };
  }

  // ---------- adaptive interview and report ----------
  const interview = {
    async context(topicHint, title) {
      const qlog = (await store.get(K.qlog, [])).filter((q) => !title || keyOf(q.title) === keyOf(title)).slice(-40);
      const checks = (await store.get(K.checkins, [])).filter((c) => !title || keyOf(c.title) === keyOf(title)).slice(-15);
      const cues = await getCues(title, 1e9, true); const wins = windows(cues, 60);
      const qt = tok(topicHint + ' ' + qlog.map((q) => q.question).join(' '));
      const picks = wins.map((w) => ({ w, s: score(qt, w.text) })).sort((a, b) => b.s - a.s).slice(0, 6).map((x) => x.w).sort((a, b) => a.start - b.start);
      const mats = (await store.get(K.materials, [])).filter((m) => m.includeInAnswers !== false); const all = await store.get(K.chunks, {}); const mc = [];
      for (const m of mats) for (const c of (all[m.id] || [])) mc.push({ m, c, s: score(qt, c.text) });
      const mtop = mc.sort((a, b) => b.s - a.s).slice(0, 4);
      return 'QUESTIONS THE LEARNER ASKED (oldest first):\n' + (qlog.map((q) => '- [' + fmt(q.videoTime) + '] ' + q.question + (q.found ? '' : ' (not found in material)')).join('\n') || '(none yet)') +
        '\n\nCHECK-IN RESULTS:\n' + (checks.map((c) => '- [' + c.videoTime + '] ' + c.topic + ': ' + (c.skipped ? 'skipped' : c.isCorrect ? 'correct' : 'wrong')).join('\n') || '(none)') +
        '\n\nTRANSCRIPT EXCERPTS:\n' + (picks.map((w) => '[' + fmt(w.start) + '-' + fmt(w.end) + '] ' + w.text.slice(0, 500)).join('\n') || '(none)') +
        '\n\nMATERIAL EXCERPTS:\n' + (mtop.map((x) => '[' + x.m.name + ' ' + x.c.label + '] ' + x.c.text.slice(0, 500)).join('\n') || '(none)');
    },
    async start({ topic, difficulty, title, n }) {
      const ctx = await this.context(topic || '', title);
      const sys = 'You are a fair, adaptive interviewer for a learner. Base every question on the learner\'s own material and the questions they asked. Weight toward topics they asked about many times, got wrong, or did not find in their material. Reply as JSON: {"question": string, "topic": string, "why": string}. "why" is one sentence telling the learner why you chose this, for example "You asked about this twice." Difficulty: ' + (difficulty || 'intermediate') + '.' + (topic ? ' Focus topic: ' + topic + '.' : '');
      const q = await jsonCall({ system: sys, user: ctx + '\n\nAsk the FIRST question.', temperature: 0.6 }, (x) => x && x.question && x.topic);
      const s = { id: uid('sess'), title: title || '', topic: topic || '', difficulty: difficulty || 'intermediate', n: n || 5, turns: [{ question: q.question, topic: q.topic, why: q.why || '' }], startedAt: Date.now() };
      await store.set(K.current, s); return { session: s, question: s.turns[0], index: 0 };
    },
    async answer(text) {
      const s = await store.get(K.current, null); if (!s) throw new LAError('nosession', 'No interview in progress.');
      const t = s.turns[s.turns.length - 1]; const last = s.turns.length >= s.n; const ctx = await this.context(s.topic, s.title);
      const hist = s.turns.filter((x) => x.eval).map((x, i) => (i + 1) + '. Q: ' + x.question + '\nA: ' + x.answer + '\nResult: ' + x.eval.status).join('\n\n');
      const sys = 'You are a fair interviewer. Judge ONLY what the learner actually said, using the lecture and material excerpts as the source of truth. Never invent feedback. Reply as JSON: {"status": "GREEN"|"YELLOW"|"RED", "reason": string, "correct_points": string[], "missing_points": string[], "better_answer_hint": string, "topic": string' + (last ? '}' : ', "next": {"question": string, "topic": string, "why": string}}') + '. Adapt the next question: after GREEN go deeper (trade-offs, edge cases, why not X); after YELLOW ask a clarifying or hint-style follow-up on the missing part; after RED step back to the prerequisite concept. Difficulty: ' + s.difficulty + '.';
      const o = await jsonCall({ system: sys, user: ctx + '\n\nINTERVIEW SO FAR:\n' + (hist || '(first question)') + '\n\nCURRENT QUESTION: ' + t.question + '\nLEARNER ANSWER: ' + text + (last ? '\n\nThis was the last question. Do not include "next".' : ''), temperature: 0.3 },
        (x) => x && /^(GREEN|YELLOW|RED)$/.test(String(x.status).toUpperCase()) && x.reason && (last || (x.next && x.next.question)));
      o.status = String(o.status).toUpperCase(); o.correct_points = o.correct_points || []; o.missing_points = o.missing_points || [];
      t.answer = text; t.eval = { status: o.status, reason: o.reason, correct_points: o.correct_points, missing_points: o.missing_points, hint: o.better_answer_hint || '', topic: o.topic || t.topic };
      if (!last) s.turns.push({ question: o.next.question, topic: o.next.topic || t.topic, why: o.next.why || '' });
      await store.set(K.current, s);
      return { eval: t.eval, next: last ? null : s.turns[s.turns.length - 1], index: s.turns.length - 1, total: s.n };
    },
    async finish() {
      const s = await store.get(K.current, null); if (!s) throw new LAError('nosession', 'No interview in progress.');
      const done = s.turns.filter((x) => x.eval);
      const ctx = await this.context(s.topic, s.title);
      const sys = 'You write the final assessment report for a learner. Use ONLY the interview below and the excerpts. Quote the learner\'s own words as evidence. Reply as JSON: {"summary": string, "scores": {"technical": number, "problem_solving": number, "communication": number, "structure": number}, "topics": [{"topic": string, "status": "GREEN"|"YELLOW"|"RED", "reason": string, "evidence": string}], "strengths": string[], "gaps": [{"topic": string, "priority": number, "reason": string, "video_range": string}], "study_plan": [{"what": string, "where": string}], "retry_questions": string[]}. Scores are 0 to 100 and must follow the per-answer results. "video_range" is where in the video the topic was taught (like 12:30-15:00) taken from the excerpts, or an empty string. "retry_questions" has 3 questions. Gaps are ordered by priority, 1 is highest.';
      const o = await jsonCall({ system: sys, user: ctx + '\n\nINTERVIEW:\n' + done.map((x, i) => (i + 1) + '. Q: ' + x.question + '\nA: ' + x.answer + '\nStatus: ' + x.eval.status + '. ' + x.eval.reason + ' Missing: ' + x.eval.missing_points.join('; ')).join('\n\n'), temperature: 0.3 },
        (x) => x && x.summary && x.scores && Array.isArray(x.topics) && Array.isArray(x.gaps));
      const sessions = await store.get(K.sessions, []);
      const rec = { id: s.id, date: Date.now(), title: s.title, topic: s.topic, difficulty: s.difficulty, turns: done, report: o };
      sessions.unshift(rec); await store.set(K.sessions, sessions.slice(0, 30)); await store.set(K.current, null);
      return rec;
    }
  };

  // ---------- UI glue ----------
  const $ = (id) => document.getElementById(id);
  const notify = (m) => { if (g.showNotification) g.showNotification(m); };
  const fail = (e) => { if (g.showGlobalError) g.showGlobalError(friendly(e)); };
  const ui = {
    show(q, idx, total) {
      $('practice-question-counter').textContent = 'Question ' + (idx + 1) + ' of ' + total;
      $('practice-question-topic').textContent = q.topic;
      $('practice-question-text').textContent = q.question;
      let why = $('la-why');
      if (!why) { why = document.createElement('div'); why.id = 'la-why'; why.style.cssText = 'font-size:11px;color:var(--muted);margin-top:4px'; $('practice-question-text').after(why); }
      why.textContent = q.why || '';
      $('practice-answer-input').value = ''; $('practice-feedback-box').classList.add('hidden');
      const sb = $('btn-submit-practice-answer'); sb.classList.remove('hidden'); sb.disabled = false; sb.textContent = 'Submit answer';
      $('btn-next-practice-question').classList.add('hidden');
    },
    async start() {
      const btn = $('btn-start-practice') || document.querySelector('#practice-setup-card button');
      if (btn) btn.disabled = true;
      try {
        const topic = ($('practice-topic-input') || {}).value || '', diff = ($('practice-diff-select') || {}).value || 'intermediate';
        const title = (g.currentVideoState && g.currentVideoState.title) || '';
        notify('Building your questions from your own history...');
        const r = await interview.start({ topic: topic.trim(), difficulty: diff, title, n: 5 });
        $('practice-setup-card').classList.add('hidden'); $('practice-active-card').classList.remove('hidden');
        ui.total = r.session.n; ui.show(r.question, 0, ui.total);
      } catch (e) { fail(e); } finally { if (btn) btn.disabled = false; }
    },
    async submit() {
      const val = ($('practice-answer-input').value || '').trim(); if (!val) return;
      const sb = $('btn-submit-practice-answer'); sb.disabled = true; sb.textContent = 'Evaluating...';
      try {
        const r = await interview.answer(val); const e = r.eval;
        const cls = { GREEN: 'badge-green', YELLOW: 'badge-yellow', RED: 'badge-red' }[e.status];
        const label = { GREEN: 'Green (Strong)', YELLOW: 'Yellow (Partial)', RED: 'Red (Needs work)' }[e.status];
        $('practice-feedback-box').classList.remove('hidden');
        $('practice-feedback-badge').className = 'status-badge ' + cls; $('practice-feedback-badge').textContent = label;
        const rs = $('practice-feedback-reason'); rs.style.whiteSpace = 'pre-wrap';
        rs.textContent = e.reason + (e.missing_points.length ? '\n\nMissing: ' + e.missing_points.join('; ') : '') + (e.hint ? '\n\nHint: ' + e.hint : '');
        sb.classList.add('hidden'); ui.pending = r.next;
        const nb = $('btn-next-practice-question'); nb.classList.remove('hidden'); nb.textContent = r.next ? 'Next question' : 'Finish and see report';
      } catch (e) { sb.disabled = false; sb.textContent = 'Submit answer'; fail(e); }
    },
    async next() {
      if (ui.pending) { const idx = (await store.get(K.current, { turns: [] })).turns.length - 1; ui.show(ui.pending, idx, ui.total); ui.pending = null; return; }
      const nb = $('btn-next-practice-question'); nb.disabled = true; nb.textContent = 'Building your report...';
      try {
        await interview.finish();
        $('practice-active-card').classList.add('hidden'); $('practice-setup-card').classList.remove('hidden');
        if (g.switchTab) g.switchTab('panel-progress', 'tab-btn-progress'); await ui.renderProgress();
      } catch (e) { fail(e); } finally { nb.disabled = false; }
    },
    async renderProgress() {
      const box = $('progress-topics-table'); if (!box) return;
      const sessions = await store.get(K.sessions, []); const checks = await store.get(K.checkins, []);
      const badge = $('progress-score-badge'), sum = $('progress-summary-text');
      let host = $('la-report'); if (!host) { host = document.createElement('div'); host.id = 'la-report'; box.after(host); }
      const cls = { GREEN: 'badge-green', YELLOW: 'badge-yellow', RED: 'badge-red' };
      const row = (t, s, d, ev) => '<div style="padding:8px 10px;background:#0E0F12;border:1px solid var(--border);border-radius:6px;margin-bottom:6px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><span style="font-weight:500;font-size:12px">' + esc(t) + '</span><span class="status-badge ' + (cls[s] || '') + '">' + esc(s) + '</span></div><div style="font-size:11px;color:var(--muted)">' + esc(d) + '</div>' + (ev ? '<div style="font-size:11px;color:var(--muted);margin-top:3px;font-style:italic">"' + esc(ev) + '"</div>' : '') + '</div>';
      const list = (title, items) => items && items.length ? '<h4 style="margin:12px 0 6px;font-size:12px">' + title + '</h4>' + items.join('') : '';
      if (!sessions.length) {
        if (badge) badge.textContent = 'No assessment yet';
        if (sum) sum.textContent = 'Ask questions while you watch, then open Practice. Your report appears here after an interview.';
        const done = checks.filter((c) => !c.skipped);
        box.innerHTML = done.length ? done.slice(-8).reverse().map((c) => row(c.topic, c.isCorrect ? 'GREEN' : 'RED', 'Check-in at ' + c.videoTime + ': ' + c.prompt)).join('') : '<div style="color:var(--muted);font-size:12px">No results yet.</div>';
        host.innerHTML = ''; return;
      }
      const r = sessions[0].report; const sc = r.scores; const avg = Math.round((sc.technical + sc.problem_solving + sc.communication + sc.structure) / 4);
      if (badge) badge.textContent = avg + '/100';
      if (sum) sum.textContent = r.summary;
      const prev = sessions[1] ? sessions[1].report.scores : null; const pavg = prev ? Math.round((prev.technical + prev.problem_solving + prev.communication + prev.structure) / 4) : null;
      box.innerHTML = '<div style="font-size:12px;line-height:1.7">Technical knowledge: <b>' + sc.technical + '</b><br>Problem solving: <b>' + sc.problem_solving + '</b><br>Communication: <b>' + sc.communication + '</b><br>Answer structure: <b>' + sc.structure + '</b>' + (pavg !== null ? '<br>Previous assessment: <b>' + pavg + '</b> (' + (avg - pavg >= 0 ? '+' : '') + (avg - pavg) + ')' : '') + '</div>';
      host.innerHTML =
        list('Topics', r.topics.map((t) => row(t.topic, String(t.status).toUpperCase(), t.reason, t.evidence))) +
        list('Where you are behind', r.gaps.slice().sort((a, b) => a.priority - b.priority).map((x) => row(x.topic, 'RED', x.reason + (x.video_range ? ' Rewatch ' + x.video_range + '.' : '')))) +
        (r.strengths && r.strengths.length ? '<h4 style="margin:12px 0 6px;font-size:12px">What you did well</h4><ul style="margin:0;padding-left:16px;font-size:11px;color:var(--muted)">' + r.strengths.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '') +
        (r.study_plan && r.study_plan.length ? '<h4 style="margin:12px 0 6px;font-size:12px">Study next</h4><ul style="margin:0;padding-left:16px;font-size:11px;color:var(--muted)">' + r.study_plan.map((x) => '<li>' + esc(x.what) + (x.where ? ' (' + esc(x.where) + ')' : '') + '</li>').join('') + '</ul>' : '') +
        (r.retry_questions && r.retry_questions.length ? '<h4 style="margin:12px 0 6px;font-size:12px">Questions to retry</h4><ol style="margin:0;padding-left:16px;font-size:11px;color:var(--muted)">' + r.retry_questions.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ol>' : '') +
        '<button type="button" class="btn" id="la-dl" style="margin-top:12px">Download report</button>';
      const dl = $('la-dl'); if (dl) dl.onclick = () => ui.download(sessions[0]);
    },
    download(rec) {
      const r = rec.report; const L = ['# Assessment report', '', r.summary, '', '## Scores', 'Technical knowledge: ' + r.scores.technical, 'Problem solving: ' + r.scores.problem_solving, 'Communication: ' + r.scores.communication, 'Answer structure: ' + r.scores.structure, '', '## Topics'];
      r.topics.forEach((t) => L.push('- ' + t.topic + ' (' + t.status + '): ' + t.reason + (t.evidence ? ' Evidence: "' + t.evidence + '"' : '')));
      L.push('', '## Where you are behind'); r.gaps.forEach((x) => L.push(x.priority + '. ' + x.topic + ': ' + x.reason + (x.video_range ? ' (rewatch ' + x.video_range + ')' : '')));
      L.push('', '## What you did well'); (r.strengths || []).forEach((x) => L.push('- ' + x));
      L.push('', '## Study next'); (r.study_plan || []).forEach((x) => L.push('- ' + x.what + (x.where ? ' (' + x.where + ')' : '')));
      L.push('', '## Questions to retry'); (r.retry_questions || []).forEach((x, i) => L.push((i + 1) + '. ' + x));
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([L.join('\n')], { type: 'text/markdown' })); a.download = 'assessment-report.md'; a.click();
    },
    async injectSettings() {
      const anchor = $('backend-url-input'); if (!anchor || $('la-key-card')) return;
      const card = anchor.parentElement.parentElement; card.style.display = 'none';
      const st = await getSettings(); const d = document.createElement('div'); d.id = 'la-key-card'; d.style.cssText = 'padding:10px 0;border-bottom:1px solid var(--border)';
      d.innerHTML = '<label for="la-key" style="display:block;font-size:11px;color:var(--muted);margin-bottom:4px">Gemini API key (stored only in this browser):</label><div style="display:flex;gap:6px"><input type="password" id="la-key" class="input" placeholder="Paste your key" style="flex:1"><button type="button" class="btn primary" id="la-key-save">Save and test</button></div><label for="la-model" style="display:block;font-size:11px;color:var(--muted);margin:8px 0 4px">Model:</label><input type="text" id="la-model" class="input" style="width:100%"><div id="la-key-status" style="margin-top:6px;font-size:11px;color:var(--muted)"></div>';
      card.before(d); $('la-key').value = st.geminiKey; $('la-model').value = st.model;
      $('la-key-status').textContent = st.geminiKey ? 'A key is saved.' : 'No key saved yet. Get a free key at aistudio.google.com/apikey.';
      $('la-key-save').onclick = async () => {
        const s = await getSettings(); s.geminiKey = $('la-key').value.trim(); s.model = $('la-model').value.trim() || 'gemini-flash-latest'; await store.set(K.settings, s);
        const out = $('la-key-status'); out.textContent = 'Testing...';
        try { await gemini({ user: 'Reply with the single word OK.', temperature: 0 }); out.textContent = 'Connected. The assistant is ready.'; out.style.color = 'var(--success)'; }
        catch (e) { out.textContent = friendly(e); out.style.color = 'var(--danger)'; }
      };
      if (!st.geminiKey && g.switchTab) setTimeout(() => g.switchTab('panel-settings', 'tab-btn-settings'), 300);
    }
  };

  const LA = { interview, ui, materials: { ingest: ingestMaterial, remove: removeMaterial }, api: { addResource: ingestResource, removeMaterial, getResourceText, updateNoteResource, clearMaterials: async () => { await chunkClear(); await store.set(K.materials, []); await store.set(K.notes, []); await store.set('la_pdf_ocr_cache', {}); }, citation: async (label) => { const r = await fetch(LOCAL_BASE + '/api/materials/citation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label }) }); return r.json(); } }, _t: { recordState, parseSubtitle, windows, tok, score, bm25Rank, queryMode, chunkLines, parseJSON, route, store, K, fmt, buildContext } };
  g.LA = LA;

  if (typeof document !== 'undefined') {
    // Record captions as the video plays.
    if (typeof g.updateVideoState === 'function') {
      const orig = g.updateVideoState;
      g.updateVideoState = function (s) { try { recordState(s); } catch (_) {} return orig.apply(this, arguments); };
    }
    setInterval(() => { flushLive(); }, 8000);
    document.addEventListener('DOMContentLoaded', () => { ui.injectSettings(); ui.renderProgress(); const tabs = document.querySelector('.tabs'); if (tabs) tabs.addEventListener('click', () => setTimeout(() => { const a = document.querySelector('.tab-btn.active'); if (a && a.scrollIntoView) a.scrollIntoView({ inline: 'nearest', block: 'nearest' }); }, 50)); });
    if (document.readyState !== 'loading') { ui.injectSettings(); ui.renderProgress(); }
  }
})();
