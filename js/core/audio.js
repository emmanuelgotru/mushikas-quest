/* ===========================================================================
   core/audio.js — 100% procedural WebAudio: raga-based soundtrack + SFX.
   No audio files are shipped; everything is synthesised at runtime.
   =========================================================================== */

const NOTE = (semi) => 440 * Math.pow(2, (semi - 9) / 12); // semi relative to C4=0 → A4=440

/* Ragas as semitone sets over Sa (0). Chosen for mood per realm. */
export const RAGAS = {
  yaman:    { name: 'Yaman',    notes: [0, 2, 4, 6, 7, 9, 11], vadi: 7,  mood: 'auspicious, luminous' },
  bhairav:  { name: 'Bhairav',  notes: [0, 1, 4, 5, 7, 8, 11], vadi: 0,  mood: 'dawn, devotion, tension' },
  bhairavi: { name: 'Bhairavi', notes: [0, 1, 3, 5, 7, 8, 10], vadi: 7,  mood: 'tender, compassionate' },
  marwa:    { name: 'Marwa',    notes: [0, 1, 4, 6, 8, 10],    vadi: 1,  mood: 'dusk, unease' },
  malkauns: { name: 'Malkauns', notes: [0, 3, 5, 8, 10],       vadi: 0,  mood: 'midnight, solemn power' },
  todi:     { name: 'Todi',     notes: [0, 1, 3, 6, 7, 8, 11], vadi: 7,  mood: 'anguished, intense' },
  durga:    { name: 'Durga',    notes: [0, 2, 5, 7, 9],        vadi: 7,  mood: 'heroic, driving' },
  hindol:   { name: 'Hindol',   notes: [0, 3, 5, 7, 10],       vadi: 3,  mood: 'swinging, festive' },
};

/* mode presets: bpm, raga, drum pattern (16 steps), intensity of layers */
const MODES = {
  silence: null,
  menu:    { bpm: 74,  raga: 'yaman',    sa: 0,  drums: 'D...t..d..t.T...', bass: .5, mel: .85, pad: .8,  drone: 1, swing: .06 },
  explore: { bpm: 96,  raga: 'durga',    sa: 0,  drums: 'D..dt.dD..dt.T..', bass: .7, mel: .55, pad: .45, drone: 1, swing: .04 },
  tension: { bpm: 112, raga: 'bhairav',  sa: 0,  drums: 'D.dtD.dtD.dtD.tt', bass: .8, mel: .5, pad: .5, drone: 1, swing: 0 },
  boss:    { bpm: 142, raga: 'malkauns', sa: -2, drums: 'DdtdDdtdDdtdDdTt', bass: 1, mel: .8, pad: .3, drone: 1, swing: 0 },
  final:   { bpm: 158, raga: 'marwa',    sa: -3, drums: 'DdTdDdTdDdTdDdTt', bass: 1, mel: .9, pad: .35, drone: 1, swing: 0 },
  victory: { bpm: 120, raga: 'bhairavi', sa: 2,  drums: 'D..tD..tD.tTD.t.', bass: .6, mel: 1, pad: .9, drone: 1, swing: .08 },
  shrine:  { bpm: 62,  raga: 'bhairavi', sa: 0,  drums: '................', bass: .2, mel: .8, pad: 1, drone: 1, swing: .1 },
};

