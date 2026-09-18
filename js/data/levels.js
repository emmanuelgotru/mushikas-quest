/* ===========================================================================
   data/levels.js — the nine realms, built with a compact level DSL.
   World units: player ≈ 26x34. Viewport is 600 units tall (scaled to fit).
   =========================================================================== */
import { makeRng } from '../core/utils.js';

export const VIEW_H = 600;
export const WORLD_H = 1520;
export const GROUND = 1080; // default floor top

class Builder {
  constructor(day, cfg) {
    this.day = day;
    Object.assign(this, cfg);
    this.solids = []; this.hazards = []; this.enemies = []; this.modaks = [];
    this.gates = []; this.anchors = []; this.switches = []; this.shrines = [];
    this.decor = []; this.texts = []; this.rng = makeRng(day * 7717 + 13);
    this.x = 0;
  }
  /* --- geometry --- */
  ground(x0, x1, y = GROUND, kind = 'ground') { this.solids.push({ x: x0, y, w: x1 - x0, h: WORLD_H - y, kind, solid: true }); return this; }
  pit(x0, x1, hazard = 'water', depth = 60) {
    this.hazards.push({ kind: hazard, x: x0, y: WORLD_H - depth, w: x1 - x0, h: depth });
    return this;
  }
  plat(x, y, w, h = 26, kind = 'stone', o = {}) { this.solids.push({ x, y, w, h, kind, solid: true, ...o }); return this; }
  oneway(x, y, w, kind = 'ledge') { return this.plat(x, y, w, 16, kind, { oneway: true }); }
  moving(x, y, w, dx = 0, dy = 0, spd = 1, kind = 'stone', h = 24) {
    return this.plat(x, y, w, h, kind, { move: { dx, dy, spd, t: 0, ox: x, oy: y }, solid: true });
  }
  crumble(x, y, w) { return this.plat(x, y, w, 22, 'crumble'); }
  hidden(x, y, w, h = 24) { return this.plat(x, y, w, h, 'hidden', { reveal: 'truesight' }); }
  vanish(x, y, w) { return this.plat(x, y, w, 22, 'vanish'); }
  bounce(x, y, w = 70) { return this.plat(x, y, w, 20, 'bounce'); }
  sticky(x, y, w) { return this.plat(x, y, w, 24, 'sticky'); }
  quicksand(x, y, w) { return this.plats(x, y, w, 46, 'quicksand'); }
  plats(x, y, w, h, kind) { return this.plat(x, y, w, h, kind); }
  ceiling(x0, x1, y) { this.solids.push({ x: x0, y: y - 400, w: x1 - x0, h: 400, kind: 'ceiling', solid: true }); return this; }

  /* --- hazards --- */
  spikes(x, y, w, h = 22) { this.hazards.push({ kind: 'spike', x, y: y - h, w, h }); return this; }
  lava(x, y, w, h = 40) { this.hazards.push({ kind: 'lava', x, y, w, h }); return this; }
  water(x, y, w, h = 90) { this.hazards.push({ kind: 'water', x, y, w, h }); return this; }
  gas(x, y, w, h = 150, effect = 'reverse') { this.hazards.push({ kind: 'gas', x, y, w, h, effect }); return this; }
  laser(x, y, h, period = 2.4, onDur = 1.3, phase = 0) { this.hazards.push({ kind: 'laser', x, y, w: 14, h, period, onDur, phase }); return this; }
  flame(x, y, period = 2.2, onDur = 1.1, phase = 0, h = 150) { this.hazards.push({ kind: 'flame', x, y, w: 46, h, period, onDur, phase }); return this; }
  crusher(x, y, w = 90, period = 3, phase = 0, drop = 260) { this.hazards.push({ kind: 'crusher', x, y, w, h: 70, period, phase, drop, oy: y }); return this; }
  thorns(x, y, w, h = 34) { this.hazards.push({ kind: 'thorn', x, y, w, h }); return this; }

  /* --- actors --- */
  enemy(type, x, y, o = {}) { this.enemies.push({ type, x, y, ...o }); return this; }
  modak(x, y) { this.modaks.push({ x, y }); return this; }
  modakArc(x, y, n = 5, dx = 46, dy = -26) { for (let i = 0; i < n; i++) this.modak(x + i * dx, y + Math.sin(i / (n - 1) * Math.PI) * dy * 2 - dy); return this; }
  modakLine(x, y, n = 4, dx = 44) { for (let i = 0; i < n; i++) this.modak(x + i * dx, y); return this; }
  anchor(x, y) { this.anchors.push({ x, y }); return this; }
  shrine(x, y = GROUND) { this.shrines.push({ x, y: y - 4 }); return this; }
  switch(x, y, gateIdx, o = {}) { this.switches.push({ x, y, gate: gateIdx, hit: false, ...o }); return this; }
  gate(kind, x, y, w, h, o = {}) { this.gates.push({ kind, x, y, w, h, open: false, ...o }); return this.gates.length - 1; }
  text(x, y, str, o = {}) { this.texts.push({ x, y, str, ...o }); return this; }
  decor(kind, x, y, o = {}) { this.decor.push({ kind, x, y, ...o }); return this; }

  /* --- boss arena: flat chamber with walls, locked door behind --- */
  arena(x, y = GROUND, w = 980, h = 620) {
    this.ground(x, x + w, y);
    this.solids.push({ x: x + w, y: y - h, w: 60, h, kind: 'wall', solid: true });
    this.solids.push({ x: x - 40, y: y - h - 40, w: w + 80, h: 40, kind: 'ceiling', solid: true });
    this.bossArena = { x, y, w, h };
    return this;
  }
  build() {
    // auto-scatter modaks on platforms that have none nearby
    return {
      day: this.day, name: this.name, vice: this.vice, boss: this.boss, biome: this.biome,
      palette: this.palette, env: this.env, music: this.music, w: this.w, h: WORLD_H,
      groundY: this.groundY || GROUND, hint: this.hint, objective: this.objective,
      solids: this.solids, hazards: this.hazards, enemies: this.enemies, modaks: this.modaks,
      gates: this.gates, anchors: this.anchors, switches: this.switches, shrines: this.shrines,
      decor: this.decor, texts: this.texts, bossArena: this.bossArena, spawn: this.spawn || { x: 90, y: GROUND - 80 },
      secrets: this.secrets || 3,
    };
  }
}

