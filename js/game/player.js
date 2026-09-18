/* ===========================================================================
   game/player.js — Mushika. Movement, combat, the eight Divine Boons,
   and a fully procedural animated mouse.
   =========================================================================== */
import { TAU, clamp, lerp, damp, rand, sign, approach, rgba, glow, ellipse, starPath, roundRect, dist } from '../core/utils.js';
import { Projectile } from './entities.js';
import { BOONS, boonById } from '../data/boons.js';

const GRAV = 2450;
const MAXFALL = 1180;

export class Player {
  constructor(G, spawn) {
    this.G = G;
    this.w = 26; this.h = 34;
    this.x = spawn.x; this.y = spawn.y;
    this.vx = 0; this.vy = 0;
    this.facing = 1;
    this.onGround = false; this.wasGround = false;
    this.coyote = 0; this.jumpBuf = 0; this.jumpHold = 0;
    this.hp = 5; this.maxHp = 5; this.shieldPips = 0;
    this.bhakti = 0; this.maxBhakti = 100;
    this.invuln = 0; this.dead = false; this.deathT = 0;
    this.standing = null; this.inWater = false; this.drown = 0;
    this.cycT = 0; this.cycSpin = 0; this._cycHits = null;
    this.runT = 0; this.animT = 0; this.blink = 0; this.squash = 1; this.stretch = 1;
    this.tailT = 0; this.tailWhip = 0;
    // combat
    this.atk = null; this.comboStep = 0; this.comboTimer = 0;
    this.dodgeT = 0; this.dodgeCd = 0; this.perfectWindow = 0;
    // boons
    this.owned = new Set(); this.sel = 0; this.cds = {};
    this.sight = false; this.smoked = false; this.phasing = false; this.phaseT = 0;
    this.shielded = false; this.shieldT = 0; this.absorbed = [];
    this.focusT = 0; this.chargeT = 0; this.chargeDir = 1;
    this.tether = null; this.boomerang = null;
    this.debuffs = { reverse: 0, slow: 0, web: 0 };
    this.surge = 0;
    this.magnetAura = false;
    this.hidden = false; this.detected = 0;
    this.lastSafe = { x: spawn.x, y: spawn.y };
    this.hitFlash = 0; this.healGlow = 0;
    this.steps = 0;
  }

  give(id) {
    this.owned.add(id);
    const i = BOONS.findIndex((b) => b.id === id);
    if (i >= 0) this.sel = i;
  }
  get boon() { return BOONS[this.sel] || null; }
  selectBoon(i) {
    if (i < 0 || i >= BOONS.length) return false;
    if (!this.owned.has(BOONS[i].id)) return false;
    this.sel = i; this.G.audio.sfx('ui'); return true;
  }
  cycle(dir = 1) {
    const n = BOONS.length;
    for (let k = 1; k <= n; k++) {
      const i = (this.sel + dir * k + n * 2) % n;
      if (this.owned.has(BOONS[i].id)) { this.sel = i; this.G.audio.sfx('ui'); return; }
    }
  }
  canPay(b) {
    if (this.G.settings.difficulty === 'story') return true;
    return this.bhakti >= (b.meter || 0);
  }
  pay(b) { if (this.G.settings.difficulty !== 'story') this.bhakti = clamp(this.bhakti - (b.meter || 0), 0, this.maxBhakti); }
  addBhakti(v) {
    if (this.G.settings.difficulty === 'story') v *= 2;
    const before = this.bhakti;
    this.bhakti = clamp(this.bhakti + v, 0, this.maxBhakti);
    if (before < this.maxBhakti && this.bhakti >= this.maxBhakti) {
      this.G.audio.sfx('powerup');
      this.G.particles.ring(this.x + this.w / 2, this.y + this.h / 2, 22, '#ffe6a3', .6);
      this.G.hud?.toast?.('Bhakti full — press V for Siddhi Surge', '✦', 'gold');
    }
  }

  /* ------------------------------- damage ------------------------------- */
  hurt(G, amount = 1, o = {}) {
    if (this.dead || this.invuln > 0 || this.phasing || G.state !== 'play') return false;
    if (this.shielded && !o.pierce) {
      this.absorb(G, 1);
      this.vx += sign(this.x - (o.sx ?? this.x)) * 120;
      return false;
    }
    if (this.dodgeT > .16 && !o.pierce) { this.perfectDodge(G, o); return false; }
    if (this.shieldPips > 0 && !o.pierce) {   // modak armour eats the hit
      this.shieldPips--;
      this.invuln = Math.max(this.invuln, .9);
      G.audio.sfx('wallbreak'); G.fx.shake(6);
      G.particles.burst(this.x + this.w / 2, this.y + this.h / 2, 14, { color: ['#9fd8ff', '#fff'], spd: 240, size: 4, life: .5 });
      G.fx.text(this.x + this.w / 2, this.y - 8, 'ARMOUR!', { color: '#9fd8ff', size: 18, crit: true, life: .7 });
      this.vx += sign(this.x - (o.sx ?? this.x)) * 140;
      return false;
    }
    const diff = G.settings.difficulty;
    if (diff === 'story') amount = Math.max(1, Math.round(amount * .6));
    if (diff === 'dharma') amount = Math.ceil(amount * 1.5);
    this.hp -= amount;
    this.invuln = G.settings?.difficulty === 'story' ? 1.7 : 1.25;
    this.hitFlash = .3;
    this.comboReset(G);
    this.vx = (o.kx ?? sign(this.x + this.w / 2 - (o.sx ?? this.x)) * 300) * .8;
    this.vy = o.ky ?? -300;
    this.sight = false; this.smoked = false;
    if (o.src && typeof o.src === 'object' && !o.src.dead) { o.src.flash = .4; o.src.cue = 1; }   // light up whatever hit you
    if (!G.run._hitTip) { G.run._hitTip = true; G.hud?.toast?.('That was an asura\'s claw — swipe J to strike back, Shift to dodge', '⚔'); }
    G.audio.sfx('hurt'); G.fx.shake(11 + amount * 3); G.fx.stop(.06); G.fx.flash('hurt');
    G.particles.burst(this.x + this.w / 2, this.y + this.h / 2, 16, { color: ['#ff5a7a', '#fff3d0'], spd: 260, size: 4, life: .5 });
    G.fx.text(this.x + this.w / 2, this.y - 6, '−' + amount, { color: '#ff7a8a', size: 22, crit: amount > 1 });
    if (this.hp <= 0) this.die(G);
    return true;
  }
  perfectDodge(G, o) {
    this.invuln = Math.max(this.invuln, .5);
    this.addBhakti(16);
    G.fx.slow(.55, .3); G.fx.stop(.09); G.audio.sfx('reflect');
    G.fx.text(this.x + this.w / 2, this.y - 22, 'DHARMA DODGE', { color: '#ffe6a3', size: 20, crit: true, life: 1 });
    G.particles.ring(this.x + this.w / 2, this.y + this.h / 2, 20, '#ffe6a3', .55);
    G.particles.burst(this.x + this.w / 2, this.y + this.h / 2, 22, { color: ['#ffe6a3', '#fff'], spd: 300, size: 3, life: .5, shape: 'spark' });
    G.stats.perfectDodges = (G.stats.perfectDodges || 0) + 1;
  }
  heal(n) {
    if (this.hp >= this.maxHp) { this.addBhakti(8); return false; }
    this.hp = clamp(this.hp + n, 0, this.maxHp); this.healGlow = 1;
    this.G.particles.burst(this.x + this.w / 2, this.y + this.h / 2, 18, { color: ['#ff9fb0', '#fff3d0'], spd: 150, size: 4, life: .8, gravity: -60 });
    return true;
  }
  die(G) {
    if (this.dead) return;
    this.dead = true; this.hp = 0; this.deathT = 0;
    G.audio.sfx('die'); G.fx.shake(20); G.fx.flash('hurt');
    G.particles.burst(this.x + this.w / 2, this.y + this.h / 2, 50, { color: ['#ff5a7a', '#ffd775', '#fff'], spd: 340, size: 5, life: 1.3, gravity: 500 });
    G.onPlayerDeath?.();
  }
  debuff(kind, dt) {
    this.debuffs[kind] = Math.max(this.debuffs[kind] || 0, kind === 'reverse' ? .55 : .8);
    if (kind === 'reverse' && !this._revWarned) { this._revWarned = true; setTimeout(() => (this._revWarned = false), 1200); this.G.hud?.toast?.('Spores! Controls reversed', '☣'); }
  }
  get tier() { return this.owned ? this.owned.size : 0; }
  get comboLen() { const t = this.tier; return 3 + (t >= 3 ? 1 : 0) + (t >= 5 ? 1 : 0); }
  comboReset(G) { this.comboStep = 0; this.comboTimer = 0; G.run.combo = 0; G.hud?.setCombo?.(0); }

