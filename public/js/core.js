/* Tab Creator core: the document model, text import/export and note extraction.
 * No DOM in here, so it runs in the browser (window.TabCore) and in Node (the tests).
 *
 * A document is { blocks: [...] } where a block is either
 *   { type: 'text', text }
 *   { type: 'tab', labels, showLabels, w, strings, above, below }
 * `strings` are the staff lines (each exactly `w` characters), `above` / `below` are free
 * text lines that belong to the staff. Text lines are stored in output-line coordinates,
 * so column 0 is the first character of the line, before the "e|" prefix.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TabCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const range = (a, b) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);
const DEFAULT_W = 74;      // columns in a new staff
const TEXT_EXTRA = 20;     // how far text lines may run past the end of the staff

/* labels run from the top line to the bottom line; midi is the open-string pitch of each */
const PRESETS = [
  { name: 'Guitar · standard', labels: 'e B G D A E', midi: [64, 59, 55, 50, 45, 40] },
  { name: 'Guitar · drop D', labels: 'e B G D A D', midi: [64, 59, 55, 50, 45, 38] },
  { name: 'Guitar · Eb standard', labels: 'eb Bb Gb Db Ab Eb', midi: [63, 58, 54, 49, 44, 39] },
  { name: 'Guitar · DADGAD', labels: 'D A G D A D', midi: [62, 57, 55, 50, 45, 38] },
  { name: 'Guitar · open G', labels: 'D B G D G D', midi: [62, 59, 55, 50, 43, 38] },
  { name: '7-string guitar', labels: 'e B G D A E B', midi: [64, 59, 55, 50, 45, 40, 35] },
  { name: 'Bass · 4 string', labels: 'G D A E', midi: [43, 38, 33, 28] },
  { name: 'Bass · 5 string', labels: 'G D A E B', midi: [43, 38, 33, 28, 23] },
  { name: 'Ukulele', labels: 'A E C G', midi: [69, 64, 60, 67] },
  { name: 'Banjo · 5 string', labels: 'D B G D g', midi: [62, 59, 55, 50, 67] },
];

/* ---------- model ---------- */
function newTab(like) {
  const labels = like ? like.labels.slice() : ['e', 'B', 'G', 'D', 'A', 'E'];
  const w = like ? like.w : DEFAULT_W;
  return { type: 'tab', labels, showLabels: like ? like.showLabels : true, w, strings: labels.map(() => '-'.repeat(w)), above: [''], below: [] };
}
const defaultDoc = () => ({ blocks: [{ type: 'text', text: '' }, newTab()] });

function sanitize(d) {
  const blocks = [];
  for (const b of (d && d.blocks) || []) {
    if (b && b.type === 'text') blocks.push({ type: 'text', text: String(b.text ?? '') });
    else if (b && b.type === 'tab' && Array.isArray(b.strings) && b.strings.length) {
      const w = Math.max(1, ...b.strings.map(s => String(s).length));
      blocks.push({
        type: 'tab', labels: b.strings.map((_, i) => String((b.labels || [])[i] ?? '')), showLabels: !!b.showLabels, w,
        strings: b.strings.map(s => String(s).padEnd(w, '-')), above: (b.above || []).map(String), below: (b.below || []).map(String),
      });
    }
  }
  return { blocks };
}

/* Rows of a staff block are numbered top to bottom: above lines, then strings, then below lines. */
const nA = b => b.above.length, nS = b => b.strings.length, nR = b => b.above.length + b.strings.length + b.below.length;
const P = b => b.showLabels ? Math.max(0, ...b.labels.map(l => l.length)) + 1 : 1;   // characters before the first staff column
const lineW = b => P(b) + b.w + 1;
function rowInfo(b, r) {
  if (r < nA(b)) return { kind: 'text', arr: b.above, i: r };
  r -= nA(b);
  if (r < nS(b)) return { kind: 'str', arr: b.strings, i: r };
  return { kind: 'text', arr: b.below, i: r - nS(b) };
}
const isStr = (b, r) => rowInfo(b, r).kind === 'str';
const minX = (b, r) => isStr(b, r) ? P(b) : 0;
const maxX = (b, r) => isStr(b, r) ? P(b) + b.w : lineW(b) + TEXT_EXTRA - 1;   // string rows: one past the end means "grow here"

