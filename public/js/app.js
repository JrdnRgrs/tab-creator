/* Tab Creator: the editor UI. Model and text handling live in core.js, chord data in chords.js,
   sound in audio.js. */
(() => {
'use strict';

const {
  clamp, range, TEXT_EXTRA, PRESETS, newTab, defaultDoc, sanitize,
  nA, nS, nR, P, lineW, rowInfo, isStr, minX, maxX,
  getCh, setCh, writeLines, insertCols, deleteCols, applyStaff,
  toText, parseTab, tuningMidi, stringNotes, legendLines,
} = window.TabCore;
const { ROOTS, QUALS, voicings } = window.TabChords;
const Sound = window.TabAudio;

/* ---------- basics ---------- */
const $ = id => document.getElementById(id);
const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const LS_KEY = 'tabcreator.v1', SET_KEY = 'tabcreator.settings';
const LH = 22;            // row height in px, matches .row in the stylesheet
let CW = 8.25;            // character width in px, measured at start

const ed = $('editor');
let doc, cur = { bi: -1, row: 0, x: 0 }, sel = null, anchor = { row: 0, x: 0, maxX: 0 }, drag = null;
let barTarget = -1;
const hist = []; let hi = -1;

const settings = Object.assign({ theme: null, speed: 8, typeSound: false }, (() => {
  try { return JSON.parse(localStorage.getItem(SET_KEY)) || {}; } catch (e) { return {}; }
})());
const saveSettings = () => { try { localStorage.setItem(SET_KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ } };

function load() {
  try { const j = JSON.parse(localStorage.getItem(LS_KEY)); if (j && Array.isArray(j.blocks)) return sanitize(j); } catch (e) { /* ignore */ }
  return null;
}
function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(doc)); } catch (e) { /* ignore */ } }

const blk = () => doc.blocks[cur.bi];
const activeTab = () => { const b = blk(); return b && b.type === 'tab' ? b : null; };