/* palette + env presets per biome */
const BIOME = {
  swamp: {
    palette: { sky: ['#16301f', '#050d09'], far: '#0c2417', mid: '#123a22', near: '#1a4f2c', ground: '#254f2c', groundTop: '#4d8f3c', accent: '#7ee06b', glow: '#b6ff7a', fog: 'rgba(20,60,34,.34)', water: '#2f6b45' },
    env: { weather: 'spore', weatherColor: '#b6ff7a', weatherRate: .55, mist: .3, dark: .18 },
    music: { mode: 'explore', raga: 'bhairav', bpm: 92 },
  },
  fortress: {
    palette: { sky: ['#2b2340', '#0c0818'], far: '#241d3a', mid: '#332a4d', near: '#443a63', ground: '#4a4060', groundTop: '#8a7aa8', accent: '#e8c25a', glow: '#ffd97a', fog: 'rgba(40,32,64,.3)', water: '#2a2440' },
    env: { weather: 'banner', weatherColor: '#e8c25a', weatherRate: .12, mist: .16, dark: .06 },
    music: { mode: 'tension', raga: 'marwa', bpm: 104 },
  },
  labyrinth: {
    palette: { sky: ['#241a44', '#0a0620'], far: '#1d1438', mid: '#2b1d52', near: '#3a2768', ground: '#33245c', groundTop: '#6a4fb0', accent: '#c792ff', glow: '#e0b8ff', fog: 'rgba(50,30,100,.36)', water: '#2a1c50' },
    env: { weather: 'mote', weatherColor: '#c792ff', weatherRate: .8, mist: .42, dark: .3, illusion: true },
    music: { mode: 'tension', raga: 'todi', bpm: 98 },
  },
  mines: {
    palette: { sky: ['#3a2a10', '#120a02'], far: '#3d2c11', mid: '#5a4218', near: '#7a5c22', ground: '#5c4419', groundTop: '#c79a3a', accent: '#ffd166', glow: '#ffe9a8', fog: 'rgba(90,66,20,.3)', water: '#3a2a10' },
    env: { weather: 'dust', weatherColor: '#ffd166', weatherRate: .5, mist: .2, dark: .42, sparkle: true },
    music: { mode: 'explore', raga: 'hindol', bpm: 108 },
  },
  volcano: {
    palette: { sky: ['#3d1206', '#150402'], far: '#4a1608', mid: '#6b2109', near: '#8c2c0c', ground: '#3a1a12', groundTop: '#6e3320', accent: '#ff6b3d', glow: '#ffb03a', fog: 'rgba(120,40,10,.3)', water: '#ff5a1e' },
    env: { weather: 'ash', weatherColor: '#ffb03a', weatherRate: 1.1, mist: .22, dark: .24, lavaLight: true },
    music: { mode: 'tension', raga: 'marwa', bpm: 126 },
  },
  garden: {
    palette: { sky: ['#2a1030', '#120420'], far: '#3a1642', mid: '#5c1f5e', near: '#8a2f74', ground: '#2f4a2a', groundTop: '#6fae4a', accent: '#ff6fa5', glow: '#ffb3d1', fog: 'rgba(120,40,110,.26)', water: '#4a2a5a' },
    env: { weather: 'petals', weatherColor: '#ff9fc4', weatherRate: .9, mist: .16, dark: .04, bloom: true },
    music: { mode: 'explore', raga: 'yaman', bpm: 112 },
  },
  web: {
    palette: { sky: ['#101f2c', '#04080e'], far: '#132634', mid: '#1b3446', near: '#25455c', ground: '#1d3242', groundTop: '#4e7d99', accent: '#9fd8ff', glow: '#d8f0ff', fog: 'rgba(20,50,70,.4)', water: '#1a3548' },
    env: { weather: 'silk', weatherColor: '#cfe9ff', weatherRate: .3, mist: .46, dark: .5 },
    music: { mode: 'tension', raga: 'malkauns', bpm: 88 },
  },
  mirror: {
    palette: { sky: ['#1a2340', '#070a18'], far: '#222c50', mid: '#2e3a68', near: '#3d4c85', ground: '#2a3358', groundTop: '#8ea0d8', accent: '#dfe8ff', glow: '#ffffff', fog: 'rgba(50,60,110,.3)', water: '#1a2340' },
    env: { weather: 'shard', weatherColor: '#dfe8ff', weatherRate: .45, mist: .2, dark: .12, mirrors: true },
    music: { mode: 'tension', raga: 'todi', bpm: 118 },
  },
  ocean: {
    palette: { sky: ['#0d2a48', '#02060f'], far: '#123a63', mid: '#1b5489', near: '#2a76b5', ground: '#1d4a72', groundTop: '#63b8e8', accent: '#7fe8ff', glow: '#e0f8ff', fog: 'rgba(20,80,140,.3)', water: '#1a6aa8' },
    env: { weather: 'bubbles', weatherColor: '#bfeeff', weatherRate: 1.2, mist: .3, dark: .22, cosmic: true },
    music: { mode: 'final', raga: 'marwa', bpm: 132 },
  },
};