  /* ------------------------------- actions ------------------------------ */
  attack(G) {
    if (this.atk || this.chargeT > 0 || this.dead) return;
    const len = this.comboLen;
    this.comboStep = this.comboTimer > 0 ? (this.comboStep + 1) % len : 0;
    const step = this.comboStep;
    const dur = [.3, .3, .42, .36, .5][step] || .4;
    this.atk = { step, fin: step === len - 1, t: 0, dur, hitSet: new Set(), windup: .07, active: .13, fired: false };
    this.tailWhip = 1;
    G.audio.sfx('swipe');
    const dir = this.facing;
    G.particles.burst(this.x + this.w / 2 + dir * 20, this.y + this.h * .55, 6, { color: '#fff3d0', spd: 150, dir: dir > 0 ? 0 : Math.PI, spread: 1.1, size: 2.6, life: .22, shape: 'spark' });
  }
  doDodge(G) {
    if (this.dodgeCd > 0 || this.dead || this.chargeT > 0) return;
    const input = G.input;
    const dir = input.axis(this.debuffs.reverse > 0) || this.facing;
    this.dodgeT = .34; this.dodgeCd = .62; this.invuln = Math.max(this.invuln, .3);
    this.vx = dir * 620; this.vy = this.onGround ? -60 : Math.min(this.vy, -30);
    this.facing = dir;
    this.squash = 1.3; this.stretch = .78;
    G.audio.sfx('dash');
    for (let i = 0; i < 10; i++) G.particles.add({ x: this.x + this.w / 2, y: this.y + this.h * .6 + rand(-8, 8), vx: -dir * rand(40, 190), vy: rand(-40, 40), life: rand(.18, .4), size: rand(2, 5), color: '#cfe0ff', shape: 'dot', drag: 3, glowy: true });
  }
  useSpecial(G, forceId = null) {
    const ok = this._useSpecial(G, forceId);
    if (ok && G.boss?.breakSeal) G.boss.breakSeal(G, (forceId ? boonById(forceId) : this.boon)?.id);
    return ok;
  }
  _useSpecial(G, forceId = null) {
    if (this.dead) return false;
    const b = forceId ? boonById(forceId) : this.boon;
    if (!b || !this.owned.has(b.id)) return false;
    if (forceId) this.sel = BOONS.indexOf(b);
    if ((this.cds[b.id] || 0) > 0) { G.audio.sfx('error'); G.hud?.flashBoon?.(this.sel); return false; }
    if (!this.canPay(b)) { G.audio.sfx('error'); G.hud?.toast?.('Not enough Bhakti', '✦'); return false; }

    switch (b.kind) {
      case 'throw': return this.throwBoomerang(G, b);
      case 'dash': return this.chargeDash(G, b);
      case 'toggle':
        if (b.id === 'truesight') { this.sight = !this.sight; if (this.sight) { G.audio.sfx('truesight'); G.fx.ripple(this.x + this.w / 2, this.y + this.h / 2, '#c792ff', 420, .7); G.particles.ring(this.x + this.w / 2, this.y + this.h / 2, 18, '#c792ff', .6); } else G.audio.sfx('ui'); return true; }
        return false;
      case 'tether': return this.fireTether(G, b);
      case 'shield': return this.raiseShield(G, b);
      case 'slowtime': return this.activateFocus(G, b);
      case 'phase': return this.activatePhase(G, b);
      case 'stealth':
        this.smoked = !this.smoked;
        if (this.smoked) { G.audio.sfx('smoke'); G.particles.smoke(this.x + this.w / 2, this.y + this.h / 2, 18, '#b9a7d6'); }
        else G.audio.sfx('ui');
        return true;
    }
    return false;
  }