/* ---------- rendering ---------- */
function measure() {
  const s = document.createElement('span'); s.className = 'probe mono'; s.textContent = '0'.repeat(200);
  document.body.appendChild(s); const w = s.getBoundingClientRect().width / 200; s.remove();
  if (w > 0) CW = w;
}
const fmt = s => esc(s).replace(/-+/g, m => `<span class="d">${m}</span>`);
const blockEl = bi => ed.querySelector(`.block[data-bi="${bi}"]`);
const gridOf = bi => ed.querySelector(`.block[data-bi="${bi}"] .grid`);
function place(el, x, r, w, h) {
  el.style.left = x * CW + 'px'; el.style.top = r * LH + 'px'; el.style.width = w * CW + 'px'; el.style.height = h * LH + 'px';
}
function fillRows(grid, b) {
  const n = nR(b), p = P(b); let html = '', xs = '';
  for (let r = 0; r < n; r++) {
    const ri = rowInfo(b, r);
    if (ri.kind === 'str') {
      const lbl = b.showLabels ? esc(b.labels[ri.i].padEnd(p - 1)) : '';
      html += `<div class="row s"><span class="lbl">${lbl}</span><span class="cap">|</span>${fmt(ri.arr[ri.i])}<span class="cap">|</span></div>`;
    } else {
      const t = ri.arr[ri.i];
      html += `<div class="row t${t ? '' : ' empty'}" data-ph="${r < nA(b) ? 'lyrics · chord names · PM' : 'notes under the staff'}">${esc(t)}</div>`;
      xs += `<button class="rowx" data-r="${r}" tabindex="-1" title="Remove this text line">×</button>`;
    }
  }
  grid.querySelector('.rows').innerHTML = html;
  const rx = grid.querySelector('.rowxs'); rx.innerHTML = xs;
  rx.querySelectorAll('.rowx').forEach(x => { x.style.top = x.dataset.r * LH + 'px'; });
  grid.style.width = (lineW(b) + TEXT_EXTRA) * CW + 'px'; grid.style.height = n * LH + 'px';
}
function tabEl(b, bi) {
  const el = document.createElement('div'); el.className = 'block tab'; el.dataset.bi = bi;
  el.innerHTML = `<div class="bctl">
      <button data-act="above" title="Add a text line above the staff (lyrics, chord names, PM)">+ line above</button>
      <button data-act="below" title="Add a text line under the staff">+ line below</button>
      <button data-act="dup" title="Duplicate this staff">Duplicate</button>
      <button data-act="up" title="Move up">↑</button><button data-act="down" title="Move down">↓</button>
      <button data-act="del" title="Delete this staff">✕</button></div>
    <div class="grid mono" tabindex="0"><div class="guide"></div><div class="playhead"></div><div class="selbox"></div><div class="hov"></div><div class="rows"></div><div class="cur"></div><div class="rowxs"></div></div>`;
  const grid = el.querySelector('.grid');
  fillRows(grid, b);
  grid.addEventListener('mousedown', e => gridDown(e, bi));
  grid.addEventListener('mousemove', e => { const h = hit(grid, doc.blocks[bi], e), hv = grid.querySelector('.hov'); place(hv, h.x, h.r, 1, 1); hv.style.display = 'block'; });
  grid.addEventListener('mouseleave', () => { grid.querySelector('.hov').style.display = 'none'; });
  grid.addEventListener('keydown', onKey);
  grid.addEventListener('focus', () => {
    if (cur.bi !== bi) { cur = { bi, row: nA(b), x: P(b) }; sel = null; setAnchor(); }
    renderCursor(); syncStaffBar();
  });
  grid.addEventListener('copy', e => { e.clipboardData.setData('text/plain', selText()); e.preventDefault(); });
  grid.addEventListener('cut', e => { e.clipboardData.setData('text/plain', selText()); e.preventDefault(); clearSel(); cellChange(); });
  grid.addEventListener('paste', e => { e.preventDefault(); pasteText(e.clipboardData.getData('text/plain')); });
  grid.addEventListener('click', e => {
    const x = e.target.closest('.rowx'); if (!x) return;
    const r = +x.dataset.r, ri = rowInfo(b, r); ri.arr.splice(ri.i, 1);
    if (cur.bi === bi) { if (cur.row > r) cur.row--; cur.row = clamp(cur.row, 0, nR(b) - 1); cur.x = clamp(cur.x, minX(b, cur.row), maxX(b, cur.row)); }
    sel = null; structChange();
  });
  el.querySelector('.bctl').addEventListener('click', e => blockAct(e, bi));
  return el;
}
function autosize(ta) { ta.style.height = 'auto'; ta.style.height = Math.max(LH, ta.scrollHeight) + 'px'; }
function textEl(b, bi) {
  const el = document.createElement('div'); el.className = 'block text'; el.dataset.bi = bi;
  el.innerHTML = `<div class="bctl"><button data-act="up" title="Move up">↑</button><button data-act="down" title="Move down">↓</button><button data-act="del" title="Delete this text">✕</button></div>
    <textarea class="mono" rows="1" spellcheck="false" placeholder="Text: title, tuning, notes, section names…"></textarea>`;
  const ta = el.querySelector('textarea'); ta.value = b.text;
  ta.addEventListener('input', () => { b.text = ta.value; autosize(ta); renderOutput(); save(); });
  ta.addEventListener('change', commit);
  ta.addEventListener('focus', () => { cur = { bi, row: 0, x: 0 }; sel = null; renderCursor(); syncStaffBar(); });
  ta.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); addBlock('tab', bi + 1); }
    else if (e.key === 'ArrowUp' && ta.selectionStart === 0 && ta.selectionEnd === 0 && doc.blocks[bi - 1]) { e.preventDefault(); focusBlock(bi - 1, 'end'); }
    else if (e.key === 'ArrowDown' && ta.selectionStart === ta.value.length && doc.blocks[bi + 1]) { e.preventDefault(); focusBlock(bi + 1, 'start'); }
  });
  el.querySelector('.bctl').addEventListener('click', e => blockAct(e, bi));
  return el;
}
function insEl(at, end) {
  const el = document.createElement('div'); el.className = 'ins' + (end ? ' end' : '');
  el.innerHTML = `<button data-t="tab" title="Add a staff here">+ Staff</button><button data-t="text" title="Add a text block here">+ Text</button>`;
  el.addEventListener('click', e => { const t = e.target.closest('button'); if (t) addBlock(t.dataset.t, at); });
  return el;
}
function renderAll() {
  drag = null;
  ed.textContent = '';
  doc.blocks.forEach((b, bi) => {
    ed.appendChild(insEl(bi, false));
    ed.appendChild(b.type === 'tab' ? tabEl(b, bi) : textEl(b, bi));
  });
  ed.appendChild(insEl(doc.blocks.length, true));
  ed.querySelectorAll('textarea').forEach(autosize);
  renderCursor(); syncStaffBar(); renderOutput();
}
function rect() { return { r0: Math.min(sel.row, cur.row), r1: Math.max(sel.row, cur.row), x0: Math.min(sel.x, cur.x), x1: Math.max(sel.x, cur.x) }; }
function renderCursor() {
  ed.querySelectorAll('.block').forEach(el => el.classList.toggle('active', +el.dataset.bi === cur.bi));
  ed.querySelectorAll('.grid.has').forEach(g => g.classList.remove('has', 'g'));
  const b = activeTab(), g = b && gridOf(cur.bi); if (!g) return;
  g.classList.add('has');
  place(g.querySelector('.cur'), cur.x, cur.row, 1, 1);
  if (cur.x >= P(b)) { g.classList.add('g'); place(g.querySelector('.guide'), cur.x, nA(b), 1, nS(b)); }
  const sb = g.querySelector('.selbox');
  if (sel) { const R = rect(); place(sb, R.x0, R.r0, R.x1 - R.x0 + 1, R.r1 - R.r0 + 1); sb.style.display = 'block'; } else sb.style.display = 'none';
}
function reveal() { const g = gridOf(cur.bi); if (g) g.querySelector('.cur').scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
function showBlock(bi) {          // vertical only: scrollIntoView would also shove a wide staff sideways
  const el = blockEl(bi), wrap = $('edwrap'); if (!el) return;
  const r = el.getBoundingClientRect(), w = wrap.getBoundingClientRect();
  if (r.top < w.top + 30) wrap.scrollTop += r.top - w.top - 30;
  else if (r.bottom > w.bottom - 20) wrap.scrollTop += Math.min(r.bottom - w.bottom + 20, r.top - w.top - 30);
}
function renderOutput() { $('out').textContent = toText(doc); }
function focusCur() {
  const b = blk(); if (!b) return;
  if (b.type === 'tab') { const g = gridOf(cur.bi); if (g) g.focus({ preventScroll: true }); }
  else { const ta = blockEl(cur.bi) && blockEl(cur.bi).querySelector('textarea'); if (ta) ta.focus(); }
}
function focusBlock(bi, edge, x) {
  const b = doc.blocks[bi]; if (!b) return; sel = null;
  if (b.type === 'tab') {
    const row = edge === 'start' ? 0 : edge === 'end' ? nR(b) - 1 : nA(b);
    cur = { bi, row, x: clamp(x ?? P(b), minX(b, row), maxX(b, row)) }; setAnchor();
    gridOf(bi).focus({ preventScroll: true }); renderCursor(); syncStaffBar(); reveal();
  } else {
    const ta = blockEl(bi).querySelector('textarea'); ta.focus();
    const p = edge === 'end' ? ta.value.length : 0; ta.setSelectionRange(p, p);
  }
}

/* ---------- history ---------- */
function commit() {
  const s = JSON.stringify(doc);
  if (hi >= 0 && hist[hi].d === s) { hist[hi].c = { ...cur }; return; }
  hist.length = hi + 1; hist.push({ d: s, c: { ...cur } });
  if (hist.length > 400) hist.shift();
  hi = hist.length - 1;
  save(); renderOutput(); syncUndo();
}
function syncUndo() { $('btnUndo').disabled = hi <= 0; $('btnRedo').disabled = hi >= hist.length - 1; }
function timeTravel(d) {
  const ni = hi + d; if (ni < 0 || ni >= hist.length) return;
  hi = ni; doc = JSON.parse(hist[hi].d); cur = { ...hist[hi].c }; sel = null;
  if (!doc.blocks[cur.bi]) cur = { bi: doc.blocks.findIndex(b => b.type === 'tab'), row: 0, x: 0 };
  const b = activeTab(); if (b) { cur.row = clamp(cur.row, 0, nR(b) - 1); cur.x = clamp(cur.x, minX(b, cur.row), maxX(b, cur.row)); }
  setAnchor(); renderAll(); save(); syncUndo(); if (activeTab()) focusCur();
}
function cellChange() { const g = gridOf(cur.bi); if (g) fillRows(g, blk()); renderCursor(); commit(); }
function structChange() { renderAll(); focusCur(); commit(); }

/* ---------- cursor + editing ---------- */
function setAnchor() { anchor = { row: cur.row, x: cur.x, maxX: cur.x }; }
function hit(grid, b, e) {
  const rc = grid.querySelector('.rows').getBoundingClientRect();
  const r = clamp(Math.floor((e.clientY - rc.top) / LH), 0, nR(b) - 1);
  return { r, x: clamp(Math.floor((e.clientX - rc.left) / CW), minX(b, r), maxX(b, r)) };
}
function gridDown(e, bi) {
  if (e.button !== 0 || e.target.closest('.rowx')) return;
  const b = doc.blocks[bi], g = e.currentTarget, h = hit(g, b, e);
  if (e.shiftKey && cur.bi === bi) { if (!sel) sel = { row: cur.row, x: cur.x }; } else sel = null;
  cur = { bi, row: h.r, x: h.x }; setAnchor();
  drag = { bi, g, r: h.r, x: h.x };
  renderCursor(); syncStaffBar();
}
document.addEventListener('mousemove', e => {
  if (!drag) return;
  const b = doc.blocks[drag.bi]; if (!b || !drag.g.isConnected) { drag = null; return; }
  const h = hit(drag.g, b, e);
  if (h.r === cur.row && h.x === cur.x) return;
  if (!sel) sel = { row: drag.r, x: drag.x };
  cur.row = h.r; cur.x = h.x; renderCursor();
});
document.addEventListener('mouseup', () => {
  if (!drag) return; drag = null;
  if (sel && sel.row === cur.row && sel.x === cur.x) { sel = null; renderCursor(); }
});

function move(dr, dx, ext) {
  const b = blk();
  if (ext) { if (!sel) sel = { row: cur.row, x: cur.x }; } else sel = null;
  const r = cur.row + dr;
  if (r < 0 || r >= nR(b)) {
    const ni = cur.bi + dr;
    if (!ext && doc.blocks[ni]) focusBlock(ni, dr > 0 ? 'start' : 'end', cur.x); else renderCursor();
    return;
  }
  cur.row = r; cur.x = clamp(cur.x + dx, minX(b, r), maxX(b, r));
  setAnchor(); renderCursor(); reveal();
}
function goTo(x, ext) {
  const b = blk();
  if (ext) { if (!sel) sel = { row: cur.row, x: cur.x }; } else sel = null;
  cur.x = clamp(x, minX(b, cur.row), maxX(b, cur.row)); setAnchor(); renderCursor(); reveal();
}
function collapseSel() { if (sel) { const R = rect(), b = blk(); cur.row = R.r0; cur.x = clamp(R.x0, minX(b, R.r0), maxX(b, R.r0)); sel = null; setAnchor(); } }
function typeText(t) {
  const b = blk(); collapseSel();
  for (const ch of t) { setCh(b, cur.row, cur.x, ch); cur.x = Math.min(cur.x + 1, maxX(b, cur.row)); }
  anchor.maxX = Math.max(anchor.maxX, cur.x);
  cellChange(); reveal();
  if (settings.typeSound && /[\dxX]$/.test(t)) soundAt(b, cur.row, cur.x - 1);
}
function clearSel() {
  const b = blk();
  if (!sel) { setCh(b, cur.row, cur.x, ' '); return; }
  const R = rect();
  for (let r = R.r0; r <= R.r1; r++) {
    const hiX = isStr(b, r) ? Math.min(R.x1, P(b) + b.w - 1) : R.x1;
    for (let x = Math.max(R.x0, minX(b, r)); x <= hiX; x++) setCh(b, r, x, ' ');
  }
}
function rectLines(b, R) {
  return range(R.r0, R.r1).map(r => range(R.x0, R.x1).map(x => getCh(b, r, x) ?? ' ').join(''));
}
function selText() {
  const b = blk();
  return sel ? rectLines(b, rect()).join('\n') : (getCh(b, cur.row, cur.x) ?? '');
}
function pasteText(t) {
  const b = blk(); if (!b || !t) return;
  const lines = t.replace(/\r/g, '').replace(/\n$/, '').split('\n');
  collapseSel();
  const r0 = cur.row, x0 = cur.x;
  writeLines(b, r0, x0, lines);
  cur.x = clamp(x0 + Math.max(...lines.map(l => l.length)), minX(b, r0), maxX(b, r0)); setAnchor();
  cellChange(); reveal();
}
function dupSel() {
  if (!sel) return toast('Select a region first (drag or Shift+arrows), then Ctrl+D repeats it to the right');
  const b = blk(), R = rect(), w = R.x1 - R.x0 + 1;
  writeLines(b, R.r0, R.x1 + 1, rectLines(b, R));
  sel = { row: R.r0, x: R.x1 + 1 }; cur.row = R.r1; cur.x = R.x1 + w;
  cellChange(); reveal();
}
function insCol(rowOnly) {
  const b = blk(); let x = cur.x, n = 1, rows = rowOnly ? [cur.row] : null;
  if (sel) { const R = rect(); x = R.x0; n = R.x1 - R.x0 + 1; if (rowOnly) rows = range(R.r0, R.r1); }
  insertCols(b, x, n, rows); cellChange();
}
function delCol(back, rowOnly) {
  const b = blk(); let rows = rowOnly ? [cur.row] : null;
  if (sel) {
    const R = rect(); if (rowOnly) rows = range(R.r0, R.r1);
    deleteCols(b, R.x0, R.x1 - R.x0 + 1, rows); sel = null; cur.x = clamp(R.x0, minX(b, cur.row), maxX(b, cur.row));
  } else if (back) {
    if (cur.x <= minX(b, cur.row)) return;
    cur.x--; deleteCols(b, cur.x, 1, rows);
  } else deleteCols(b, cur.x, 1, rows);
  setAnchor(); cellChange();
}
function needStaff() {
  const b = activeTab();
  if (!b) { toast('Click a spot on a staff first'); return null; }
  const g = gridOf(cur.bi); if (g && document.activeElement !== g) g.focus({ preventScroll: true });
  return b;
}
function barLine() {
  const b = needStaff(); if (!b) return; collapseSel();
  const x = Math.max(cur.x, P(b));
  for (let i = 0; i < nS(b); i++) setCh(b, nA(b) + i, x, '|');
  cur.x = clamp(x + 1, minX(b, cur.row), maxX(b, cur.row)); setAnchor(); cellChange();
}
function repeatMark(start) {
  const b = needStaff(); if (!b) return; collapseSel();
  const p = P(b), a = nA(b), n = nS(b); let x = Math.max(cur.x, p);
  const dots = n >= 4 ? [1, n - 2] : [Math.floor((n - 1) / 2)], all = range(0, n - 1);
  const col = (xx, ch, rows) => rows.forEach(i => setCh(b, a + i, xx, ch));
  if (start) {
    if (x > p) { col(x, '|', all); x++; }      // at the very start the staff's own edge is the bar
    col(x, 'o', dots); x += 2;                  // leave one dash after the dots
  } else {
    col(x, 'o', dots);
    const end = p + b.w;                        // the closing | of the staff counts as one of the two bars
    if (x + 1 < end) col(x + 1, '|', all);
    if (x + 2 < end) col(x + 2, '|', all);
    x += 3;
  }
  cur.x = clamp(x, minX(b, cur.row), maxX(b, cur.row)); setAnchor(); cellChange();
}
function wrapNum(open, close) {
  const b = needStaff(); if (!b) return; collapseSel();
  const ri = rowInfo(b, cur.row);
  if (ri.kind === 'str') {
    const s = ri.arr[ri.i], p = P(b), isD = i => i >= 0 && i < s.length && /\d/.test(s[i]);
    let c = cur.x - p; if (!isD(c) && isD(c - 1)) c--;
    if (isD(c)) {
      let a = c, z = c; while (isD(a - 1)) a--; while (isD(z + 1)) z++;
      if (s[a - 1] === '-' && (z + 1 >= s.length || s[z + 1] === '-')) {
        setCh(b, cur.row, p + a - 1, open); setCh(b, cur.row, p + z + 1, close);
        cur.x = Math.min(p + z + 2, maxX(b, cur.row)); return cellChange();
      }
    }
  }
  typeText(open + close);
}
function palmMute() {
  const b = needStaff(); if (!b) return;
  let struct = false;
  if (!b.above.length) { b.above.push(''); cur.row++; if (sel) sel.row++; struct = true; }
  const r = nA(b) - 1;
  if (sel) { const R = rect(), w = R.x1 - R.x0 + 1; writeLines(b, r, R.x0, [w >= 4 ? 'PM' + '-'.repeat(w - 3) + '|' : 'PM']); }
  else writeLines(b, r, cur.x, ['PM']);
  if (struct) structChange(); else cellChange();
}
function addLegend() {
  const L = legendLines(doc);
  if (!L.length) return toast('No technique symbols in the tab yet');
  doc.blocks.push({ type: 'text', text: 'Legend\n' + L.join('\n') });
  cur = { bi: doc.blocks.length - 1, row: 0, x: 0 }; sel = null; structChange();
  showBlock(cur.bi);
}

function onKey(e) {
  const b = activeTab(); if (!b || e.isComposing) return;
  const k = e.key, ctrl = (e.ctrlKey || e.metaKey) && !e.altKey, sh = e.shiftKey;
  let done = true;
  if (ctrl) {
    switch (k.length === 1 ? k.toLowerCase() : k) {
      case 'a': sel = { row: 0, x: P(b) }; cur.row = nR(b) - 1; cur.x = P(b) + b.w - 1; renderCursor(); break;
      case 'd': dupSel(); break;
      case 'b': barLine(); break;
      case 'Enter': addBlock('tab', cur.bi + 1, cur.row); break;
      case ' ': insCol(sh); break;
      case 'Backspace': delCol(true, sh); break;
      case 'Delete': delCol(false, sh); break;
      case 'ArrowLeft': move(0, -4, sh); break;
      case 'ArrowRight': move(0, 4, sh); break;
      case 'ArrowUp': move(-1, 0, sh); break;
      case 'ArrowDown': move(1, 0, sh); break;
      default: done = false;
    }
  } else {
    switch (k) {
      case 'ArrowLeft': move(0, -1, sh); break;
      case 'ArrowRight': move(0, 1, sh); break;
      case 'ArrowUp': move(-1, 0, sh); break;
      case 'ArrowDown': move(1, 0, sh); break;
      case 'Home': goTo(0, sh); break;
      case 'End': {
        const ri = rowInfo(b, cur.row), s = ri.arr[ri.i]; let t = s.length;
        if (ri.kind === 'str') { const m = s.replace(/-+$/, '').length; t = P(b) + Math.min(m ? m + 1 : 0, b.w); if (cur.x === t) t = P(b) + b.w; }
        goTo(t, sh); break;
      }
      case 'Enter': {
        sel = null; const r = clamp(cur.row + (sh ? -1 : 1), 0, nR(b) - 1);
        cur.row = r; cur.x = clamp(anchor.x, minX(b, r), maxX(b, r)); renderCursor(); reveal(); break;
      }
      case 'Tab': {
        sel = null; const r = clamp(anchor.row, 0, nR(b) - 1);
        const x = sh ? anchor.x - 2 : Math.max(anchor.maxX, anchor.x + 1) + 1;
        cur.row = r; cur.x = clamp(x, minX(b, r), maxX(b, r)); setAnchor(); renderCursor(); reveal(); break;
      }
      case 'Backspace':
        if (sel) clearSel();
        else { if (cur.x <= minX(b, cur.row)) break; cur.x--; setCh(b, cur.row, cur.x, ' '); }
        cellChange(); break;
      case 'Delete': clearSel(); cellChange(); break;
      case 'Insert': insCol(sh); break;
      case 'Escape': if (playState) stopPlay(); sel = null; renderCursor(); break;
      default:
        if (k.length === 1 && !e.metaKey && !(e.altKey && !e.ctrlKey)) typeText(k); else done = false;
    }
  }
  if (done) e.preventDefault();
}
document.addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === 'p' && !$('dlgImport').open) { e.preventDefault(); togglePlay(e.shiftKey); return; }
  if (e.target.closest && e.target.closest('textarea, input, dialog')) return;
  if (k === 'z') { e.preventDefault(); timeTravel(e.shiftKey ? 1 : -1); }
  else if (k === 'y') { e.preventDefault(); timeTravel(1); }
});