/* ============================ DAY 1 — SWAMP ============================= */
const L1 = () => {
  const b = new Builder(1, {
    name: 'The Swamps of Jealousy', vice: 'Matsara · Jealousy', boss: 'matsara', biome: 'swamp', w: 5700,
    hint: 'J swipe · K spin · SHIFT dodge · SPACE jump',
    objective: 'Cross the marsh. Find the rotting heart.',
    spawn: { x: 80, y: GROUND - 90 }, secrets: 3,
    ...BIOME.swamp,
  });
  b.ground(0, 900); b.shrine(240);
  b.enemy('crawler', 520, GROUND - 30); b.enemy('crawler', 700, GROUND - 30);
  b.modakLine(430, GROUND - 60, 4);
  b.water(900, GROUND + 40, 340, 90); b.oneway(960, GROUND - 90, 90, 'log'); b.oneway(1120, GROUND - 130, 90, 'log');
  b.ground(1240, 1980, GROUND); b.enemy('hopper', 1420, GROUND - 34); b.enemy('shooter', 1720, GROUND - 40);
  b.thorns(1560, GROUND, 120);
  b.plat(1620, GROUND - 150, 130); b.modakLine(1640, GROUND - 190, 3);
  b.oneway(2000, GROUND - 60, 90, 'log'); b.oneway(2140, GROUND - 130, 90, 'log'); b.oneway(2280, GROUND - 190, 90, 'log');
  b.ground(2380, 3120, GROUND - 60); b.shrine(2460, GROUND - 60);
  b.enemy('thief', 2620, GROUND - 90); b.enemy('mimic', 2900, GROUND - 90);
  b.vanish(2620, GROUND - 190, 90); b.vanish(2780, GROUND - 250, 90); b.modakArc(2600, GROUND - 250, 5);
  b.water(3120, GROUND + 20, 260, 110); b.moving(3200, GROUND - 110, 110, 0, -60, 1.1, 'log', 20);
  b.ground(3380, 4180, GROUND - 40);
  b.enemy('crawler', 3500, GROUND - 70); b.enemy('shooter', 3760, GROUND - 80); b.enemy('hopper', 3960, GROUND - 74);
  b.spikes(3620, GROUND - 40, 150);
  b.plat(3500, GROUND - 120, 140); b.plat(3700, GROUND - 210, 140); b.plat(3960, GROUND - 250, 130);
  b.modakLine(3520, GROUND - 160, 3); b.modakArc(3950, GROUND - 300, 4);
  b.gate('crack', 4180, GROUND - 190, 46, 150, { requires: 'charge', note: 'A wall of petrified root. Something with tremendous force could break this.' });
  b.hidden(4260, GROUND - 230, 130); b.modakArc(4250, GROUND - 280, 5);
  b.ground(4180, 4620, GROUND - 40);
  b.enemy('flyer', 4380, GROUND - 220); b.enemy('crawler', 4480, GROUND - 70);
  b.text(200, GROUND - 190, 'Move with A/D · Jump SPACE · Swipe J · Dodge SHIFT');
  b.text(2500, GROUND - 250, 'Murky water slows you and drains devotion — keep moving');
  b.text(4150, GROUND - 260, 'Sealed root-wall · return with greater force');
  b.arena(4700, GROUND - 40, 900, 620);
  b.gate('boss', 4660, GROUND - 200, 40, 160, { boss: true });
  return b.build();
};

/* =========================== DAY 2 — FORTRESS =========================== */
const L2 = () => {
  const b = new Builder(2, {
    name: 'The Fortress of Arrogance', vice: 'Mada · Pride', boss: 'mada', biome: 'fortress', w: 5600,
    hint: 'Armoured guards cannot be hurt from the front — bait them, then strike from behind',
    objective: 'Climb the unscalable walls. Reach the throne.',
    spawn: { x: 80, y: GROUND - 90 }, secrets: 4,
    ...BIOME.fortress,
  });
  b.ground(0, 760); b.shrine(200);
  b.enemy('crawler', 480, GROUND - 30, { kind: 'squire' });
  b.plat(560, GROUND - 140, 150); b.plat(820, GROUND - 250, 150); b.plat(1080, GROUND - 360, 150);
  b.modakArc(560, GROUND - 190, 3); b.modakArc(1080, GROUND - 410, 3);
  b.ground(760, 1500, GROUND);
  b.enemy('armored', 1000, GROUND - 46); b.enemy('shooter', 1320, GROUND - 250, { turret: true });
  b.plat(1250, GROUND - 200, 160);
  b.gate('switch', 1500, GROUND - 260, 44, 220, { requires: 'boomerang', note: 'A portcullis. Its winch-switch glimmers far above, out of reach of claws.' });
  b.switch(1880, GROUND - 430, 0, { kind: 'winch' });
  b.ground(1500, 2260, GROUND);
  b.plat(1620, GROUND - 150, 130); b.plat(1830, GROUND - 280, 130); b.plat(2050, GROUND - 380, 130);
  b.enemy('flyer', 1900, GROUND - 420, { kind: 'banner' });
  b.modakLine(1630, GROUND - 200, 3); b.modakLine(2060, GROUND - 430, 3);
  b.enemy('armored', 2140, GROUND - 46);
  b.ground(2260, 2980, GROUND - 80); b.shrine(2340, GROUND - 80);
  b.crusher(2500, GROUND - 320, 90, 3.1, 0, 230); b.crusher(2700, GROUND - 320, 90, 3.1, 1.4, 230);
  b.enemy('shooter', 2860, GROUND - 120, { turret: true });
  b.gate('crack', 2980, GROUND - 240, 48, 160, { requires: 'charge', note: 'A cracked battlement. Immovable — for now.' });
  b.plat(2860, GROUND - 160, 120); b.plat(2880, GROUND - 250, 120); b.plat(2960, GROUND - 340, 120);
  b.plat(2900, GROUND - 380, 120); b.modakArc(2880, GROUND - 440, 4);
  b.ground(2980, 3700, GROUND - 80);
  b.laser(3180, GROUND - 320, 240, 2.6, 1.3, 0); b.laser(3400, GROUND - 320, 240, 2.6, 1.3, 1.3);
  b.enemy('armored', 3300, GROUND - 126); b.enemy('crawler', 3560, GROUND - 110, { kind: 'squire' });
  b.moving(3600, GROUND - 200, 120, 0, -160, 1.2);
  b.modakLine(3620, GROUND - 300, 3);
  b.ground(3700, 4400, GROUND - 140);
  b.enemy('shooter', 3860, GROUND - 180, { turret: true }); b.enemy('armored', 4080, GROUND - 186);
  b.hidden(4000, GROUND - 330, 140); b.modakArc(3990, GROUND - 390, 5);
  b.text(1520, GROUND - 300, 'Throw the Boomerang (C) at the distant winch to raise the gate');
  b.text(2960, GROUND - 280, 'Cracked wall — sealed against claws');
  b.arena(4520, GROUND - 140, 980, 640);
  b.gate('boss', 4480, GROUND - 300, 40, 160, { boss: true });
  return b.build();
};