export class AudioSys {
  constructor() {
    this.ctx = null; this.ready = false; this.muted = false;
    this.musicVol = .6; this.sfxVol = .8;
    this.mode = 'silence'; this.targetMode = 'silence';
    this.intensity = .5;
    this._voices = 0;
    this.step = 0; this.bar = 0; this.nextTime = 0; this._timer = null;
    this._noiseBuf = null;
    this._melodyPlan = [];
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = 1;
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.knee.value = 22; this.comp.ratio.value = 7; this.comp.attack.value = .004; this.comp.release.value = .22;
    this.master.connect(this.comp); this.comp.connect(c.destination);

    this.musicBus = c.createGain(); this.musicBus.gain.value = 0; this.musicBus.connect(this.master);
    this.sfxBus = c.createGain(); this.sfxBus.gain.value = this.sfxVol; this.sfxBus.connect(this.master);

    // reverb-ish: feedback delay network (cheap temple echo)
    this.delay = c.createDelay(1.2); this.delay.delayTime.value = .27;
    this.fb = c.createGain(); this.fb.gain.value = .3;
    this.delayFilter = c.createBiquadFilter(); this.delayFilter.type = 'lowpass'; this.delayFilter.frequency.value = 2600;
    this.wet = c.createGain(); this.wet.gain.value = .3;
    this.delay.connect(this.delayFilter); this.delayFilter.connect(this.fb); this.fb.connect(this.delay);
    this.delayFilter.connect(this.wet); this.wet.connect(this.master);
    this.musicBus.connect(this.delay);

    // noise buffer
    const len = c.sampleRate * 1.4;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._noiseBuf = buf;

    this.ready = true;
    this._applyVolumes();
    this._startScheduler();
  }

