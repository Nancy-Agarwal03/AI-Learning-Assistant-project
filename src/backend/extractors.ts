import { Chunk } from './types';

// Helper: parse time strings like 00:01:23.456 or 01:23 into total seconds
export function parseTimestampSeconds(timeStr: string): number {
  const parts = timeStr.trim().replace(',', '.').split(':');
  try {
    if (parts.length === 3) {
      return Math.floor(parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]));
    } else if (parts.length === 2) {
      return Math.floor(parseFloat(parts[0]) * 60 + parseFloat(parts[1]));
    }
  } catch {
    // Return 0 on parsing error
  }
  return 0;
}

// 1. Parse Code files into function or class chunks
// Code is strictly read as text and is never executed.
export function parseCodeChunks(content: string, filename: string, materialId?: string): Chunk[] {
  const lines = content.split('\n');
  const totalLines = lines.length;
  const chunks: Chunk[] = [];

  const blockPattern = /^(?:def\s+[a-zA-Z0-9_]+|class\s+[a-zA-Z0-9_]+|(?:async\s+)?function\s+[a-zA-Z0-9_]+|(?:public|private|protected|static|\s)*class\s+[a-zA-Z0-9_]+|func\s+[a-zA-Z0-9_]+|fn\s+[a-zA-Z0-9_]+)/;

  let currentStart = 1;
  let currentLines: string[] = [];

  for (let idx = 1; idx <= totalLines; idx++) {
    const line = lines[idx - 1];
    if (blockPattern.test(line) && currentLines.length >= 10) {
      chunks.push({
        id: `chk_code_${Date.now()}_${chunks.length}`,
        material_id: materialId,
        source_id: filename,
        kind: 'code',
        content: currentLines.join('\n').trim(),
        file_path: filename,
        line_range: `${currentStart}-${idx - 1}`,
        created_at: new Date().toISOString(),
      });
      currentStart = idx;
      currentLines = [line];
    } else {
      currentLines.push(line);
    }

    if (currentLines.length >= 60) {
      chunks.push({
        id: `chk_code_${Date.now()}_${chunks.length}`,
        material_id: materialId,
        source_id: filename,
        kind: 'code',
        content: currentLines.join('\n').trim(),
        file_path: filename,
        line_range: `${currentStart}-${idx}`,
        created_at: new Date().toISOString(),
      });
      currentStart = idx + 1;
      currentLines = [];
    }
  }

  if (currentLines.length > 0) {
    chunks.push({
      id: `chk_code_${Date.now()}_${chunks.length}`,
      material_id: materialId,
      source_id: filename,
      kind: 'code',
      content: currentLines.join('\n').trim(),
      file_path: filename,
      line_range: `${currentStart}-${totalLines}`,
      created_at: new Date().toISOString(),
    });
  }

  return chunks;
}

// 2. Parse WebVTT and SRT transcripts into 30 to 60 second windows with 10s overlap
export function parseTranscriptChunks(content: string, sourceTitle = 'Lecture Video', materialId?: string): Chunk[] {
  const cuePattern = /(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?)\s*-->\s*(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?)/;
  const lines = content.split('\n');
  const cues: Array<{ start: number; end: number; text: string }> = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    const match = line.match(cuePattern);
    if (match) {
      const startSec = parseTimestampSeconds(match[1]);
      const endSec = parseTimestampSeconds(match[2]);
      const textLines: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() && !cuePattern.test(lines[i])) {
        if (!/^\d+$/.test(lines[i].trim())) {
          textLines.push(lines[i].trim());
        }
        i++;
      }
      cues.push({
        start: startSec,
        end: endSec,
        text: textLines.join(' '),
      });
    } else {
      i++;
    }
  }

  // Fallback: match inline bracketed timestamps like [12:45]
  if (cues.length === 0) {
    const inlinePattern = /\[?(\d{1,2}:\d{2})\]?\s*(.*)/;
    for (const l of lines) {
      const m = l.trim().match(inlinePattern);
      if (m && m[2]) {
        const s = parseTimestampSeconds(m[1]);
        cues.push({ start: s, end: s + 30, text: m[2] });
      }
    }
  }

  const chunks: Chunk[] = [];

  if (cues.length === 0) {
    // Plain text transcript chunked by word count
    const words = content.split(/\s+/).filter(Boolean);
    const windowSize = 80;
    for (let idx = 0; idx < words.length; idx += windowSize) {
      const startS = Math.floor(idx / windowSize) * 45;
      chunks.push({
        id: `chk_tr_${Date.now()}_${chunks.length}`,
        material_id: materialId,
        source_id: sourceTitle,
        kind: 'video_transcript',
        start_seconds: startS,
        end_seconds: startS + 45,
        content: words.slice(idx, idx + windowSize).join(' '),
        file_path: sourceTitle,
        created_at: new Date().toISOString(),
      });
    }
    return chunks;
  }

  // Group cues into 30 to 60 second windows with 10s overlap
  let windowStart = cues[0].start;
  let windowEnd = windowStart + 45;
  let windowText: string[] = [];

  for (const cue of cues) {
    if (cue.start >= windowEnd && windowText.length > 0) {
      chunks.push({
        id: `chk_tr_${Date.now()}_${chunks.length}`,
        material_id: materialId,
        source_id: sourceTitle,
        kind: 'video_transcript',
        start_seconds: windowStart,
        end_seconds: windowEnd,
        content: windowText.join(' '),
        file_path: sourceTitle,
        created_at: new Date().toISOString(),
      });
      windowStart = Math.max(0, windowEnd - 10); // 10s overlap
      windowEnd = windowStart + 45;
      windowText = [];
    }
    windowText.push(cue.text);
  }

  if (windowText.length > 0) {
    chunks.push({
      id: `chk_tr_${Date.now()}_${chunks.length}`,
      material_id: materialId,
      source_id: sourceTitle,
      kind: 'video_transcript',
      start_seconds: windowStart,
      end_seconds: windowEnd,
      content: windowText.join(' '),
      file_path: sourceTitle,
      created_at: new Date().toISOString(),
    });
  }

  return chunks;
}