/* ========================== DAY 3 — LABYRINTH =========================== */
const L3 = () => {
  const b = new Builder(3, {
    name: 'The Labyrinth of Delusion', vice: 'Moha · Illusion', boss: 'moha', biome: 'labyrinth', w: 5700,
    hint: 'Open True Sight (C) to see the real path — illusions cannot hold your weight',
    objective: 'Find the real exit. Nine corridors lie.',
    spawn: { x: 80, y: GROUND - 90 }, secrets: 4,
    ...BIOME.labyrinth,
  });
  b.ground(0, 700); b.shrine(200);
  b.enemy('flyer', 520, GROUND - 200, { kind: 'eye' });
  b.text(220, GROUND - 200, 'True Sight: press C to open the third eye (drains Bhakti)');
  b.hidden(760, GROUND - 110, 120); b.hidden(940, GROUND - 200, 120); b.hidden(1120, GROUND - 290, 120);
  b.ground(700, 900, GROUND); b.ground(900, 1320, GROUND);
  b.spikes(980, GROUND, 200); b.spikes(1180, GROUND, 140);
  b.enemy('shooter', 1240, GROUND - 40, { turret: true, kind: 'eye' });
  b.modakArc(760, GROUND - 160, 4);
  b.ground(1320, 2080, GROUND - 60); b.shrine(1400, GROUND - 60);
  b.vanish(1560, GROUND - 190, 100); b.vanish(1720, GROUND - 260, 100); b.vanish(1880, GROUND - 190, 100);
  b.enemy('mimic', 1700, GROUND - 90); b.enemy('crawler', 1960, GROUND - 90, { kind: 'shade' });
  b.gate('crack', 2080, GROUND - 220, 48, 160, { requires: 'charge', note: 'A false wall. True Sight shows the seam — break it with the Charge.' });
  b.plat(2000, GROUND - 330, 120); b.modakLine(2010, GROUND - 380, 3);
  b.ground(2080, 2900, GROUND - 60);
  b.hidden(2200, GROUND - 170, 130); b.hidden(2400, GROUND - 250, 130); b.hidden(2600, GROUND - 330, 130);
  b.enemy('flyer', 2450, GROUND - 300, { kind: 'eye' }); b.enemy('flyer', 2700, GROUND - 220, { kind: 'eye' });
  b.laser(2340, GROUND - 300, 240, 2.2, 1.1, 0); b.laser(2560, GROUND - 380, 240, 2.2, 1.1, 1.1);
  b.modakArc(2200, GROUND - 220, 4); b.modakArc(2600, GROUND - 380, 4);
  b.ground(2900, 3620, GROUND - 120); b.shrine(2980, GROUND - 120);
  b.enemy('armored', 3160, GROUND - 166); b.enemy('spawner', 3420, GROUND - 170, { kind: 'illusion' });
  b.crusher(3260, GROUND - 400, 90, 2.8, 0, 260);
  b.moving(3520, GROUND - 240, 110, 190, 0, 1.1);
  b.hidden(3660, GROUND - 260, 140); b.modakArc(3650, GROUND - 320, 5);
  b.gate('switch', 3620, GROUND - 300, 44, 180, { requires: 'boomerang', note: 'The gate\u2019s switch floats in mid-air — an illusion\u2019s own trick.' });
  b.switch(3980, GROUND - 470, 2, { kind: 'rune', hidden: true });
  b.ground(3620, 4480, GROUND - 120);
  b.vanish(3820, GROUND - 240, 100); b.vanish(4000, GROUND - 300, 100); b.vanish(4180, GROUND - 240, 100);
  b.enemy('shooter', 4100, GROUND - 160, { turret: true, kind: 'eye' }); b.enemy('mimic', 4300, GROUND - 150);
  b.modakLine(3830, GROUND - 300, 3);
  b.text(2100, GROUND - 260, 'Select the Charge (keys 1–8) then run at the false wall');
  b.text(3640, GROUND - 340, 'Throw the Boomerang at the floating rune');
  b.arena(4620, GROUND - 120, 960, 640);
  b.gate('boss', 4580, GROUND - 280, 40, 160, { boss: true });
  return b.build();
};