  throwBoomerang(G, b) {
    if (this.boomerang) return false;
    this.pay(b); this.cds[b.id] = b.cd;
    const dir = this.facing;
    const up = G.input.isDown('up') ? -1 : 0;
    const p = new Projectile({
      x: this.x + this.w / 2 + dir * 14, y: this.y + this.h * .45,
      vx: dir * 780, vy: up * 520, kind: 'tusk', dmg: 2, owner: 'player', life: 3,
      pierce: 99, knock: 200, spin: 26, boomerang: true, t: 0, ghost: true,
      trail: { color: '#7fe3ff', life: .26, size: .5 },
    });
    p.ret = false; p.hitCd = new Map();
    this.boomerang = p;
    G.projectiles.push(p);
    G.audio.sfx('boomerang');
    this.squash = .85; this.stretch = 1.18;
    return true;
  }
  chargeDash(G, b) {
    this.pay(b); this.cds[b.id] = b.cd;
    this.chargeT = .3; this.chargeDir = G.input.axis(this.debuffs.reverse > 0) || this.facing;
    this.facing = this.chargeDir;
    this.invuln = Math.max(this.invuln, .34);
    this.atk = null;
    G.audio.sfx('charge'); G.fx.shake(7);
    G.fx.ripple(this.x + this.w / 2, this.y + this.h / 2, '#ffd166', 260, .45);
    G.stats.charges = (G.stats.charges || 0) + 1;
    return true;
  }
  fireTether(G, b) {
    this.pay(b); this.cds[b.id] = b.cd;
    const input = G.input;
    let ax = input.axis(this.debuffs.reverse > 0), ay = input.vertical();
    if (!ax && !ay) ax = this.facing;
    const len = Math.hypot(ax, ay) || 1; ax /= len; ay /= len;
    this.tether = { x: this.x + this.w / 2, y: this.y + this.h * .4, dx: ax, dy: ay, t: 0, len: 0, max: 430, target: null, anchor: null, state: 'fire' };
    G.audio.sfx('pull');
    return true;
  }
  raiseShield(G, b) {
    if (this.shielded) return this.releaseShield(G);
    this.pay(b); this.cds[b.id] = b.cd;
    this.shielded = true; this.shieldT = 1.9; this.absorbed = [];
    G.audio.sfx('shield');
    G.particles.ring(this.x + this.w / 2, this.y + this.h / 2, 20, '#6ee7a8', .5);
    return true;
  }
  releaseShield(G) {
    this.shielded = false;
    if (this.absorbed.length) {
      const n = this.absorbed.length;
      const dir = this.facing;
      const p = new Projectile({
        x: this.x + this.w / 2 + dir * 16, y: this.y + this.h * .45, vx: dir * 900, vy: 0,
        kind: 'reflected', dmg: 3 + n * 2, owner: 'player', life: 1.4, pierce: 99, knock: 420, scale: 1 + n * .22, ghost: true,
        trail: { color: '#fff3d0', life: .34, size: .8 },
      });
      G.projectiles.push(p);
      G.audio.sfx('reflect'); G.fx.shake(6 + n * 2); G.fx.stop(.05);
      G.fx.text(this.x + this.w / 2, this.y - 26, 'REFLECT ×' + n, { color: '#fff3d0', size: 20, crit: true });
      G.stats.reflects = (G.stats.reflects || 0) + 1;
    } else G.audio.sfx('ui');
    this.absorbed = [];
    return true;
  }
  absorb(G, power = 1) {
    if (this.absorbed.length < 4) this.absorbed.push(power);
    G.boss?.notifyAbsorb?.(G);
    this.shieldT = Math.min(this.shieldT + .35, 2.4);
    G.audio.sfx('reflect'); G.fx.stop(.045); G.fx.shake(4);
    G.particles.burst(this.x + this.w / 2 + this.facing * 16, this.y + this.h * .45, 14, { color: ['#6ee7a8', '#fff3d0'], spd: 220, size: 3.4, life: .4 });
    this.addBhakti(7);
    G.fx.text(this.x + this.w / 2, this.y - 20, 'ABSORB', { color: '#6ee7a8', size: 16, life: .6 });
  }
  activateFocus(G, b) {
    this.pay(b); this.cds[b.id] = b.cd;
    this.focusT = 3.4;
    G.audio.sfx('timeslow');
    G.fx.ripple(this.x + this.w / 2, this.y + this.h / 2, '#8fd3ff', 560, .9);
    G.particles.ring(this.x + this.w / 2, this.y + this.h / 2, 24, '#8fd3ff', .8);
    G.hud?.toast?.('Time bends to devotion', '❂');
    return true;
  }
  activatePhase(G, b) {
    this.pay(b); this.cds[b.id] = b.cd;
    this.phasing = true; this.phaseT = 1.7; this.invuln = Math.max(this.invuln, 1.7);
    G.audio.sfx('phase');
    G.particles.burst(this.x + this.w / 2, this.y + this.h / 2, 24, { color: ['#a0f0ff', '#fff'], spd: 170, size: 4, life: .6 });
    return true;
  }
  useSurge(G) {
    if (this.bhakti < this.maxBhakti || this.surge > 0) return false;
    this.bhakti = 0; this.surge = 9;
    this.hp = clamp(this.hp + 1, 0, this.maxHp);
    G.audio.sfx('boon'); G.fx.flash('bless'); G.fx.shake(16); G.fx.stop(.14);
    G.fx.ripple(this.x + this.w / 2, this.y + this.h / 2, '#ffe6a3', 900, 1.2);
    for (let i = 0; i < 3; i++) G.particles.ring(this.x + this.w / 2, this.y + this.h / 2, 20 + i * 12, '#ffe6a3', .9 + i * .2);
    G.particles.confetti(this.x + this.w / 2, this.y, 60);
    G.hud?.toast?.('SIDDHI SURGE — divine power unleashed', 'ॐ', 'gold');
    return true;
  }