/* ---------- block operations ---------- */
function addBlock(type, at, row) {
  let b;
  if (type === 'tab') {
    let like = null;
    for (let i = at - 1; i >= 0 && !like; i--) if (doc.blocks[i].type === 'tab') like = doc.blocks[i];
    if (!like) like = doc.blocks.find(x => x.type === 'tab') || null;
    b = newTab(like);
  } else b = { type: 'text', text: '' };
  doc.blocks.splice(at, 0, b); sel = null;
  cur = b.type === 'tab' ? { bi: at, row: clamp(row ?? nA(b), 0, nR(b) - 1), x: P(b) } : { bi: at, row: 0, x: 0 };
  if (b.type === 'tab') cur.x = clamp(cur.x, minX(b, cur.row), maxX(b, cur.row));
  setAnchor(); structChange();
  showBlock(at);
}
function blockAct(e, bi) {
  const btn = e.target.closest('button'); if (!btn) return;
  const act = btn.dataset.act, b = doc.blocks[bi], B = doc.blocks;
  if (act === 'above') { b.above.unshift(''); if (cur.bi === bi) cur.row++; else cur = { bi, row: 0, x: 0 }; }
  else if (act === 'below') { b.below.push(''); }
  else if (act === 'dup') { B.splice(bi + 1, 0, JSON.parse(JSON.stringify(b))); cur = { ...cur, bi: bi + 1 }; if (cur.row >= nR(b)) cur.row = nA(b); }
  else if (act === 'up' || act === 'down') {
    const ni = bi + (act === 'up' ? -1 : 1); if (ni < 0 || ni >= B.length) return;
    [B[bi], B[ni]] = [B[ni], B[bi]];
    if (cur.bi === bi) cur.bi = ni; else if (cur.bi === ni) cur.bi = bi;
  } else if (act === 'del') {
    B.splice(bi, 1);
    if (cur.bi > bi) cur.bi--; else if (cur.bi === bi) cur = { bi: Math.min(bi, B.length - 1), row: 0, x: 0 };
  }
  sel = null;
  const nb = activeTab(); if (nb) { cur.row = clamp(cur.row, 0, nR(nb) - 1); cur.x = clamp(cur.x, minX(nb, cur.row), maxX(nb, cur.row)); }
  renderAll(); commit();
}