/* ============================= DAY 4 — MINES ============================ */
const L4 = () => {
  const b = new Builder(4, {
    name: 'The Golden Mines of Greed', vice: 'Lobha · Greed', boss: 'lobha', biome: 'mines', w: 5800,
    hint: 'Gold piles are quicksand — sink fast, escape faster. Hop the shaft by its stepping-stones.',
    objective: 'Descend the vault. Do not let him swallow your light.',
    spawn: { x: 80, y: GROUND - 90 }, secrets: 5,
    ...BIOME.mines,
  });
  b.ground(0, 640); b.shrine(190);
  b.enemy('hoarder', 420, GROUND - 40); b.enemy('crawler', 560, GROUND - 30, { kind: 'imp' });
  b.modakLine(300, GROUND - 70, 4);
  b.quicksand(640, GROUND - 10, 260);
  b.plat(700, GROUND - 150, 100); b.plat(860, GROUND - 230, 100);
  b.ground(900, 1560, GROUND);
  b.anchor(1120, GROUND - 300); b.anchor(1360, GROUND - 380);
  b.enemy('shooter', 1200, GROUND - 40, { turret: true, kind: 'gem' }); b.enemy('hoarder', 1440, GROUND - 40);
  // the shaft is crossed by stepping-stones on the way in…
  b.plat(1620, GROUND - 96, 96, 22, 'stone');
  b.plat(1740, GROUND - 168, 92, 22, 'stone');
  b.anchor(1700, GROUND - 320); b.anchor(1900, GROUND - 420); b.anchor(2100, GROUND - 330);
  b.plat(1800, GROUND - 240, 110, 22, 'stone'); b.modakArc(1780, GROUND - 300, 4);
  b.plat(2010, GROUND - 150, 96, 22, 'stone');
  // …and the lotus anchors above it are a Pull-boon shortcut to a sealed vault (revisit on Day 5+)
  b.plat(1960, GROUND - 520, 130, 22, 'stone');
  b.gate('tether', 2090, GROUND - 520, 44, 130, { requires: 'pull', note: 'A vault knotted with lotus-silk. Only the Pull can undo it.' });
  b.modakArc(2150, GROUND - 566, 5);
  b.enemy('flyer', 1950, GROUND - 300, { kind: 'bat' });
  b.ground(2140, 2860, GROUND - 60); b.shrine(2220, GROUND - 60);
  b.quicksand(2300, GROUND - 70, 200); b.enemy('armored', 2560, GROUND - 106);
  b.crusher(2420, GROUND - 340, 90, 2.6, 0, 250); b.crusher(2620, GROUND - 340, 90, 2.6, 1.3, 250);
  b.plat(2700, GROUND - 230, 120); b.modakLine(2710, GROUND - 280, 3);
  b.gate('crack', 2860, GROUND - 230, 48, 170, { requires: 'charge', note: 'A vault door of packed gold. The Charge will open it.' });
  b.ground(2860, 3620, GROUND - 60);
  b.enemy('hoarder', 3020, GROUND - 100); b.enemy('hoarder', 3180, GROUND - 100); b.enemy('shooter', 3420, GROUND - 100, { turret: true, kind: 'gem' });
  b.hidden(3120, GROUND - 260, 150); b.modakArc(3110, GROUND - 320, 6);
  b.quicksand(3300, GROUND - 70, 220);
  b.anchor(3560, GROUND - 330);
  b.ground(3620, 4400, GROUND - 120); b.shrine(3700, GROUND - 120);
  b.enemy('exploder', 3860, GROUND - 150, { kind: 'cart' }); b.enemy('exploder', 4060, GROUND - 150, { kind: 'cart' });
  b.moving(3960, GROUND - 250, 110, 220, 0, 1.15);
  b.modakArc(3960, GROUND - 320, 4);
  b.laser(4200, GROUND - 380, 260, 2.4, 1.2, 0);
  b.plat(4280, GROUND - 260, 130); b.modakLine(4290, GROUND - 310, 3);
  b.text(1560, GROUND - 250, 'Hop the stepping-stones — the shaft below has no bottom');
  b.text(1960, GROUND - 580, 'Lotus anchors: aim up and press C with the Pull boon (Day 4\u2019s reward)');
  b.text(660, GROUND - 160, 'Gold is quicksand — sink fast, escape faster');
  b.arena(4560, GROUND - 120, 1000, 660);
  b.gate('boss', 4520, GROUND - 280, 40, 160, { boss: true });
  return b.build();
};

/* ============================ DAY 5 — VOLCANO =========================== */
const L5 = () => {
  const b = new Builder(5, {
    name: 'The Volcano of Anger', vice: 'Krodha · Rage', boss: 'krodha', biome: 'volcano', w: 5800,
    hint: 'Raise the Shield (C) as fire arrives — absorbed shots can be released for massive damage',
    objective: 'Outrun the eruption. Reach the mouth of the volcano.',
    spawn: { x: 80, y: GROUND - 90 }, secrets: 4, risingLava: true,
    ...BIOME.volcano,
  });
  b.ground(0, 620); b.shrine(190);
  b.enemy('exploder', 420, GROUND - 34); b.enemy('crawler', 540, GROUND - 30, { kind: 'ember' });
  b.modakLine(300, GROUND - 70, 4);
  b.lava(620, GROUND + 20, 300, 120); b.plat(700, GROUND - 96, 96); b.plat(850, GROUND - 176, 96);
  b.flame(960, GROUND - 40, 2.2, 1.0, 0, 170);
  b.ground(920, 1620, GROUND - 40);
  b.enemy('shooter', 1120, GROUND - 80, { turret: true, kind: 'vent' }); b.enemy('exploder', 1400, GROUND - 74);
  b.anchor(1250, GROUND - 320);
  b.plat(1320, GROUND - 220, 110); b.modakArc(1310, GROUND - 280, 4);
  b.gate('shield', 1620, GROUND - 230, 46, 190, { requires: 'shield', note: 'A curtain of hellfire. Only a Shield that can swallow flame will pass.' });
  b.lava(1620, GROUND + 10, 260, 130);
  b.moving(1700, GROUND - 140, 110, 180, 0, 1.2);
  b.ground(1880, 2620, GROUND - 90); b.shrine(1960, GROUND - 90);
  b.flame(2100, GROUND - 90, 1.9, 1.0, .4, 190); b.flame(2320, GROUND - 90, 1.9, 1.0, 1.2, 190);
  b.enemy('shooter', 2200, GROUND - 130, { turret: true, kind: 'vent' }); b.enemy('armored', 2460, GROUND - 136);
  b.crusher(2380, GROUND - 400, 100, 2.4, 0, 280);
  b.plat(2500, GROUND - 280, 120); b.modakLine(2510, GROUND - 330, 3);
  b.lava(2620, GROUND + 10, 320, 130); b.anchor(2760, GROUND - 300); b.anchor(2940, GROUND - 380);
  b.ground(2940, 3680, GROUND - 140);
  b.enemy('exploder', 3060, GROUND - 174); b.enemy('exploder', 3220, GROUND - 174); b.enemy('flyer', 3400, GROUND - 320, { kind: 'phoenix' });
  b.crumble(3120, GROUND - 300, 100); b.crumble(3300, GROUND - 360, 100);
  b.modakArc(3110, GROUND - 360, 5);
  b.hidden(3520, GROUND - 300, 140); b.modakArc(3510, GROUND - 360, 4);
  b.gate('crack', 3680, GROUND - 300, 48, 160, { requires: 'charge', note: 'Obsidian seal. The Charge shatters it.' });
  b.ground(3680, 4460, GROUND - 140); b.shrine(3760, GROUND - 140);
  b.flame(3900, GROUND - 140, 1.7, .9, 0, 200); b.flame(4100, GROUND - 140, 1.7, .9, .8, 200); b.flame(4300, GROUND - 140, 1.7, .9, 1.5, 200);
  b.enemy('shooter', 4000, GROUND - 180, { turret: true, kind: 'vent' }); b.enemy('armored', 4260, GROUND - 186);
  b.anchor(4150, GROUND - 400);
  b.plat(4340, GROUND - 300, 120); b.modakLine(4350, GROUND - 350, 3);
  b.text(1600, GROUND - 270, 'Hold C to raise the Shield through the fire curtain');
  b.text(620, GROUND - 180, 'The lava is rising. Keep moving.');
  b.arena(4620, GROUND - 140, 1000, 680);
  b.gate('boss', 4580, GROUND - 300, 40, 160, { boss: true });
  return b.build();
};