  /* -------------------------------- update ------------------------------- */
  update(dt, G) {
    const input = G.input;
    this.animT += dt;
    if (this.dead) { this.deathT += dt; this.vy += GRAV * dt * .4; this.y += this.vy * dt; return; }

    // timers
    this.invuln = Math.max(0, this.invuln - dt);
    this.dodgeT = Math.max(0, this.dodgeT - dt);
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    this.comboTimer = Math.max(0, this.comboTimer - dt);
    this.tailWhip = Math.max(0, this.tailWhip - dt * 3.4);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.healGlow = Math.max(0, this.healGlow - dt);
    this.blink -= dt; if (this.blink < -3) this.blink = rand(.1, .18) + rand(2, 5);
    for (const k of Object.keys(this.debuffs)) this.debuffs[k] = Math.max(0, this.debuffs[k] - dt);
    for (const k of Object.keys(this.cds)) this.cds[k] = Math.max(0, this.cds[k] - dt);
    if (this.surge > 0) {
      this.surge -= dt;
      if (rand(0, 1) < dt * 40) G.particles.add({ x: this.x + rand(0, this.w), y: this.y + rand(0, this.h), vx: rand(-30, 30), vy: rand(-130, -50), life: rand(.4, .9), size: rand(2, 5), color: '#ffe6a3', shape: 'dot', glowy: true, drag: 1 });
    }

    const rev = this.debuffs.reverse > 0;
    let ax = input.axis(rev);
    const speedMul = (this.debuffs.slow > 0 ? .55 : 1) * (this.inWater ? .55 : 1) * (this.surge > 0 ? 1.25 : 1) * (this.smoked ? .82 : 1);
    const spd = 336 * speedMul;
    const accel = this.onGround ? 3000 : 1900;

    if (this.chargeT > 0) {
      this.chargeT -= dt;
      this.vx = this.chargeDir * 1020; this.vy = 0;
      if (rand(0, 1) < dt * 60) G.particles.add({ x: this.x + this.w / 2 - this.chargeDir * rand(0, 24), y: this.y + rand(4, this.h), vx: -this.chargeDir * rand(60, 260), vy: rand(-50, 50), life: rand(.2, .5), size: rand(3, 7), color: ['#ffd166', '#fff3d0', '#ff8a1f'][rand(0, 3) | 0], shape: 'dot', glowy: true, drag: 2 });
      this.chargeHits?.(G);
    } else if (this.tether?.state === 'fly') {
      const t = this.tether;
      const a = Math.atan2(t.anchor.y - (this.y + this.h / 2), t.anchor.x - (this.x + this.w / 2));
      const sp = 1000;
      this.vx = Math.cos(a) * sp; this.vy = Math.sin(a) * sp;
      if (dist(this.x + this.w / 2, this.y + this.h / 2, t.anchor.x, t.anchor.y) < 34) {
        this.tether = null; this.vy = -320; this.vx *= .35; this.invuln = Math.max(this.invuln, .16);
        G.audio.sfx('jump');
        G.particles.ring(t.anchor.x, t.anchor.y, 16, '#ff9f6e', .45);
        t.anchor.pulse = 1;
      }
      if (rand(0, 1) < dt * 40) G.particles.trail(this.x + this.w / 2, this.y + this.h / 2, '#ff9f6e', 4, .3);
    } else if (this.dodgeT > 0) {
      this.vx = damp(this.vx, this.facing * 620, 6, dt);
      this.vy += GRAV * dt * .35;
    } else {
      if (ax !== 0) {
        this.vx = approach(this.vx, ax * spd, accel * dt);
        this.facing = ax;
        this.runT += dt * Math.abs(this.vx) * .045;
      } else {
        this.vx = approach(this.vx, 0, (this.onGround ? 3400 : 1200) * dt);
        this.runT += dt * 1.4;
      }
      this.vy += GRAV * dt * (this.vy > 0 ? 1.12 : 1);
      // sticky web
      if (this.standing && this.standing.kind === 'sticky') this.vx *= Math.pow(.02, dt);
      if (this.standing && this.standing.kind === 'quicksand') { this.vx *= Math.pow(.3, dt); this.y += 22 * dt; }
    }

    // jump
    if (input.pressed('jump')) { input.buf('jump', .15); }
    this.jumpBuf = input.consume('jump') ? .15 : Math.max(0, this.jumpBuf - dt);
    this.coyote = this.onGround ? .11 : Math.max(0, this.coyote - dt);
    if (this.jumpBuf > 0 && (this.coyote > 0 || this.jumpBuf > 0 && this.coyote > 0)) {
      if (this.coyote > 0) {
        this.vy = -742 * (this.inWater ? .6 : 1);
        this.jumpBuf = 0; this.coyote = 0; this.onGround = false; this.jumpHold = .22;
        this.squash = .74; this.stretch = 1.32;
        G.audio.sfx('jump');
        G.particles.dust(this.x + this.w / 2, this.y + this.h, 6, G.level.palette.groundTop);
      }
    }
    if (this.jumpHold > 0) {
      this.jumpHold -= dt;
      if (!input.isDown('jump')) { this.jumpHold = 0; if (this.vy < -200) this.vy *= .48; }
    }
    if (this.bouncePad) { this.vy = -1120; this.bouncePad = false; G.audio.sfx('dbljump'); this.squash = .62; this.stretch = 1.4; G.particles.ring(this.x + this.w / 2, this.y + this.h, 18, '#ff9fc4', .5); }

    // attack input
    if (this.comboStep >= this.comboLen) this.comboStep = 0;
    if (input.pressed('attack')) { input.buf('attack', .12); }
    /* Tail Cyclone: whirlwind strike hitting everything around (K) */
    if (input.pressed('cyclone') && this.cycT <= 0) {
      this.cycSpin = .5; this.cycT = Math.max(1.4, 3.2 - .25 * this.tier); this._cycHits = new Set();
      G.audio.sfx('swipe'); G.audio.sfx('dash');
      const mx = this.x + this.w / 2, my = this.y + this.h / 2;
      G.particles.burst(mx, my, 18, { color: '#ffd775', spd: 260, size: 3.4, life: .45 });
      G.fx.text(mx, this.y - 14, 'TAIL CYCLONE', { color: '#ffe6a3', size: 15, life: .8 });
    }
    if (this.cycT > 0) this.cycT -= dt;
    if (this.cycSpin > 0) {
      this.cycSpin -= dt;
      const mx = this.x + this.w / 2, my = this.y + this.h / 2;
      const r = 80 + 4 * this.tier;
      G.world.damageArea(G, { x: mx - r, y: my - r, w: r * 2, h: r * 2 },
        { dmg: 7 + this.tier, from: 'player', kx: 0, ky: -140, hitSet: this._cycHits, crit: true, armorBreak: true });
    }
    if (input.consume('attack')) this.attack(G);
    if (input.pressed('dodge')) this.doDodge(G);
    if (input.pressed('special')) this.useSpecial(G);
    if (input.pressed('swap')) this.cycle(1);
    for (let i = 1; i <= 8; i++) if (input.pressed('b' + i)) this.selectBoon(i - 1);
    if (input.pressed('up') && this.bhakti >= this.maxBhakti && input.isDown('down')) this.useSurge(G);

    // shield maintenance
    if (this.shielded) {
      this.shieldT -= dt;
      if (this.shieldT <= 0) this.releaseShield(G);
      if (rand(0, 1) < dt * 30) {
        const a = rand(0, TAU), r = 34;
        G.particles.add({ x: this.x + this.w / 2 + Math.cos(a) * r, y: this.y + this.h / 2 + Math.sin(a) * r * .9, vx: 0, vy: -14, life: .4, size: rand(2, 4), color: '#6ee7a8', shape: 'dot', glowy: true, drag: 1 });
      }
    }
    if (this.focusT > 0) this.focusT -= dt;
    if (this.phaseT > 0) { this.phaseT -= dt; if (this.phaseT <= 0) this.phasing = false; }
    if (this.sight && !this.canSustain(11 * dt)) this.sight = false;
    if (this.sight) this.drainBhakti(11 * dt);
    if (this.smoked && !this.canSustain(14 * dt)) this.smoked = false;
    if (this.smoked) {
      this.drainBhakti(14 * dt);
      if (rand(0, 1) < dt * 26) G.particles.add({ x: this.x + rand(-4, this.w + 4), y: this.y + rand(0, this.h), vx: rand(-22, 22), vy: rand(-52, -18), life: rand(.5, 1.2), size: rand(6, 15), sizeEnd: rand(16, 30), color: '#b9a7d6', shape: 'smoke', drag: .8, glowy: false });
    }

    // attack resolution
    if (this.atk) {
      const a = this.atk; a.t += dt;
      if (a.t > a.windup && a.t < a.windup + a.active) {
        const hb = this.attackBox();
        G.world.damageArea(G, hb, { dmg: a.fin ? 3 + this.tier : 2 + Math.floor(this.tier / 3), from: 'player', kx: this.facing * (a.fin ? 420 : 260), ky: a.fin ? -220 : -90, hitSet: a.hitSet, crit: a.fin, armorBreak: a.fin && this.tier >= 1 });
        if (!a.fired) { a.fired = true; }
      }
      if (a.t >= a.dur) { this.atk = null; this.comboTimer = .34; }
    }

    // boomerang lifecycle
    if (this.boomerang) {
      const bm = this.boomerang;
      bm.t += dt;
      if (!bm.ret && bm.t > .42) bm.ret = true;
      if (bm.ret) {
        const tx = this.x + this.w / 2, ty = this.y + this.h * .45;
        const a = Math.atan2(ty - bm.y, tx - bm.x);
        const sp = 900;
        bm.vx = lerp(bm.vx, Math.cos(a) * sp, 1 - Math.exp(-14 * dt));
        bm.vy = lerp(bm.vy, Math.sin(a) * sp, 1 - Math.exp(-14 * dt));
        if (dist(bm.x, bm.y, tx, ty) < 26) { this.boomerang = null; bm.dead = true; G.audio.sfx('ui'); G.particles.ring(tx, ty, 12, '#7fe3ff', .3); }
      }
      bm.gravity = 0;
      if (bm.dead) this.boomerang = null;
      // hits enemies & switches
      if (!bm.dead) {
        G.world.damageArea(G, { x: bm.x - bm.r, y: bm.y - bm.r, w: bm.r * 2, h: bm.r * 2 }, { dmg: 2, from: 'boomerang', kx: sign(bm.vx) * 200, ky: -80, hitCdMap: bm.hitCd, cd: .34, pierce: true });
        G.world.checkSwitchHit(G, bm.x, bm.y, bm.r);
      }
    }

    // tether lifecycle
    if (this.tether) {
      const t = this.tether; t.t += dt;
      if (t.state === 'fire') {
        t.len += 1500 * dt;
        const hx = t.x + t.dx * t.len, hy = t.y + t.dy * t.len;
        // anchor?
        for (const a of G.level.anchors) {
          if (dist(hx, hy, a.x, a.y) < 40) {
            t.state = 'fly'; t.anchor = a; G.audio.sfx('grapple');
            G.particles.ring(a.x, a.y, 16, '#ff9f6e', .5); a.pulse = 1;
            G.stats.grapples = (G.stats.grapples || 0) + 1;
            break;
          }
        }
        // enemy?
        if (t.state === 'fire') for (const e of G.enemies) {
          if (e.dead) continue;
          if (hx > e.x - 8 && hx < e.x + e.w + 8 && hy > e.y - 8 && hy < e.y + e.h + 8) {
            t.state = 'reel'; t.target = e; G.audio.sfx('grapple');
            if (e.shielded) { e.shielded = false; G.fx.text(e.x + e.w / 2, e.y - 12, 'SHIELD RIPPED', { color: '#ff9f6e', size: 16, crit: true }); G.particles.burst(e.x + e.w / 2, e.y + e.h / 2, 20, { color: ['#ffd166', '#fff'], spd: 260, size: 4, life: .6 }); }
            break;
          }
        }
        if (t.state === 'fire' && t.len > t.max) t.state = 'back';
        // wall stop
        if (t.state === 'fire') for (const s of G.level.solids) {
          if (!s.solid || s.kind === 'hidden') continue;
          if (hx > s.x && hx < s.x + s.w && hy > s.y && hy < s.y + s.h) { t.state = 'back'; break; }
        }
      } else if (t.state === 'reel') {
        const e = t.target;
        if (!e || e.dead) { t.state = 'back'; }
        else {
          const tx = this.x + this.w / 2, ty = this.y + this.h * .3;
          const a = Math.atan2(ty - (e.y + e.h / 2), tx - (e.x + e.w / 2));
          e.vx += Math.cos(a) * 2600 * dt; e.vy += Math.sin(a) * 2600 * dt;
          e.yanked = .5;
          if (dist(e.x + e.w / 2, e.y + e.h / 2, tx, ty) < 52) {
            G.world.hurtEnemy(G, e, { dmg: 2, from: 'pull', kx: this.facing * 320, ky: -180, crit: true });
            t.state = 'back';
          }
        }
      } else if (t.state === 'back') {
        t.len -= 2000 * dt;
        if (t.len <= 0) this.tether = null;
      }
    }

    /* ---- physics integration ---- */
    this.vy = clamp(this.vy, -1600, MAXFALL);
    const prevBottom = this.y + this.h;
    const world = G.world;
    this.wasGround = this.onGround;
    this.standing = null;
    this.onGround = false;
    this.inWater = false;
    this.bouncePad = false;

    const solids = world.activeSolids(G);
    // X
    this.x += this.vx * dt;
    for (const s of solids) {
      if (this.overlaps(s)) {
        if (this.vx > 0) this.x = s.x - this.w; else if (this.vx < 0) this.x = s.x + s.w;
        if (this.chargeT > 0) { world.onChargeHitWall(G, this, s); }
        else { this.vx = 0; }
      }
    }
    // Y
    this.y += this.vy * dt;
    for (const s of solids) {
      if (this.overlaps(s)) {
        if (this.vy > 0) {
          if (s.oneway && prevBottom > s.y + 8) continue;
          this.y = s.y - this.h; this.onGround = true; this.standing = s;
          if (s.kind === 'bounce') this.bouncePad = true;
          if (s.kind === 'crumble') world.startCrumble(G, s);
          if (s.kind === 'vanish') world.startVanish(G, s);
          if (s.move) { this.x += s.mvdx || 0; }
        } else if (this.vy < 0) { this.y = s.y + s.h; }
        this.vy = 0;
      } else if (s.oneway && this.vy > 0 && !input.isDown('down')) {
        if (prevBottom <= s.y + 4 && this.y + this.h >= s.y && this.x + this.w > s.x + 2 && this.x < s.x + s.w - 2) {
          this.y = s.y - this.h; this.vy = 0; this.onGround = true; this.standing = s;
          if (s.kind === 'crumble') world.startCrumble(G, s);
          if (s.kind === 'bounce') this.bouncePad = true;
        }
      }
    }
    if (this.onGround && !this.wasGround) {
      G.audio.sfx('land'); this.squash = 1.34; this.stretch = .72;
      G.particles.dust(this.x + this.w / 2, this.y + this.h, 8, G.level.palette.groundTop);
      if (this.vyPrev > 700) G.fx.shake(3);
    }
    this.vyPrev = this.vy;
    if (this.onGround && Math.abs(this.vx) > 40) {
      this.steps += dt * Math.abs(this.vx) * .06;
      if (this.steps > 1) { this.steps = 0; if (rand(0, 1) < .5) G.particles.dust(this.x + this.w / 2 - this.facing * 8, this.y + this.h, 1, G.level.palette.groundTop); }
    }
    // squash & stretch relax
    this.squash = damp(this.squash, 1, 12, dt);
    this.stretch = damp(this.stretch, 1, 12, dt);
    // world bounds
    this.x = clamp(this.x, 4, G.level.w - this.w - 4);
    if (this.y > 1800) this.hurt(G, 2, { src: 'pit', ky: -500, pierce: true, kx: 0 });
    if (this.y > 2200) { this.respawn(G); }
    // safe point tracking
    if (this.onGround && !G.world.inHazard(G, this.x + this.w / 2, this.y + this.h / 2)) this.lastSafe = { x: this.x, y: this.y };
    // stealth detection
    this.hidden = this.smoked;
    this.detected = Math.max(0, this.detected - dt);
    // passive bhakti
    this.addBhakti(dt * 1.6);
  }