function growTo(b, w) {
  if (w <= b.w) return;
  for (let i = 0; i < b.strings.length; i++) b.strings[i] = b.strings[i].padEnd(w, '-');   // in place: callers hold on to b.strings
  b.w = w;
}
function getCh(b, r, x) {
  const ri = rowInfo(b, r);
  if (ri.kind === 'str') { const c = x - P(b); return c >= 0 && c < b.w ? ri.arr[ri.i][c] : null; }
  return ri.arr[ri.i][x] ?? ' ';
}
function setCh(b, r, x, ch) {
  const ri = rowInfo(b, r);
  if (ri.kind === 'str') {
    const c = x - P(b); if (c < 0) return;
    growTo(b, c + 1);
    const s = ri.arr[ri.i]; ri.arr[ri.i] = s.slice(0, c) + (ch === ' ' ? '-' : ch) + s.slice(c + 1);
  } else {
    if (x < 0) return;
    const s = ri.arr[ri.i].padEnd(x, ' ');
    ri.arr[ri.i] = (s.slice(0, x) + ch + s.slice(x + 1)).replace(/\s+$/, '');
  }
}
function writeLines(b, r0, x0, lines) {
  lines.forEach((line, i) => {
    const r = r0 + i; if (r < 0 || r >= nR(b)) return;
    [...line].forEach((ch, j) => { const x = x0 + j; if (x >= minX(b, r)) setCh(b, r, x, ch); });
  });
}
/* rows: array of row numbers, or null for every row */
function insertCols(b, x, n, rows) {
  const c = x - P(b); let touched = false;
  for (const r of rows || range(0, nR(b) - 1)) {
    const ri = rowInfo(b, r), s = ri.arr[ri.i];
    if (ri.kind === 'str') { if (c < 0) continue; ri.arr[ri.i] = s.slice(0, c) + '-'.repeat(n) + s.slice(c); touched = true; }
    else if (s.length > x) ri.arr[ri.i] = s.slice(0, x) + ' '.repeat(n) + s.slice(x);
  }
  if (!touched) return;
  // keep the staff width if the columns pushed off the end were empty
  const maxLen = Math.max(...b.strings.map(s => s.length));
  let trim = 0;
  while (trim < maxLen - b.w && b.strings.every(s => s.length < maxLen - trim || s[maxLen - trim - 1] === '-')) trim++;
  const w = maxLen - trim;
  b.strings = b.strings.map(s => s.slice(0, w).padEnd(w, '-')); b.w = w;
}
function deleteCols(b, x, n, rows) {
  const c = x - P(b);
  for (const r of rows || range(0, nR(b) - 1)) {
    const ri = rowInfo(b, r), s = ri.arr[ri.i];
    if (ri.kind === 'str') { if (c < 0) continue; ri.arr[ri.i] = (s.slice(0, c) + s.slice(c + n)).padEnd(b.w, '-'); }
    else ri.arr[ri.i] = (s.slice(0, x) + s.slice(x + n)).replace(/\s+$/, '');
  }
}
function shiftText(b, d) {
  const f = s => !s ? s : d > 0 ? ' '.repeat(d) + s : s.replace(new RegExp('^ {0,' + (-d) + '}'), '');
  b.above = b.above.map(f); b.below = b.below.map(f);
}
/* Change the string labels / count. Returns how far the staff moved sideways (label width change). */
function applyStaff(b, labels, show) {
  const p0 = P(b), n = labels.length;
  while (b.strings.length < n) b.strings.push('-'.repeat(b.w));
  b.strings.length = n; b.labels = labels.slice(); b.showLabels = show;
  const d = P(b) - p0; if (d) shiftText(b, d);
  return d;
}