/* ============================ DAY 6 — GARDENS =========================== */
const L6 = () => {
  const b = new Builder(6, {
    name: 'The Gardens of Temptation', vice: 'Kama · Desire', boss: 'kama', biome: 'garden', w: 5800,
    hint: 'Spore clouds reverse your controls. Vikata\u2019s Focus (C) slows the world — step between the petals.',
    objective: 'Cross the intoxicating bloom without losing yourself.',
    spawn: { x: 80, y: GROUND - 90 }, secrets: 4,
    ...BIOME.garden,
  });
  b.ground(0, 660); b.shrine(200);
  b.enemy('crawler', 440, GROUND - 30, { kind: 'bud' }); b.enemy('flyer', 600, GROUND - 200, { kind: 'moth' });
  b.modakArc(320, GROUND - 90, 5);
  b.gas(700, GROUND - 150, 220, 150, 'reverse');
  b.oneway(720, GROUND - 70, 100, 'leaf'); b.oneway(880, GROUND - 140, 100, 'leaf');
  b.ground(900, 1620, GROUND);
  b.enemy('shooter', 1120, GROUND - 40, { turret: true, kind: 'bloom' }); b.enemy('snarer', 1420, GROUND - 40);
  b.bounce(1300, GROUND - 40);
  b.plat(1240, GROUND - 230, 170); b.modakLine(1250, GROUND - 280, 3);
  b.plat(1490, GROUND - 252, 104, 22, 'leaf');   // stepping-stone over the petal corridor
  b.gate('focus', 1620, GROUND - 220, 46, 220, { requires: 'focus', note: 'A corridor of scything petals, moving faster than thought. Only slowed time can be walked.' });
  b.crumble(1700, GROUND - 120, 90); b.crumble(1830, GROUND - 180, 90); b.crumble(1960, GROUND - 120, 90);
  b.ground(2060, 2800, GROUND - 40); b.shrine(2140, GROUND - 40);
  b.gas(2280, GROUND - 180, 260, 180, 'slow');
  b.enemy('flyer', 2400, GROUND - 240, { kind: 'moth' }); b.enemy('flyer', 2600, GROUND - 200, { kind: 'moth' });
  b.enemy('armored', 2700, GROUND - 86, { kind: 'thornknight' });
  b.moving(2500, GROUND - 260, 110, 200, 0, 1.3);
  b.modakArc(2490, GROUND - 320, 4);
  b.hidden(2860, GROUND - 240, 140); b.modakArc(2850, GROUND - 300, 5);
  b.ground(2800, 3560, GROUND - 40);
  b.enemy('snarer', 2980, GROUND - 80); b.enemy('shooter', 3200, GROUND - 80, { turret: true, kind: 'bloom' }); b.enemy('hopper', 3400, GROUND - 74);
  b.bounce(3080, GROUND - 80);
  l6vert(b, 3300);
  b.gate('crack', 3560, GROUND - 220, 48, 180, { requires: 'charge', note: 'A root-sealed gate of ironwood.' });
  b.ground(3560, 4420, GROUND - 90); b.shrine(3640, GROUND - 90);
  b.gas(3760, GROUND - 220, 240, 220, 'reverse');
  b.crumble(3820, GROUND - 200, 90); b.crumble(3980, GROUND - 260, 90); b.crumble(4140, GROUND - 200, 90);
  b.enemy('flyer', 4000, GROUND - 320, { kind: 'moth' }); b.enemy('armored', 4280, GROUND - 136, { kind: 'thornknight' });
  b.anchor(4060, GROUND - 400);
  b.plat(4200, GROUND - 300, 120); b.modakLine(4210, GROUND - 350, 3);
  b.text(1620, GROUND - 260, 'Focus (C) slows time — walk the crumbling petals');
  b.text(700, GROUND - 200, 'Spores reverse your controls. Do not panic — breathe out of them.');
  b.arena(4580, GROUND - 90, 1000, 660);
  b.gate('boss', 4540, GROUND - 250, 40, 160, { boss: true });
  return b.build();
};
function l6vert(b, x) {
  b.plat(x, GROUND - 180, 110); b.plat(x + 160, GROUND - 300, 110); b.plat(x + 20, GROUND - 420, 110);
  b.modakArc(x + 150, GROUND - 360, 4);
  b.enemy('shooter', x + 180, GROUND - 340, { turret: true, kind: 'bloom' });
}