  canSustain(cost) { return this.G.settings.difficulty === 'story' || this.bhakti > cost; }
  drainBhakti(v) { if (this.G.settings.difficulty !== 'story') this.bhakti = clamp(this.bhakti - v, 0, this.maxBhakti); }

  overlaps(s) {
    return this.x < s.x + s.w && this.x + this.w > s.x && this.y < s.y + s.h && this.y + this.h > s.y;
  }
  attackBox() {
    const a = this.atk;
    const reach = a.fin ? 54 + 2 * this.tier : 44;
    const h = a.fin ? 40 : 32;
    return { x: this.facing > 0 ? this.x + this.w - 8 : this.x + 8 - reach, y: this.y + this.h / 2 - h / 2 - 2, w: reach, h };
  }
  chargeHits(G) {
    if (!this._chargeHitSet) this._chargeHitSet = new Set();
    if (this.chargeT <= 0) { this._chargeHitSet = null; return; }
    const box = { x: this.x - 8, y: this.y - 4, w: this.w + 16, h: this.h + 8 };
    G.world.damageArea(G, box, { dmg: 3, from: 'charge', kx: this.chargeDir * 520, ky: -200, hitSet: this._chargeHitSet, armorBreak: true, crit: true });
  }
  modakVitals(G) {   // sweets grown vitality: +1 max heart per 3, shield pip per 4
    const diff = G.settings?.difficulty;
    const base = diff === 'story' ? 6 : diff === 'dharma' ? 4 : 5;
    this.maxHp = base + Math.min(4, Math.floor((G.run?.modaks || 0) / 3));
    this.shieldPips = Math.min(3, Math.floor((G.run?.modaks || 0) / 4));
  }
  respawn(G) {
    this.modakVitals(G);
    this.dead = false; this.hp = this.maxHp; this.invuln = 1.6;
    const cp = G.world.checkpoint || this.lastSafe;
    this.x = cp.x; this.y = cp.y - this.h; this.vx = 0; this.vy = 0;
    this.sight = false; this.smoked = false; this.phasing = false; this.shielded = false; this.tether = null;
  }
  fullReset(G) {
    this.modakVitals(G);
    this.hp = this.maxHp; this.bhakti = Math.max(this.bhakti, 30);
    this.invuln = 1; this.dead = false;
    for (const k of Object.keys(this.debuffs)) this.debuffs[k] = 0;
    this.focusT = 0; this.chargeT = 0; this.phaseT = 0; this.shieldT = 0; this.absorbed = [];
  }

