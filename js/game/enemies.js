/* ===========================================================================
   game/enemies.js — the asura host. Behaviour archetypes + procedural art.
   =========================================================================== */
import { TAU, clamp, lerp, rand, pick, sign, dist, rgba, glow, ellipse, starPath, roundRect, aabb, chance, damp, ring, shade} from '../core/utils.js';
import { Projectile, Pickup } from './entities.js';

/* --------------------------- visual look table --------------------------- */
const LOOKS = {
  sprite:    { body: '#6bd46b', body2: '#1d4a22', accent: '#b6ff7a', eye: '#fff36b', shape: 'blob', horns: 2, scale: 1 },
  shade:     { body: '#8f6fd4', body2: '#241a44', accent: '#c792ff', eye: '#ffe6a3', shape: 'ghost', horns: 0, scale: 1 },
  squire:    { body: '#8a7aa8', body2: '#332a4d', accent: '#e8c25a', eye: '#ff8a6a', shape: 'knight', horns: 1, scale: .92 },
  imp:       { body: '#d8a44a', body2: '#5a4210', accent: '#ffd166', eye: '#fff', shape: 'blob', horns: 2, scale: .88 },
  ember:     { body: '#ff6b3d', body2: '#5a1408', accent: '#ffb03a', eye: '#fff3d0', shape: 'blob', horns: 1, scale: .95 },
  bud:       { body: '#ff6fa5', body2: '#4d1030', accent: '#ffb3d1', eye: '#fff3d0', shape: 'plant', horns: 0, scale: 1 },
  spiderling:{ body: '#4e7d99', body2: '#123048', accent: '#9fd8ff', eye: '#ff5a7a', shape: 'spider', horns: 0, scale: .8 },
  shardling: { body: '#8ea0d8', body2: '#1b2444', accent: '#dfe8ff', eye: '#fff', shape: 'crystal', horns: 0, scale: .85 },
  frog:      { body: '#7ee06b', body2: '#1f5a24', accent: '#b6ff7a', eye: '#ffe66b', shape: 'frog', horns: 0, scale: 1.05 },
  eye:       { body: '#b98bff', body2: '#2b1a4d', accent: '#e0b8ff', eye: '#fff', shape: 'eye', horns: 0, scale: 1 },
  banner:    { body: '#e8c25a', body2: '#4a3410', accent: '#ffd97a', eye: '#ff5a5a', shape: 'bat', horns: 2, scale: 1 },
  bat:       { body: '#c79a3a', body2: '#3a2a10', accent: '#ffd166', eye: '#ff8a6a', shape: 'bat', horns: 1, scale: .9 },
  phoenix:   { body: '#ff8a1f', body2: '#8c1a04', accent: '#ffd166', eye: '#fff', shape: 'bat', horns: 0, scale: 1.15, fiery: true },
  moth:      { body: '#ff9fc4', body2: '#5c1f5e', accent: '#ffd6e8', eye: '#fff3d0', shape: 'bat', horns: 0, scale: 1.05 },
  spider:    { body: '#9fd8ff', body2: '#123048', accent: '#d8f0ff', eye: '#ff5a7a', shape: 'spider', horns: 0, scale: 1.2 },
  garuda:    { body: '#7fe8ff', body2: '#0a2c48', accent: '#e0f8ff', eye: '#ffe6a3', shape: 'bat', horns: 1, scale: 1.25 },
  gem:       { body: '#ffd166', body2: '#5a4210', accent: '#fff3d0', eye: '#ff8a6a', shape: 'turret', horns: 0, scale: 1 },
  vent:      { body: '#8c2c0c', body2: '#3a1a12', accent: '#ff6b3d', eye: '#ffd166', shape: 'turret', horns: 0, scale: 1 },
  bloom:     { body: '#ff6fa5', body2: '#4d1030', accent: '#ffb3d1', eye: '#fff3d0', shape: 'turret', horns: 0, scale: 1.05 },
  sac:       { body: '#4e7d99', body2: '#123048', accent: '#cfe9ff', eye: '#9fd8ff', shape: 'turret', horns: 0, scale: 1.1 },
  prism:     { body: '#8ea0d8', body2: '#1b2444', accent: '#ffffff', eye: '#ff5a7a', shape: 'turret', horns: 0, scale: 1 },
  coral:     { body: '#2a76b5', body2: '#0a2c48', accent: '#7fe8ff', eye: '#ffe6a3', shape: 'turret', horns: 0, scale: 1.05 },
  knight:    { body: '#e8c25a', body2: '#4a3410', accent: '#ffd97a', eye: '#ff5a5a', shape: 'knight', horns: 2, scale: 1.35 },
  thornknight:{ body: '#6fae4a', body2: '#2f4a2a', accent: '#ff6fa5', eye: '#ffe66b', shape: 'knight', horns: 2, scale: 1.3 },
  carapace:  { body: '#4e7d99', body2: '#123048', accent: '#9fd8ff', eye: '#ff5a7a', shape: 'knight', horns: 2, scale: 1.3 },
  mirror:    { body: '#dfe8ff', body2: '#2a3358', accent: '#ffffff', eye: '#ff5a7a', shape: 'knight', horns: 2, scale: 1.3 },
  tide:      { body: '#63b8e8', body2: '#1d4a72', accent: '#e0f8ff', eye: '#ffe6a3', shape: 'knight', horns: 2, scale: 1.3 },
  cart:      { body: '#8c2c0c', body2: '#3a1a12', accent: '#ffd166', eye: '#fff', shape: 'bomb', horns: 0, scale: 1.05 },
  bomb:      { body: '#ff6b3d', body2: '#5a1408', accent: '#ffd166', eye: '#fff', shape: 'bomb', horns: 0, scale: 1 },
  illusion:  { body: '#b98bff', body2: '#2b1a4d', accent: '#e0b8ff', eye: '#fff', shape: 'ghost', horns: 2, scale: 1.3 },
  hoarder:   { body: '#ffd166', body2: '#5a4210', accent: '#fff3d0', eye: '#ff5a5a', shape: 'golem', horns: 0, scale: 1.15 },
  golem:     { body: '#c79a3a', body2: '#3a2a10', accent: '#ffe9a8', eye: '#ff8a6a', shape: 'golem', horns: 0, scale: 1.2 },
  thief:     { body: '#7ee06b', body2: '#1d4a22', accent: '#ffd166', eye: '#fff36b', shape: 'blob', horns: 1, scale: .8 },
  egoguard:  { body: '#dfe8ff', body2: '#2a3358', accent: '#ffe6a3', eye: '#ff5a7a', shape: 'knight', horns: 2, scale: 1.45, invincible: true },
  clone:     { body: '#3a2a52', body2: '#120a20', accent: '#8b5cf6', eye: '#ff5a7a', shape: 'mouse', horns: 0, scale: 1.1 },
};