/* ============================== DAY 7 — WEB ============================= */
const L7 = () => {
  const b = new Builder(7, {
    name: 'The Web of Attachment', vice: 'Mamata · Attachment', boss: 'mamata', biome: 'web', w: 5900,
    hint: 'Silk slows you and webs drain you. Phase (C) through barriers and out of a grapple.',
    objective: 'Cut the anchor-threads. Nothing here is yours to keep.',
    spawn: { x: 80, y: GROUND - 90 }, secrets: 4,
    ...BIOME.web,
  });
  b.ground(0, 620); b.shrine(190);
  b.enemy('crawler', 420, GROUND - 30, { kind: 'spiderling' }); b.enemy('snarer', 560, GROUND - 34);
  b.modakLine(280, GROUND - 70, 4);
  b.sticky(620, GROUND - 10, 220);
  b.plat(700, GROUND - 160, 100, 22, 'sticky'); b.plat(860, GROUND - 250, 100, 22, 'sticky');
  b.ground(840, 1560, GROUND);
  b.enemy('flyer', 1080, GROUND - 260, { kind: 'spider' }); b.enemy('shooter', 1320, GROUND - 40, { turret: true, kind: 'sac' });
  b.gate('phase', 1560, GROUND - 240, 46, 240, { requires: 'phase', note: 'A wall of living silk, woven shut. Nothing solid can pass — but you need not be solid.' });
  b.anchor(1700, GROUND - 330); b.anchor(1900, GROUND - 420);
  b.ground(1600, 2360, GROUND - 60); b.shrine(1680, GROUND - 60);
  b.laser(1820, GROUND - 320, 260, 2.3, 1.2, 0); b.laser(2040, GROUND - 320, 260, 2.3, 1.2, 1.15);
  b.enemy('snarer', 1960, GROUND - 100); b.enemy('armored', 2200, GROUND - 106, { kind: 'carapace' });
  b.sticky(2080, GROUND - 70, 200);
  b.crumble(2260, GROUND - 240, 100); b.modakArc(2250, GROUND - 300, 4);
  b.hidden(2420, GROUND - 300, 150); b.modakArc(2410, GROUND - 360, 5);
  b.ground(2360, 3120, GROUND - 60);
  b.enemy('spawner', 2600, GROUND - 110, { kind: 'sac' }); b.enemy('flyer', 2860, GROUND - 300, { kind: 'spider' });
  b.sticky(2700, GROUND - 70, 260);
  b.moving(2900, GROUND - 220, 110, 0, -140, 1.2);
  b.gate('crack', 3120, GROUND - 240, 48, 180, { requires: 'charge', note: 'A calcified cocoon-door.' });
  b.ground(3120, 3880, GROUND - 120); b.shrine(3200, GROUND - 120);
  b.laser(3320, GROUND - 400, 280, 2.0, 1.0, .5); b.laser(3520, GROUND - 400, 280, 2.0, 1.0, 1.5);
  b.enemy('snarer', 3400, GROUND - 160); b.enemy('snarer', 3620, GROUND - 160); b.enemy('armored', 3760, GROUND - 166, { kind: 'carapace' });
  b.sticky(3480, GROUND - 130, 200);
  b.anchor(3680, GROUND - 420);
  b.plat(3800, GROUND - 300, 120); b.modakLine(3810, GROUND - 350, 3);
  b.ground(3880, 4640, GROUND - 120);
  b.enemy('flyer', 4060, GROUND - 340, { kind: 'spider' }); b.enemy('shooter', 4280, GROUND - 160, { turret: true, kind: 'sac' });
  b.hidden(4180, GROUND - 320, 150); b.modakArc(4170, GROUND - 380, 5);
  b.crumble(4400, GROUND - 250, 100);
  b.text(1560, GROUND - 290, 'Phase (C) — become untouchable and walk through the silk');
  b.text(2080, GROUND - 200, 'Sticky silk slows you. Do not linger.');
  b.arena(4780, GROUND - 120, 1000, 680);
  b.gate('boss', 4740, GROUND - 280, 40, 160, { boss: true });
  return b.build();
};

/* ============================ DAY 8 — MIRRORS =========================== */
const L8 = () => {
  const b = new Builder(8, {
    name: 'The Hall of Mirrors', vice: 'Abhimana · Ego', boss: 'abhimana', biome: 'mirror', w: 5800,
    hint: 'Ego-guards are invincible. Become smoke (C), stay in shadow, and strike from behind.',
    objective: 'Cross the hall without being seen by yourself.',
    spawn: { x: 80, y: GROUND - 90 }, secrets: 5,
    ...BIOME.mirror,
  });
  b.ground(0, 640); b.shrine(190);
  b.enemy('crawler', 420, GROUND - 30, { kind: 'shardling' });
  b.modakLine(300, GROUND - 70, 4);
  b.enemy('guard', 760, GROUND - 52, { patrol: 190 });
  b.ground(640, 1420, GROUND);
  b.plat(880, GROUND - 90, 130); b.plat(1060, GROUND - 180, 130); b.plat(1240, GROUND - 270, 130);
  b.modakArc(1250, GROUND - 320, 4);
  b.gate('smoke', 1420, GROUND - 240, 46, 240, { requires: 'smoke', note: 'A mirrored portcullis with no keyhole, no seam, no weakness. Only nothing passes.' });
  b.ground(1420, 2200, GROUND - 40); b.shrine(1500, GROUND - 40);
  b.enemy('guard', 1720, GROUND - 92, { patrol: 240 }); b.enemy('clone', 2020, GROUND - 84);
  b.laser(1860, GROUND - 340, 300, 2.1, 1.05, 0); b.laser(2060, GROUND - 340, 300, 2.1, 1.05, 1.05);
  b.hidden(1900, GROUND - 300, 150); b.modakArc(1890, GROUND - 360, 5);
  b.plat(2120, GROUND - 220, 130);
  b.gate('crack', 2200, GROUND - 240, 48, 200, { requires: 'charge', note: 'A mirrored slab. Crack it with the Charge.' });
  b.ground(2200, 3000, GROUND - 40);
  b.enemy('guard', 2380, GROUND - 92, { patrol: 220 }); b.enemy('guard', 2760, GROUND - 92, { patrol: 200 });
  b.enemy('clone', 2580, GROUND - 84);
  b.moving(2500, GROUND - 240, 120, 220, 0, 1.2);
  b.modakLine(2510, GROUND - 300, 3);
  b.sticky(2640, GROUND - 50, 180);
  b.ground(3000, 3760, GROUND - 100); b.shrine(3080, GROUND - 100);
  b.enemy('shooter', 3260, GROUND - 140, { turret: true, kind: 'prism' }); b.enemy('armored', 3480, GROUND - 146, { kind: 'mirror' });
  b.crusher(3340, GROUND - 420, 100, 2.5, 0, 300); b.crusher(3560, GROUND - 420, 100, 2.5, 1.25, 300);
  b.anchor(3420, GROUND - 380);
  b.hidden(3600, GROUND - 320, 150); b.modakArc(3590, GROUND - 380, 5);
  b.gate('phase', 3760, GROUND - 300, 46, 200, { requires: 'phase', note: 'A wall of reflected light. Phase through it.' });
  b.ground(3760, 4560, GROUND - 100);
  b.enemy('guard', 3940, GROUND - 152, { patrol: 260 }); b.enemy('clone', 4180, GROUND - 144); b.enemy('clone', 4380, GROUND - 144);
  b.laser(4060, GROUND - 400, 300, 1.9, .95, .3); b.laser(4260, GROUND - 400, 300, 1.9, .95, 1.2);
  b.plat(4300, GROUND - 280, 130); b.modakLine(4310, GROUND - 330, 3);
  b.text(640, GROUND - 200, 'An Ego-Guard. It cannot be hurt. Become smoke and walk past it.');
  b.text(1420, GROUND - 290, 'Smoke Form (C): invisible in shadow · takedown from behind');
  b.arena(4720, GROUND - 100, 1000, 700);
  b.gate('boss', 4680, GROUND - 260, 40, 160, { boss: true });
  return b.build();
};