  resume() { this.init(); if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  _applyVolumes() {
    if (!this.ready) return;
    const m = this.muted ? 0 : 1;
    this.sfxBus.gain.value = this.sfxVol * m;
    this._musicTarget = this.musicVol * m;
  }
  setVolumes(music, sfx, muted) {
    this.musicVol = music; this.sfxVol = sfx; this.muted = muted; this._applyVolumes();
  }

  /* ---------------- music ---------------- */
  setMode(mode, force = false) {
    if (!MODES[mode]) mode = 'silence';
    if (this.mode === mode && !force) return;
    this.targetMode = mode;
    if (!this.ready) { this.mode = mode; return; }
    this.mode = mode;
    this.step = 0; this.bar = 0;
    this.nextTime = this.ctx.currentTime + .06;
    const cfg = MODES[mode];
    this._cfg = cfg;
    if (cfg) {
      this._sa = NOTE(cfg.sa + 12); // Sa frequency (C-ish base)
      this._scale = RAGAS[cfg.raga].notes;
      this._melodyPlan = [];
      this._startDrone();
      this.musicBus.gain.cancelScheduledValues(this.ctx.currentTime);
      this.musicBus.gain.setTargetAtTime(this._musicTarget ?? this.musicVol, this.ctx.currentTime, .5);
    } else {
      this._stopDrone();
      this.musicBus.gain.setTargetAtTime(0, this.ctx.currentTime, .35);
    }
  }
  setIntensity(v) { this.intensity = Math.max(0, Math.min(1, v)); }

  _startScheduler() {
    if (this._timer) return;
    this._timer = setInterval(() => this._schedule(), 25);
  }

  _schedule() {
    if (!this.ready) return;
    const cfg = this._cfg;
    if (!cfg) { this.musicBus.gain.value = Math.max(0, this.musicBus.gain.value - .02); return; }
    if (this.muted) return;
    const spb = 60 / cfg.bpm / 4; // 16th
    while (this.nextTime < this.ctx.currentTime + .18) {
      this._playStep(this.step % 16, this.nextTime, spb);
      const sw = (this.step % 2 === 1) ? cfg.swing * spb : -cfg.swing * spb * .4;
      this.nextTime += spb + (this.step % 16 === 15 ? 0 : 0) + sw * 0;
      this.step++;
      if (this.step % 16 === 0) this.bar++;
    }
  }

  _playStep(s, t, spb) {
    const cfg = this._cfg; if (!cfg) return;
    const I = this.intensity;
    // --- drums ---
    const ch = cfg.drums[s];
    if (ch === 'D') this._drumLow(t, 1);
    else if (ch === 'd') this._drumLow(t, .55);
    else if (ch === 'T') { this._drumHigh(t, 1); this._drumShake(t, .5); }
    else if (ch === 't') this._drumHigh(t, .6);
    if (s % 4 === 2 && I > .55) this._drumShake(t, .22 * I);
    // --- bass (on beat 1 & 3, walking) ---
    if (cfg.bass && (s === 0 || s === 6 || s === 10) && (I > .3 || cfg.bass > .6)) {
      const deg = [0, 4, 3, 5][((this.bar * 3 + s) >> 1) % 4];
      this._pluck(this._deg(deg - 12), t, .55 * cfg.bass * (.5 + I * .5), .5, 'sine', 700);
    }
    // --- melody ---
    if (cfg.mel) {
      if (this._melodyPlan.length === 0) this._makePhrase(cfg, I);
      const n = this._melodyPlan.shift();
      if (n && n.deg !== null) {
        const f = this._deg(n.deg);
        if (cfg.mel > .8) this._flute(f, t, n.dur * spb, .3 * cfg.mel * (.4 + I * .6), n.bend);
        else this._pluck(f, t, n.dur * spb * .9, .2 * cfg.mel * (.4 + I * .6), 'triangle', 2600, n.bend);
      }
    }
    // --- pad chord every 2 bars ---
    if (cfg.pad && s === 0 && this.bar % 2 === 0) {
      const base = [0, 3, 4, 0][this.bar % 4];
      [0, 2, 4].forEach((iv, i) => this._pad(this._deg(base + iv), t, spb * 30, .05 * cfg.pad * (.5 + I * .5), i * 3));
    }
  }

  _makePhrase(cfg, I) {
    // generative raga phrase: 8 slots over one bar, motif-driven, with rests
    const sc = this._scale;
    const seedDeg = () => sc[(Math.random() * sc.length) | 0] + (Math.random() < .35 ? 12 : 0) + (Math.random() < .12 ? -12 : 0);
    let deg = this._lastDeg ?? 0;
    const density = .35 + I * .45 + (cfg.mel > .8 ? .15 : 0);
    for (let i = 0; i < 16; i++) {
      if (Math.random() > density) { this._melodyPlan.push(null); continue; }
      // stepwise motion within the raga, occasional leap to vadi
      if (Math.random() < .72) {
        const idx = sc.indexOf(((deg % 12) + 12) % 12);
        const step = (Math.random() < .5 ? -1 : 1) * (Math.random() < .8 ? 1 : 2);
        const ni = idx < 0 ? (Math.random() * sc.length) | 0 : Math.max(0, Math.min(sc.length - 1, idx + step));
        deg = sc[ni] + (deg >= 12 ? 12 : deg < 0 ? -12 : 0);
      } else deg = seedDeg();
      deg = Math.max(-5, Math.min(24, deg));
      this._lastDeg = deg;
      const dur = Math.random() < .75 ? 2 : 4;
      this._melodyPlan.push({ deg, dur, bend: Math.random() < .3 ? (Math.random() < .5 ? -2 : 2) : 0 });
      for (let k = 1; k < dur; k++) this._melodyPlan.push(null);
      i += dur - 1;
    }
    if (this._melodyPlan.length > 40) this._melodyPlan.length = 40;
  }

  /** scale degree (diatonic index) → frequency, wrapping octaves */
  _deg(deg) {
    const sc = this._scale, n = sc.length;
    let oct = Math.floor(deg / n), i = ((deg % n) + n) % n;
    return this._sa * Math.pow(2, oct + sc[i] / 12);
  }

  /* ---------- instruments ---------- */
  _droneNodes = null;
  _startDrone() {
    this._stopDrone();
    const c = this.ctx; if (!c) return;
    const g = c.createGain(); g.gain.value = 0; g.connect(this.musicBus);
    const filt = c.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 620; filt.Q.value = .8; filt.connect(g);
    const oscs = [];
    [0, 7, 12, 7].forEach((semi, i) => {
      const o = c.createOscillator(); o.type = i % 2 ? 'triangle' : 'sawtooth';
      o.frequency.value = this._sa * Math.pow(2, semi / 12) * (i === 2 ? 2 : 1) * (1 + (i - 1.5) * .0016);
      const og = c.createGain(); og.gain.value = i === 2 ? .07 : .13;
      o.connect(og); og.connect(filt); o.start(); oscs.push(o);
    });
    const lfo = c.createOscillator(); lfo.frequency.value = .09;
    const lg = c.createGain(); lg.gain.value = 210; lfo.connect(lg); lg.connect(filt.frequency); lfo.start();
    g.gain.setTargetAtTime(.16, c.currentTime, 1.4);
    this._droneNodes = { g, oscs, lfo };
  }
  _stopDrone() {
    if (!this._droneNodes || !this.ctx) return;
    const { g, oscs, lfo } = this._droneNodes;
    const t = this.ctx.currentTime;
    g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(0, t, .5);
    setTimeout(() => { try { oscs.forEach((o) => o.stop()); lfo.stop(); } catch (e) { /* noop */ } }, 1600);
    this._droneNodes = null;
  }

  _pluck(freq, t, dur, vol, type = 'triangle', cut = 2200, bend = 0) {
    if (!this.ready || this._voices > 46) return;
    const c = this.ctx;
    const o = c.createOscillator(); o.type = type;
    const o2 = c.createOscillator(); o2.type = 'sawtooth'; o2.detune.value = -7;
    const g = c.createGain(); const f = c.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 3;
    o.frequency.setValueAtTime(freq * (bend ? Math.pow(2, -bend / 12) : 1), t);
    if (bend) o.frequency.exponentialRampToValueAtTime(freq, t + dur * .3);
    o2.frequency.setValueAtTime(o.frequency.value, t); if (bend) o2.frequency.exponentialRampToValueAtTime(freq, t + dur * .3);
    f.frequency.setValueAtTime(cut, t); f.frequency.exponentialRampToValueAtTime(Math.max(220, cut * .28), t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .008);
    g.gain.exponentialRampToValueAtTime(.0008, t + Math.max(.09, dur));
    o.connect(f); o2.connect(f); f.connect(g); g.connect(this.musicBus);
    o.start(t); o2.start(t); o.stop(t + dur + .2); o2.stop(t + dur + .2);
    this._voices += 2; setTimeout(() => (this._voices -= 2), (dur + .25) * 1000);
  }

  _flute(freq, t, dur, vol, bend = 0) {
    if (!this.ready || this._voices > 44) return;
    const c = this.ctx;
    const o = c.createOscillator(); o.type = 'sine';
    const o2 = c.createOscillator(); o2.type = 'triangle';
    const g = c.createGain(); const g2 = c.createGain(); g2.gain.value = .12;
    const vib = c.createOscillator(); vib.frequency.value = 5.3;
    const vg = c.createGain(); vg.gain.value = freq * .011;
    vib.connect(vg); vg.connect(o.frequency); vg.connect(o2.frequency);
    o.frequency.setValueAtTime(freq * (bend ? Math.pow(2, bend / 12) : 1), t);
    o.frequency.exponentialRampToValueAtTime(freq, t + dur * .22);
    o2.frequency.value = o.frequency.value;
    // breath
    const nz = c.createBufferSource(); nz.buffer = this._noiseBuf; nz.loop = true;
    const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = freq * 2.1; nf.Q.value = 1.4;
    const ng = c.createGain(); ng.gain.value = vol * .28;
    nz.connect(nf); nf.connect(ng); ng.connect(g);
    dur = Math.max(.16, Math.min(dur, 2.4));
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .05);
    g.gain.setValueAtTime(vol, t + dur * .7); g.gain.exponentialRampToValueAtTime(.0008, t + dur + .08);
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(this.musicBus); g.connect(this.delay);
    o.start(t); o2.start(t); vib.start(t); nz.start(t);
    const stop = t + dur + .15;
    o.stop(stop); o2.stop(stop); vib.stop(stop); nz.stop(stop);
    this._voices += 4; setTimeout(() => (this._voices -= 4), (dur + .3) * 1000);
  }