  /* --------------------------------- draw -------------------------------- */
  draw(ctx, cam, t, G) {
    const cx = this.x + this.w / 2 - cam.cx;
    const cy = this.y + this.h - cam.cy;
    if (this.cycSpin > 0) {
      const pr = (.5 - this.cycSpin) / .5, ry = cy - this.h / 2;
      ctx.save();
      ctx.globalAlpha = .85 * (1 - pr * .5);
      ctx.strokeStyle = '#ffd775'; ctx.lineWidth = 5; ctx.shadowColor = '#ff9a2f'; ctx.shadowBlur = 18;
      ctx.beginPath(); ctx.arc(cx, ry, 62 + pr * 26, pr * 9, pr * 9 + 4.2); ctx.stroke();
      ctx.strokeStyle = '#fff3d0'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(cx, ry, 48 + pr * 30, -pr * 11, -pr * 11 + 3.4); ctx.stroke();
      ctx.restore();
    }
    if (this.dead) {
      ctx.save(); ctx.globalAlpha = clamp(1 - this.deathT * .9, 0, 1);
      ctx.translate(cx, cy); ctx.rotate(this.deathT * 3);
      this.drawBody(ctx, t, G, true);
      ctx.restore(); return;
    }
    const flick = this.invuln > 0 && Math.floor(t * 26) % 2 === 0;
    ctx.save();
    ctx.translate(cx, cy);
    // shadow
    ctx.save(); ctx.globalAlpha = .34; ctx.fillStyle = '#000';
    const sh = this.onGround ? 1 : clamp(1 - Math.abs(this.vy) / 900, .35, 1);
    ellipse(ctx, 0, 2, 15 * sh, 5 * sh); ctx.fill(); ctx.restore();

    ctx.scale(this.facing * this.squash, this.stretch);
    if (flick) ctx.globalAlpha = .45;
    if (this.phasing) ctx.globalAlpha = .42;
    if (this.smoked) ctx.globalAlpha = .5;

    // aura
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, 0, -16, 30, '#ffd9a0', .1);          // ever-present diya aura: he must never vanish into a dark biome
    ctx.restore();
    ctx.save();
    if (this.surge > 0) { ctx.globalCompositeOperation = 'lighter'; glow(ctx, 0, -18, 62 + Math.sin(t * 8) * 6, '#ffe6a3', .55); }
    else if (this.bhakti >= this.maxBhakti) { ctx.globalCompositeOperation = 'lighter'; glow(ctx, 0, -18, 40 + Math.sin(t * 3) * 4, '#ffd775', .22); }
    if (this.sight) { ctx.globalCompositeOperation = 'lighter'; glow(ctx, 0, -26, 34, '#c792ff', .3); }
    ctx.restore();