/* ============================= DAY 9 — OCEAN ============================ */
const L9 = () => {
  const b = new Builder(9, {
    name: 'The Immortal Ocean', vice: 'The Ninth Gate', boss: 'sindhu', biome: 'ocean', w: 7400,
    hint: 'Everything you have learned. Every boon. Do not stop moving.',
    objective: 'Reach the centre of the Ocean of Milk. End this.',
    spawn: { x: 80, y: GROUND - 90 }, secrets: 6, gauntlet: true,
    ...BIOME.ocean,
  });
  b.ground(0, 560); b.shrine(170);
  b.text(180, GROUND - 210, 'The final day. Eight boons, one mouse, and the whole of Dharma.');
  b.enemy('flyer', 420, GROUND - 240, { kind: 'garuda' });
  // section 1: boomerang + charge
  b.ground(560, 1200, GROUND - 40);
  b.switch(1080, GROUND - 400, 0, { kind: 'rune' });
  b.gate('switch', 1200, GROUND - 260, 44, 220, { requires: 'boomerang', note: 'The first gate of the gauntlet. Its rune floats beyond the current.' });
  b.enemy('shooter', 800, GROUND - 80, { turret: true, kind: 'coral' });
  b.modakArc(760, GROUND - 140, 4);
  b.ground(1200, 1900, GROUND - 40);
  b.gate('crack', 1900, GROUND - 240, 48, 200, { requires: 'charge', note: 'A wall of compressed salt.' });
  b.enemy('armored', 1480, GROUND - 86, { kind: 'tide' }); b.enemy('exploder', 1720, GROUND - 74);
  b.anchor(1600, GROUND - 340);
  b.plat(1680, GROUND - 240, 120); b.modakLine(1690, GROUND - 290, 3);
  b.ground(1900, 2600, GROUND - 100); b.shrine(1980, GROUND - 100);
  // section 2: truesight + pull
  b.hidden(2100, GROUND - 240, 130); b.hidden(2300, GROUND - 330, 130); b.hidden(2500, GROUND - 420, 130);
  b.enemy('flyer', 2380, GROUND - 380, { kind: 'garuda' });
  b.modakArc(2100, GROUND - 300, 4);
  b.gate('truesight', 2600, GROUND - 300, 46, 200, { requires: 'truesight', note: 'A door that is not there. Or is. Open the eye.' });
  b.anchor(2760, GROUND - 380); b.anchor(2980, GROUND - 460); b.anchor(3200, GROUND - 380);
  b.ground(2600, 2760, GROUND - 100);
  b.hazards.push({ kind: 'void', x: 2760, y: GROUND - 20, w: 640, h: 200 });
  b.enemy('shooter', 3000, GROUND - 420, { turret: true, kind: 'coral' });
  b.ground(3400, 4100, GROUND - 100); b.shrine(3480, GROUND - 100);
  // section 3: shield + focus
  b.flame(3620, GROUND - 100, 1.8, .9, 0, 200); b.flame(3820, GROUND - 100, 1.8, .9, .9, 200);
  b.enemy('shooter', 3700, GROUND - 140, { turret: true, kind: 'vent' });
  b.crumble(3900, GROUND - 230, 90); b.crumble(4030, GROUND - 300, 90);
  b.modakArc(3890, GROUND - 300, 4);
  b.gate('shield', 4100, GROUND - 300, 46, 200, { requires: 'shield', note: 'A wall of boiling amrita-fire. Swallow it.' });
  b.ground(4100, 4800, GROUND - 100);
  b.enemy('armored', 4300, GROUND - 146, { kind: 'tide' }); b.enemy('clone', 4520, GROUND - 144);
  b.laser(4380, GROUND - 420, 320, 1.8, .9, 0); b.laser(4600, GROUND - 420, 320, 1.8, .9, .9);
  b.hidden(4480, GROUND - 330, 150); b.modakArc(4470, GROUND - 390, 5);
  b.gate('phase', 4800, GROUND - 320, 46, 220, { requires: 'phase', note: 'A barrier of pure refusal. Pass through it.' });
  b.ground(4800, 5480, GROUND - 100); b.shrine(4880, GROUND - 100);
  // section 4: smoke + everything
  b.enemy('guard', 5080, GROUND - 152, { patrol: 220 }); b.enemy('guard', 5320, GROUND - 152, { patrol: 200 });
  b.enemy('snarer', 5200, GROUND - 140);
  b.sticky(5140, GROUND - 110, 220);
  b.plat(5240, GROUND - 300, 130); b.modakLine(5250, GROUND - 350, 3);
  b.gate('smoke', 5480, GROUND - 320, 46, 220, { requires: 'smoke', note: 'The last door. Only nothingness walks through.' });
  b.ground(5480, 6100, GROUND - 100);
  b.anchor(5680, GROUND - 380); b.anchor(5880, GROUND - 460);
  b.enemy('flyer', 5800, GROUND - 380, { kind: 'garuda' });
  b.modakArc(5660, GROUND - 240, 5);
  b.text(4820, GROUND - 340, 'The ninth gate: every boon, in sequence.');
  b.arena(6120, GROUND - 100, 1080, 720);
  b.gate('boss', 6080, GROUND - 260, 40, 160, { boss: true });
  return b.build();
};

export const LEVEL_DEFS = [L1, L2, L3, L4, L5, L6, L7, L8, L9];
export function buildLevel(i) { return LEVEL_DEFS[i](); }
export const LEVEL_COUNT = LEVEL_DEFS.length;
