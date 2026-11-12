/* Plucked-string playback (Karplus-Strong synthesis through the Web Audio API).
 * It knows nothing about tabs: the app hands it note events with times in seconds.
 * The audio context is only created on the first play, which must come from a click or key press.
 */
(function () {
'use strict';

let ctx = null, master = null, playing = null;
const cache = new Map();          // midi -> { buf, rate }
const live = new Map();           // string -> last voice started by pluck()

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.5;
    const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 5500;
    const comp = ctx.createDynamicsCompressor();
    master.connect(tone); tone.connect(comp); comp.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/* One plucked note, rendered once per pitch and reused. The delay line has to be a whole
   number of samples, so the leftover tuning error is corrected with the playback rate. */
function buffer(midi) {
  midi = Math.max(16, Math.min(100, Math.round(midi)));
  let e = cache.get(midi); if (e) return e;
  const sr = ctx.sampleRate, freq = 440 * Math.pow(2, (midi - 69) / 12);
  const N = Math.max(2, Math.round(sr / freq)), len = Math.floor(sr * 3);
  const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0), ring = new Float32Array(N);
  let lp = 0;
  for (let i = 0; i < N; i++) { lp = 0.5 * lp + 0.5 * (Math.random() * 2 - 1); ring[i] = lp; }
  let idx = 0, peak = 0;
  for (let i = 0; i < len; i++) {
    const nx = idx + 1 === N ? 0 : idx + 1, v = ring[idx];
    d[i] = v; if (v > peak) peak = v; else if (-v > peak) peak = -v;
    ring[idx] = (v + ring[nx]) * 0.5 * 0.9965;
    idx = nx;
  }
  if (peak > 0) for (let i = 0; i < len; i++) d[i] *= 0.9 / peak;
  e = { buf, rate: freq / (sr / N) };
  cache.set(midi, e); return e;
}

function voice(midi, when, o) {
  const e = buffer(midi), src = ctx.createBufferSource(), g = ctx.createGain();
  src.buffer = e.buf; src.playbackRate.value = e.rate;
  g.gain.setValueAtTime(o.mute ? 0.6 : o.soft ? 0.5 : 0.85, when);
  if (o.mute) g.gain.setTargetAtTime(0, when + 0.01, 0.02);        // a dead note is just the attack
  else g.gain.setTargetAtTime(0, when + 2.2, 0.25);
  src.connect(g); g.connect(master);
  src.start(when); src.stop(when + (o.mute ? 0.3 : 3));
  return { src, g };
}
function cut(v, when) {
  try {
    v.g.gain.cancelScheduledValues(when);
    v.g.gain.setTargetAtTime(0, when, 0.012);
    v.src.stop(when + 0.15);
  } catch (e) { /* already stopped */ }
}

/* events: [{ t, midi, string, soft, mute }] sorted by t (seconds from the start).
   A new note on a string silences the one before it, like a real string. */
function play(events, total, onEnd) {
  if (!ensure()) return false;
  stop();
  const t0 = ctx.currentTime + 0.08, voices = [], last = new Map();
  for (const ev of events) {
    const when = t0 + ev.t, prev = last.get(ev.string);
    if (prev) cut(prev, when);
    const v = voice(ev.midi, when, ev);
    voices.push(v); last.set(ev.string, v);
  }
  const timer = setTimeout(() => { playing = null; if (onEnd) onEnd(); }, (total + 0.08) * 1000);
  playing = { t0, voices, timer };
  return true;
}
function stop() {
  if (!playing) return;
  clearTimeout(playing.timer);
  const now = ctx.currentTime;
  playing.voices.forEach(v => cut(v, now));
  playing = null;
}
/* seconds since playback started, or -1 when nothing is playing */
function elapsed() { return playing ? ctx.currentTime - playing.t0 : -1; }

/* a single note right now, e.g. while typing. o: { string, soft, mute, delay } */
function pluck(midi, o) {
  if (!ensure()) return false;
  o = o || {};
  const when = ctx.currentTime + 0.01 + (o.delay || 0), prev = live.get(o.string);
  if (prev) cut(prev, when);
  live.set(o.string, voice(midi, when, o));
  return true;
}

window.TabAudio = { play, stop, elapsed, pluck, isPlaying: () => !!playing };
})();