/* ---------- playback ----------
   A tab has no rhythm in it, so every column gets the same slice of time. Spacing the notes
   out with dashes is what makes it sound right. */
let playState = null;
function buildPlayback(fromCursor) {
  const step = 1 / settings.speed, segs = [], events = [];
  let t = 0;
  const addSeg = (bi, c0, c1, rows, trim) => {
    const b = doc.blocks[bi], midi = tuningMidi(b.labels), notes = [];
    b.strings.forEach((s, i) => {
      if (rows && !rows.includes(i)) return;
      for (const n of stringNotes(s)) if (n.col >= c0 && n.col <= c1) notes.push({ ...n, i });
    });
    if (!notes.length) return;
    if (trim) {                                   // skip the empty run-in and run-out of a staff
      c0 = Math.max(c0, Math.min(...notes.map(n => n.col)) - 1);
      c1 = Math.min(c1, Math.max(...notes.map(n => n.col + n.len - 1)) + 1);
    }
    for (const n of notes) events.push({ t: t + (n.col - c0) * step, midi: midi[n.i] + (n.mute ? 0 : n.fret), string: n.i, soft: n.soft, mute: n.mute });
    const t1 = t + (c1 - c0 + 1) * step;
    segs.push({ bi, c0, c1, t0: t, t1 }); t = t1;
  };
  const b = activeTab();
  if (b && sel) {
    const R = rect(), rows = range(R.r0, R.r1).filter(r => isStr(b, r)).map(r => r - nA(b));
    addSeg(cur.bi, Math.max(0, R.x0 - P(b)), Math.min(b.w - 1, R.x1 - P(b)), rows.length ? rows : null, false);
  } else {
    let start = doc.blocks.findIndex((x, i) => i >= cur.bi && x.type === 'tab');
    if (start < 0) start = doc.blocks.findIndex(x => x.type === 'tab');
    for (let bi = start; bi >= 0 && bi < doc.blocks.length; bi++) {
      const x = doc.blocks[bi]; if (x.type !== 'tab') continue;
      addSeg(bi, fromCursor && bi === cur.bi ? Math.max(0, cur.x - P(x)) : 0, x.w - 1, null, true);
    }
  }
  events.sort((a, b2) => a.t - b2.t);
  return { segs, events, total: t, step, key: '', bi: -1, raf: 0 };
}
function togglePlay(fromCursor) {
  if (playState) return stopPlay();
  const p = buildPlayback(fromCursor);
  if (!p.events.length) return toast('Nothing to play here yet');
  if (!Sound.play(p.events, p.total, stopPlay)) return toast('This browser has no Web Audio, so playback is unavailable');
  playState = p; $('btnPlay').textContent = '■ Stop';
  tick();
}
function stopPlay() {
  if (!playState) return;
  cancelAnimationFrame(playState.raf); playState = null;
  Sound.stop();
  $('btnPlay').textContent = '▶ Play';
  ed.querySelectorAll('.playhead').forEach(el => { el.style.display = 'none'; });
}
function tick() {
  if (!playState) return;
  const el = Sound.elapsed(), seg = el >= 0 && playState.segs.find(s => el < s.t1);
  if (seg) {
    const col = seg.c0 + Math.max(0, Math.floor((el - seg.t0) / playState.step)), key = seg.bi + ':' + col;
    if (key !== playState.key) {
      playState.key = key;
      ed.querySelectorAll('.playhead').forEach(x => { x.style.display = 'none'; });
      const b = doc.blocks[seg.bi], g = gridOf(seg.bi);
      if (b && b.type === 'tab' && g) {
        const ph = g.querySelector('.playhead');
        place(ph, P(b) + col, nA(b), 1, nS(b)); ph.style.display = 'block';
        if (seg.bi !== playState.bi) { playState.bi = seg.bi; showBlock(seg.bi); }
        ph.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    }
  }
  playState.raf = requestAnimationFrame(tick);
}
/* the note under a cell, for "sound as I type" */
function soundAt(b, row, x) {
  if (!isStr(b, row)) return;
  const i = row - nA(b), c = x - P(b), n = stringNotes(b.strings[i]).find(q => c >= q.col && c < q.col + q.len);
  if (n) Sound.pluck(tuningMidi(b.labels)[i] + (n.mute ? 0 : n.fret), { string: i, mute: n.mute });
}

/* ---------- toolbars ---------- */
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2400);
}
function typeFromBar(t) { if (needStaff()) typeText(t); }
function buildTechBar() {
  const bar = $('techBar');
  const add = (label, title, fn, cls) => {
    const b = document.createElement('button'); b.textContent = label; b.title = title; if (cls) b.className = cls;
    b.addEventListener('mousedown', e => e.preventDefault());     // keep the cursor in the staff
    b.addEventListener('click', fn); bar.appendChild(b);
  };
  const sep = () => { const s = document.createElement('div'); s.className = 'sep'; bar.appendChild(s); };
  const lab = t => { const s = document.createElement('span'); s.className = 'lab'; s.textContent = t; bar.appendChild(s); };
  lab('Techniques');
  [['h', 'Hammer-on'], ['p', 'Pull-off'], ['/', 'Slide up'], ['\\', 'Slide down'], ['b', 'Bend'], ['r', 'Release'], ['^', 'Bend (short form)'],
   ['~', 'Vibrato'], ['x', 'Muted / dead note'], ['t', 'Tap'], ['tr', 'Trill']].forEach(([c, d]) => add(c, d + ': types "' + c + '" at the cursor', () => typeFromBar(c), 'k'));
  add('( )', 'Ghost note: wraps the fret number at the cursor in ( )', () => wrapNum('(', ')'), 'k');
  add('< >', 'Harmonic: wraps the fret number at the cursor in < >', () => wrapNum('<', '>'), 'k');
  add('PM', 'Palm mute: writes PM on the line above. Select a span of columns first to get PM-----|', palmMute, 'k');
  sep(); lab('Structure');
  add('| Bar', 'Bar line down every string at the cursor (Ctrl+B)', barLine);
  add('|o Repeat', 'Repeat start at the cursor', () => repeatMark(true));
  add('Repeat o||', 'Repeat end at the cursor', () => repeatMark(false));
  add('+ Col', 'Insert an empty column at the cursor (Ctrl+Space)', () => { if (needStaff()) insCol(false); });
  add('− Col', 'Remove the column at the cursor (Ctrl+Delete)', () => { if (needStaff()) delCol(false, false); });
  sep();
  add('+ Staff', 'New staff below the current one (Ctrl+Enter)', () => addBlock('tab', cur.bi >= 0 ? cur.bi + 1 : doc.blocks.length));
  add('+ Text', 'New text block below the current one', () => addBlock('text', cur.bi >= 0 ? cur.bi + 1 : doc.blocks.length));
  add('Legend', 'Add a legend at the end for the symbols used in this tab', addLegend);
}
function syncStaffBar() {
  const b = activeTab(), els = ['selPreset', 'inpLabels', 'chkLabels', 'inpWidth', 'btnAll'].map($);
  if ($('staffBar').contains(document.activeElement)) return;      // don't yank values while the user edits them
  els.forEach(el => { el.disabled = !b; });
  if (!b) return;
  const lab = b.labels.join(' ');
  $('inpLabels').value = lab; $('chkLabels').checked = b.showLabels; $('inpWidth').value = b.w;
  $('selPreset').value = PRESETS.some(p => p.labels === lab) ? lab : '';
}
function staffTarget() { const b = doc.blocks[barTarget]; return b && b.type === 'tab' ? b : null; }
function afterStaffEdit() {
  const b = activeTab();
  if (b) { cur.row = clamp(cur.row, 0, nR(b) - 1); cur.x = clamp(cur.x, minX(b, cur.row), maxX(b, cur.row)); }
  sel = null; renderAll(); commit();
  setTimeout(() => { if (!document.activeElement || document.activeElement === document.body) focusCur(); syncStaffBar(); }, 0);
}
function setLabelsFromInput() {
  const b = staffTarget(); if (!b) return;
  const labels = $('inpLabels').value.split(/[\s,]+/).filter(Boolean).slice(0, 12);
  if (!labels.length) { $('inpLabels').value = b.labels.join(' '); return; }
  if (labels.length < nS(b) && b.strings.slice(labels.length).some(s => /[^-]/.test(s))) toast('Removed strings that had notes on them. Undo brings them back.');
  const d = applyStaff(b, labels, b.showLabels); if (barTarget === cur.bi) cur.x += d;
  afterStaffEdit();
}
function initStaffBar() {
  const sp = $('selPreset');
  sp.innerHTML = '<option value="">Custom</option>' + PRESETS.map(p => `<option value="${p.labels}">${p.name}</option>`).join('');
  $('staffBar').addEventListener('focusin', () => { barTarget = cur.bi; });
  sp.addEventListener('change', () => { if (sp.value) { $('inpLabels').value = sp.value; setLabelsFromInput(); } });
  $('inpLabels').addEventListener('change', setLabelsFromInput);
  $('inpLabels').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });
  $('chkLabels').addEventListener('change', e => {
    const b = staffTarget(); if (!b) return;
    const d = applyStaff(b, b.labels, e.target.checked); if (barTarget === cur.bi) cur.x += d;
    afterStaffEdit();
  });
  $('inpWidth').addEventListener('change', e => {
    const b = staffTarget(); if (!b) return;
    const w = clamp(parseInt(e.target.value, 10) || b.w, 4, 300);
    if (w < b.w && b.strings.some(s => /[^-]/.test(s.slice(w)))) toast('Cut off some notes at the end. Undo brings them back.');
    b.strings = b.strings.map(s => s.slice(0, w).padEnd(w, '-')); b.w = w;
    afterStaffEdit();
  });
  $('inpWidth').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });
  $('btnAll').addEventListener('click', () => {
    const src = staffTarget() || activeTab(); if (!src) return;
    doc.blocks.forEach(b => { if (b.type === 'tab' && b !== src) applyStaff(b, src.labels, src.showLabels); });
    afterStaffEdit(); toast('Tuning applied to every staff');
  });
}