  _pad(freq, t, dur, vol, detune = 0) {
    if (!this.ready) return;
    const c = this.ctx;
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq; o.detune.value = detune;
    const o2 = c.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = freq; o2.detune.value = -detune - 5;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(420, t); f.frequency.linearRampToValueAtTime(1500, t + dur * .4); f.Q.value = .7;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + dur * .3);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(f); o2.connect(f); f.connect(g); g.connect(this.musicBus);
    o.start(t); o2.start(t); o.stop(t + dur + .1); o2.stop(t + dur + .1);
  }

  _drumLow(t, vol) {
    if (!this.ready) return;
    const c = this.ctx;
    const o = c.createOscillator(); o.type = 'sine';
    const g = c.createGain();
    o.frequency.setValueAtTime(196, t); o.frequency.exponentialRampToValueAtTime(58, t + .13);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.62 * vol, t + .006);
    g.gain.exponentialRampToValueAtTime(.0008, t + .26);
    o.connect(g); g.connect(this.musicBus); o.start(t); o.stop(t + .3);
    // skin slap
    const nz = c.createBufferSource(); nz.buffer = this._noiseBuf;
    const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 420; nf.Q.value = 1.1;
    const ng = c.createGain(); ng.gain.setValueAtTime(.2 * vol, t); ng.gain.exponentialRampToValueAtTime(.0008, t + .07);
    nz.connect(nf); nf.connect(ng); ng.connect(this.musicBus); nz.start(t); nz.stop(t + .09);
  }
  _drumHigh(t, vol) {
    if (!this.ready) return;
    const c = this.ctx;
    const o = c.createOscillator(); o.type = 'triangle';
    const g = c.createGain();
    o.frequency.setValueAtTime(760 + Math.random() * 90, t); o.frequency.exponentialRampToValueAtTime(340, t + .07);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.24 * vol, t + .004);
    g.gain.exponentialRampToValueAtTime(.0006, t + .13);
    o.connect(g); g.connect(this.musicBus); o.start(t); o.stop(t + .16);
    const nz = c.createBufferSource(); nz.buffer = this._noiseBuf;
    const nf = c.createBiquadFilter(); nf.type = 'highpass'; nf.frequency.value = 3400;
    const ng = c.createGain(); ng.gain.setValueAtTime(.1 * vol, t); ng.gain.exponentialRampToValueAtTime(.0005, t + .05);
    nz.connect(nf); nf.connect(ng); ng.connect(this.musicBus); nz.start(t); nz.stop(t + .06);
  }
  _drumShake(t, vol) {
    if (!this.ready) return;
    const c = this.ctx;
    const nz = c.createBufferSource(); nz.buffer = this._noiseBuf; nz.playbackRate.value = 1.6;
    const nf = c.createBiquadFilter(); nf.type = 'highpass'; nf.frequency.value = 5200;
    const g = c.createGain();
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.09 * vol, t + .006);
    g.gain.exponentialRampToValueAtTime(.0005, t + .17);
    nz.connect(nf); nf.connect(g); g.connect(this.musicBus); nz.start(t); nz.stop(t + .2);
  }

  /* ---------------- SFX ---------------- */
  sfx(name, opts = {}) {
    if (!this.ready || this.muted) return;
    const fn = SFX[name];
    if (fn) { try { fn(this, opts); } catch (e) { /* never break the game on audio */ } }
  }
  _voice(o, g, dest) { o.connect(g); g.connect(dest || this.sfxBus); }
  tone({ freq = 440, to = null, type = 'sine', dur = .2, vol = .3, atk = .005, cut = 5000, q = 1, dest = null, delay = 0, pan = 0 }) {
    const c = this.ctx; if (!c) return null;
    const t = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cut; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(.0002, vol), t + atk);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    let node = f;
    if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; f.connect(g); g.connect(p); p.connect(dest || this.sfxBus); }
    else { o.connect(f); f.connect(g); g.connect(dest || this.sfxBus); }
    if (pan && c.createStereoPanner) o.connect(f);
    o.start(t); o.stop(t + dur + .03);
    return o;
  }
  noise({ dur = .2, vol = .3, type = 'bandpass', freq = 1200, to = null, q = 1, atk = .004, delay = 0, dest = null, rate = 1 }) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this._noiseBuf; s.loop = true; s.playbackRate.value = rate;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (to) f.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(.0002, vol), t + atk);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || this.sfxBus);
    s.start(t); s.stop(t + dur + .05);
  }
}