/* --------------------------- behaviour archetypes ------------------------ */
const ARCH = {
  crawler: { w: 36, h: 30, hp: 4, dmg: 1, speed: 74, ai: 'walk', look: 'sprite', bhakti: 6, score: 60 },
  hopper:  { w: 38, h: 32, hp: 5, dmg: 1, speed: 60, ai: 'hop', look: 'frog', bhakti: 7, score: 80 },
  flyer:   { w: 36, h: 30, hp: 4, dmg: 1, speed: 118, ai: 'fly', look: 'eye', bhakti: 7, score: 90, flying: true },
  shooter: { w: 40, h: 42, hp: 6, dmg: 1, speed: 0, ai: 'shoot', look: 'gem', bhakti: 9, score: 110, turret: true },
  armored: { w: 52, h: 62, hp: 16, dmg: 2, speed: 52, ai: 'walk', look: 'knight', bhakti: 16, score: 200, armor: true },
  hoarder: { w: 48, h: 52, hp: 12, dmg: 1, speed: 62, ai: 'hoard', look: 'hoarder', bhakti: 14, score: 170 },
  mimic:   { w: 30, h: 34, hp: 7, dmg: 1, speed: 150, ai: 'mimic', look: 'shade', bhakti: 12, score: 150 },
  exploder:{ w: 34, h: 34, hp: 4, dmg: 2, speed: 165, ai: 'rush', look: 'cart', bhakti: 10, score: 130 },
  spawner: { w: 54, h: 58, hp: 18, dmg: 1, speed: 30, ai: 'spawn', look: 'illusion', bhakti: 20, score: 240 },
  guard:   { w: 46, h: 66, hp: 999, dmg: 2, speed: 68, ai: 'patrol', look: 'egoguard', bhakti: 0, score: 0, invincible: true },
  clone:   { w: 28, h: 36, hp: 14, dmg: 2, speed: 200, ai: 'clone', look: 'clone', bhakti: 18, score: 220 },
  snarer:  { w: 44, h: 36, hp: 9, dmg: 1, speed: 58, ai: 'snare', look: 'spider', bhakti: 12, score: 150 },
  thief:   { w: 30, h: 26, hp: 3, dmg: 1, speed: 150, ai: 'steal', look: 'thief', bhakti: 8, score: 100 },
};