/* ---------- chords ---------- */
function stamp(shape, name) {
  const b = needStaff(); if (!b) return;
  if (shape.length !== nS(b)) return toast(`That shape is for ${shape.length} strings; this staff has ${nS(b)}.`);
  collapseSel();
  const x = Math.max(cur.x, P(b));
  const w = Math.max(1, ...shape.map(v => v == null ? 0 : String(v).length));
  shape.forEach((v, i) => { if (v != null) writeLines(b, nA(b) + nS(b) - 1 - i, x, [String(v)]); });   // shape is lowest string first
  let struct = false;
  if (name && $('chkName').checked) {
    if (!b.above.length) { b.above.push(''); cur.row++; struct = true; }
    const row = b.above[nA(b) - 1];
    const free = !row.slice(Math.max(0, x - 1), x + name.length + 1).trim();
    if (free) writeLines(b, nA(b) - 1, x, [name]);
  }
  cur.x = clamp(x + w + 1, minX(b, cur.row), maxX(b, cur.row)); setAnchor();
  if (struct) structChange(); else cellChange();
  reveal();
  if (settings.typeSound) {
    const midi = tuningMidi(b.labels); let k = 0;
    shape.forEach((v, i) => { const s = nS(b) - 1 - i; if (v != null) Sound.pluck(midi[s] + +v, { string: s, delay: 0.025 * k++ }); });
  }
}
function renderVoicings() {
  const { name, list } = voicings(+$('chRoot').value, $('chQual').value), box = $('voicings');
  box.textContent = '';
  const labs = ['e', 'B', 'G', 'D', 'A', 'E'];
  list.forEach(v => {
    const w = Math.max(1, ...v.shape.map(f => f == null ? 0 : String(f).length));
    const pre = labs.map((l, i) => { const f = v.shape[5 - i]; return l + '|-' + (f == null ? '' : String(f)).padEnd(w, '-') + '-'; }).join('\n');
    const btn = document.createElement('button'); btn.className = 'voi'; btn.title = 'Stamp ' + name + ' at the cursor';
    btn.innerHTML = `<pre>${esc(pre)}</pre><small>${esc(name)} · ${esc(v.label)}</small>`;
    btn.addEventListener('mousedown', e => e.preventDefault());
    btn.addEventListener('click', () => stamp(v.shape, name));
    box.appendChild(btn);
  });
  if (!list.length) box.innerHTML = '<span class="hint">No stock shape for this one. Use a custom shape below.</span>';
}
function initChords() {
  $('chRoot').innerHTML = ROOTS.map((r, i) => `<option value="${i}">${r}</option>`).join('');
  $('chQual').innerHTML = QUALS.map(q => `<option value="${q[0]}">${q[1]}</option>`).join('');
  $('chRoot').value = '9'; $('chQual').value = 'm';
  $('chRoot').addEventListener('change', renderVoicings); $('chQual').addEventListener('change', renderVoicings);
  const custom = () => {
    const raw = $('chCustom').value.trim(); if (!raw) return;
    const toks = /[\s,.]/.test(raw) ? raw.split(/[\s,.]+/).filter(Boolean) : [...raw];
    if (!toks.every(t => /^(\d+|x)$/i.test(t))) return toast('Use fret numbers and x only, lowest string first, e.g. x32010 or 8 10 10 9 8 8');
    stamp(toks.map(t => /x/i.test(t) ? null : t), '');
  };
  $('btnCustom').addEventListener('click', custom);
  $('chCustom').addEventListener('keydown', e => { if (e.key === 'Enter') custom(); });
  renderVoicings();
}

