/* Chord shapes for the chord stamp panel: six strings, standard tuning.
 * A shape is an array of six frets, lowest string first, with null for a string that is not played.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TabChords = api;
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

const ROOTS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const QUALS = [['', 'major'], ['m', 'minor'], ['7', '7'], ['maj7', 'maj7'], ['m7', 'm7'], ['sus2', 'sus2'], ['sus4', 'sus4'], ['add9', 'add9'], ['5', '5 (power chord)']];

const OPEN = {
  C: 'x32010', C7: 'x32310', Cmaj7: 'x32000', Cadd9: 'x32030',
  D: 'xx0232', Dm: 'xx0231', D7: 'xx0212', Dmaj7: 'xx0222', Dm7: 'xx0211', Dsus2: 'xx0230', Dsus4: 'xx0233',
  E: '022100', Em: '022000', E7: '020100', Emaj7: '021100', Em7: '022030', Esus4: '022200', Eadd9: '024100',
  Fmaj7: 'xx3210', G: '320003', G7: '320001', Gmaj7: '320002', Gadd9: '320203',
  A: 'x02220', Am: 'x02210', A7: 'x02020', Amaj7: 'x02120', Am7: 'x02010', Asus2: 'x02200', Asus4: 'x02230', Aadd9: 'x02420',
  B7: 'x21202',
};

/* movable shapes, as offsets from the fret of the root note */
const X = null;
const ESHAPE = { '': [0, 2, 2, 1, 0, 0], m: [0, 2, 2, 0, 0, 0], 7: [0, 2, 0, 1, 0, 0], maj7: [0, 2, 1, 1, 0, 0], m7: [0, 2, 0, 0, 0, 0], sus4: [0, 2, 2, 2, 0, 0], add9: [0, 2, 4, 1, 0, 0], 5: [0, 2, 2, X, X, X] };
const ASHAPE = { '': [X, 0, 2, 2, 2, 0], m: [X, 0, 2, 2, 1, 0], 7: [X, 0, 2, 0, 2, 0], maj7: [X, 0, 2, 1, 2, 0], m7: [X, 0, 2, 0, 1, 0], sus2: [X, 0, 2, 2, 0, 0], sus4: [X, 0, 2, 2, 3, 0], add9: [X, 0, 2, 4, 2, 0], 5: [X, 0, 2, 2, X, X] };

/* rootIndex is an index into ROOTS, quality is the first item of a QUALS entry */
function voicings(rootIndex, quality) {
  const name = ROOTS[rootIndex] + quality, list = [], seen = new Set();
  const push = (shape, label) => { const k = shape.map(v => v ?? 'x').join(','); if (!seen.has(k)) { seen.add(k); list.push({ shape, label }); } };
  if (OPEN[name]) push([...OPEN[name]].map(c => c === 'x' ? X : +c), 'open');
  const fe = (rootIndex - 4 + 12) % 12, fa = (rootIndex - 9 + 12) % 12;      // root fret on the low E and A strings
  const mk = (tpl, f) => tpl.map(v => v === X ? X : v + f);
  const cands = [];
  if (ESHAPE[quality]) cands.push([fe, mk(ESHAPE[quality], fe), fe ? 'E shape, fret ' + fe : 'open']);
  if (ASHAPE[quality]) cands.push([fa, mk(ASHAPE[quality], fa), fa ? 'A shape, fret ' + fa : 'open']);
  cands.sort((a, b) => a[0] - b[0]).forEach(c => push(c[1], c[2]));
  return { name, list };
}

return { ROOTS, QUALS, voicings };
});