/* --- SFX library -------------------------------------------------------- */
const SFX = {
  ui: (a) => a.tone({ freq: 880, to: 1320, type: 'triangle', dur: .07, vol: .12, cut: 4000 }),
  uiBig: (a) => { a.tone({ freq: 320, to: 640, type: 'triangle', dur: .16, vol: .2 }); a.noise({ dur: .12, vol: .05, freq: 3000 }); },
  back: (a) => a.tone({ freq: 620, to: 300, type: 'triangle', dur: .12, vol: .14 }),
  jump: (a) => { a.tone({ freq: 420, to: 760, type: 'square', dur: .13, vol: .12, cut: 2600 }); a.noise({ dur: .07, vol: .05, freq: 1600, q: .8 }); },
  dbljump: (a) => { a.tone({ freq: 560, to: 1000, type: 'triangle', dur: .16, vol: .15, cut: 3400 }); },
  land: (a) => { a.noise({ dur: .09, vol: .12, freq: 320, q: .7, type: 'lowpass' }); a.tone({ freq: 130, to: 70, type: 'sine', dur: .1, vol: .12 }); },
  swipe: (a) => { a.noise({ dur: .13, vol: .17, freq: 2400, to: 700, q: 1.3 }); a.tone({ freq: 900, to: 380, type: 'sawtooth', dur: .09, vol: .06, cut: 3000 }); },
  hit: (a) => { a.tone({ freq: 260, to: 90, type: 'square', dur: .12, vol: .2, cut: 1800 }); a.noise({ dur: .1, vol: .2, freq: 1500, to: 300, q: .8 }); },
  hitCrit: (a) => { a.tone({ freq: 700, to: 180, type: 'sawtooth', dur: .18, vol: .24, cut: 3600 }); a.tone({ freq: 1400, to: 900, type: 'square', dur: .1, vol: .1, delay: .02 }); a.noise({ dur: .18, vol: .22, freq: 2600, to: 400 }); },
  hurt: (a) => { a.tone({ freq: 220, to: 70, type: 'sawtooth', dur: .34, vol: .3, cut: 1200 }); a.noise({ dur: .28, vol: .18, freq: 900, to: 200 }); },
  die: (a) => { [0, .1, .22, .36].forEach((d, i) => a.tone({ freq: 420 - i * 80, to: 90, type: 'triangle', dur: .4, vol: .22, delay: d, cut: 1400 })); a.noise({ dur: .9, vol: .12, freq: 700, to: 90, delay: .1 }); },
  modak: (a) => { a.tone({ freq: 1180, type: 'sine', dur: .1, vol: .16 }); a.tone({ freq: 1760, type: 'sine', dur: .13, vol: .12, delay: .06 }); },
  heart: (a) => { [0, .08, .16].forEach((d, i) => a.tone({ freq: 660 * Math.pow(1.26, i), type: 'triangle', dur: .22, vol: .16, delay: d })); },
  boomerang: (a) => { a.tone({ freq: 700, to: 1500, type: 'sawtooth', dur: .18, vol: .14, cut: 3800 }); a.noise({ dur: .5, vol: .07, freq: 1800, q: 3 }); },
  dash: (a) => { a.noise({ dur: .22, vol: .2, freq: 500, to: 2600, q: 1.1 }); a.tone({ freq: 180, to: 520, type: 'sawtooth', dur: .2, vol: .14, cut: 2200 }); },
  charge: (a) => { a.tone({ freq: 120, to: 900, type: 'sawtooth', dur: .34, vol: .26, cut: 3200 }); a.noise({ dur: .42, vol: .26, freq: 300, to: 3400 }); a.tone({ freq: 90, to: 46, type: 'sine', dur: .4, vol: .3, delay: .04 }); },
  wallbreak: (a) => { a.noise({ dur: .55, vol: .32, freq: 1600, to: 160, q: .6 }); for (let i = 0; i < 6; i++) a.tone({ freq: 300 + Math.random() * 900, to: 90, type: 'square', dur: .16, vol: .08, delay: i * .04 }); },
  truesight: (a) => { [0, .07, .14, .21].forEach((d, i) => a.tone({ freq: 520 + i * 260, type: 'sine', dur: .5, vol: .12, delay: d, cut: 6000 })); a.noise({ dur: .4, vol: .05, freq: 6000, q: 2 }); },
  pull: (a) => { a.tone({ freq: 260, to: 900, type: 'sine', dur: .3, vol: .18, cut: 4200 }); a.tone({ freq: 130, to: 450, type: 'triangle', dur: .3, vol: .12, delay: .02 }); },
  grapple: (a) => { a.noise({ dur: .18, vol: .12, freq: 2600, to: 800, q: 2 }); a.tone({ freq: 700, to: 300, type: 'square', dur: .12, vol: .1 }); },
  shield: (a) => { a.tone({ freq: 320, to: 620, type: 'sine', dur: .5, vol: .16, cut: 3000 }); a.tone({ freq: 480, to: 930, type: 'triangle', dur: .5, vol: .09, delay: .03 }); },
  reflect: (a) => { a.tone({ freq: 1200, to: 260, type: 'sawtooth', dur: .26, vol: .24, cut: 5000 }); a.noise({ dur: .3, vol: .2, freq: 3600, to: 500 }); },
  timeslow: (a) => { a.tone({ freq: 900, to: 160, type: 'sine', dur: .8, vol: .2, cut: 2000 }); a.tone({ freq: 1350, to: 240, type: 'triangle', dur: .8, vol: .1, delay: .02 }); },
  phase: (a) => { a.tone({ freq: 1500, to: 420, type: 'sine', dur: .38, vol: .16, cut: 5200 }); a.noise({ dur: .34, vol: .07, freq: 4200, q: 4 }); },
  smoke: (a) => { a.noise({ dur: .55, vol: .16, freq: 900, to: 260, q: .6, rate: .7 }); },
  takedown: (a) => { a.noise({ dur: .16, vol: .26, freq: 3200, to: 400, q: .8 }); a.tone({ freq: 1500, to: 200, type: 'square', dur: .16, vol: .14 }); },
  explosion: (a) => { a.noise({ dur: .7, vol: .4, freq: 1400, to: 60, q: .5 }); a.tone({ freq: 140, to: 34, type: 'sine', dur: .7, vol: .38 }); a.tone({ freq: 700, to: 120, type: 'sawtooth', dur: .28, vol: .14 }); },
  shoot: (a) => { a.tone({ freq: 620, to: 240, type: 'square', dur: .13, vol: .11, cut: 2600 }); },
  shootBig: (a) => { a.tone({ freq: 300, to: 90, type: 'sawtooth', dur: .3, vol: .2, cut: 1800 }); a.noise({ dur: .24, vol: .14, freq: 1200, to: 300 }); },
  laser: (a) => { a.tone({ freq: 2200, to: 1600, type: 'sawtooth', dur: .5, vol: .07, cut: 6000 }); },
  roar: (a) => { a.tone({ freq: 110, to: 44, type: 'sawtooth', dur: 1.1, vol: .4, cut: 900 }); a.tone({ freq: 165, to: 62, type: 'square', dur: 1.0, vol: .2, cut: 700, delay: .04 }); a.noise({ dur: 1.2, vol: .26, freq: 700, to: 120, q: .6 }); },
  bossHit: (a) => { a.tone({ freq: 200, to: 70, type: 'square', dur: .16, vol: .22, cut: 1400 }); a.noise({ dur: .16, vol: .2, freq: 1100, to: 240 }); },
  gate: (a) => { a.noise({ dur: .5, vol: .18, freq: 700, to: 160, q: .8 }); a.tone({ freq: 180, to: 90, type: 'triangle', dur: .5, vol: .14 }); },
  switch: (a) => { a.tone({ freq: 500, to: 900, type: 'square', dur: .1, vol: .14 }); a.tone({ freq: 1000, to: 1500, type: 'sine', dur: .12, vol: .1, delay: .06 }); },
  boon: (a) => {
    [0, .12, .24, .36, .52, .7].forEach((d, i) => a.tone({ freq: 392 * Math.pow(2, [0, 4, 7, 11, 12, 16][i] / 12), type: 'triangle', dur: 1.3 - i * .12, vol: .17, delay: d, cut: 6000 }));
    a.noise({ dur: 1.6, vol: .07, freq: 5000, q: 1.4, atk: .3 });
    a.tone({ freq: 98, to: 196, type: 'sine', dur: 1.4, vol: .22 });
  },
  blessing: (a) => { [0, .18, .36].forEach((d, i) => a.tone({ freq: 262 * Math.pow(2, [0, 4, 7][i] / 12), type: 'sine', dur: 2.2, vol: .16, delay: d, cut: 4000, atk: .12 })); },
  shrine: (a) => { [0, .14, .28, .42].forEach((d, i) => a.tone({ freq: 523 * Math.pow(2, [0, 3, 7, 10][i] / 12), type: 'sine', dur: 1.1, vol: .13, delay: d })); },
  checkpoint: (a) => { [0, .1, .2].forEach((d, i) => a.tone({ freq: 660 * Math.pow(1.19, i), type: 'triangle', dur: .5, vol: .16, delay: d })); },
  victory: (a) => { [0, .13, .26, .39, .62].forEach((d, i) => a.tone({ freq: 392 * Math.pow(2, [0, 4, 7, 12, 16][i] / 12), type: 'triangle', dur: 1.1, vol: .2, delay: d, cut: 7000 })); },
  axe: (a) => { a.tone({ freq: 2400, to: 120, type: 'sawtooth', dur: .5, vol: .34, cut: 8000 }); a.noise({ dur: .9, vol: .4, freq: 4000, to: 80 }); a.tone({ freq: 70, to: 30, type: 'sine', dur: 1.2, vol: .45, delay: .05 }); },
  splash: (a) => { a.noise({ dur: .3, vol: .16, freq: 900, to: 2400, q: .7 }); },
  web: (a) => { a.noise({ dur: .3, vol: .12, freq: 2200, to: 500, q: 3, rate: .6 }); },
  coin: (a) => { a.tone({ freq: 1560, type: 'square', dur: .06, vol: .1 }); a.tone({ freq: 2090, type: 'square', dur: .1, vol: .09, delay: .05 }); },
  error: (a) => { a.tone({ freq: 180, to: 120, type: 'square', dur: .22, vol: .16, cut: 900 }); },
  powerup: (a) => { [0, .06, .12, .18].forEach((d, i) => a.tone({ freq: 440 * Math.pow(1.2, i), type: 'square', dur: .2, vol: .12, delay: d, cut: 3000 })); },
  shrine: (a) => { [0, .14, .28, .44].forEach((d, i) => a.tone({ freq: 294 * Math.pow(2, [0, 4, 7, 12][i] / 12), type: 'sine', dur: 1.7 - i * .3, vol: .15, delay: d, cut: 4200, atk: .1 })); a.noise({ dur: 1.2, vol: .05, freq: 3000, q: 1.6, atk: .2 }); },
  checkpoint: (a) => { [0, .09, .18].forEach((d, i) => a.tone({ freq: 523 * Math.pow(2, [0, 4, 7][i] / 12), type: 'triangle', dur: .5, vol: .14, delay: d, cut: 3400 })); },
  heartbeat: (a) => { a.tone({ freq: 66, to: 40, type: 'sine', dur: .22, vol: .34 }); a.tone({ freq: 60, to: 36, type: 'sine', dur: .18, vol: .22, delay: .22 }); },
};