/* ---------- export ---------- */
function tabLines(b) {
  const p = P(b), out = [];
  for (const s of b.above) if (s.trim()) out.push(s.replace(/\s+$/, ''));
  b.strings.forEach((s, i) => out.push((b.showLabels ? b.labels[i].padEnd(p - 1) : '') + '|' + s + '|'));
  for (const s of b.below) if (s.trim()) out.push(s.replace(/\s+$/, ''));
  return out;
}
function toText(doc) {
  const parts = [];
  for (const b of doc.blocks) {
    if (b.type === 'text') { const t = b.text.replace(/\s+$/, '').replace(/^(\s*\n)+/, ''); if (t.trim()) parts.push(t); }
    else parts.push(tabLines(b).join('\n'));
  }
  return parts.join('\n\n') + '\n';
}

/* ---------- import ---------- */
const TAB_RE = /^(\s*)([A-Za-z][#b]?)?(\s*)\|(.*)$/;
function isTabLine(l) {
  const m = TAB_RE.exec(l); if (!m) return false;
  const body = m[4]; if (body.length < 3) return false;
  const frac = (body.match(/-/g) || []).length / body.length;
  if (frac < 0.25) return false;
  if (/\s/.test(body) && frac < 0.5) return false;
  return true;
}
const DEFAULT_LABELS = { 4: 'G D A E', 5: 'G D A E B', 6: 'e B G D A E', 7: 'e B G D A E B' };
function parseTab(text) {
  const lines = text.replace(/\r/g, '').split('\n').map(l => l.replace(/\t/g, '    ').replace(/\s+$/, '')).filter(l => !/^\s*```/.test(l));
  const n = lines.length, kind = lines.map(l => !l.trim() ? 'b' : isTabLine(l) ? 't' : 'x');
  const groups = [];
  for (let i = 0; i < n;) {
    if (kind[i] !== 't') { i++; continue; }
    let j = i; while (j < n && kind[j] === 't') j++;
    const labels = lines.slice(i, j).map(l => TAB_RE.exec(l)[2] || '');
    let size = j - i;
    const rep = labels[0] ? labels.indexOf(labels[0], 1) : -1;          // two staffs stacked with no blank line between
    if (rep > 1 && size % rep === 0) size = rep;
    else if (!labels[0] && size >= 12 && size % 6 === 0) size = 6;
    for (let k = i; k < j; k += size) groups.push({ s: k, e: Math.min(k + size, j), above: [], below: [] });
    i = j;
  }
  for (const g of groups) {               // short text runs sitting directly on top of a staff belong to it
    const run = []; for (let k = g.s - 1; k >= 0 && kind[k] === 'x'; k--) run.unshift(k);
    if (run.length && run.length <= 3) { g.above = run; run.forEach(q => kind[q] = 'c'); }
  }
  for (const g of groups) {
    const run = []; for (let k = g.e; k < n && kind[k] === 'x'; k++) run.push(k);
    if (run.length && run.length <= 2) { g.below = run; run.forEach(q => kind[q] = 'c'); }
  }
  const blocks = []; let buf = [];
  const flush = () => { const t = buf.join('\n').replace(/^(\s*\n)+/, '').replace(/\s+$/, ''); if (t) blocks.push({ type: 'text', text: t }); buf = []; };
  const byStart = new Map(groups.map(g => [g.s, g]));
  for (let i = 0; i < n; i++) {
    const g = byStart.get(i);
    if (g) {
      flush();
      const ms = lines.slice(g.s, g.e).map(l => TAB_RE.exec(l));
      let labels = ms.map(m => m[2] || ''); const showLabels = labels.some(Boolean);
      if (!showLabels && DEFAULT_LABELS[labels.length]) labels = DEFAULT_LABELS[labels.length].split(' ');
      let bodies = ms.map(m => m[4]);
      if (bodies.every(s => s.endsWith('|'))) bodies = bodies.map(s => s.slice(0, -1));
      const w = Math.max(1, ...bodies.map(s => s.length));
      const b = { type: 'tab', labels, showLabels, w, strings: bodies.map(s => s.padEnd(w, '-')), above: g.above.map(q => lines[q]), below: g.below.map(q => lines[q]) };
      const d = P(b) - (ms[0][0].length - ms[0][4].length); if (d) shiftText(b, d);
      blocks.push(b);
      i = g.e - 1;
    } else if (kind[i] !== 'c') buf.push(lines[i]);
  }
  flush();
  return blocks;
}

/* ---------- notes (for playback) ---------- */
const PITCH = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
function labelPitchClass(label) {
  const m = /^([A-Ga-g])([#b]?)/.exec(label || ''); if (!m) return null;
  return (PITCH[m[1].toLowerCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
}
/* Open-string pitch (MIDI number) for each label. Presets are exact; anything else is guessed
   as a guitar-range tuning where each string sits below the one above it. */
function tuningMidi(labels) {
  const preset = PRESETS.find(p => p.labels === labels.join(' '));
  if (preset) return preset.midi.slice();
  const out = [];
  labels.forEach((l, i) => {
    const pc = labelPitchClass(l);
    if (i === 0) out.push(pc == null ? 64 : labels.length <= 5 && l === 'G' ? 43 : 58 + ((pc - 10 + 12) % 12));
    else { const prev = out[i - 1]; out.push(pc == null ? prev - 5 : prev - ((((prev - pc) % 12) + 12) % 12 || 12)); }
  });
  return out;
}
/* The notes written on one staff line: [{ col, len, fret, soft }] or { col, len, mute } for an x.
   Two digits are one fret when that makes sense (up to 24), so "12" is fret 12 and "35" is 3 then 5. */
function stringNotes(s) {
  const out = [], digit = c => c >= '0' && c <= '9';
  for (let i = 0; i < s.length;) {
    const ch = s[i];
    if (digit(ch)) {
      let n = ch; if (digit(s[i + 1] || '') && +(ch + s[i + 1]) <= 24) n += s[i + 1];
      out.push({ col: i, len: n.length, fret: +n, soft: /[hpbrs/\\^(]/.test(s[i - 1] || '') });
      i += n.length;
    } else {
      if (ch === 'x' || ch === 'X') out.push({ col: i, len: 1, mute: true });
      i++;
    }
  }
  return out;
}

/* ---------- legend ---------- */
function legendLines(doc) {
  const tabs = doc.blocks.filter(b => b.type === 'tab');
  const strs = tabs.flatMap(b => b.strings).join('\n'), txt = tabs.flatMap(b => [...b.above, ...b.below]).join('\n');
  const L = [
    [/h/, 'h', 'hammer-on'], [/p/, 'p', 'pull-off'], [/\//, '/', 'slide up'], [/\\/, '\\', 'slide down'], [/s/, 's', 'slide'],
    [/b/, 'b', 'bend'], [/\^/, '^', 'bend'], [/(^|[^t])r/m, 'r', 'release'], [/~/, '~', 'vibrato'], [/x/i, 'x', 'muted note'],
    [/t(?!r)/, 't', 'tap'], [/tr/, 'tr', 'trill'], [/\(/, '( )', 'ghost note'], [/</, '< >', 'harmonic'],
  ].filter(([re]) => re.test(strs)).map(([, k, d]) => k.padEnd(4) + d);
  if (/PM/.test(txt)) L.push('PM  palm mute');
  return L;
}

return {
  clamp, range, DEFAULT_W, TEXT_EXTRA, PRESETS,
  newTab, defaultDoc, sanitize,
  nA, nS, nR, P, lineW, rowInfo, isStr, minX, maxX,
  growTo, getCh, setCh, writeLines, insertCols, deleteCols, shiftText, applyStaff,
  tabLines, toText, isTabLine, parseTab,
  tuningMidi, stringNotes, legendLines,
};
});
