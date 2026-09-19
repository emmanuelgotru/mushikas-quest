import { resolveHint } from './data/hints.js';
/* ===========================================================================
   main.js — Mushika's Quest: Nine Days of Dharma
   Boot, state machine, day flow, boss flow, save system, render loop.
   =========================================================================== */
import { clamp, lerp, rand, rgba, TAU, glow, ellipse, starPath, mandala, fmtTime, roman, devNum } from './core/utils.js';
import { AudioSys } from './core/audio.js';
import { Input } from './core/input.js';
import { Camera, FX, Particles } from './core/fx.js';
import { World } from './game/world.js';
import { Player } from './game/player.js';
import { createBoss } from './game/bosses.js';
import { BOONS, boonById } from './data/boons.js';
import { LEVEL_DEFS, buildLevel, VIEW_H } from './data/levels.js';
import { BOSSES, PROLOGUE, PRE_BOSS, SHLOKAS, DEATH_QUOTES, EPILOGUE } from './data/lore.js';
import { HUD } from './ui/hud.js';
import { Screens } from './ui/screens.js';

const SAVE_KEY = 'mushika_save_v1';
const SET_KEY = 'mushika_settings_v1';
const DEFAULT_SAVE = () => ({ v: 1, day: 1, days: {}, modaks: 0, boons: [], finished: false, unlockAll: false, cp: null, seenPrologue: false, rushBest: null });
const DEFAULT_SETTINGS = () => ({ difficulty: 'story', music: .7, sfx: .85, muted: false, shake: 1, grain: 1, particles: 1, hints: 1, touch: 'auto' });

const PAR = [0, 165, 195, 210, 225, 240, 240, 255, 265, 420]; // seconds per day for rank

