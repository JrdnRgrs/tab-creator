'use strict';
/* Run with: npm test   (or: node --test) */
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../public/js/core.js');
const chords = require('../public/js/chords.js');

const EXAMPLE = `Gamma Knife by King Gizzard

These are the sections of the song.
You'll need to play along/listen to put them together with the correct timing

Intro
e|--------------------------------------------------------------------------|
B|-------------6------------------------------------------------------------|
G|---7-7-5-7-7-7-7-7-5-7----7-7-7-7-7-7-7-7-7-7-7-7-7-7-7-7-----------------|
D|---0-0-0-0-0-0-0-0-0-0----0-0-0-0-0-0-0-0-0-0-0-0-0-0-0-0-----------------|
A|--------------------------------------------------------------------------|
E|--------------------------------------------------------------------------|

Milk and honey.................unborn self...............
e|--------------------------------------------------------------------------|
B|--------------------------------------------------------------------------|
G|---7-7-5-4-4-5-2-2-4-0-0-2------------------------------------------------|
D|---0-0-0-0-0-0-0-0-0-0-0-0------------------------------------------------|
A|----------------------------3h5-5-5-5-3h5-5-5-5-3h5-5-5-5-----------------|
E|--------------------------------------------------------------------------|

|--18^--18^--18-15----------15-15----------------------15-------------------|
|------------------18---18^--------18-15-------------15----18-15------------|
|----------------------------------------17-15tr--17^------------17---------|
|---------------------------------------------------------------------------|
|---------------------------------------------------------------------------|
|---------------------------------------------------------------------------|

Intro
    Gtrs I, II
|---------------|----------------------------||---------|
|o--------------|---5-5---------------------o||---------|
|---------------|---5-5b5.5------------------||---------|
|---------------|---------------5------------||---------|
|o-7--10--7-----|-----------5h7---7s5-3-----o||---------|
|--5---8--5-----|-----------------------3h5--||-5-------|
 |-Rhy Fig 1                    end Rhy Fig 1-||-Fill 1-|

|-------------------------------------------|------------------------|
|-----------5-8-5---------------------------|------------------------|
|-7b9==(7)r-------7b9==(7)r(7)p5-7p5--------|-----------5------------|
|------------------------------------7-5h7--|-----5-5h7---7p5---5h7--|
|-------------------------------------------|-5h7-------------7------|
|-------------------------------------------|------------------------|
`;

test('import then export gives back the same text', () => {
  const doc = { blocks: core.parseTab(EXAMPLE) };
  assert.equal(core.toText(doc), EXAMPLE);
});

test('import recognises staffs, labels and attached text lines', () => {
  const blocks = core.parseTab(EXAMPLE);
  assert.deepEqual(blocks.map(b => b.type), ['text', 'tab', 'tab', 'tab', 'tab', 'tab']);
  assert.equal(blocks[1].showLabels, true);
  assert.deepEqual(blocks[1].above, ['Intro']);
  assert.equal(blocks[1].w, 74);
  assert.equal(blocks[3].showLabels, false);
  assert.deepEqual(blocks[3].labels, ['e', 'B', 'G', 'D', 'A', 'E']);       // sensible defaults when the tab had none
  assert.deepEqual(blocks[4].above, ['Intro', '    Gtrs I, II']);
  assert.equal(blocks[4].below.length, 1);
});

test('import ignores markdown code fences and survives sanitize()', () => {
  const src = '```\ne|--3--|\nB|--0--|\n```\n';
  const doc = core.sanitize({ blocks: core.parseTab(src) });
  assert.equal(core.toText(doc), 'e|--3--|\nB|--0--|\n');
});

test('typing overwrites a cell without moving anything else', () => {
  const b = core.newTab(), p = core.P(b), g = core.nA(b) + 2;      // the G string row
  core.writeLines(b, g, p + 3, ['12']);
  assert.equal(b.strings[2].slice(0, 8), '---12---');
  assert.equal(b.w, core.DEFAULT_W);
  assert.ok(b.strings.every(s => s.length === b.w));
  assert.equal(b.strings[1], '-'.repeat(b.w));
});

test('writing past the end grows every string', () => {
  const b = core.newTab(), p = core.P(b);
  core.setCh(b, core.nA(b), p + b.w, '5');
  assert.equal(b.w, core.DEFAULT_W + 1);
  assert.ok(b.strings.every(s => s.length === b.w));
  assert.equal(b.strings[0].at(-1), '5');
});

