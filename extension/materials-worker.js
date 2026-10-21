'use strict';

importScripts('vendor/jszip.min.js');

const CODE_EXT = new Set('py js ts jsx tsx java c cpp h hpp cs go rs rb php swift kt sql sh html css json md txt csv yml yaml xml r m scala lua ipynb'.split(' '));
const safePath = (path) => !/(^|\/)(?:node_modules|\.git|\.venv|venv|dist|build)(?:\/|$)/i.test(path) && !/\.(?:png|jpe?g|gif|webp|ico|woff2?|ttf|mp[34]|wav|zip|exe|dll|so|class|pyc|bin)$/i.test(path);

function chunkCode(text, name, ext) {
  const patterns = {
    py: /^\s*(?:async\s+)?def\s+\w+|^\s*class\s+\w+/m,
    js: /^\s*(?:export\s+)?(?:async\s+)?function\s+[\w$]+|^\s*class\s+[\w$]+|^\s*(?:export\s+)?(?:const|let)\s+[\w$]+\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/m,
    ts: /^\s*(?:export\s+)?(?:async\s+)?function\s+[\w$]+|^\s*class\s+[\w$]+|^\s*(?:export\s+)?(?:const|let)\s+[\w$]+\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/m,
    java: /^\s*(?:public|private|protected|static|final|abstract|synchronized|\w+\s+)+[\w<>\[\]]+\s+\w+\s*\([^;]*\)\s*\{|^\s*(?:public\s+)?class\s+\w+/m,
    c: /^\s*(?:[\w*]+\s+)+\w+\s*\([^;]*\)\s*\{|^\s*struct\s+\w+/m,
    cpp: /^\s*(?:[\w:*&<>]+\s+)+\w+\s*\([^;]*\)\s*\{|^\s*class\s+\w+/m,
    go: /^\s*func\s+(?:\([^)]*\)\s*)?\w+/m
  };
  const lang = ['jsx', 'tsx'].includes(ext) ? ext.slice(0, 2) : ext === 'hpp' ? 'cpp' : ext === 'h' ? 'c' : ext;
  const boundary = patterns[lang], lines = text.split('\n'), starts = [0];
  if (boundary) for (let i = 1; i < lines.length; i++) if (boundary.test(lines[i])) starts.push(i);
  if (starts.length < 2) {
    const chunks = [];
    for (let i = 0; i < lines.length; i += 40) {
      const end = Math.min(lines.length, i + 48), part = lines.slice(i, end).join('\n').trim();
      if (part) chunks.push({ text: part, label: name + ' L' + (i + 1) + '-' + end, kind: 'CODE', indexText: name });
    }
    return chunks;
  }
  const imports = lines.filter((line) => /^\s*(?:import\s|from\s+\S+\s+import\s|#include\s|require\s*\(|using\s+)/.test(line)).slice(0, 30).join('\n');
  return starts.map((start, i) => {
    const end = starts[i + 1] === undefined ? lines.length : starts[i + 1], part = lines.slice(start, end).join('\n').trim();
    const declaration = lines[start].match(/(?:def|function|class|func|struct|interface)\s+([\w$]+)/) || lines[start].match(/(?:[\w:*&<>\[\]]+\s+)+([\w$]+)\s*\([^;]*\)\s*\{/);
    return { text: part, label: name + ' L' + (start + 1) + '-' + end, kind: 'CODE', indexText: [name, imports, declaration && declaration[1]].filter(Boolean).join(' ') };
  }).filter((chunk) => chunk.text);
}

self.onmessage = async (event) => {
  try {
    const zip = await JSZip.loadAsync(event.data.buffer), chunks = [];
    const files = Object.keys(zip.files).filter((path) => !zip.files[path].dir && safePath(path));
    for (const path of files) {
      const blob = await zip.files[path].async('blob');
      if (blob.size > 1024 * 1024) continue;
      const ext = (path.split('.').pop() || '').toLowerCase();
      if (!CODE_EXT.has(ext)) continue;
      let text = await blob.text();
      if (ext === 'ipynb') {
        try { text = JSON.parse(text).cells.map((cell) => Array.isArray(cell.source) ? cell.source.join('') : cell.source).join('\n\n'); } catch (_) {}
      }
      chunks.push(...chunkCode(text, path, ext));
      self.postMessage({ type: 'progress', filesDone: files.indexOf(path) + 1, filesTotal: files.length });
    }
    if (!chunks.length) throw new Error('No supported text or code files were found in this ZIP repository.');
    self.postMessage({ type: 'done', chunks });
  } catch (error) {
    self.postMessage({ type: 'error', message: String(error && error.message || 'Could not read this ZIP repository.') });
  }
};