/* ---------- top bar ---------- */
async function copyText(text, msg) {
  try { await navigator.clipboard.writeText(text); }
  catch (e) {                                   // plain http (not localhost) has no clipboard API
    const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
  }
  toast(msg);
}
function effectiveTheme() {
  return document.documentElement.dataset.theme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}
function syncTheme() {
  const dark = effectiveTheme() === 'dark', btn = $('btnTheme');
  btn.textContent = dark ? '☀ Light' : '☾ Dark';
  btn.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
}
function initTop() {
  for (const id of ['btnUndo', 'btnRedo', 'btnPlay']) $(id).addEventListener('mousedown', e => e.preventDefault());
  $('btnUndo').addEventListener('click', () => timeTravel(-1));
  $('btnRedo').addEventListener('click', () => timeTravel(1));
  $('btnPlay').addEventListener('click', e => togglePlay(e.shiftKey));
  $('rngSpeed').value = settings.speed;
  $('rngSpeed').addEventListener('input', e => { settings.speed = clamp(+e.target.value || 8, 2, 20); saveSettings(); });
  $('chkTypeSound').checked = !!settings.typeSound;
  $('chkTypeSound').addEventListener('change', e => { settings.typeSound = e.target.checked; saveSettings(); });
  $('btnTheme').addEventListener('click', () => {
    settings.theme = effectiveTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = settings.theme; saveSettings(); syncTheme();
  });
  syncTheme();
  $('btnCopy').addEventListener('click', () => copyText(toText(doc), 'Tab copied'));
  $('btnCopyMd').addEventListener('click', () => copyText('```\n' + toText(doc) + '```\n', 'Tab copied as a code block'));
  $('btnNew').addEventListener('click', () => {
    stopPlay();
    doc = defaultDoc(); cur = { bi: 1, row: nA(doc.blocks[1]), x: P(doc.blocks[1]) }; sel = null; setAnchor();
    structChange(); toast('Started a new tab. Undo brings the old one back.');
  });
  const dlg = $('dlgImport');
  $('btnImport').addEventListener('click', () => { $('impText').value = ''; dlg.showModal(); $('impText').focus(); });
  $('impCancel').addEventListener('click', () => dlg.close());
  const doImport = replace => {
    const blocks = parseTab($('impText').value);
    if (!blocks.length) return toast('Nothing to import');
    stopPlay();
    doc.blocks = replace ? blocks : doc.blocks.concat(blocks);
    const first = replace ? 0 : doc.blocks.length - blocks.length;
    const ti = doc.blocks.findIndex((b, i) => i >= first && b.type === 'tab');
    cur = ti >= 0 ? { bi: ti, row: nA(doc.blocks[ti]), x: P(doc.blocks[ti]) } : { bi: first, row: 0, x: 0 };
    sel = null; setAnchor(); dlg.close(); structChange();
    $('edwrap').scrollLeft = 0; showBlock(cur.bi);
    toast(`Imported ${blocks.filter(b => b.type === 'tab').length} staff(s)`);
  };
  $('impReplace').addEventListener('click', () => doImport(true));
  $('impAppend').addEventListener('click', () => doImport(false));
}

/* ---------- boot ---------- */
measure();
doc = load() || defaultDoc();
const firstTab = doc.blocks.findIndex(b => b.type === 'tab');
if (firstTab >= 0) cur = { bi: firstTab, row: nA(doc.blocks[firstTab]), x: P(doc.blocks[firstTab]) };
setAnchor();
buildTechBar(); initStaffBar(); initChords(); initTop();
renderAll(); commit(); focusCur();
const remeasure = () => { const old = CW; measure(); if (CW !== old) renderAll(); };
window.addEventListener('resize', remeasure);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(remeasure);

/* handy for poking at it from the browser console */
window.__tab = { parseTab, toText: () => toText(doc), get doc() { return doc; }, get cur() { return cur; }, get playing() { return playState; } };
})();