export class Enemy {
  constructor(spec, G) {
    const arch = ARCH[spec.type] || ARCH.crawler;
    const look = LOOKS[spec.kind || arch.look] || LOOKS[arch.look];
    Object.assign(this, arch);
    this.spec = spec; this.type = spec.type; this.kind = spec.kind || arch.look;
    this.look = look;
    const sc = (spec.scale ?? 1) * (look.scale ?? 1);
    this.w = arch.w * sc; this.h = arch.h * sc; this.scale = sc;
    this.x = spec.x; this.y = spec.y - this.h + (arch.flying ? 0 : 0);
    if (arch.flying) this.y = spec.y - this.h;
    this.vx = 0; this.vy = 0;
    this.hp = Math.round(arch.hp * (G.settings?.difficulty === 'dharma' ? 1.4 : G.settings?.difficulty === 'story' ? .7 : 1));
    this.maxHp = this.hp;
    this.facing = chance(.5) ? 1 : -1;
    this.home = { x: this.x, y: this.y };
    this.t = rand(0, 6); this.cd = rand(.6, 2.2); this.state = 'idle'; this.stateT = 0;
    this.dead = false; this.hitFlash = 0; this.yanked = 0;
    this.patrol = spec.patrol || 140; this.dir = 1;
    this.onGround = false; this.fuse = -1; this.alert = 0; this.stolen = 0;
    this.growth = 0; this.shielded = !!spec.shielded;
    this.spawnCd = 4; this.animT = rand(0, 9);
    this.weakX = rand(-.3, .3); this.weakY = rand(-.3, .3);
    if (this.ai === 'fly') { this.y = spec.y - rand(40, 160); this.home.y = this.y; }
    if (this.ai === 'patrol') { this.alert = 0; this.suspicion = 0; }
    if (arch.invincible) this.invincible = true;
  }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }

  hurt(G, o = {}) {
    if (this.dead) return false;
    const from = o.from || 'player';
    // invincible ego-guards: only a stealth takedown works
    if (this.invincible) {
      const behind = (o.kx ?? 0) * this.facing < 0 || (G.player.x + G.player.w / 2 - this.cx) * this.facing < 0;
      const stealthed = G.player.smoked || G.player.hidden;
      if (behind && stealthed) return this.takedown(G);
      G.audio.sfx('error');
      G.particles.spark(this.cx + (o.kx > 0 ? -8 : 8), this.cy, 10, '#dfe8ff', 260);
      G.fx.text(this.cx, this.y - 8, 'EGO — IMMUNE', { color: '#dfe8ff', size: 15, life: .8 });
      G.fx.stop(.03);
      return false;
    }
    // armour
    if (this.armor && !o.armorBreak && !G.player.sight) {
      const hitFromBehind = (o.kx ?? 0) * this.facing > 0;
      if (!hitFromBehind) {
        G.audio.sfx('error');
        G.run._clang = { t: G.run.elapsed, x: this.cx };
        G.particles.spark(this.cx, this.cy, 12, '#e8c25a', 300);
        G.fx.text(this.cx, this.y - 8, o.crit ? 'ARMOUR HOLDS' : 'CLANG', { color: '#e8c25a', size: 15, life: .7 });
        this.vx += sign(o.kx || 1) * 40;
        G.fx.stop(.04);
        return false;
      }
      o.dmg = Math.ceil((o.dmg || 1) * 1.6);
    }
    if (this.shielded && from !== 'pull') {
      G.particles.spark(this.cx, this.cy, 10, '#ffd166', 260);
      G.fx.text(this.cx, this.y - 8, 'SHIELDED', { color: '#ffd166', size: 14, life: .7 });
      G.audio.sfx('error');
      return false;
    }
    let dmg = o.dmg || 1;
    if (G.player.sight) dmg = Math.ceil(dmg * 1.6);
    if (G.player.surge > 0) dmg = Math.ceil(dmg * 1.8);
    this.hp -= dmg;
    this.hitFlash = .2;
    this.vx += (o.kx ?? 0) * (this.flying ? .6 : 1);
    if (!this.flying) this.vy += (o.ky ?? -60);
    this.yanked = .2;
    G.audio.sfx(o.crit ? 'hitCrit' : 'hit');
    G.fx.stop(o.crit ? .075 : .045);
    G.fx.shake(o.crit ? 6 : 3);
    G.particles.burst(this.cx, this.cy, o.crit ? 16 : 9, { color: [this.look.accent, '#fff3d0'], spd: o.crit ? 300 : 200, size: o.crit ? 4 : 3, life: .4 });
    G.fx.text(this.cx + rand(-8, 8), this.y - 4, String(dmg), { color: o.crit ? '#ffd166' : '#fff3d0', size: o.crit ? 24 : 17, crit: o.crit, life: .6 });
    // combo
    G.run.combo = Math.min(99, (G.run.combo || 0) + 1);
    G.run.comboT = 2.6;
    G.hud?.setCombo?.(G.run.combo);
    G.player.addBhakti(o.crit ? 7 : 4);
    if (this.hp <= 0) { this.die(G, o); return true; }
    if (this.ai === 'patrol') { this.alert = 3; this.suspicion = 1; }
    return true;
  }
  takedown(G) {
    G.audio.sfx('takedown'); G.fx.stop(.12); G.fx.shake(9);
    G.fx.text(this.cx, this.y - 14, 'TAKEDOWN', { color: '#ffe6a3', size: 24, crit: true, life: 1 });
    G.particles.burst(this.cx, this.cy, 40, { color: ['#dfe8ff', '#fff', '#b9a7d6'], spd: 380, size: 5, life: .8 });
    G.particles.shockwave(this.cx, this.cy, 180, '#dfe8ff', .5);
    this.hp = 0; this.invincible = false;
    G.stats.takedowns = (G.stats.takedowns || 0) + 1;
    G.player.addBhakti(25);
    this.die(G, { crit: true });
    return true;
  }
  die(G, o = {}) {
    if (this.dead) return;
    this.dead = true;
    const L = this.look;
    G.audio.sfx(this.ai === 'rush' ? 'explosion' : 'hitCrit');
    G.particles.burst(this.cx, this.cy, 26, { color: [L.body, L.accent, '#fff3d0'], spd: 320, size: 5, life: .85, gravity: 420 });
    G.particles.ring(this.cx, this.cy, 12, L.accent, .45);
    G.particles.smoke(this.cx, this.cy, 5, L.body2);
    G.run.kills++; G.stats.kills++;
    G.run.score += this.score * (1 + (G.run.combo || 0) * .05);
    G.player.addBhakti(this.bhakti);
    if (this.ai === 'rush' || this.fuse >= 0) this.explode(G);
    if (this.stolen > 0) {
      for (let i = 0; i < this.stolen; i++) G.pickups.push(new Pickup(this.cx + rand(-14, 14), this.cy - 10, 'modak'));
    }
    if (chance(.24)) G.pickups.push(new Pickup(this.cx, this.cy - 10, 'bhakti', { life: 12 }));
    if (chance(.1) && G.player.hp < G.player.maxHp) G.pickups.push(new Pickup(this.cx, this.cy - 10, 'heart', { life: 14 }));
    G.fx.shake(4);
  }
  explode(G) {
    const r = 96 * this.scale;
    G.audio.sfx('explosion'); G.fx.shake(12); G.fx.flash('hit');
    G.particles.burst(this.cx, this.cy, 40, { color: ['#ffd166', '#ff6b3d', '#fff3d0'], spd: 420, size: 6, life: .8, gravity: 240 });
    G.particles.shockwave(this.cx, this.cy, r * 2.2, '#ff8a1f', .55);
    G.world.damageArea(G, { x: this.cx - r, y: this.cy - r, w: r * 2, h: r * 2 }, { dmg: 2, from: 'blast', kx: 0, ky: -300, hitPlayer: true, sx: this.cx });
  }

  /* ------------------------------ behaviours ----------------------------- */
  update(dt, G) {
    if (this.dead) return;
    this.t += dt; this.animT += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.yanked = Math.max(0, this.yanked - dt);
    const p = G.player;
    const px = p.x + p.w / 2, py = p.y + p.h / 2;
    const d = dist(this.cx, this.cy, px, py);
    this.seesPlayer = d < 560 && !p.dead;

    switch (this.ai) {
      case 'walk': this.aiWalk(dt, G, d, px, py); break;
      case 'hop': this.aiHop(dt, G, d, px, py); break;
      case 'fly': this.aiFly(dt, G, d, px, py); break;
      case 'shoot': this.aiShoot(dt, G, d, px, py); break;
      case 'rush': this.aiRush(dt, G, d, px, py); break;
      case 'hoard': this.aiHoard(dt, G, d, px, py); break;
      case 'mimic': this.aiMimic(dt, G, d, px, py); break;
      case 'spawn': this.aiSpawn(dt, G, d, px, py); break;
      case 'patrol': this.aiPatrol(dt, G, d, px, py); break;
      case 'clone': this.aiClone(dt, G, d, px, py); break;
      case 'snare': this.aiSnare(dt, G, d, px, py); break;
      case 'steal': this.aiSteal(dt, G, d, px, py); break;
    }

    // physics
    if (!this.flying) {
      this.vy += 2200 * dt;
      this.vy = clamp(this.vy, -1400, 1100);
      const solids = G.world.enemySolids(G, this);
      this.x += this.vx * dt;
      for (const s of solids) if (aabb(this, s)) { if (this.vx > 0) this.x = s.x - this.w; else this.x = s.x + s.w; this.vx = 0; this.dir *= -1; this.facing = this.dir; this.hitWall = true; }
      const prevB = this.y + this.h;
      this.y += this.vy * dt;
      this.onGround = false;
      for (const s of solids) {
        if (aabb(this, s)) {
          if (this.vy > 0) { if (s.oneway && prevB > s.y + 8) continue; this.y = s.y - this.h; this.onGround = true; }
          else this.y = s.y + s.h;
          this.vy = 0;
        }
      }
      // ledge check
      if (this.onGround && this.ai !== 'rush') {
        const ahead = { x: this.cx + this.dir * (this.w * .6 + 6), y: this.y + this.h + 8, w: 4, h: 12 };
        let floor = false;
        for (const s of solids) if (aabb(ahead, s)) { floor = true; break; }
        if (!floor && !this.hitWall) { this.dir *= -1; this.facing = this.dir; }
      }
      this.hitWall = false;
      this.vx *= Math.pow(.02, dt);
      if (this.y > 1900) this.dead = true;
    } else {
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.vx *= Math.pow(.4, dt); this.vy *= Math.pow(.4, dt);
    }
    this.facing = this.vx > 12 ? 1 : this.vx < -12 ? -1 : this.facing;

    // aggro telegraph: an exclamation the first time it notices you
    if (!this.dead && this.dmg > 0 && this.seesPlayer && !this.cueDone) { this.cueDone = true; this.cue = 1; }
    if (this.cue > 0) this.cue -= dt;

    // contact damage
    if (!p.dead && !p.phasing && this.dmg > 0 && aabb(this, p)) {
      if (this.ai === 'rush') { this.fuse = 0; }
      else if (!(this.invincible && this.alert <= 0)) {
        p.hurt(G, this.dmg, { sx: this.cx, kx: sign(px - this.cx) * 300, ky: -280, src: this });
        if (this.ai === 'patrol') this.alert = 3;
      }
    }
    if (this.fuse >= 0) {
      this.fuse += dt;
      if (this.fuse > .38) { this.die(G); }
    }
  }

  aiWalk(dt, G, d, px, py) {
    const chase = this.seesPlayer && Math.abs(py - this.cy) < 90 && d < 300;
    const sp = this.speed * (chase ? 1.7 : 1);
    if (chase) this.dir = sign(px - this.cx) || this.dir;
    this.vx = this.dir * sp;
    this.facing = this.dir;
    if (this.look.shape === 'blob' && this.onGround && rand(0, 1) < dt * 3) this.vy = -260;
  }
  aiHop(dt, G, d, px, py) {
    this.cd -= dt;
    if (this.onGround) {
      this.vx = damp(this.vx, 0, 6, dt);
      if (this.cd <= 0) {
        this.cd = rand(1.1, 2.1);
        const dir = this.seesPlayer && d < 420 ? sign(px - this.cx) : this.dir;
        this.vx = dir * (this.seesPlayer ? 250 : 150); this.vy = -640;
        this.facing = dir;
        G.particles.dust(this.cx, this.y + this.h, 5, G.level.palette.groundTop);
      }
    }
  }
  aiFly(dt, G, d, px, py) {
    this.stateT += dt;
    const hoverY = this.home.y + Math.sin(this.t * 1.7) * 26;
    if (this.state === 'idle') {
      this.vx = damp(this.vx, Math.cos(this.t * 1.2) * 40 + sign(this.home.x - this.cx) * 30, 3, dt);
      this.vy = damp(this.vy, (hoverY - this.cy) * 2.4, 4, dt);
      if (this.seesPlayer && d < 340 && this.cd <= 0) { this.state = 'dive'; this.stateT = 0; this.cd = rand(1.6, 2.8); }
      this.cd -= dt;
    } else if (this.state === 'dive') {
      const a = Math.atan2(py - this.cy, px - this.cx);
      this.vx = damp(this.vx, Math.cos(a) * 330, 5, dt);
      this.vy = damp(this.vy, Math.sin(a) * 330, 5, dt);
      this.facing = sign(this.vx) || this.facing;
      if (this.stateT > .95) { this.state = 'retreat'; this.stateT = 0; }
      if (rand(0, 1) < dt * 20) G.particles.trail(this.cx, this.cy, this.look.accent, 4, .3);
    } else {
      this.vx = damp(this.vx, sign(this.home.x - this.cx) * 130, 3, dt);
      this.vy = damp(this.vy, (hoverY - this.cy) * 3, 3, dt);
      if (this.stateT > .9) { this.state = 'idle'; this.stateT = 0; }
    }
    if (this.kind === 'eye' && this.seesPlayer && d < 400) {
      this.cd -= dt;
      if (this.cd <= 0) { this.cd = rand(2.2, 3.4); this.shoot(G, px, py, 'dark', 300, 1); }
    }
  }
  aiShoot(dt, G, d, px, py) {
    this.cd -= dt;
    const range = this.kind === 'vent' ? 620 : 540;
    if (this.seesPlayer && d < range && this.cd <= 0) {
      this.cd = rand(1.5, 2.6) * (G.settings.difficulty === 'story' ? 1.5 : G.settings.difficulty === 'dharma' ? .7 : 1);
      const kind = this.kind === 'vent' ? 'fire' : this.kind === 'bloom' ? 'petal' : this.kind === 'sac' ? 'web' : this.kind === 'prism' ? 'shard' : this.kind === 'coral' ? 'nectar' : this.kind === 'gem' ? 'coin' : 'orb';
      const n = this.kind === 'prism' ? 3 : 1;
      for (let i = 0; i < n; i++) {
        const spread = n > 1 ? (i - (n - 1) / 2) * .24 : 0;
        this.shoot(G, px, py, kind, 340, 1, spread);
      }
      this.recoil = .2;
    }
    this.recoil = Math.max(0, (this.recoil || 0) - dt);
    this.facing = this.seesPlayer ? sign(px - this.cx) || this.facing : this.facing;
  }
  shoot(G, px, py, kind, spd, dmg, spread = 0) {
    const a = Math.atan2(py - this.cy, px - this.cx) + spread;
    G.audio.sfx(kind === 'fire' ? 'shootBig' : 'shoot');
    G.projectiles.push(new Projectile({
      x: this.cx + Math.cos(a) * 14, y: this.cy + Math.sin(a) * 14,
      vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, kind, dmg, owner: 'enemy',
      life: 3.4, gravity: kind === 'coin' ? 420 : kind === 'petal' ? 60 : 0,
      spin: 8, trail: { color: PROJ_COL[kind] || '#fff', life: .25, size: .5 },
    }));
    G.particles.burst(this.cx + Math.cos(a) * 16, this.cy + Math.sin(a) * 16, 5, { color: PROJ_COL[kind] || '#fff', spd: 90, size: 2.6, life: .25 });
  }
  aiRush(dt, G, d, px, py) {
    if (this.fuse >= 0) { this.vx *= .8; return; }
    if (this.seesPlayer && d < 460) {
      this.dir = sign(px - this.cx) || this.dir;
      this.vx = this.dir * this.speed * (d < 120 ? 1.5 : 1);
      this.facing = this.dir;
      if (rand(0, 1) < dt * 22) G.particles.add({ x: this.cx, y: this.cy, vx: rand(-40, 40), vy: rand(-70, -20), life: rand(.3, .7), size: rand(2, 5), color: pick(['#ffd166', '#ff6b3d']), shape: 'dot', glowy: true, drag: 1.4 });
      if (this.onGround && Math.abs(py - this.cy) > 60 && rand(0, 1) < dt * 2.4) this.vy = -560;
    } else this.vx = this.dir * this.speed * .4;
  }
  aiHoard(dt, G, d, px, py) {
    // seek nearest modak pickup
    let best = null, bd = 460;
    for (const pk of G.pickups) {
      if (pk.dead || pk.type !== 'modak') continue;
      const dd = dist(this.cx, this.cy, pk.x, pk.y);
      if (dd < bd) { bd = dd; best = pk; }
    }
    if (best) {
      this.dir = sign(best.x - this.cx) || this.dir;
      this.vx = this.dir * this.speed * 1.5;
      if (bd < 26) {
        best.dead = true; this.growth++;
        this.maxHp = Math.round(this.maxHp * 1.14); this.hp = Math.min(this.maxHp, this.hp + 4);
        this.scale *= 1.06; this.w *= 1.05; this.h *= 1.05;
        this.dmg = Math.min(3, this.dmg + (this.growth % 3 === 0 ? 1 : 0));
        G.audio.sfx('coin');
        G.fx.text(this.cx, this.y - 8, 'HOARDED ×' + this.growth, { color: '#ffd166', size: 15, life: .8 });
        G.particles.burst(this.cx, this.cy, 12, { color: ['#ffd166', '#fff3d0'], spd: 180, size: 3.4, life: .5 });
      }
    } else {
      this.vx = this.dir * this.speed * .5;
      this.cd -= dt; if (this.cd <= 0) { this.cd = rand(1.6, 3); this.dir *= -1; }
    }
    this.facing = this.dir;
    if (this.seesPlayer && d < 240 && this.cd <= 0 && rand(0, 1) < dt * .8) this.shoot(G, px, py, 'coin', 320, 1);
  }
  aiMimic(dt, G, d, px, py) {
    // mirrors the player about its home point
    const target = this.home.x + (this.home.x - px) * .75;
    const dx = target - this.cx;
    this.vx = clamp(dx * 3.2, -this.speed, this.speed);
    this.facing = sign(px - this.cx) || this.facing;
    if (this.onGround && Math.abs(px - this.cx) < 300 && rand(0, 1) < dt * 1.1) this.vy = -560;
    if (rand(0, 1) < dt * 12) G.particles.trail(this.cx, this.cy, this.look.accent, 3.4, .3);
  }
  aiSpawn(dt, G, d, px, py) {
    this.vx = Math.sin(this.t * .8) * this.speed;
    this.spawnCd -= dt;
    if (this.spawnCd <= 0 && G.enemies.length < 34) {
      this.spawnCd = rand(3.4, 5.2);
      const e = new Enemy({ type: 'crawler', x: this.cx + rand(-30, 30), y: this.y + this.h, kind: this.kind === 'sac' ? 'spiderling' : 'shade', scale: .7 }, G);
      G.enemies.push(e);
      G.particles.burst(this.cx, this.cy, 18, { color: [this.look.accent, '#fff'], spd: 200, size: 4, life: .6 });
      G.audio.sfx('smoke');
    }
    this.facing = sign(px - this.cx) || this.facing;
  }
  aiPatrol(dt, G, d, px, py) {
    const p = G.player;
    // vision
    const inFront = sign(px - this.cx) === this.facing;
    const close = d < 300;
    const yOk = Math.abs(py - this.cy) < 76;
    let detect = 0;
    if (close && yOk && inFront) detect = p.smoked ? (d < 60 ? .8 : 0) : 1;
    else if (d < 74 && yOk) detect = p.smoked ? .3 : 1;
    if (p.sight) detect *= .7;
    this.suspicion = clamp((this.suspicion || 0) + (detect ? dt * 2.4 : -dt * 1.1), 0, 1);
    if (this.suspicion >= 1) this.alert = 3.2;
    this.alert = Math.max(0, this.alert - dt);

    if (this.alert > 0) {
      this.dir = sign(px - this.cx) || this.dir;
      this.vx = this.dir * this.speed * 1.9;
      this.facing = this.dir;
      if (rand(0, 1) < dt * 14) G.particles.add({ x: this.cx, y: this.y - 6, vx: rand(-20, 20), vy: rand(-40, -10), life: .6, size: 3, color: '#ff5a7a', shape: 'dot', glowy: true });
    } else {
      const t = this.t * .55;
      const off = Math.sin(t) * this.patrol;
      const target = this.home.x + off;
      this.vx = clamp((target - this.cx) * 2.2, -this.speed, this.speed);
      this.facing = Math.cos(t) > 0 ? 1 : -1;
    }
    this.detected = this.alert > 0;
  }
  aiClone(dt, G, d, px, py) {
    this.cd -= dt;
    this.stateT += dt;
    if (this.state === 'idle') {
      this.vx = damp(this.vx, sign(px - this.cx) * this.speed * .8, 4, dt);
      if (this.cd <= 0) {
        this.cd = rand(1.4, 2.4);
        const r = rand(0, 1);
        if (r < .34) { this.state = 'dash'; this.stateT = 0; this.facing = sign(px - this.cx); G.audio.sfx('dash'); }
        else if (r < .68) { this.state = 'shoot'; this.stateT = 0; }
        else { this.state = 'blink'; this.stateT = 0; }
      }
    } else if (this.state === 'dash') {
      this.vx = this.facing * 560;
      if (rand(0, 1) < dt * 40) G.particles.trail(this.cx, this.cy, '#8b5cf6', 5, .35);
      if (this.stateT > .34) { this.state = 'idle'; }
    } else if (this.state === 'shoot') {
      this.vx *= .8;
      if (this.stateT > .18 && !this.fired) {
        this.fired = true;
        for (let i = -1; i <= 1; i++) this.shoot(G, px, py, 'dark', 380, 1, i * .2);
      }
      if (this.stateT > .5) { this.state = 'idle'; this.fired = false; }
    } else if (this.state === 'blink') {
      if (!this.blinked) {
        this.blinked = true;
        G.particles.burst(this.cx, this.cy, 18, { color: '#8b5cf6', spd: 220, size: 4, life: .5 });
        this.x = clamp(px + rand(-190, 190), 40, G.level.w - 60);
        this.y = py - rand(20, 90);
        G.audio.sfx('phase');
      }
      if (this.stateT > .3) { this.state = 'idle'; this.blinked = false; G.particles.burst(this.cx, this.cy, 18, { color: '#8b5cf6', spd: 220, size: 4, life: .5 }); }
    }
  }
  aiSnare(dt, G, d, px, py) {
    this.cd -= dt;
    this.vx = damp(this.vx, this.seesPlayer && d > 190 ? sign(px - this.cx) * this.speed : this.seesPlayer && d < 120 ? -sign(px - this.cx) * this.speed : Math.sin(this.t) * 20, 4, dt);
    this.facing = sign(px - this.cx) || this.facing;
    if (this.seesPlayer && d < 460 && this.cd <= 0) {
      this.cd = rand(2.1, 3.2);
      const a = Math.atan2(py - this.cy, px - this.cx);
      G.audio.sfx('web');
      G.projectiles.push(new Projectile({
        x: this.cx, y: this.cy, vx: Math.cos(a) * 380, vy: Math.sin(a) * 380 - 60,
        kind: 'web', dmg: 1, owner: 'enemy', life: 2.4, gravity: 300,
        onHitPlayer: (GG) => { GG.player.debuff('slow', 1); GG.world.spawnSticky(GG, GG.player.x, GG.player.y + GG.player.h, 70); },
        trail: { color: '#cfe9ff', life: .3, size: .5 },
      }));
    }
  }
  aiSteal(dt, G, d, px, py) {
    if (this.stolen > 0) {
      this.dir = sign(this.home.x - this.cx) || this.dir;
      this.vx = this.dir * this.speed * 1.5;
      if (Math.abs(this.cx - this.home.x) < 20) this.vx = 0;
    } else {
      let best = null, bd = 420;
      for (const pk of G.pickups) { if (pk.dead || pk.type !== 'modak') continue; const dd = dist(this.cx, this.cy, pk.x, pk.y); if (dd < bd) { bd = dd; best = pk; } }
      if (best) {
        this.dir = sign(best.x - this.cx) || this.dir;
        this.vx = this.dir * this.speed * 1.3;
        if (bd < 24) { best.dead = true; this.stolen++; G.audio.sfx('coin'); G.fx.text(this.cx, this.y - 10, 'STOLEN!', { color: '#ffd166', size: 16, life: .9 }); G.hud?.toast?.('A thief took your modak!', '✖'); }
      } else {
        this.cd -= dt; this.vx = this.dir * this.speed * .5;
        if (this.cd <= 0) { this.cd = rand(1.4, 2.6); this.dir *= -1; }
      }
    }
    this.facing = this.dir;
    if (this.onGround && rand(0, 1) < dt * 1.2 && Math.abs(this.vx) > 40) this.vy = -420;
  }

  /* -------------------------------- draw --------------------------------- */
  draw(ctx, cam, t, G) {
    if (this.dead) return;
    const x = this.cx - cam.cx, y = this.y + this.h - cam.cy;
    if (x < -160 || x > cam.w + 160 || y < -220 || y > cam.h + 220) return;
    const L = this.look, s = this.scale;
    ctx.save();
    ctx.translate(x, y);
    // shadow
    if (!this.flying) { ctx.save(); ctx.globalAlpha = .3; ctx.fillStyle = '#000'; ellipse(ctx, 0, 2, this.w * .42, 5); ctx.fill(); ctx.restore(); }
    // "!" aggro cue so the player always knows what is hunting them
    if (this.cue > 0) {
      const k = clamp(this.cue, 0, 1), pop = 1 + (1 - k) * .2;
      ctx.save(); ctx.globalAlpha = Math.min(1, k * 2);
      ctx.translate(0, -this.h - 26 - (1 - k) * 8);ctx.scale(pop, pop);
      ctx.fillStyle = 'rgba(10,4,16,.85)';
      ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU); ctx.fill();
      ctx.strokeStyle = rgba('#ff5a7a', .9); ctx.lineWidth = 1.6; ctx.stroke();
      ctx.fillStyle = '#ff8a9a'; ctx.font = '900 15px Rajdhani, system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', 0, 1);
      ctx.restore();
    }
    // true-sight weak point
    if (G.player.sight && !this.invincible) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const wx = this.weakX * this.w, wy = -this.h * .55 + this.weakY * this.h * .3;
      glow(ctx, wx, wy, 22, '#ff5a7a', .5 + Math.sin(t * 7) * .16);
      ctx.strokeStyle = rgba('#ff5a7a', .9); ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(wx, wy, 7 + Math.sin(t * 7) * 1.6, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    if (this.fuse >= 0) {
      const k = this.fuse / .38;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, 0, -this.h / 2, this.h * (1 + k * 2), '#ff8a1f', .5 * k); ctx.restore();
      ctx.scale(1 + k * .25, 1 + k * .25);
    }
    ctx.scale(this.facing * s * (1 + (this.hitFlash > 0 ? .06 : 0)), s * (1 - (this.hitFlash > 0 ? .04 : 0)));
    if (this.hitFlash > 0) { ctx.globalAlpha = 1; }
    const flash = this.hitFlash > 0;
    const body = flash ? '#ffffff' : L.body;
    const body2 = flash ? '#ffd0d0' : L.body2;
    const accent = flash ? '#ffffff' : L.accent;

    switch (L.shape) {
      case 'blob': this.drawBlob(ctx, t, body, body2, accent, L); break;
      case 'frog': this.drawFrog(ctx, t, body, body2, accent, L); break;
      case 'eye': this.drawEye(ctx, t, body, body2, accent, L); break;
      case 'bat': this.drawBat(ctx, t, body, body2, accent, L); break;
      case 'spider': this.drawSpider(ctx, t, body, body2, accent, L); break;
      case 'knight': this.drawKnight(ctx, t, body, body2, accent, L); break;
      case 'plant': this.drawPlant(ctx, t, body, body2, accent, L); break;
      case 'turret': this.drawTurret(ctx, t, body, body2, accent, L); break;
      case 'golem': this.drawGolem(ctx, t, body, body2, accent, L); break;
      case 'ghost': this.drawGhost(ctx, t, body, body2, accent, L); break;
      case 'bomb': this.drawBomb(ctx, t, body, body2, accent, L); break;
      case 'crystal': this.drawCrystal(ctx, t, body, body2, accent, L); break;
      case 'mouse': this.drawDarkMouse(ctx, t, body, body2, accent, L); break;
      default: this.drawBlob(ctx, t, body, body2, accent, L);
    }
    // armour / shield indicators
    if (this.armor && !flash) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(accent, .5 + Math.sin(t * 3) * .12); ctx.lineWidth = 2;
      roundRect(ctx, -this.w / 2 - 3, -this.h - 3, this.w + 6, this.h + 6, 8); ctx.stroke();
      ctx.restore();
    }
    if (this.shielded) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba('#ffd166', .8); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, -this.h / 2, this.w * .8, 0, TAU); ctx.stroke();
      glow(ctx, 0, -this.h / 2, this.w, '#ffd166', .25); ctx.restore();
    }
    if (this.invincible) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      glow(ctx, 0, -this.h / 2, this.w * 1.1, this.alert > 0 ? '#ff5a7a' : '#dfe8ff', .18 + Math.sin(t * 2) * .05);
      ctx.restore();
      // vision cone
      const coneLen = 300, coneA = .42;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const alert = this.alert > 0;
      const g = ctx.createLinearGradient(0, -this.h * .7, this.facing * coneLen, -this.h * .7);
      g.addColorStop(0, rgba(alert ? '#ff5a7a' : '#ffe6a3', .3));
      g.addColorStop(1, rgba(alert ? '#ff5a7a' : '#ffe6a3', 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(this.facing * 8, -this.h * .72);
      ctx.lineTo(this.facing * coneLen, -this.h * .72 - coneLen * coneA);
      ctx.lineTo(this.facing * coneLen, -this.h * .72 + coneLen * coneA);
      ctx.closePath(); ctx.fill(); ctx.restore();
      if (alert) {
        ctx.save(); ctx.fillStyle = '#ff5a7a'; ctx.font = `900 ${18}px Rajdhani, sans-serif`; ctx.textAlign = 'center';
        ctx.fillText('!', 0, -this.h - 14 + Math.sin(t * 14) * 2); ctx.restore();
      }
    }
    // hp pip for tough enemies
    if (this.maxHp > 8 && this.hp < this.maxHp && !this.invincible) {
      const w = this.w * .9;
      ctx.fillStyle = 'rgba(0,0,0,.6)'; roundRect(ctx, -w / 2, -this.h - 14, w, 5, 3); ctx.fill();
      ctx.fillStyle = this.hp / this.maxHp > .4 ? L.accent : '#ff5a7a';
      roundRect(ctx, -w / 2 + 1, -this.h - 13, (w - 2) * clamp(this.hp / this.maxHp, 0, 1), 3, 2); ctx.fill();
    }
    ctx.restore();
  }

  /* ---- shape painters (local space: origin at feet, facing +x) ---- */
  _eyes(ctx, x, y, r, col, n = 2, t = 0) {
    ctx.fillStyle = col;
    for (let i = 0; i < n; i++) {
      const ox = x + (i - (n - 1) / 2) * r * 2.1;
      ctx.beginPath(); ctx.arc(ox, y, r, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.beginPath(); ctx.arc(ox + r * .3, y - r * .3, r * .34, 0, TAU); ctx.fill();
      ctx.fillStyle = col;
    }
  }
  drawBlob(ctx, t, body, body2, accent, L) {
    const w = this.w, h = this.h;
    const wob = Math.sin(t * 6 + this.animT) * 1.6;
    const g = ctx.createLinearGradient(0, -h, 0, 0);
    g.addColorStop(0, body); g.addColorStop(1, body2);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-w / 2, 0);
    ctx.quadraticCurveTo(-w / 2 - wob, -h * .8, 0, -h - wob * .4);
    ctx.quadraticCurveTo(w / 2 + wob, -h * .8, w / 2, 0);
    ctx.quadraticCurveTo(0, 4, -w / 2, 0);
    ctx.fill();
    // horns
    ctx.fillStyle = accent;
    for (const s of [-1, 1]) {
      if (L.horns >= 2 || (L.horns === 1 && s > 0)) {
        ctx.beginPath(); ctx.moveTo(s * w * .26, -h * .92); ctx.lineTo(s * w * .44, -h * 1.34); ctx.lineTo(s * w * .1, -h * 1.02); ctx.closePath(); ctx.fill();
      }
    }
    this._eyes(ctx, w * .16, -h * .58, w * .1, L.eye, 2, t);
    // mouth
    ctx.strokeStyle = body2; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(w * .04, -h * .3); ctx.quadraticCurveTo(w * .2, -h * .2, w * .34, -h * .32); ctx.stroke();
    // feet
    ctx.fillStyle = body2;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * w * .26, -1, w * .14, 4, 0, 0, TAU); ctx.fill(); }
  }
  drawFrog(ctx, t, body, body2, accent, L) {
    const w = this.w, h = this.h;
    const sq = this.onGround ? 1 + Math.sin(t * 5) * .04 : .86;
    ctx.save(); ctx.scale(1 / sq, sq);
    const g = ctx.createLinearGradient(0, -h, 0, 0); g.addColorStop(0, body); g.addColorStop(1, body2);
    ctx.fillStyle = g;
    ellipse(ctx, 0, -h * .45, w * .52, h * .46); ctx.fill();
    ctx.fillStyle = body2;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * w * .4, -h * .16, w * .18, h * .16, s * .4, 0, TAU); ctx.fill(); }
    ctx.fillStyle = body;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * w * .2, -h * .92, w * .17, 0, TAU); ctx.fill(); }
    this._eyes(ctx, 0, -h * .94, w * .11, L.eye, 2);
    ctx.fillStyle = accent;
    ctx.beginPath(); ctx.arc(0, -h * .94, w * .05, 0, TAU); ctx.fill();
    ctx.strokeStyle = body2; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-w * .3, -h * .38); ctx.quadraticCurveTo(0, -h * .22, w * .3, -h * .38); ctx.stroke();
    ctx.restore();
  }
  drawEye(ctx, t, body, body2, accent, L) {
    const r = this.w * .5;
    ctx.save(); ctx.translate(0, -this.h * .55);
    // tentacles
    ctx.strokeStyle = body2; ctx.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + t * .6;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * .7, Math.sin(a) * r * .7);
      ctx.quadraticCurveTo(Math.cos(a) * r * 1.5, Math.sin(a) * r * 1.5 + Math.sin(t * 4 + i) * 5, Math.cos(a) * r * 1.9, Math.sin(a) * r * 1.9);
      ctx.stroke();
    }
    const g = ctx.createRadialGradient(0, 0, r * .2, 0, 0, r);
    g.addColorStop(0, accent); g.addColorStop(.7, body); g.addColorStop(1, body2);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, r * .62, 0, TAU); ctx.fill();
    ctx.fillStyle = '#1a0a2a';
    ctx.beginPath(); ctx.arc(Math.cos(this.t * 1.4) * r * .2, Math.sin(this.t * 1.1) * r * .2, r * .3, 0, TAU); ctx.fill();
    ctx.fillStyle = L.eye; ctx.beginPath(); ctx.arc(r * .18, -r * .18, r * .1, 0, TAU); ctx.fill();
    ctx.restore();
  }
  drawBat(ctx, t, body, body2, accent, L) {
    const w = this.w, h = this.h;
    const flap = Math.sin(t * 12 + this.animT) * .6;
    ctx.save(); ctx.translate(0, -h * .6);
    for (const s of [-1, 1]) {
      ctx.save(); ctx.rotate(s * (.5 + flap * .5));
      const g = ctx.createLinearGradient(0, 0, s * w, 0);
      g.addColorStop(0, body); g.addColorStop(1, rgba(L.body2, .9));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(0, -2);
      ctx.quadraticCurveTo(s * w * .6, -h * .7, s * w * 1.05, -h * .1);
      ctx.quadraticCurveTo(s * w * .72, h * .1, s * w * .5, h * .34);
      ctx.quadraticCurveTo(s * w * .3, h * .05, 0, h * .2);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = rgba(accent, .5); ctx.lineWidth = 1.2; ctx.stroke();
      ctx.restore();
    }
    const bg = ctx.createLinearGradient(0, -h * .5, 0, h * .4); bg.addColorStop(0, body); bg.addColorStop(1, body2);
    ctx.fillStyle = bg; ellipse(ctx, 0, 0, w * .34, h * .42); ctx.fill();
    if (L.fiery) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, 0, 0, w * .8, '#ff8a1f', .4); ctx.restore(); }
    ctx.fillStyle = body2;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * w * .16, -h * .34); ctx.lineTo(s * w * .3, -h * .68); ctx.lineTo(s * w * .04, -h * .44); ctx.closePath(); ctx.fill(); }
    this._eyes(ctx, 0, -h * .1, w * .09, L.eye, 2);
    ctx.restore();
  }
  drawSpider(ctx, t, body, body2, accent, L) {
    const w = this.w, h = this.h;
    ctx.strokeStyle = body2; ctx.lineWidth = 3.2; ctx.lineCap = 'round';
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
      const ph = Math.sin(t * 7 + i * 1.2 + (s > 0 ? Math.PI : 0)) * 4;
      const ax = s * w * (.18 + i * .1), ay = -h * .5;
      ctx.beginPath(); ctx.moveTo(ax * .4, ay);
      ctx.quadraticCurveTo(s * w * (.5 + i * .12), ay - h * .5 + ph, s * w * (.6 + i * .14), 0 + ph * .3);
      ctx.stroke();
    }
    const g = ctx.createRadialGradient(0, -h * .55, 2, 0, -h * .55, w * .5);
    g.addColorStop(0, accent); g.addColorStop(.5, body); g.addColorStop(1, body2);
    ctx.fillStyle = g; ellipse(ctx, 0, -h * .5, w * .42, h * .4); ctx.fill();
    ctx.fillStyle = body2; ellipse(ctx, w * .26, -h * .68, w * .2, h * .18); ctx.fill();
    ctx.fillStyle = L.eye;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(w * .26 + (i % 2) * 5 - 2, -h * .72 + Math.floor(i / 2) * 5, 1.9, 0, TAU); ctx.fill(); }
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = rgba(accent, .3); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, -h); ctx.lineTo(0, -h * 2.4); ctx.stroke(); ctx.restore();
  }
  drawKnight(ctx, t, body, body2, accent, L) {
    const w = this.w, h = this.h;
    const step = Math.sin(t * 5 + this.animT) * 3 * (Math.abs(this.vx) > 20 ? 1 : .2);
    // legs
    ctx.fillStyle = body2;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(s * w * .2 - 5, -h * .34 + (s > 0 ? step : -step) * .4, 11, h * .34, 4) : ctx.rect(s * w * .2 - 5, -h * .34, 11, h * .34); ctx.fill(); }
    // body armour
    const g = ctx.createLinearGradient(0, -h, 0, -h * .3); g.addColorStop(0, body); g.addColorStop(1, body2);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-w * .42, -h * .34); ctx.lineTo(-w * .36, -h * .78);
    ctx.quadraticCurveTo(0, -h * .92, w * .36, -h * .78);
    ctx.lineTo(w * .42, -h * .34); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = rgba(accent, .8); ctx.lineWidth = 2; ctx.stroke();
    // pauldrons
    ctx.fillStyle = accent;
    for (const s of [-1, 1]) { ellipse(ctx, s * w * .42, -h * .74, w * .17, h * .1); ctx.fill(); }
    // helm
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.moveTo(-w * .24, -h * .82); ctx.lineTo(-w * .2, -h * 1.06); ctx.quadraticCurveTo(0, -h * 1.16, w * .2, -h * 1.06); ctx.lineTo(w * .24, -h * .82); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = rgba(accent, .9); ctx.lineWidth = 1.6; ctx.stroke();
    // visor slit + eyes
    ctx.fillStyle = '#120a1c'; ctx.fillRect(-w * .18, -h * .98, w * .36, h * .06);
    ctx.fillStyle = this.alert > 0 ? '#ff2a3a' : L.eye;
    ctx.beginPath(); ctx.arc(w * .07, -h * .95, 2.6, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(-w * .07, -h * .95, 2.6, 0, TAU); ctx.fill();
    // crest
    ctx.fillStyle = accent;
    ctx.beginPath(); ctx.moveTo(0, -h * 1.12); ctx.quadraticCurveTo(w * .16, -h * 1.34, -w * .04, -h * 1.3); ctx.closePath(); ctx.fill();
    // weapon
    ctx.save(); ctx.translate(w * .4, -h * .5); ctx.rotate(-.5 + Math.sin(t * 2) * .12);
    ctx.strokeStyle = '#5a4a34'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w * .5, -h * .1); ctx.stroke();
    ctx.fillStyle = accent; ctx.beginPath(); ctx.moveTo(w * .44, -h * .16); ctx.lineTo(w * .66, -h * .04); ctx.lineTo(w * .44, h * .06); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  drawPlant(ctx, t, body, body2, accent, L) {
    const w = this.w, h = this.h;
    ctx.strokeStyle = '#3f6b2a'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(Math.sin(t * 1.6) * 6, -h * .5, 0, -h * .7); ctx.stroke();
    ctx.save(); ctx.translate(0, -h * .78);
    const open = .6 + Math.sin(t * 2.4) * .3;
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + (i - 3) * .34 * (1 + open * .5);
      ctx.save(); ctx.rotate(a + Math.PI / 2);
      const g = ctx.createLinearGradient(0, 0, 0, -h * .5); g.addColorStop(0, body2); g.addColorStop(1, body);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(w * .22, -h * .28, 0, -h * .52); ctx.quadraticCurveTo(-w * .22, -h * .28, 0, 0); ctx.fill();
      ctx.strokeStyle = rgba(accent, .6); ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(0, -h * .1, w * .16, 0, TAU); ctx.fill();
    this._eyes(ctx, 0, -h * .12, w * .07, L.eye, 2);
    ctx.restore();
    ctx.fillStyle = body2; ellipse(ctx, 0, -2, w * .34, 6); ctx.fill();
  }
  drawTurret(ctx, t, body, body2, accent, L) {
    const w = this.w, h = this.h;
    const g = ctx.createLinearGradient(0, -h, 0, 0); g.addColorStop(0, body); g.addColorStop(1, body2);
    ctx.fillStyle = g;
    roundRect(ctx, -w / 2, -h, w, h, 8); ctx.fill();
    ctx.strokeStyle = rgba(accent, .7); ctx.lineWidth = 2; ctx.stroke();
    // barrel
    ctx.save(); ctx.translate(0, -h * .68);
    const aim = this.facing;
    ctx.rotate((this.recoil || 0) * -.4 * aim);
    ctx.fillStyle = body2; roundRect(ctx, 0, -6, w * .62 * aim, 12, 5); ctx.fill();
    ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(w * .62 * aim, 0, 6 + (this.recoil || 0) * 6, 0, TAU); ctx.fill();
    ctx.restore();
    // eye
    ctx.fillStyle = '#120a1c'; ctx.beginPath(); ctx.arc(0, -h * .68, w * .2, 0, TAU); ctx.fill();
    ctx.fillStyle = L.eye; ctx.beginPath(); ctx.arc(aim * 3, -h * .68, w * .1 + Math.sin(t * 4) * 1.2, 0, TAU); ctx.fill();
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, 0, -h * .68, w * .6, L.eye, .25); ctx.restore();
    // base spikes
    ctx.fillStyle = body2;
    for (let i = -1; i <= 1; i += 2) { ctx.beginPath(); ctx.moveTo(i * w * .3, 0); ctx.lineTo(i * w * .46, -h * .18); ctx.lineTo(i * w * .18, -h * .1); ctx.closePath(); ctx.fill(); }
  }
  drawGolem(ctx, t, body, body2, accent, L) {
    const w = this.w, h = this.h;
    const step = Math.sin(t * 4) * 3;
    ctx.fillStyle = body2;
    for (const s of [-1, 1]) { roundRect(ctx, s * w * .26 - 7, -h * .3 + (s > 0 ? step : -step) * .3, 15, h * .3, 5); ctx.fill(); }
    const g = ctx.createLinearGradient(0, -h, 0, 0); g.addColorStop(0, body); g.addColorStop(1, body2);
    ctx.fillStyle = g;
    roundRect(ctx, -w * .46, -h * .92, w * .92, h * .64, 10); ctx.fill();
    ctx.strokeStyle = rgba(accent, .6); ctx.lineWidth = 2; ctx.stroke();
    // gold veins
    ctx.strokeStyle = rgba('#fff3d0', .55); ctx.lineWidth = 1.6;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-w * .4 + i * w * .22, -h * .9); ctx.lineTo(-w * .3 + i * w * .22, -h * .32); ctx.stroke(); }
    // belly vault
    ctx.fillStyle = '#2a1c08'; ellipse(ctx, 0, -h * .56, w * .26, h * .18); ctx.fill();
    ctx.fillStyle = accent;
    for (let i = 0; i < Math.min(5, this.growth); i++) { ctx.beginPath(); ctx.arc(-w * .14 + i * w * .07, -h * .56, 3.4, 0, TAU); ctx.fill(); }
    // head
    ctx.fillStyle = body; roundRect(ctx, -w * .22, -h * 1.16, w * .44, h * .28, 7); ctx.fill();
    ctx.strokeStyle = rgba(accent, .8); ctx.lineWidth = 1.6; ctx.stroke();
    this._eyes(ctx, 0, -h * 1.02, w * .07, L.eye, 2);
    // arms
    ctx.fillStyle = body2;
    for (const s of [-1, 1]) { roundRect(ctx, s * w * .46 - (s > 0 ? 0 : 12), -h * .86, 13, h * .5, 6); ctx.fill(); }
  }
  drawGhost(ctx, t, body, body2, accent, L) {
    const w = this.w, h = this.h;
    ctx.save(); ctx.globalAlpha = .82;
    const g = ctx.createLinearGradient(0, -h * 1.2, 0, 0);
    g.addColorStop(0, rgba(L.accent, .95)); g.addColorStop(.55, rgba(L.body, .8)); g.addColorStop(1, rgba(L.body2, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-w * .46, 0);
    ctx.quadraticCurveTo(-w * .5, -h * 1.1, 0, -h * 1.2);
    ctx.quadraticCurveTo(w * .5, -h * 1.1, w * .46, 0);
    for (let i = 0; i < 5; i++) {
      const x0 = w * .46 - (i + 1) * (w * .92 / 5);
      ctx.quadraticCurveTo(x0 + w * .1, 8 + Math.sin(t * 5 + i) * 5, x0, 0);
    }
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(-w * .12, -h * .84, w * .1, h * .07, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(w * .16, -h * .84, w * .1, h * .07, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#1a0a2a';
    ctx.beginPath(); ctx.arc(-w * .12 + this.facing * 2, -h * .84, w * .05, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(w * .16 + this.facing * 2, -h * .84, w * .05, 0, TAU); ctx.fill();
    ctx.restore();
  }
  drawBomb(ctx, t, body, body2, accent, L) {
    const w = this.w, h = this.h;
    const g = ctx.createRadialGradient(-w * .1, -h * .7, 2, 0, -h * .5, w * .6);
    g.addColorStop(0, accent); g.addColorStop(.5, body); g.addColorStop(1, body2);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, -h * .5, w * .46, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#2a1208'; ctx.lineWidth = 2; ctx.stroke();
    // fuse
    const fuse = this.fuse >= 0 ? 1 : .3;
    ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(0, -h * .95); ctx.quadraticCurveTo(w * .2, -h * 1.2, w * .1, -h * 1.34); ctx.stroke();
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    glow(ctx, w * .1, -h * 1.36, 12 + fuse * 14, '#ffd166', .8);
    ctx.fillStyle = '#fff3d0'; ctx.beginPath(); ctx.arc(w * .1, -h * 1.36, 3 + fuse * 2, 0, TAU); ctx.fill();
    ctx.restore();
    this._eyes(ctx, 0, -h * .55, w * .08, L.eye, 2);
    ctx.fillStyle = body2;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * w * .22, -2, w * .13, 5, 0, 0, TAU); ctx.fill(); }
  }
  drawCrystal(ctx, t, body, body2, accent, L) {
    const w = this.w, h = this.h;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, 0, -h * .5, w * .9, accent, .2); ctx.restore();
    const g = ctx.createLinearGradient(-w * .4, -h, w * .4, 0);
    g.addColorStop(0, rgba('#ffffff', .95)); g.addColorStop(.4, body); g.addColorStop(1, body2);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -h * 1.15); ctx.lineTo(w * .38, -h * .5); ctx.lineTo(w * .22, 0); ctx.lineTo(-w * .26, 0); ctx.lineTo(-w * .4, -h * .56);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = rgba('#fff', .8); ctx.lineWidth = 1.4; ctx.stroke();
    ctx.fillStyle = rgba('#fff', .35);
    ctx.beginPath(); ctx.moveTo(0, -h * 1.1); ctx.lineTo(w * .16, -h * .5); ctx.lineTo(-w * .1, -h * .1); ctx.closePath(); ctx.fill();
    ctx.fillStyle = L.eye; ctx.beginPath(); ctx.arc(w * .06, -h * .68, 3.2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(-w * .14, -h * .62, 2.4, 0, TAU); ctx.fill();
  }
  drawDarkMouse(ctx, t, body, body2, accent, L) {
    const w = this.w * 1.4, h = this.h;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, 0, -h * .5, w * 1.1, '#8b5cf6', .28); ctx.restore();
    // tail
    ctx.strokeStyle = accent; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-w * .3, -h * .22);
    ctx.quadraticCurveTo(-w * .8, -h * .4 + Math.sin(t * 5) * 6, -w * .95, -h * .7); ctx.stroke();
    const g = ctx.createLinearGradient(0, -h, 0, 0); g.addColorStop(0, body); g.addColorStop(1, body2);
    ctx.fillStyle = g; ellipse(ctx, 0, -h * .42, w * .38, h * .34); ctx.fill();
    ctx.fillStyle = body; ellipse(ctx, w * .16, -h * .74, w * .26, h * .24); ctx.fill();
    for (const s of [-1, 1]) { ctx.fillStyle = body2; ctx.beginPath(); ctx.arc(w * .16 + s * w * .2, -h * .92, w * .17, 0, TAU); ctx.fill(); ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(w * .16 + s * w * .2, -h * .92, w * .09, 0, TAU); ctx.fill(); }
    ctx.fillStyle = L.eye; ctx.beginPath(); ctx.arc(w * .26, -h * .78, 3, 0, TAU); ctx.fill();
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, w * .26, -h * .78, 12, L.eye, .7); ctx.restore();
    ctx.fillStyle = body2;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * w * .2, -3, w * .12, 5, 0, 0, TAU); ctx.fill(); }
  }
}
const PROJ_COL = { orb: '#b6ff7a', acid: '#9dff5a', fire: '#ff8a1f', fireball: '#ff6b3d', spore: '#ff9fc4', petal: '#ff6fa5', coin: '#ffd166', web: '#cfe9ff', shard: '#dfe8ff', laser: '#ff5a7a', nectar: '#7fe8ff', dark: '#8b5cf6' };

export function spawnEnemy(G, spec) { const e = new Enemy(spec, G); G.enemies.push(e); return e; }