class Game {
  constructor() {
    /* ---- persistent state ---- */
    this.save = this.load(SAVE_KEY, DEFAULT_SAVE());
    this.settings = { ...DEFAULT_SETTINGS(), ...this.load(SET_KEY, {}) };

    /* ---- core systems ---- */
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.audio = new AudioSys();
    this.input = new Input(this);
    this.camera = new Camera();
    this.particles = new Particles(1800);
    this.fx = new FX(this);
    this.hud = new HUD(this);
    this.screens = new Screens(this);

    /* ---- runtime ---- */
    this.state = 'boot';
    this.time = 0; this.last = performance.now(); this.fps = 60; this.frames = 0; this.fpsT = 0;
    this.world = null; this.player = null; this.boss = null;
    this.enemies = []; this.projectiles = []; this.pickups = [];
    this.level = null;
    this.run = this.freshRun(1);
    this.stats = this.freshStats();
    this.dayCard = 0; this.dayCardText = ''; this.dayCardSub = ''; this.dayCardDeva = '';
    this.debug = false;
    this.deadT = 0;
    this.backdrop = { petals: [], diyas: [], stars: [] };
    this.initBackdrop();

    this.applySettings();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'play') this.pause(); });
    window.addEventListener('keydown', (e) => { if (!this.audio.ready) { this.audio.resume(); this.audio.setMode(this.state === 'play' ? (this.level?.music?.mode || 'explore') : 'menu'); } }, { once: false });
    // game-over screen: keyboard players (and stuck keyboards) can rise with Space/Enter/J
    window.addEventListener('keydown', (e) => {
      if (this.state === 'over' && (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyJ')) { e.preventDefault(); this.retry(); }
    });
    window.addEventListener('pointerdown', () => { if (!this.audio.ready) { this.audio.resume(); this.audio.setMode('menu'); } }, { once: true });

    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
    this.boot();
  }

  /* ============================== PERSISTENCE ============================ */
  load(k, def) { try { const v = JSON.parse(localStorage.getItem(k)); return v && typeof v === 'object' ? { ...def, ...v } : def; } catch { return def; } }
  persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch { /* private mode */ } }
  saveSettings() { try { localStorage.setItem(SET_KEY, JSON.stringify(this.settings)); } catch { } }
  saveCheckpoint(day, cp) { this.save.cp = { day, x: cp.x, y: cp.y }; this.persist(); }

  applySettings() {
    const s = this.settings;
    this.audio.setVolumes(+s.music, +s.sfx, !!s.muted);
    document.body.classList.toggle('no-grain', !s.grain);
    const coarse = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    const touch = s.touch === 'on' || (s.touch === 'auto' && coarse);
    this.touchUI = touch;
    document.body.classList.toggle('touch-on', touch);
    document.getElementById('touch')?.classList.toggle('hidden', !(touch && ['play', 'dead'].includes(this.state)));
    document.body.classList.toggle('reduce-particles', s.particles < 1);
  }
  toggleDebug() { this.debug = !this.debug; this.hud.toast('Debug ' + (this.debug ? 'ON' : 'off'), '⚙'); }

  /* ================================= BOOT ================================ */
  async boot() {
    const fill = document.getElementById('boot-fill');
    const status = document.getElementById('boot-status');
    const steps = [
      ['Kindling the first diya…', .12], ['Weaving the nine realms…', .3], ['Sharpening the Parashu…', .48],
      ['Tuning the ragas…', .64], ['Waking Mushika…', .82], ['गणपति बाप्पा मोरया', 1],
    ];
    for (const [txt, k] of steps) {
      status.textContent = txt;
      fill.style.width = (k * 100) + '%';
      await new Promise((r) => setTimeout(r, 230));
    }
    // pre-build every level once so the first load of each day is instant
    try { for (let i = 0; i < 9; i++) buildLevel(i); } catch (e) { console.warn('prewarm', e); }
    await new Promise((r) => setTimeout(r, 260));
    document.getElementById('screen-boot').classList.add('gone');
    setTimeout(() => document.getElementById('screen-boot')?.remove(), 900);
    this.toTitle();
  }

  toTitle() {
    this.state = 'title';
    this.world = null; this.boss = null; this.level = null;
    this.enemies.length = 0; this.projectiles.length = 0; this.pickups.length = 0;
    this.hud.show(false); this.hud.clear();
    this.screens.showTitle();
    this.audio.setMode('menu'); this.audio.setIntensity(.7);
  }

  /* ============================== QUEST FLOW ============================= */
  startQuest() {
    const next = this.save.finished ? 1 : clamp(this.save.day || 1, 1, 9);
    const first = !this.save.seenPrologue;
    if (first) {
      this.save.seenPrologue = true; this.persist();
      this.audio.setMode('shrine');
      this.screens.playStory(PROLOGUE, () => this.startDay(next));
    } else this.startDay(next);
  }
  startBossRush() {
    this.rush = true;
    this.save.unlockAll = true;
    this.screens.showLevels();
    this.hud.toast('Asura Gauntlet — all boons granted', '⚔', 'gold');
  }

  freshRun(day) {
    return { day, kills: 0, score: 0, modaks: 0, shards: 0, combo: 0, comboT: 0, bossDamage: 0, modakTotal: 0, collected: new Set(), t0: performance.now(), deaths: 0, elapsed: 0 };
  }
  freshStats() { return { kills: 0, modaks: 0, perfectDodges: 0, reflects: 0, takedowns: 0, grapples: 0, charges: 0 }; }

  startDay(day, opts = {}) {
    day = clamp(day, 1, 9);
    this.rush = !!this.rush && opts.rush !== false;
    if (!this.save.finished && day > 1 && !this.save.days[day - 1] && !this.save.unlockAll) day = clamp(this.save.day || 1, 1, 9);
    this.run = this.freshRun(day);
    this.stats = this.freshStats();
    this._bossSnap = null; this._bossDeaths = 0;
    this.loadDay(day, { atCheckpoint: false });
    this.screens.hideAll();
    this.state = 'play';
    this.input.enabled = true;   // day transitions must never leave controls dead
    const def = LEVEL_DEFS[day - 1]();
    this.dayCard = 3.4;
    if (day === 1 && !this.save.coached && !this.save.seenHowTo) { this.save.seenHowTo = true; this.persist(); this.pendingHowTo = true; }
    this.dayCardText = `Day ${roman[day - 1]}`;
    this.dayCardSub = def.name;
    this.dayCardDeva = BOSSES[day - 1].deva;
    this.hud.show(true);
    this.hud.setDay(day, def.name);
    this.hud.objective(def.objective || 'Purify the realm', '');
    this.touchUI = this.settings.touch === 'on' || (this.settings.touch === 'auto' && matchMedia('(pointer: coarse)').matches);
    document.getElementById('touch')?.classList.toggle('hidden', !this.touchUI);
    if (this.settings.hints) this.hud.hint(def.hint, 6);
    this.audio.setMode(def.music?.mode || 'explore');
    this.audio.setIntensity(.5);
    this.persist();
  }

  loadDay(day, o = {}) {
    // keep run.day in sync even when a day is loaded directly (debug jumps, retries)
    if (this.run && this.run.day !== day) this.run.day = clamp(day, 1, 9);
    const data = buildLevel(day - 1);
    // total modaks in this realm stays constant across respawns
    this.run.modakTotal = data.modaks.length;
    // keep already-collected secrets collected across respawns
    if (this.run.collected.size) data.modaks = data.modaks.filter((m) => !this.run.collected.has(m.x + ',' + m.y));
    this.level = data;
    this.boss = null; this.bossSpawned = false;
    this.enemies.length = 0; this.projectiles.length = 0; this.pickups.length = 0;
    this.particles.clear(); this.fx.texts.length = 0; this.fx.ripples.length = 0;
    this.world = new World(this, data);

    const diff = this.settings.difficulty;
    const spawn = o.atCheckpoint && this.save.cp && this.save.cp.day === day
      ? { x: this.save.cp.x, y: this.save.cp.y }
      : { ...data.spawn };
    this.player = new Player(this, spawn);
    this.player.maxHp = diff === 'story' ? 6 : diff === 'dharma' ? 4 : 5;
    this.player.modakVitals(this);   // sweets-grown vitality survives respawns
    this.player.hp = this.player.maxHp;
    this.player.hp = this.player.maxHp;
    for (let d = 1; d < day; d++) this.player.give(BOONS[d - 1].id);
    if (this.save.boons?.length) for (const id of this.save.boons) this.player.give(id);
    if (this.rush || o.rush) { for (const b of BOONS) this.player.give(b.id); this.player.bhakti = this.player.maxBhakti; }
    this.player.lastSafe = { ...spawn };

    this.camera.bounds = null;
    this.camera.snap(spawn.x + this.player.w / 2 - this.camera.w / 2, spawn.y - this.camera.h * .5);
    this.world.checkpoint = { ...spawn };
    this._progX = spawn.x; this._stuckT = 0;
    if (o.rush && data.bossArena) {
      // gauntlet: drop the player straight into the arena
      const ar = data.bossArena;
      this.player.x = ar.x + 90; this.player.y = ar.y - this.player.h - 4;
      this.camera.snap(this.player.x - this.camera.w / 2, this.player.y - this.camera.h * .5);
      this.world.bossStarted = true;
      this.spawnBoss();
    }
  }

  restartDay() { this._bossSnap = null; this._bossDeaths = 0; this.input.enabled = true; this.screens.hideAll(); this.loadDay(this.run.day, {}); this.state = 'play'; this.hud.show(true); this.audio.setMode(this.level.music?.mode || 'explore'); }
  retry() {
    this.screens.hide('over');
    this.run.deaths++;
    this.loadDay(this.run.day, { atCheckpoint: true });
    if (this.run.deaths >= 2) setTimeout(() => { if (this.state === 'play') this.showHint(); }, 1500);
    this.state = 'play';
    this.hud.show(true);
    this.hud.toast('Risen at the last shrine', '🪔');
    this.audio.setMode(this.level.music?.mode || 'explore');
    this.dayCard = 0;
  }
  quitToCalendar() {
    this.screens.hideAll(); this.rush = false; this.save.unlockAll = false;
    this.state = 'levels'; this.world = null; this.boss = null;
    this.hud.show(false); this.hud.clear();
    this.screens.showLevels();
    this.audio.setMode('menu');
  }
  pause() {
    if (this.state !== 'play') return;
    this.state = 'pause';
    this.pausedFrom = 'pause';
    const def = LEVEL_DEFS[this.run.day - 1]();
    document.getElementById('pause-stats').innerHTML = `
      <div class="ps"><b>Day ${this.run.day}</b><i>${def.name}</i></div>
      <div class="ps"><b>${fmtTime(this.run.elapsed * 1000)}</b><i>Time</i></div>
      <div class="ps"><b>${this.run.modaks}</b><i>Modaks</i></div>
      <div class="ps"><b>${this.run.kills}</b><i>Asuras felled</i></div>
      <div class="ps"><b>${this.run.shards}</b><i>Shards</i></div>
      <div class="ps"><b>${this.player.owned.size}/8</b><i>Boons</i></div>`;
    this.screens.show('pause');
    this.audio.setMode('shrine'); this.audio.setIntensity(.4);
    this.input.enabled = false;
  }
  resume() {
    if (this.state !== 'pause') return;
    this.screens.hideAll();
    this.state = 'play';
    this.input.enabled = true;
    this.audio.setMode(this.boss ? (this.run.day === 9 ? 'final' : 'boss') : (this.level.music?.mode || 'explore'));
    this.audio.setIntensity(this.boss ? 1 : .6);
  }
  onScreen(id) {
    if (id === 'title') this.state = 'title';
    else if (id === 'levels') this.state = 'levels';
    else if (id === 'codex') this.state = 'codex';
    else if (id === 'settings' || id === 'controls') this.state = this.world ? 'pause' : 'menu';
    if (['title', 'levels', 'codex'].includes(id)) { this.audio.setMode('menu'); this.audio.setIntensity(.7); }
  }

  /* ================================ BOSS ================================= */
  startBoss() {
    if (this.bossSpawned) return;
    this.bossSpawned = true;
    const day = this.run.day;
    if (this._bossSnap && this._bossSnap.day === day) { this.spawnBoss(); return; }  // retry: skip the cutscene, keep his wounds
    this.state = 'story';
    this.input.enabled = false;
    this.audio.setMode('shrine'); this.audio.setIntensity(.5);
    this.hud.hidePrompt();
    const lines = PRE_BOSS[day] || [{ s: 'NARRATOR', t: 'The air thickens. Something ancient turns to face you.' }];
    this.screens.playStory(lines, () => { this.input.enabled = true; this.spawnBoss(); });
  }
  spawnBoss() {
    const day = this.run.day;
    const meta = BOSSES[day - 1];
    const ar = this.level.bossArena;
    if (!ar) return;
    this.boss = createBoss(this, meta.id, day, ar.x + ar.w * .74, ar.y);
    this.state = 'play';
    this.hud.showBoss(meta, meta.phases);
    if (this._bossSnap && this._bossSnap.day === day) {
      this.boss.hp = Math.min(this.boss.hp, this._bossSnap.hp);
      this.hud.toast('He still bears your wounds — and each fall of yours weakens him a little more', '⛩', 'gold', 5600);
    }
    const COACH = {
      8: 'While even ONE mirror stands he takes NO damage — smash mirrors with anything: J, K spin, boomerang, charge. Press C (Phase) to slip unseen: phase-touch shatters glass 3× faster and ignores his yellow gaze. Phase 3: keep your BACK to him!',
      2: 'His gold armour deflects FRONT hits — normal, not a bug! Press K (Tail Cyclone) whenever ready: each spin cracks it, 3 cracks shatter it → then J·J·J freely. Phase 2: kill the 3 gold banners first (they heal him)! Sweets = life: each heals, every 3rd = +1 MAX heart, every 4th = shield pip.',
    };
    this.hud.toast(COACH[day] || 'Dodge his attacks — when he stops, run in and press J·J·J or K. Grab sweets before he does!', '✦', 'gold', 8000);
    this.hud.objective('Vanquish', `${meta.name} — ${meta.title}`);
    this.audio.setMode(day === 9 ? 'final' : 'boss');
    this.audio.setIntensity(.8);
    const pad = 70;
    this.camera.bounds = { x: ar.x - pad, y: ar.y - ar.h - pad, w: ar.w + pad * 2, h: ar.h + pad * 2 };
    this.audio.sfx('roar');
    this.fx.shake(20); this.fx.ripple(this.boss.cx, this.boss.cy, meta.color, 700, 1);
    this.particles.burst(this.boss.cx, this.boss.cy, 60, { color: [meta.color, '#fff3d0'], spd: 380, size: 5, life: 1.1 });
    this.camera.zoom = 1.16; this.camera.zoomT = 1.16;
    setTimeout(() => { this.camera.zoomT = 1; }, 900);
    this.hud.bossCue(meta.name, meta.title, 2.6);
    if (this.settings.hints && meta.weakness) setTimeout(() => this.hud.hint(meta.weakness, 7), 2600);
  }
  onBossDefeated(boss) {
    if (this._dayDone) return;
    this._dayDone = true;
    this._bossSnap = null; this._bossDeaths = 0;
    this.finishDay();
  }
  finishDay() {
    const day = this.run.day;
    const meta = BOSSES[day - 1];
    // Day 9 has no ninth boon — its reward is the Parashu itself, and victory.
    const boon = BOONS[day - 1] || null;
    this.state = 'boon';
    this.input.enabled = false;
    this.camera.bounds = null;
    this.hud.hideBoss(); this.hud.hideSeals(); this.hud.hidePrompt(); this.hud.hint('');
    this.boss = null;
    this.enemies.length = 0; this.projectiles.length = 0;
    this.audio.setMode('victory'); this.audio.setIntensity(.9);
    this.audio.sfx('blessing');
    this.fx.flash('bless');
    this.particles.confetti(this.player.x + this.player.w / 2, this.player.y - 200, 160);

    const time = this.run.elapsed;
    const modakTotal = Math.max(1, this.run.modakTotal || this.level.modaks.length);
    const rank = this.rank(time, this.run.modaks, modakTotal, this.run.deaths, day);
    const rec = { day, time: Math.round(time * 1000), rank, modaks: this.run.modaks, modakTotal, kills: this.run.kills, deaths: this.run.deaths, shards: this.run.shards };
    const prev = this.save.days[day];
    if (!prev || prev.time > rec.time) this.save.days[day] = rec; else this.save.days[day] = { ...prev, ...rec, time: Math.min(prev.time, rec.time) };
    if (boon && !this.save.boons.includes(boon.id)) this.save.boons.push(boon.id);
    this.save.day = Math.max(this.save.day || 1, Math.min(9, day + 1));
    this.save.cp = null;
    this.persist();
    let artText = '';
    if (boon) {
      this.player.give(boon.id);
      const tier = this.player.owned.size;
      const ARTS = ['CYCLONE MASTERY — your Tail Cyclone spins harder & recharges faster',
        'ROOT-BREAKER — your combo finisher now cracks armour',
        'FOUR-STRIKE FLOW — your combo chain gains a fourth strike',
        'WIDER CYCLONE — the spin reaches further & hits harder',
        'FIVE-STRIKE TEMPLE — the chain gains a fifth launcher',
        'DIVINE MIGHT — every strike lands heavier',
        'MIRROR-BREAKER — every weapon shatters ego-glass; Phase-touch shatters it fastest',
        'PARASHU ECHO — your blows carry the axe’s memory'];
      artText = ARTS[Math.min(tier, ARTS.length) - 1] || '';
    }

    if (day === 9) { setTimeout(() => this.victory(), 1500); return; }
    setTimeout(() => {
      this.screens.showBoon(day, { time: rec.time, rank: rec.rank, modaks: rec.modaks, modakTotal: rec.modakTotal, kills: rec.kills, deaths: rec.deaths }, () => {
        this._dayDone = false;
        this.startDay(day + 1, { rush: false });
        if (artText) this.hud.toast('NEW COMBAT ART: ' + artText, '✦', 'gold', 8000);
      });
      this.state = 'boon';
    }, 1200);
  }
  rank(time, modaks, modakTotal, deaths, day) {
    const par = PAR[day] || 200;
    const tk = clamp(par / Math.max(20, time), 0, 2);
    const mk = modakTotal ? modaks / modakTotal : 0;
    const score = tk * 55 + mk * 35 - deaths * 4;
    if (score >= 88 && deaths <= 1) return 'S';
    if (score >= 74) return 'A';
    if (score >= 58) return 'B';
    if (score >= 42) return 'C';
    return 'D';
  }
  victory() {
    this.save.finished = true; this.save.unlockAll = true; this.persist();
    const days = Object.values(this.save.days);
    const totalTime = days.reduce((a, d) => a + (d.time || 0), 0);
    const modaks = days.reduce((a, d) => a + (d.modaks || 0), 0);
    const modakTotal = days.reduce((a, d) => a + (d.modakTotal || 0), 0) || 1;
    const ranks = days.map((d) => d.rank || 'D');
    const order = { S: 5, A: 4, B: 3, C: 2, D: 1 };
    const avg = ranks.reduce((a, r) => a + order[r], 0) / ranks.length;
    const rank = avg >= 4.6 ? 'S' : avg >= 3.8 ? 'A' : avg >= 2.9 ? 'B' : avg >= 2 ? 'C' : 'D';
    this.state = 'win';
    this.input.enabled = false;
    this.hud.show(false);
    this.audio.setMode('victory'); this.audio.setIntensity(1);
    this.screens.showVictory({
      totalTime, modaks, kills: this.stats.kills, deaths: days.reduce((a, d) => a + (d.deaths || 0), 0),
      rank, completion: clamp((modaks / modakTotal) * 60 + (days.length / 9) * 40, 0, 100),
    }, (to) => {
      if (to === 'credits') { this.state = 'credits'; this.screens.showCredits(); }
      else { this._dayDone = false; this.rush = false; this.toTitle(); }
    });
  }
  finishCredits() { this._dayDone = false; this.rush = false; this.save.unlockAll = this.save.finished; this.toTitle(); }

  onPlayerDeath() {
    this.state = 'dead';
    this.deadT = 0;
    this.audio.setMode('shrine'); this.audio.setIntensity(.3);
    this.hud.hidePrompt();
    if (this.boss) {
      if (this.boss.state === 'fight' || this.boss.state === 'intro') {
        this._bossDeaths = (this._bossDeaths || 0) + 1;
        let hp = this.boss.hp;
        hp = Math.max(this.boss.maxHp * .1, hp * .88);  // shrine blessing: he weakens on every retry, forever
        this._bossSnap = { day: this.run.day, hp };
      }
      this.boss = null; this.hud.hideBoss();
    }
  }

  /* ================================ LOOP ================================= */
  loop(ts) {
    requestAnimationFrame(this.loop);
    if (this.camera) this.camera.zoom += ((this.camera.zoomT ?? 1) - this.camera.zoom) * .06;
    const raw = clamp((ts - this.last) / 1000, 0, .05) || 0;
    this.last = ts;
    this.frames++; this.fpsT += raw;
    if (this.fpsT > .5) { this.fps = Math.round(this.frames / this.fpsT); this.frames = 0; this.fpsT = 0; }

    this.metaInput(raw);
    this.input.update(raw);

    if (['play', 'dead', 'story', 'boon'].includes(this.state)) {
      this.dayCard = Math.max(0, this.dayCard - raw);
      let dt = raw * this.fx.timeScale;
      if (this.fx.hitStop > 0) { this.fx.hitStop -= raw; dt = raw * .05; }
      this.time += dt;
      this.update(dt, raw);
    } else {
      this.time += raw * .35;   // menus keep a slow ambient clock
      this.dayCard = Math.max(0, this.dayCard - raw);
    }
    if (this.state === 'howto' && this.screens.current !== 'controls') { this.state = 'play'; this.input.enabled = true; }
    this.fx.update(this.state === 'pause' ? 0 : raw);
    this.render(raw);
    this.input.endFrame();
  }

  metaInput(raw) {
    const I = this.input;
    if (I.raw('fullscreen')) this.toggleFullscreen();
    if (I.raw('hint')) this.showHint();
    if (I.raw('mute')) { this.settings.muted = !this.settings.muted; this.saveSettings(); this.applySettings(); this.hud.toast(this.settings.muted ? 'Audio muted' : 'Audio on', this.settings.muted ? '🔇' : '🔊'); }
    if (I.raw('pause')) {
      if (this.state === 'play') this.pause();
      else if (this.state === 'pause') this.resume();
      else if (['settings', 'controls', 'codex', 'levels'].includes(this.screens.current)) this.screens.back();
    }
    if (this.state === 'howto' && (I.raw('confirm') || I.raw('jump') || I.raw('attack'))) { this.screens.back(); }
    if (this.screens.current === 'title' && !this.world) {
      if (I.pressed('up')) this.screens.menuMove(-1);
      if (I.pressed('down')) this.screens.menuMove(1);
      if (I.pressed('confirm') || I.pressed('jump') || I.pressed('attack')) this.screens.menuConfirm();
    }
  }

  showHint() {
    this.hud.toast(resolveHint(this), '✦', 'gold', 7000);
  }

  toggleFullscreen() {
    const d = document;
    try {
      const p = d.fullscreenElement
        ? d.exitFullscreen()
        : (d.documentElement.requestFullscreen ? d.documentElement.requestFullscreen({ navigationUI: 'hide' }) : null);
      if (p && p.catch) p.catch(() => this.fsDenied());
    } catch (err) { this.fsDenied(); }
  }
  fsDenied() {
    this.hud.toast('This embed blocks fullscreen — use the preview’s pop-out / new-tab icon, then Alt+Enter', '✦');
  }

  update(dt, raw) {
    const I = this.input;
    this.run.elapsed += dt;

    /* --- first-ever Day 1: pause into the How-to-Play panel once --- */
    if (this.pendingHowTo && this.dayCard < 1.4) {
      this.pendingHowTo = false;
      this.screens.show('controls');          // onScreen() would force 'pause'…
      this.state = 'howto'; this.input.enabled = false;   // …so claim our own state after
      return;
    }
    this.coach(dt, raw);
    /* stuck-detector: no eastward progress for a while → offer guidance */
    if (this.state === 'play' && !this.boss && this.player) {
      const wx = this.player.x;
      if (wx > (this._progX ?? -1e9) + 60) { this._progX = wx; this._stuckT = 0; }
      else this._stuckT = (this._stuckT || 0) + dt;
      if (this._stuckT > 45) { this._stuckT = -90; this.showHint(); }
    }

    if (this.state === 'dead') {
      this.deadT += dt;
      this.player?.update(dt, this);
      this.particles.update(dt, this.settings.particles);
      this.camera.follow(this.player, dt, this.level.w, this.level.h);
      if (this.deadT > 1.35 && !this._overShown) { this._overShown = true; this.screens.showGameOver(); this.state = 'over'; this.input.enabled = false; }
      return;
    }
    this._overShown = false;

    if (this.state === 'boon' || this.state === 'story') {
      // cinematic: world keeps breathing, the mouse holds still
      this.player.vx *= .8; this.player.vy = this.state === 'boon' ? 0 : this.player.vy;
      this.world.update(dt, this);
      this.particles.update(dt, this.settings.particles);
      if (this.state === 'boon') this.camera.follow(this.player, dt, this.level.w, this.level.h);
      this.dayCard = Math.max(0, this.dayCard - raw);
      this.updateHud();
      return;
    }

    /* --- boon gates: pressing C next to a sealed gate uses the right boon --- */
    const pr = this.world.prompt;
    if (I.pressed('special') && pr && pr.act === 'gate') {
      this.world.tryGateWithBoon(this);
      I.down.special = false;
    }
    if (I.pressed('interact')) {
      if (pr && pr.act === 'gate') { this.world.tryGateWithBoon(this); }
      else if (!this.world.interact(this)) {
        this.audio.sfx('ui');
      }
    }

    this.player.update(dt, this);
    this.boss?.update(dt, this);
    this.world.update(dt, this);

    /* --- camera --- */
    if (this.boss && this.boss.state !== 'dying') {
      const ar = this.level.bossArena;
      const mid = { x: lerp(this.player.x, this.boss.cx, .42), y: lerp(this.player.y, this.boss.cy, .35), w: 1, h: 1, vx: 0, vy: 0 };
      this.camera.follow(mid, dt, this.level.w, this.level.h);
      this.camera.zoom = 1;
    } else {
      this.camera.follow(this.player, dt, this.level.w, this.level.h);
      if (this.boss?.state === 'dying') this.camera.bounds = null;
    }

    /* --- combo decay --- */
    if (this.run.comboT > 0) {
      this.run.comboT -= dt;
      this.hud.setComboBar(this.run.comboT / 2.6);
      if (this.run.comboT <= 0) { this.run.combo = 0; this.hud.setCombo(0); this.hud.setComboBar(0); }
    }

    /* --- music intensity --- */
    if (this.boss) {
      this.audio.setIntensity(clamp(.55 + (1 - this.boss.hp / this.boss.maxHp) * .45 + (this.boss.atk ? .15 : 0), 0, 1));
    } else {
      let near = 0;
      for (const e of this.enemies) if (Math.abs(e.cx - this.player.x) < 520 && !e.dead) near++;
      this.audio.setIntensity(clamp(.35 + near * .12, 0, .9));
    }

    /* --- particles & HUD --- */
    this.particles.update(dt, this.settings.particles);
    this.updateHud();
  }

  /* step-by-step coach for the first Day 1: each cue waits for the action */
  coach(dt, raw) {
    if (this.state !== 'play' || this.run.day !== 1 || this.save.coached || this.boss) return;
    const c = (this.coachS = this.coachS || { step: 0, t: 0, held: 0 });
    c.t += dt;
    const I = this.input, p = this.player;
    const say = (main, sub) => this.hud.bossCue(main, sub, 4.5);
    if (c.t > 5.2) { c.t = 0; }                     // re-cue while a step is pending
    const step = c.step;
    if (c.t === dt || (c.t < dt * 1.5)) {           // just entered a step
      const T = this.touchUI;
      if (step === 0) say(T ? 'Walk with the stick' : 'Walk with A / D', T ? 'your left thumb lives here' : 'or push the left stick on touch');
      if (step === 1) say(T ? 'Jump with the JUMP button' : 'Jump with SPACE', T ? 'tap it again mid-air to double-jump' : 'hold it a moment longer to jump higher');
      if (step === 2) say(T ? 'Swipe with the SWIPE button' : 'Swipe with J', 'three-hit combo — the third hit knocks back');
      if (step === 3) say(T ? 'Dodge with the DODGE button' : 'Dodge with SHIFT', 'a dodge mid-air covers great distance');
    }
    if (step === 0) {
      if (I.held.left || I.held.right) c.held += dt; else c.held = 0;
      if (c.held > .5) { c.step = 1; c.t = 0; }
    } else if (step === 1) {
      if (I.pressed('jump') || !p.onGround) { c.step = 2; c.t = 0; }
    } else if (step === 2) {
      if (I.pressed('attack') || p.atk) { c.step = 3; c.t = 0; }
    } else if (step === 3) {
      if (I.pressed('dodge') || p.dodgeT > 0) {
        c.step = 4; this.save.coached = true; this.persist();
        this.hud.bossCue('Well done, little vehicle', 'the Nine Days await — shrines save your progress', 3.4);
      }
    }
  }

  updateHud() {
    const p = this.player;
    this.hud.setHearts(p.hp, p.maxHp, p.shieldPips || 0);
    this.hud.setBhakti(p.bhakti, p.maxBhakti);
    this.hud.setModaks(this.run.modaks, this.run.modakTotal || this.level.modaks.length);
    this.hud.setTimer(fmtTime(this.run.elapsed * 1000));
    this.hud.setBoons(p.owned, p.sel, p.cds, p.bhakti >= p.maxBhakti && p.surge <= 0);
    if (this.boss && !this.boss.dead) this.hud.setBossHp(this.boss.hp / this.boss.maxHp);
    const pr = this.world.prompt;
    if (pr) this.hud.prompt(pr.key, pr.text); else this.hud.hidePrompt();
  }

  /* ================================ RENDER =============================== */
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, this.touchUI ? 1.5 : 2);
    const W = Math.max(320, window.innerWidth), H = Math.max(240, window.innerHeight);
    this.canvas.width = Math.round(W * dpr); this.canvas.height = Math.round(H * dpr);
    this.canvas.style.width = W + 'px'; this.canvas.style.height = H + 'px';
    const aspect = W / H;
    let vw = clamp(VIEW_H * aspect, 880, 1680);
    let vh = vw / aspect;
    if (vh > VIEW_H * 1.35) { vh = VIEW_H * 1.35; vw = vh * aspect; }
    this.scale = (W / vw) * dpr;
    this.camera.w = vw; this.camera.h = vh;
    this.view = { w: vw, h: vh };
  }

  render(raw) {
    const ctx = this.ctx;
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.imageSmoothingEnabled = true;
    const vw = this.camera.w, vh = this.camera.h;
    const camz = this.camera.zoom || 1;
    if (camz !== 1) { ctx.translate(vw / 2, vh / 2); ctx.scale(camz, camz); ctx.translate(-vw / 2, -vh / 2); }
    if (this.world && this.state !== 'title' && this.state !== 'levels' && this.state !== 'codex' && this.state !== 'boot') {
      ctx.fillStyle = '#07040f'; ctx.fillRect(0, 0, vw, vh);
      this.world.draw(ctx, this, this.time);
      this.drawDayCard(ctx, vw, vh);
      if (this.state === 'dead') this.drawDeathVeil(ctx, vw, vh);
    } else {
      this.drawBackdrop(ctx, vw, vh, this.time);
    }
    if (this.debug) this.drawDebug(ctx, vw, vh);
  }

  drawDayCard(ctx, vw, vh) {
    if (this.dayCard <= 0) return;
    const total = 3.4, k = 1 - this.dayCard / total;
    const a = k < .12 ? k / .12 : k > .82 ? (1 - k) / .18 : 1;
    ctx.save();
    ctx.globalAlpha = clamp(a, 0, 1);
    ctx.fillStyle = `rgba(6,3,14,${.55 * a})`; ctx.fillRect(0, 0, vw, vh);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const cy = vh * .42;
    // mandala
    ctx.globalAlpha = clamp(a, 0, 1) * .5;
    mandala(ctx, vw / 2, cy, 190 + Math.sin(this.time) * 6, 16, this.time * .3, '#f6b93b', .5);
    ctx.globalAlpha = clamp(a, 0, 1);
    ctx.font = `700 ${Math.round(vh * .045)}px Cinzel, Georgia, serif`;
    ctx.fillStyle = '#f6b93b';
    ctx.shadowColor = '#ff8a1f'; ctx.shadowBlur = 26;
    ctx.fillText(this.dayCardText.toUpperCase(), vw / 2, cy - vh * .085);
    ctx.shadowBlur = 0;
    ctx.font = `400 ${Math.round(vh * .052)}px "Tiro Devanagari Sanskrit", serif`;
    ctx.fillStyle = 'rgba(255,233,168,.9)';
    ctx.fillText(this.dayCardDeva, vw / 2, cy - vh * .012);
    ctx.font = `600 ${Math.round(vh * .036)}px Cinzel, Georgia, serif`;
    ctx.fillStyle = '#f8edda';
    ctx.fillText(this.dayCardSub, vw / 2, cy + vh * .072);
    // rule
    ctx.strokeStyle = rgba('#f6b93b', .6); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(vw / 2 - 170, cy + vh * .12); ctx.lineTo(vw / 2 + 170, cy + vh * .12); ctx.stroke();
    ctx.restore();
  }

  drawDeathVeil(ctx, vw, vh) {
    const k = clamp(this.deadT / 1.2, 0, 1);
    ctx.save();
    ctx.fillStyle = `rgba(20,2,8,${k * .62})`; ctx.fillRect(0, 0, vw, vh);
    ctx.globalAlpha = k;
    ctx.textAlign = 'center';
    ctx.font = `700 ${Math.round(vh * .05)}px Cinzel, Georgia, serif`;
    ctx.fillStyle = '#ffb3c0';
    ctx.fillText('the mouse falls…', vw / 2, vh * .5);
    ctx.restore();
  }

  /* --- ambient menu backdrop: a festival night with nine diyas --- */
  initBackdrop() {
    for (let i = 0; i < 70; i++) this.backdrop.stars.push({ x: Math.random(), y: Math.random() * .6, r: Math.random() * 1.6 + .4, tw: Math.random() * 6 });
    for (let i = 0; i < 34; i++) this.backdrop.petals.push({ x: Math.random(), y: Math.random(), vy: .012 + Math.random() * .03, vx: -.01 + Math.random() * .02, r: 2 + Math.random() * 3.4, rot: Math.random() * TAU, spin: rand(-1.4, 1.4), c: ['#ff8fbf', '#ffd775', '#ff9a2e', '#fff3d0'][(Math.random() * 4) | 0] });
    for (let i = 0; i < 9; i++) this.backdrop.diyas.push({ k: i, x: .08 + i * .105, y: .82 + Math.sin(i * 1.7) * .02 });
  }
  drawBackdrop(ctx, vw, vh, t) {
    const sky = ctx.createLinearGradient(0, 0, 0, vh);
    sky.addColorStop(0, '#150a2e'); sky.addColorStop(.45, '#2a1140'); sky.addColorStop(1, '#0a0518');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, vw, vh);
    // stars
    for (const s of this.backdrop.stars) {
      ctx.globalAlpha = .25 + Math.abs(Math.sin(t * .7 + s.tw)) * .6;
      ctx.fillStyle = '#fff6dd';
      ctx.fillRect(s.x * vw, s.y * vh, s.r, s.r);
    }
    ctx.globalAlpha = 1;
    // moon
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    glow(ctx, vw * .82, vh * .18, 120, '#ffe6a3', .28);
    ctx.fillStyle = '#fff3d0'; ctx.beginPath(); ctx.arc(vw * .82, vh * .18, 30, 0, TAU); ctx.fill();
    ctx.restore();
    // rotating mandala
    ctx.save(); ctx.globalAlpha = .2;
    mandala(ctx, vw * .5, vh * .52, Math.min(vw, vh) * .46, 24, t * .12, '#f6b93b', .45);
    ctx.globalAlpha = .13;
    mandala(ctx, vw * .5, vh * .52, Math.min(vw, vh) * .3, 12, -t * .2, '#39d6c2', .4);
    ctx.restore();
    // temple skyline
    ctx.fillStyle = '#0d0720';
    const baseY = vh * .78;
    ctx.beginPath(); ctx.moveTo(0, vh);
    for (let i = 0; i <= 26; i++) {
      const x = (i / 26) * vw;
      const h = 40 + Math.abs(Math.sin(i * 2.3)) * 90 + (i % 5 === 0 ? 70 : 0);
      ctx.lineTo(x, baseY - h);
      if (i % 5 === 0) { ctx.lineTo(x + 12, baseY - h - 26); ctx.lineTo(x + 24, baseY - h); }
      ctx.lineTo(x + vw / 26, baseY - h);
    }
    ctx.lineTo(vw, vh); ctx.closePath(); ctx.fill();
    // ground
    const gg = ctx.createLinearGradient(0, baseY, 0, vh);
    gg.addColorStop(0, '#1a0f2c'); gg.addColorStop(1, '#08040f');
    ctx.fillStyle = gg; ctx.fillRect(0, baseY, vw, vh - baseY);
    // nine diyas — lit for every realm purified
    const done = Object.keys(this.save.days || {}).length;
    for (const d of this.backdrop.diyas) {
      const x = d.x * vw, y = d.y * vh;
      const lit = d.k < done || (this.save.finished && true);
      ctx.save();
      if (lit) { ctx.globalCompositeOperation = 'lighter'; glow(ctx, x, y - 6, 46 + Math.sin(t * 4 + d.k) * 6, '#ff9a2e', .5); }
      ctx.restore();
      ctx.fillStyle = lit ? '#8a5a20' : '#2a1c38';
      ctx.beginPath(); ctx.ellipse(x, y, 15, 6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = lit ? '#c98a3a' : '#3a2a4a';
      ctx.beginPath(); ctx.ellipse(x, y - 2, 15, 5, 0, Math.PI, TAU); ctx.fill();
      if (lit) {
        const f = 1 + Math.sin(t * 9 + d.k * 2) * .12;
        ctx.fillStyle = '#ffca55';
        ctx.beginPath(); ctx.ellipse(x, y - 13 * f, 5 * f, 11 * f, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#fff8e0';
        ctx.beginPath(); ctx.ellipse(x, y - 12 * f, 2.2 * f, 5.4 * f, 0, 0, TAU); ctx.fill();
      }
    }
    // drifting petals / embers
    for (const p of this.backdrop.petals) {
      p.y += p.vy * .016; p.x += (p.vx + Math.sin(t + p.rot) * .004) * .016; p.rot += p.spin * .016;
      if (p.y > 1.05) { p.y = -.05; p.x = Math.random(); }
      if (p.x < -.05) p.x = 1.05; if (p.x > 1.05) p.x = -.05;
      ctx.save(); ctx.translate(p.x * vw, p.y * vh); ctx.rotate(p.rot);
      ctx.globalAlpha = .5; ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * .5, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    // bottom haze
    const hz = ctx.createLinearGradient(0, vh * .6, 0, vh);
    hz.addColorStop(0, 'rgba(10,5,24,0)'); hz.addColorStop(1, 'rgba(10,5,24,.85)');
    ctx.fillStyle = hz; ctx.fillRect(0, vh * .6, vw, vh * .4);
  }

  drawDebug(ctx, vw, vh) {
    ctx.save();
    ctx.font = '600 13px Rajdhani, monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(8, 8, 250, 118);
    ctx.fillStyle = '#7CFC9A';
    const p = this.player;
    const lines = [
      `fps ${this.fps}  state ${this.state}  t ${this.time.toFixed(1)}`,
      `pos ${p ? Math.round(p.x) + ',' + Math.round(p.y) : '-'}  v ${p ? Math.round(p.vx) + ',' + Math.round(p.vy) : '-'}`,
      `hp ${p?.hp}/${p?.maxHp}  bhakti ${Math.round(p?.bhakti || 0)}  boon ${p?.boon?.id || '-'}`,
      `enemies ${this.enemies.length}  proj ${this.projectiles.length}  parts ${this.particles.list.length}`,
      `boss ${this.boss ? this.boss.meta.id + ' ph' + this.boss.phase + ' ' + Math.round(this.boss.hp) + '/' + this.boss.maxHp + ' ' + this.boss.state : '-'}`,
      `cam ${Math.round(this.camera.x)},${Math.round(this.camera.y)} ${Math.round(vw)}x${Math.round(vh)}  solids ${this.level?.solids.length || 0}`,
      `day ${this.run.day} modaks ${this.run.modaks} kills ${this.run.kills} deaths ${this.run.deaths}`,
    ];
    lines.forEach((l, i) => ctx.fillText(l, 14, 14 + i * 15));
    ctx.restore();
  }
}

/* ================================= START ================================= */
const G = new Game();
window.GAME = G;
/* presenter deep-link: index.html?day=5&unlock=1 drops straight into a day   */
setTimeout(() => {
  try {
    const q = new URLSearchParams(location.search);
    const d = +q.get('day');
    if (d >= 1 && d <= 9) {
      if (q.get('unlock')) { G.save.unlockAll = true; G.persist(); }
      if (G.state === 'title') G.startDay(d);
    }
  } catch { /* ignore */ }
}, 2800);
window.addEventListener('error', (e) => {
  // never leave the player with a black screen
  const el = document.getElementById('boot-status');
  if (el && G.state === 'boot') { el.textContent = 'Something went wrong: ' + (e.message || 'unknown'); el.style.color = '#ff8a9a'; }
  console.error(e.error || e.message);
});
setTimeout(() => {
  if (G.state === 'boot') {
    const el = document.getElementById('boot-status');
    if (el && !el.textContent) el.textContent = 'Still loading… if this persists, scripts may be blocked here — try a new tab.';
  }
}, 7000);