    this.drawBody(ctx, t, G, false);

    if (this.shielded) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const n = this.absorbed.length;
      const r = 34 + Math.sin(t * 7) * 2 + n * 2;
      glow(ctx, 0, -18, r * 1.7, '#6ee7a8', .3);
      ctx.strokeStyle = rgba('#a8ffdc', .85); ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(0, -18, r, 0, TAU); ctx.stroke();
      ctx.strokeStyle = rgba('#fff', .4); ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(0, -18, r - 4 - i * 4, t * 2 + i, t * 2 + i + 1.6); ctx.stroke(); }
      for (let i = 0; i < n; i++) {
        const a = t * 3 + i / Math.max(1, n) * TAU;
        ctx.fillStyle = '#fff3d0'; starPath(ctx, Math.cos(a) * r * .72, -18 + Math.sin(a) * r * .72, 4, 5, 2); ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();

    // charge streaks
    if (this.chargeT > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 1; i <= 5; i++) {
        ctx.globalAlpha = .3 - i * .05;
        glow(ctx, cx - this.chargeDir * i * 16, cy - 18, 26, '#ffd166', .5);
      }
      ctx.restore();
    }
    // tether
    if (this.tether) {
      const tt = this.tether;
      const hx = tt.x + tt.dx * tt.len - cam.cx, hy = tt.y + tt.dy * tt.len - cam.cy;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba('#ff9f6e', .9); ctx.lineWidth = 3.4;
      ctx.beginPath(); ctx.moveTo(cx, cy - 14);
      const tx = tt.state === 'reel' && tt.target ? tt.target.x + tt.target.w / 2 - cam.cx : hx;
      const ty = tt.state === 'reel' && tt.target ? tt.target.y + tt.target.h / 2 - cam.cy : hy;
      ctx.quadraticCurveTo((cx + tx) / 2, (cy + ty) / 2 - 22, tx, ty); ctx.stroke();
      ctx.strokeStyle = rgba('#fff3d0', .8); ctx.lineWidth = 1.3; ctx.stroke();
      glow(ctx, tx, ty, 22, '#ff9f6e', .5);
      ctx.restore();
    }
    // hit flash overlay
    if (this.hitFlash > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = this.hitFlash * 1.6;
      glow(ctx, cx, cy - 18, 40, '#ff5a7a', .6); ctx.restore();
    }
    if (this.healGlow > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = this.healGlow;
      glow(ctx, cx, cy - 18, 52, '#ff9fb0', .5); ctx.restore();
    }
  }

  drawBody(ctx, t, G, dead) {
    const running = this.onGround && Math.abs(this.vx) > 40 && this.chargeT <= 0;
    const air = !this.onGround;
    const bob = running ? Math.sin(this.runT * 2) * 1.6 : Math.sin(t * 2.4) * .9;
    const atk = this.atk;
    const atkK = atk ? clamp((atk.t - atk.windup) / atk.active, 0, 1) : 0;
    const lean = clamp(this.vx / 700, -.4, .4) + (this.chargeT > 0 ? .3 * this.chargeDir * this.facing : 0);

    ctx.save();
    ctx.rotate(lean * .3);
    ctx.translate(0, bob);

    const fur = this.smoked ? '#7a6a92' : '#9a8878';
    const furD = this.smoked ? '#4e4260' : '#6f6053';
    const belly = this.smoked ? '#a294bb' : '#d8c9b4';
    const earIn = '#e0909a';

    /* --- tail --- */
    const whip = this.tailWhip;
    const tailA = atk ? lerp(-2.1, 1.5, atkK) * (atk.fin ? 1.2 : 1) : Math.sin(t * 3 + this.runT) * .35 + (running ? Math.sin(this.runT * 2) * .3 : 0);
    ctx.save();
    ctx.strokeStyle = '#c9a08a'; ctx.lineWidth = 3.6; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-9, -8);
    const tx1 = -20 - whip * 4, ty1 = -12 + Math.sin(tailA) * 8;
    const tx2 = -26 + Math.cos(tailA) * (10 + whip * 26), ty2 = -18 + Math.sin(tailA) * (18 + whip * 10);
    ctx.bezierCurveTo(tx1, ty1, tx1 - 6, ty2, tx2, ty2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,230,210,.5)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.restore();
    // attack arc
    if (atk && atk.t > atk.windup - .04 && atk.t < atk.windup + atk.active + .05) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const k = atkK;
      const r0 = 26, r1 = 50 + (atk.fin ? 12 : 0);
      const a0 = -1.5 + k * 2.2, a1 = a0 + .9;
      const g = ctx.createRadialGradient(6, -18, r0 * .4, 6, -18, r1);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(.6, rgba(atk.fin ? '#ffd166' : '#eaf6ff', .55 * (1 - k * .5)));
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(6, -18, r1, a0, a1); ctx.arc(6, -18, r0, a1, a0, true); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = rgba('#ffffff', .8 * (1 - k)); ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(6, -18, r1 - 3, a0, a1); ctx.stroke();
      ctx.restore();
    }

    /* --- legs --- */
    ctx.fillStyle = furD;
    const legSwing = running ? Math.sin(this.runT * 2) * 5 : (air ? 3 : 0);
    for (const s of [-1, 1]) {
      const lx = s * 6 + (s > 0 ? legSwing : -legSwing) * .5;
      ctx.beginPath(); ctx.ellipse(lx, -2.5, 4.6, 3.6, s * .2, 0, TAU); ctx.fill();
    }
    if (air) { ctx.beginPath(); ctx.ellipse(-4, -5, 4.2, 3.2, -.3, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(6, -6, 4.2, 3.2, .3, 0, TAU); ctx.fill(); }

    /* --- body --- */
    const bodyY = -14;
    const g = ctx.createLinearGradient(0, bodyY - 12, 0, bodyY + 12);
    g.addColorStop(0, fur); g.addColorStop(1, furD);
    ctx.fillStyle = g;
    ellipse(ctx, 0, bodyY, 12.5, 11.5, 0); ctx.fill();
    ctx.fillStyle = belly;
    ellipse(ctx, 2.5, bodyY + 3, 8, 7.5, 0); ctx.fill();
    // sacred thread
    ctx.strokeStyle = '#ffe6a3'; ctx.lineWidth = 1.5; ctx.globalAlpha = .9;
    ctx.beginPath(); ctx.moveTo(-7, bodyY - 8); ctx.quadraticCurveTo(2, bodyY + 2, 8, bodyY + 8); ctx.stroke();
    ctx.globalAlpha = 1;

    /* --- arms --- */
    ctx.fillStyle = furD;
    const armSwing = running ? Math.sin(this.runT * 2 + Math.PI) * 4 : 0;
    ctx.beginPath(); ctx.ellipse(8 + armSwing * .4, bodyY + 2, 3.4, 5, .5 + armSwing * .04, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-8 - armSwing * .4, bodyY + 2, 3.4, 5, -.5 - armSwing * .04, 0, TAU); ctx.fill();

    /* --- head --- */
    const headY = -26;
    ctx.save();
    ctx.translate(2, headY);
    ctx.rotate(lean * .2 + (air ? .12 : 0));
    // ears
    for (const s of [-1, 1]) {
      ctx.save(); ctx.translate(s * 7.4, -6.2); ctx.rotate(s * (.35 + Math.sin(t * 4 + s) * .05));
      ctx.fillStyle = fur; ellipse(ctx, 0, 0, 7.6, 7.2); ctx.fill();
      ctx.fillStyle = earIn; ellipse(ctx, s * .8, .6, 4.6, 4.4); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1; ellipse(ctx, 0, 0, 7.6, 7.2); ctx.stroke();
      ctx.restore();
    }
    // skull
    const hg = ctx.createLinearGradient(0, -10, 0, 10);
    hg.addColorStop(0, fur); hg.addColorStop(1, furD);
    ctx.fillStyle = hg;
    ellipse(ctx, 0, 0, 9.6, 8.8); ctx.fill();
    // snout
    ctx.fillStyle = belly;
    ctx.beginPath(); ctx.moveTo(4, -1); ctx.quadraticCurveTo(15, 1.4, 14.5, 4.6); ctx.quadraticCurveTo(12, 7.4, 4, 6.4); ctx.closePath(); ctx.fill();
    // nose
    ctx.fillStyle = '#e0909a'; ellipse(ctx, 14.2, 3.2, 2.5, 2.1); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.6)'; ellipse(ctx, 13.6, 2.5, .9, .7); ctx.fill();
    // whiskers
    ctx.strokeStyle = 'rgba(255,245,230,.65)'; ctx.lineWidth = .9;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath(); ctx.moveTo(11, 3.4);
      ctx.quadraticCurveTo(18, 3 + i * 3.2, 23, 2.4 + i * 4.6 + Math.sin(t * 5 + i) * .6); ctx.stroke();
    }
    // eye
    const blink = this.blink > 0 && this.blink < .18;
    ctx.fillStyle = '#1a1020';
    if (blink || dead) {
      ctx.strokeStyle = '#1a1020'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(4.2, -1.4); ctx.lineTo(9.4, -1.4); ctx.stroke();
    } else {
      ellipse(ctx, 6.8, -1.8, 3.1, 3.4); ctx.fill();
      const eyeGlow = this.surge > 0 ? '#ffe6a3' : this.sight ? '#c792ff' : this.smoked ? '#b9a7d6' : '#fff';
      ctx.fillStyle = eyeGlow; ellipse(ctx, 7.9, -2.8, 1.25, 1.4); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.55)'; ellipse(ctx, 6.0, -.6, .8, .9); ctx.fill();
      if (this.surge > 0 || this.bhakti >= this.maxBhakti) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, 6.8, -1.8, 10, '#ffe6a3', .6); ctx.restore();
      }
    }
    // third eye (true sight)
    if (this.sight) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = '#e0b8ff'; ellipse(ctx, 1.2, -6.4, 2.2, 3.1); ctx.fill();
      ctx.fillStyle = '#2a1040'; ellipse(ctx, 1.2, -6.4, 1, 1.7); ctx.fill();
      glow(ctx, 1.2, -6.4, 14, '#c792ff', .8);
      ctx.restore();
    }
    // tilak
    ctx.fillStyle = '#e0344a';
    ctx.beginPath(); ctx.moveTo(-.5, -7.6); ctx.lineTo(1.6, -4.2); ctx.lineTo(-2.4, -4.2); ctx.closePath(); ctx.fill();
    // tiny crown when surging
    if (this.surge > 0) {
      ctx.fillStyle = '#ffe6a3';
      ctx.beginPath(); ctx.moveTo(-6, -9); ctx.lineTo(-4, -14); ctx.lineTo(-2, -10); ctx.lineTo(0, -15); ctx.lineTo(2, -10); ctx.lineTo(4, -14); ctx.lineTo(6, -9); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    ctx.restore();

    // dodge after-image
    if (this.dodgeT > .18) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .3;
      glow(ctx, -this.facing * 14, -18, 26, '#cfe0ff', .5); ctx.restore();
    }
  }
}