test('inserting a column keeps the width when the last column was empty', () => {
  const b = core.newTab(), p = core.P(b), row = core.nA(b);
  core.setCh(b, row, p + 4, '7');
  b.above[0] = '      Am';                       // sits over column 4
  core.insertCols(b, p + 2, 1, null);
  assert.equal(b.w, core.DEFAULT_W);
  assert.equal(b.strings[0][5], '7');
  assert.equal(b.above[0], '       Am');         // the text line moved with the staff
});

test('inserting a column widens the staff when a note sits in the last column', () => {
  const b = core.newTab(), p = core.P(b), row = core.nA(b);
  core.setCh(b, row, p + b.w - 1, '3');
  core.insertCols(b, p, 1, null);
  assert.equal(b.w, core.DEFAULT_W + 1);
  assert.equal(b.strings[0].at(-1), '3');
});

test('inserting and deleting on one string leaves the others alone', () => {
  const b = core.newTab(), p = core.P(b), a = core.nA(b);
  core.setCh(b, a, p + 2, '5'); core.setCh(b, a + 1, p + 2, '6');
  core.insertCols(b, p, 1, [a]);
  assert.equal(b.strings[0][3], '5');
  assert.equal(b.strings[1][2], '6');
  core.deleteCols(b, p, 1, [a]);
  assert.equal(b.strings[0][2], '5');
  assert.ok(b.strings.every(s => s.length === b.w));
});

test('changing the labels changes the string count and keeps text lines aligned', () => {
  const b = core.newTab();
  b.above[0] = '  Am';
  core.applyStaff(b, ['G', 'D', 'A', 'E'], true);
  assert.equal(b.strings.length, 4);
  const d = core.applyStaff(b, ['eb', 'Bb', 'Gb', 'Db', 'Ab', 'Eb'], true);
  assert.equal(d, 1);                              // two-letter labels push the staff one column right
  assert.equal(b.above[0], '   Am');
  assert.equal(core.tabLines(b)[1], 'eb|' + '-'.repeat(b.w) + '|');
});

test('notes are read off a string the way a player would read them', () => {
  const frets = s => core.stringNotes(s).map(n => n.mute ? 'x' : n.fret);
  assert.deepEqual(frets('--12-5h7--'), [12, 5, 7]);
  assert.deepEqual(frets('-35-110-x-'), [3, 5, 11, 0, 'x']);     // 35 is not a fret, so it is 3 then 5
  assert.deepEqual(frets('-7b9==(7)r-'), [7, 9, 7]);
  assert.equal(core.stringNotes('-5h7-')[1].soft, true);
  assert.equal(core.stringNotes('-5h7-')[0].soft, false);
});

test('open-string pitches: presets are exact, other tunings are worked out', () => {
  assert.deepEqual(core.tuningMidi('e B G D A E'.split(' ')), [64, 59, 55, 50, 45, 40]);
  assert.deepEqual(core.tuningMidi('G D A E'.split(' ')), [43, 38, 33, 28]);
  assert.deepEqual(core.tuningMidi('d A F C G C'.split(' ')), [62, 57, 53, 48, 43, 36]);   // drop C, not a preset
});

test('legend lists only the symbols that are used', () => {
  const doc = { blocks: core.parseTab('  PM----|\ne|--5h7--x--|\nB|--7b9-----|\n') };
  assert.deepEqual(core.legendLines(doc), ['h   hammer-on', 'b   bend', 'x   muted note', 'PM  palm mute']);
});

test('chord shapes', () => {
  const show = v => v.shape.map(f => f ?? 'x').join(' ');
  const am = chords.voicings(chords.ROOTS.indexOf('A'), 'm');
  assert.equal(am.name, 'Am');
  assert.equal(show(am.list[0]), 'x 0 2 2 1 0');
  const f = chords.voicings(chords.ROOTS.indexOf('F'), '');
  assert.equal(show(f.list[0]), '1 3 3 2 1 1');
  assert.ok(f.list.some(v => show(v) === 'x 8 10 10 10 8'));
  const e = chords.voicings(chords.ROOTS.indexOf('E'), '');
  assert.equal(e.list.filter(v => show(v) === '0 2 2 1 0 0').length, 1);     // the open shape is not listed twice
});
