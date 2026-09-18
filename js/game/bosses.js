/* ===========================================================================
   game/bosses.js — the nine Asuras. Shared state machine + nine bespoke fights.
   =========================================================================== */
import { TAU, clamp, lerp, rand, randInt, pick, sign, dist, rgba, glow, ellipse, starPath, roundRect, aabb, chance } from '../core/utils.js';
import { Projectile, Pickup } from './entities.js';
import { Enemy } from './enemies.js';
import { BOSSES } from '../data/lore.js';
import { BOONS } from '../data/boons.js';

/* ============================== BASE CLASS ============================== */
export class Boss {
  constructor(G, day, x, y) {
    this.G = G; this.day = day; this.meta = BOSSES[day - 1];
    const s = this.meta.size;
    this.w = 132 * s; this.h = 148 * s;
    this.x = x - this.w / 2; this.y = y - this.h;
    this.vx = 0; this.vy = 0; this.facing = -1;
    const dm = G.settings.difficulty === 'story' ? .35 : G.settings.difficulty === 'dharma' ? 1.15 : .8;
    this.hp = Math.round(this.meta.hp * dm); this.maxHp = this.hp;
    this.phase = 1; this.maxPhase = this.meta.phases;
    this.state = 'intro'; this.st = 0; this.t = 0;
    this.dead = false; this.dying = 0;
    this.invuln = 1.6; this.hitFlash = 0; this.onGround = false;
    this.atk = null; this.cd = 1.4; this.rage = 0; this.armor = false;
    this.ghost = 0; this.scale = 1; this.bob = 0;
    this.nodes = []; this.cueT = 0;
    this.flying = false;
    G.audio.setMode('boss');
    G.audio.setIntensity(.7);
  }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  get hitRect() { return { x: this.x + this.w * .12, y: this.y + this.h * .06, w: this.w * .76, h: this.h * .9 }; }
  arena(G) { const a = G.world.data.bossArena; return { l: a.x + 30, r: a.x + a.w - 30, floor: a.y }; }

  hurt(G, dmg = 1, o = {}) {
    if (this.dead || this.state === 'intro' || this.state === 'parashu') return false;
    if (this.invuln > 0) {
      G.particles.spark(o.x ?? this.cx, o.y ?? this.cy, 8, '#ffffff', 240);
      if (!this._immuneCue || G.time - this._immuneCue > 2.4) {
        this._immuneCue = G.time;
        G.fx.text(this.cx, this.y - 14, this.immuneText || 'INVULNERABLE', { color: '#ffd0d0', size: 18, life: 1 });
        G.audio.sfx('error');
      }
      return false;
    }
    if (this.armor && !o.armorBreak) {
      G.particles.spark(this.cx + (o.kx > 0 ? -20 : 20), this.cy, 12, '#e8c25a', 320);
      G.fx.text(this.cx, this.y - 12, 'ARMOUR', { color: '#e8c25a', size: 17, life: .7 });
      G.audio.sfx('error'); G.fx.shake(3);
      return false;
    }
    let d = dmg;
    if (G.player.surge > 0) d = Math.ceil(d * 1.7);
    if (G.player.sight) d = Math.ceil(d * 1.25);
    if (o.crit) d = Math.ceil(d * 1.4);
    this.hp -= d;
    this.hitFlash = .18;
    this.rage = clamp(this.rage + .06, 0, 1);
    G.audio.sfx(o.crit ? 'hitCrit' : 'bossHit');
    G.fx.stop(o.crit ? .07 : .04);
    G.fx.shake(o.crit ? 5 : 3);
    G.particles.burst(this.cx + rand(-24, 24), this.cy + rand(-30, 30), o.crit ? 16 : 9, { color: [this.meta.color, '#fff3d0'], spd: o.crit ? 330 : 220, size: o.crit ? 5 : 3.4, life: .45 });
    G.fx.text(this.cx + rand(-26, 26), this.y + rand(-6, 20), String(d), { color: o.crit ? '#ffd166' : '#fff3d0', size: o.crit ? 26 : 18, crit: !!o.crit, life: .6 });
    G.run.combo = Math.min(99, (G.run.combo || 0) + 1); G.run.comboT = 2.6;
    G.hud?.setCombo?.(G.run.combo);
    G.player.addBhakti(o.crit ? 6 : 3.2);
    G.run.bossDamage = (G.run.bossDamage || 0) + d;
    this.onHurt?.(G, d, o);
    // phase transitions
    const th = 1 - this.phase / this.maxPhase;
    if (this.phase < this.maxPhase && this.hp <= this.maxHp * th) this.nextPhase(G);
    if (this.hp <= 0) this.beginDeath(G);
    return true;
  }
  nextPhase(G) {
    this.phase++;
    this.invuln = 1.5; this.atk = null; this.cd = 1.1;
    this.state = 'transition'; this.st = 0;
    G.audio.sfx('roar'); G.fx.shake(22); G.fx.flash('hit'); G.fx.stop(.16);
    G.fx.ripple(this.cx, this.cy, this.meta.color, 700, 1);
    for (let i = 0; i < 3; i++) G.particles.ring(this.cx, this.cy, 40 + i * 26, this.meta.color, .8 + i * .2);
    G.particles.burst(this.cx, this.cy, 70, { color: [this.meta.color, '#fff3d0', this.meta.color2], spd: 460, size: 6, life: 1.2, gravity: 300 });
    // clear hostile projectiles so the phase change reads cleanly
    for (const p of G.projectiles) if (p.owner === 'enemy') p.dead = true;
    G.audio.setIntensity(clamp(.7 + this.phase * .07, 0, 1));
    this.onPhase?.(G);
    G.hud?.bossPhase?.(this.phase, this.maxPhase, this.phaseText?.());
    G.hud?.bossCue?.(this.phaseCue?.() || `PHASE ${this.phase}`, this.phaseSub?.() || '');
  }
  beginDeath(G) {
    if (this.dead) return;
    this.dead = true; this.state = 'dying'; this.dying = 0; this.atk = null;
    G.audio.sfx('roar'); G.audio.setMode('silence');
    G.fx.shake(26); G.fx.stop(.4);
    G.hud?.hideBoss?.();
    for (const p of G.projectiles) if (p.owner === 'enemy') p.dead = true;
    G.enemies.length = 0;
    this.onDeath?.(G);
  }

  /* --------------------------- attack machinery -------------------------- */
  setAttack(name, cfg) {
    this.atk = Object.assign({ name, windup: .5, active: .4, recover: .7, tick: .12, phase: 'w', _tick: 0, next: .7 }, cfg);
    this.atk.recover *= 1.25;   // longer punish windows after every attack
    this.st = 0;
    this.atkName = name;
  }
  runAttack(dt, G) {
    const a = this.atk; if (!a) return;
    this.st += dt;
    if (a.phase === 'w') {
      if (this.st >= a.windup) { a.phase = 'a'; this.st = 0; a._tick = a.tick; a.onStart?.(G); }
    } else if (a.phase === 'a') {
      a._tick += dt;
      if (a.onActive && a._tick >= a.tick) { a._tick = 0; a.onActive(G); }
      if (this.st >= a.active) { a.phase = 'r'; this.st = 0; a.onEnd?.(G); }
    } else if (this.st >= a.recover) { this.atk = null; this.cd = (a.next ?? rand(.9, 1.9)) * (this.G?.settings?.difficulty === 'story' ? 1.45 : 1); }
  }
  get windupK() { return this.atk && this.atk.phase === 'w' ? clamp(this.st / this.atk.windup, 0, 1) : 0; }
  get activeK() { return this.atk && this.atk.phase === 'a' ? clamp(this.st / this.atk.active, 0, 1) : 0; }

  fire(G, o) {
    const p = new Projectile(Object.assign({ owner: 'enemy', life: 5, spin: 6 }, o));
    G.projectiles.push(p);
    G.audio.sfx(o.big ? 'shootBig' : 'shoot');
    G.particles.burst(p.x, p.y, 6, { color: p.color || this.meta.color, spd: 110, size: 3, life: .3 });
    return p;
  }
  aim(G, spread = 0, from = null) {
    const p = G.player;
    const ox = from ? from.x : this.cx, oy = from ? from.y : this.cy;
    return Math.atan2(p.y + p.h / 2 - oy, p.x + p.w / 2 - ox) + spread;
  }
  shockwave(G, dir, dmg = 1, spd = 430, kind = 'orb', y = null) {
    this.fire(G, { x: this.cx + dir * 30, y: y ?? (this.y + this.h - 14), vx: dir * spd, vy: 0, kind, dmg, gravity: 0, ghost: true, life: 3.4, scale: 1.5 });
  }
  leap(G, tx, onLand) {
    this.vy = -980; this.vx = clamp((tx - this.cx) * 1.6, -620, 620);
    this.onGround = false;
    this._land = onLand;
  }
  physics(dt, G) {
    const A = this.arena(G);
    if (!this.flying) {
      this.vy += 2300 * dt;
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.vx *= Math.pow(.12, dt);
      const floor = A.floor - this.h;
      if (this.y >= floor) {
        if (!this.onGround && this.vy > 420) {
          G.fx.shake(9); G.audio.sfx('land');
          G.particles.dust(this.cx, A.floor, 14, G.level.palette.groundTop);
          this._land?.(G);
        }
        this.y = floor; this.vy = 0; this.onGround = true;
      } else this.onGround = false;
    } else {
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.vx *= Math.pow(.3, dt); this.vy *= Math.pow(.3, dt);
    }
    this.x = clamp(this.x, A.l - this.w * .4, A.r - this.w * .6);
  }
  moveToward(G, tx, spd, dt) {
    const d = tx - this.cx;
    this.vx = clamp(d * 3.2, -spd, spd);
    // throttled turning: circling to his back must actually be possible
    if (!this.atk && (!this._faceT || G.time - this._faceT > .8)) { this._faceT = G.time; this.facing = sign(d) || this.facing; }
  }

  /* -------------------------------- update ------------------------------- */
  update(dt, G) {
    this.t += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.rage = Math.max(0, this.rage - dt * .12);
    this.bob = Math.sin(this.t * 1.6) * 5;

    if (this.state === 'intro') {
      this.st += dt;
      this.physics(dt, G);
      if (rand(0, 1) < dt * 22) G.particles.add({ x: this.cx + rand(-this.w / 2, this.w / 2), y: this.y + rand(0, this.h), vx: rand(-30, 30), vy: rand(-90, -20), life: rand(.5, 1.2), size: rand(2, 5), color: this.meta.color, shape: 'dot', glowy: true, drag: 1 });
      if (this.st > 2.1) { this.state = 'fight'; this.st = 0; this.cd = .5; G.hud?.bossCue?.('FIGHT', this.meta.vice); }
      return;
    }
    if (this.state === 'dying') { this.dyingUpdate(dt, G); return; }
    if (this.state === 'parashu') { this.parashuUpdate(dt, G); return; }
    if (this.state === 'transition') {
      this.st += dt;
      this.physics(dt, G);
      if (rand(0, 1) < dt * 40) G.particles.burst(this.cx + rand(-40, 40), this.cy + rand(-50, 50), 3, { color: [this.meta.color, '#fff'], spd: 200, size: 4, life: .6 });
      if (this.st > 1.5) { this.state = 'fight'; this.st = 0; }
      return;
    }
    // fight
    this.st += dt;
    this.physics(dt, G);
    this.runAttack(dt, G);
    if (!this.atk) {
      this.cd -= dt * (1 + this.rage * .7);
      if (this.cd <= 0) this.think(G, dt);
    }
    this.thinkAlways?.(G, dt);
    // touch damage
    const p = G.player;
    if (!p.dead && !p.phasing && aabb(this.hitRect, p) && this.touchDmg !== 0) {
      p.hurt(G, this.touchDmg ?? 1, { sx: this.cx, kx: sign(p.x - this.cx) * 420, ky: -330 });
    }
  }
  dyingUpdate(dt, G) {
    this.dying += dt;
    this.vy += 900 * dt; this.y += this.vy * dt * .3;
    if (rand(0, 1) < dt * 26) {
      const a = rand(0, TAU), r = rand(10, this.w * .6);
      G.particles.burst(this.cx + Math.cos(a) * r, this.cy + Math.sin(a) * r * .7, 12, { color: [this.meta.color, '#fff3d0', '#ffd775'], spd: 300, size: 5, life: .9, gravity: 200 });
      G.fx.shake(4);
    }
    if (this.dying > .5 && !this._boom) {
      this._boom = true;
      G.audio.sfx('explosion'); G.fx.flash('bless'); G.fx.shake(30); G.fx.stop(.3);
      G.particles.burst(this.cx, this.cy, 160, { color: [this.meta.color, '#fff3d0', '#ffd775', '#ffffff'], spd: 620, size: 7, life: 1.8, gravity: 260 });
      for (let i = 0; i < 5; i++) G.particles.shockwave(this.cx, this.cy, 200 + i * 130, i % 2 ? '#fff3d0' : this.meta.color, .9 + i * .16);
      G.particles.confetti(this.cx, this.cy, 60);
    }
    if (this.dying > 2.6 && !this._done) { this._done = true; G.onBossDefeated?.(this); }
  }

  think(G, dt) { /* per boss */ }

  /* --------------------------------- draw -------------------------------- */
  draw(ctx, cam, t, G) {
    if (this.dead && this.dying > 2.2) return;
    const x = this.cx - cam.cx, y = this.y + this.h - cam.cy;
    ctx.save();
    // shadow
    const A = this.arena(G);
    ctx.save(); ctx.globalAlpha = .34; ctx.fillStyle = '#000';
    const sk = clamp(1 - (A.floor - (this.y + this.h)) / 400, .3, 1);
    ellipse(ctx, x, A.floor - cam.cy, this.w * .42 * sk, 12 * sk); ctx.fill(); ctx.restore();

    const k = this.dead ? clamp(1 - this.dying / 2.2, 0, 1) : 1;
    ctx.globalAlpha = k;
    ctx.translate(x, y + this.bob * (this.flying ? 1 : .3));
    if (this.dead) { ctx.rotate(Math.sin(this.dying * 9) * .05); ctx.scale(1 + this.dying * .1, 1 - this.dying * .08); }
    ctx.scale(this.facing * this.scale, this.scale);
    // aura
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    glow(ctx, 0, -this.h * .5, this.w * (1.1 + this.rage * .5), this.meta.color, .18 + this.rage * .2 + (this.invuln > 0 ? .18 : 0));
    if (this.state === 'transition' || this.invuln > 0) {
      ctx.strokeStyle = rgba('#ffffff', .5 + Math.sin(t * 20) * .3); ctx.lineWidth = 3;
      ellipse(ctx, 0, -this.h * .5, this.w * .62, this.h * .62); ctx.stroke();
    }
    ctx.restore();
    // windup telegraph
    if (this.atk && this.atk.phase === 'w') {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const wk = this.windupK;
      glow(ctx, this.w * .3, -this.h * .55, 40 + wk * 90, '#fff3d0', .25 + wk * .4);
      ctx.strokeStyle = rgba('#ff5a5a', .3 + wk * .55); ctx.lineWidth = 2 + wk * 3;
      ctx.beginPath(); ctx.arc(0, -this.h * .5, this.w * .8 + wk * 26, 0, TAU * wk); ctx.stroke();
      ctx.restore();
    }
    const flash = this.hitFlash > 0;
    this.drawBody(ctx, t, G, flash);
    ctx.restore();
    // weak point under true sight
    if (G.player.sight && !this.dead && this.weak) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const wp = this.weak(G);
      glow(ctx, wp.x - cam.cx, wp.y - cam.cy, 34, '#ff5a7a', .55 + Math.sin(t * 8) * .2);
      ctx.strokeStyle = rgba('#ff5a7a', .9); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(wp.x - cam.cx, wp.y - cam.cy, 13 + Math.sin(t * 8) * 3, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    this.drawExtras?.(ctx, cam, t, G);
  }
}

/* ====================== shared demon-body painter ======================= */
function demonBody(ctx, b, t, flash) {
  const W = b.w, H = b.h;
  const col = flash ? '#ffffff' : b.color;
  const col2 = flash ? '#ffdada' : b.color2;
  const acc = flash ? '#ffffff' : b.accent;
  const breathe = Math.sin(t * 2.1) * .02 + 1;
  ctx.save();
  ctx.scale(breathe, 2 - breathe);
  // legs / base
  if (b.legs !== 0) {
    ctx.fillStyle = col2;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * W * .16, -H * .3);
      ctx.quadraticCurveTo(s * W * .4, -H * .16, s * W * .34, 0);
      ctx.lineTo(s * W * .1, 0);
      ctx.quadraticCurveTo(s * W * .12, -H * .16, s * W * .06, -H * .3);
      ctx.closePath(); ctx.fill();
    }
  }
  // torso
  const g = ctx.createLinearGradient(0, -H, 0, 0);
  g.addColorStop(0, col); g.addColorStop(.6, mix(col, col2, .5)); g.addColorStop(1, col2);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-W * .38, -H * .3);
  ctx.quadraticCurveTo(-W * .52, -H * .72, -W * .26, -H * .86);
  ctx.quadraticCurveTo(0, -H * .98, W * .26, -H * .86);
  ctx.quadraticCurveTo(W * .52, -H * .72, W * .38, -H * .3);
  ctx.quadraticCurveTo(0, -H * .16, -W * .38, -H * .3);
  ctx.closePath(); ctx.fill();
  // belly
  if (b.belly) {
    ctx.fillStyle = rgba(b.bellyColor || acc, b.bellyAlpha ?? .3);
    ellipse(ctx, 0, -H * .48, W * .3, H * .26); ctx.fill();
    if (b.bellyGlow) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, 0, -H * .48, W * .5, b.bellyColor || acc, .35 + Math.sin(t * 4) * .12); ctx.restore(); }
  }
  // arms
  if (b.arms) {
    ctx.strokeStyle = col2; ctx.lineWidth = W * .11; ctx.lineCap = 'round';
    for (const s of [-1, 1]) {
      const sw = Math.sin(t * 2 + (s > 0 ? 0 : 2)) * .2 + (b.armPose || 0) * s;
      ctx.beginPath();
      ctx.moveTo(s * W * .36, -H * .74);
      ctx.quadraticCurveTo(s * W * (.62 + sw * .2), -H * (.5 + sw * .2), s * W * (.56 + sw * .3), -H * (.18 - sw * .1));
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(s * W * (.56 + sw * .3), -H * (.18 - sw * .1), W * .09, 0, TAU); ctx.fill();
      // claws
      ctx.strokeStyle = acc; ctx.lineWidth = 2.4;
      for (let k = -1; k <= 1; k++) {
        ctx.beginPath();
        ctx.moveTo(s * W * (.56 + sw * .3), -H * (.18 - sw * .1));
        ctx.lineTo(s * W * (.56 + sw * .3) + s * 10, -H * (.18 - sw * .1) + k * 7 + 6);
        ctx.stroke();
      }
    }
  }
  // head
  const hy = -H * .94;
  ctx.fillStyle = col;
  ellipse(ctx, 0, hy, W * .26, H * .13); ctx.fill();
  // horns / crown
  if (b.horns) {
    ctx.fillStyle = acc;
    for (const s of [-1, 1]) for (let i = 0; i < b.horns; i++) {
      const a = -.4 - i * .34;
      ctx.save(); ctx.translate(s * W * .16, hy - H * .06); ctx.rotate(s * a);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(s * 8, -H * .12, s * 3, -H * (.17 + i * .04)); ctx.quadraticCurveTo(s * 2, -H * .09, -4, -2);
      ctx.closePath(); ctx.fill(); ctx.restore();
    }
  }
  if (b.crown) {
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.moveTo(-W * .26, hy - H * .07);
    for (let i = 0; i < 5; i++) {
      const px = -W * .26 + (i + .5) * (W * .52 / 5);
      ctx.lineTo(px, hy - H * (.15 + (i % 2 ? .04 : 0)));
      ctx.lineTo(-W * .26 + (i + 1) * (W * .52 / 5), hy - H * .07);
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e0344a'; ctx.beginPath(); ctx.arc(0, hy - H * .11, 4.5, 0, TAU); ctx.fill();
  }
  // eyes
  const n = b.eyes || 2;
  for (let i = 0; i < n; i++) {
    const ex = (i - (n - 1) / 2) * W * .13 + W * .06;
    const ey = hy - H * .01 + (i % 2 ? -3 : 0);
    ctx.fillStyle = '#12060c';
    ellipse(ctx, ex, ey, W * .055, H * .032); ctx.fill();
    ctx.fillStyle = b.eyeColor || '#ffe66b';
    const look = b.pupil ?? 0;
    ctx.beginPath(); ctx.arc(ex + look * 3, ey, W * .028, 0, TAU); ctx.fill();
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, ex, ey, W * .12, b.eyeColor || '#ffe66b', .35); ctx.restore();
  }
  // mouth
  ctx.fillStyle = '#1a0608';
  const mo = b.mouthOpen ?? .3;
  ctx.beginPath();
  ctx.moveTo(-W * .12, hy + H * .05);
  ctx.quadraticCurveTo(0, hy + H * (.05 + mo * .07), W * .12, hy + H * .05);
  ctx.quadraticCurveTo(0, hy + H * .045, -W * .12, hy + H * .05);
  ctx.fill();
  if (b.fangs) {
    ctx.fillStyle = '#fff';
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * W * .07, hy + H * .05); ctx.lineTo(s * W * .045, hy + H * .05); ctx.lineTo(s * W * .058, hy + H * .095); ctx.closePath(); ctx.fill(); }
  }
  ctx.restore();
}
function mix(a, b, t) {
  const p = (h) => { h = (h || '#000').replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); return [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0]; };
  const A = p(a), B = p(b);
  return `rgb(${Math.round(lerp(A[0], B[0], t))},${Math.round(lerp(A[1], B[1], t))},${Math.round(lerp(A[2], B[2], t))})`;
}

/* ========================= DAY 1 · MATSARASURA ========================== */
export class Matsurasura extends Boss {
  constructor(G, day, x, y) {
    super(G, day, x, y);
    this.flying = false; this.stolen = 0; this.gloat = 0;
    this.immuneText = 'HE IS GUARDED BY ENVY';
    this.eyeCount = 7;
  }
  weak(G) { return { x: this.cx, y: this.y + this.h * .38 }; }
  think(G) {
    const p = G.player, d = Math.abs(p.x - this.cx);
    const r = rand(0, 1);
    if (this.gloat > 0) return;
    if (this.phase >= 2 && r < .22) return this.atkGaze(G);
    if (r < .18 || this.stolen < 1) return this.atkSteal(G);
    if (d < 220 && r < .6) return this.atkVine(G);
    if (r < .82) return this.atkSpit(G);
    return this.atkSummon(G);
  }
  thinkAlways(G, dt) {
    if (this.gloat > 0) {
      this.gloat -= dt;
      if (rand(0, 1) < dt * 20) G.particles.add({ x: this.cx + rand(-40, 40), y: this.y + this.h * .4, vx: rand(-20, 20), vy: rand(-70, -20), life: .7, size: rand(2, 5), color: '#b6ff7a', shape: 'dot', glowy: true });
      if (this.gloat <= 0) this.invuln = 0;
    }
  }
  atkSpit(G) {
    this.setAttack('spit', {
      windup: .55, active: .5, recover: .7, tick: .16,
      onStart: () => { this.mouthOpen = 1; },
      onActive: (GG) => {
        const n = this.phase >= 3 ? 3 : this.phase >= 2 ? 2 : 1;
        for (let i = 0; i < n; i++) {
          const a = this.aim(GG, (i - (n - 1) / 2) * .22);
          this.fire(GG, { x: this.cx + Math.cos(a) * 40, y: this.y + this.h * .28, vx: Math.cos(a) * 420, vy: Math.sin(a) * 420, kind: 'acid', dmg: 1, gravity: 260, trail: { color: '#9dff5a', life: .3 } });
        }
      },
      onEnd: () => { this.mouthOpen = .3; },
    });
  }
  atkVine(G) {
    this.setAttack('vine', {
      windup: .62, active: .5, recover: .8, tick: .18,
      onActive: (GG) => {
        const dir = sign(GG.player.x - this.cx) || this.facing;
        GG.projectiles.push(new Projectile({ x: this.cx + dir * 30, y: GG.world.data.bossArena.y - 16, vx: dir * 470, vy: 0, kind: 'thornvine', dmg: 1, owner: 'enemy', life: 3, gravity: 0, ghost: true, color: '#7ee06b', shape: 'vine', r: 16, spin: 0 }));
        GG.audio.sfx('web');
      },
    });
  }
  atkSteal(G) {
    this.setAttack('steal', {
      windup: .7, active: 1.1, recover: .5, tick: .28,
      onStart: (GG) => {
        const A = this.arena(GG);
        for (let i = 0; i < 4; i++) {
          const mx = lerp(A.l + 60, A.r - 60, (i + .5) / 4);
          GG.pickups.push(new Pickup(mx, A.floor - 46, 'modak'));
        }
        GG.hud?.bossCue?.('HE COVETS YOUR LIGHT', 'grab the modaks before he does');
      },
      onActive: (GG) => {
        // inhale: pull pickups toward him
        for (const pk of GG.pickups) {
          if (pk.type !== 'modak' || pk.dead) continue;
          const a = Math.atan2(this.y + this.h * .4 - pk.y, this.cx - pk.x);
          const dd = dist(pk.x, pk.y, this.cx, this.y + this.h * .4);
          if (dd < 340) { pk.x += Math.cos(a) * 190 * .016; pk.y += Math.sin(a) * 190 * .016; pk.grounded = false; pk.vy = 0; }
          if (dd < 34) { pk.dead = true; this.stolen++; this.hp = Math.min(this.maxHp, this.hp + 8); this.scale += .02; this.growthFx(GG); }
        }
        const a2 = Math.atan2(this.y + this.h * .4 - (GG.player.y + 17), this.cx - (GG.player.x + 13));
        if (dist(this.cx, this.y + this.h * .4, GG.player.x + 13, GG.player.y + 17) < 250) {
          GG.player.vx += Math.cos(a2) * 260 * .016 * 60 * .016;
        }
      },
      onEnd: (GG) => {
        if (this.stolen >= 2) {
          this.gloat = 2.6; this.invuln = 0;
          GG.hud?.bossCue?.('HE GLOATS', 'strike now — envy exposed');
          GG.audio.sfx('roar');
        }
      },
      next: 1.1,
    });
  }
  growthFx(G) {
    G.audio.sfx('coin');
    G.particles.burst(this.cx, this.y + this.h * .4, 22, { color: ['#b6ff7a', '#ffd166'], spd: 240, size: 4, life: .7 });
    G.fx.text(this.cx, this.y - 10, 'DEVOUR', { color: '#b6ff7a', size: 20, crit: true });
  }
  atkGaze(G) {
    this.setAttack('gaze', {
      windup: .8, active: 1.6, recover: .9, tick: .1,
      onStart: (GG) => { GG.audio.sfx('laser'); this.gazeA = this.aim(GG); },
      onActive: (GG) => {
        this.gazeA = lerp(this.gazeA, this.aim(GG), .02);
        const len = 900;
        const ex = this.cx + Math.cos(this.gazeA) * 26, ey = this.y + this.h * .2;
        const bx = ex + Math.cos(this.gazeA) * len, by = ey + Math.sin(this.gazeA) * len;
        // beam damage
        const p = GG.player;
        const px = p.x + p.w / 2, py = p.y + p.h / 2;
        const t2 = clamp(((px - ex) * Math.cos(this.gazeA) + (py - ey) * Math.sin(this.gazeA)) / len, 0, 1);
        const cxp = ex + Math.cos(this.gazeA) * len * t2, cyp = ey + Math.sin(this.gazeA) * len * t2;
        if (dist(px, py, cxp, cyp) < 24) p.hurt(GG, 1, { sx: ex, kx: sign(px - ex) * 340, ky: -260 });
        if (rand(0, 1) < .6) GG.particles.add({ x: cxp, y: cyp, vx: rand(-40, 40), vy: rand(-40, 40), life: .3, size: rand(2, 5), color: '#b6ff7a', shape: 'dot', glowy: true });
        this.beam = { ex, ey, bx, by };
      },
      onEnd: () => { this.beam = null; },
      next: 1.2,
    });
  }
  atkSummon(G) {
    this.setAttack('summon', {
      windup: .6, active: .2, recover: .8,
      onStart: (GG) => {
        const n = this.phase >= 3 ? 3 : 2;
        for (let i = 0; i < n; i++) {
          const A = this.arena(GG);
          GG.enemies.push(new Enemy({ type: 'mimic', x: lerp(A.l, A.r, rand(.15, .85)), y: A.floor, kind: 'shade', scale: .85 }, GG));
        }
        GG.audio.sfx('smoke');
        GG.particles.burst(this.cx, this.cy, 30, { color: ['#8f6fd4', '#b6ff7a'], spd: 260, size: 5, life: .8 });
      },
    });
  }
  drawExtras(ctx, cam, t, G) {
    if (this.beam) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const a = this.beam;
      ctx.strokeStyle = rgba('#b6ff7a', .8); ctx.lineWidth = 12 + Math.sin(t * 30) * 3;
      ctx.beginPath(); ctx.moveTo(a.ex - cam.cx, a.ey - cam.cy); ctx.lineTo(a.bx - cam.cx, a.by - cam.cy); ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.stroke();
      ctx.restore();
    }
  }
  drawBody(ctx, t, G, flash) {
    const W = this.w, H = this.h;
    // dripping slime
    ctx.save(); ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 6; i++) {
      const dx = (i - 2.5) * W * .16;
      const dy = ((t * 60 + i * 40) % 90);
      ctx.fillStyle = rgba('#9dff5a', .5 - dy / 200);
      ellipse(ctx, dx, -H * .3 + dy, 3.4, 6); ctx.fill();
    }
    ctx.restore();
    demonBody(ctx, {
      w: W, h: H, color: '#5fbf5f', color2: '#173d1c', accent: '#b6ff7a', eyeColor: '#fff36b',
      eyes: 3, horns: 2, arms: true, legs: 2, fangs: true, mouthOpen: this.mouthOpen || .3, belly: true, bellyColor: '#b6ff7a', bellyAlpha: .18,
      pupil: sign(G.player.x - this.cx) * -this.facing, armPose: this.atk ? .4 : .1,
    }, t, flash);
    // extra envious eyes all over the body
    ctx.save();
    for (let i = 0; i < this.eyeCount; i++) {
      const a = i / this.eyeCount * TAU + t * .25;
      const ex = Math.cos(a) * W * .3, ey = -H * .55 + Math.sin(a) * H * .2;
      ctx.fillStyle = '#0d2a12'; ellipse(ctx, ex, ey, 7, 5.4); ctx.fill();
      ctx.fillStyle = '#fff36b'; ctx.beginPath(); ctx.arc(ex + Math.cos(a) * 2, ey, 2.6, 0, TAU); ctx.fill();
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, ex, ey, 14, '#fff36b', .3); ctx.restore();
    }
    ctx.restore();
    if (this.gloat > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      glow(ctx, 0, -H * .45, W * .8, '#ffd166', .3 + Math.sin(t * 9) * .12);
      ctx.restore();
    }
  }
}

/* =========================== DAY 2 · MADASURA =========================== */
export class Madasura extends Boss {
  constructor(G, day, x, y) {
    super(G, day, x, y);
    this.armor = true; this.touchDmg = 2;
    this.immuneText = 'HIS ARMOUR SCOFFS';
    this.banners = 0;
  }
  weak(G) { return { x: this.cx - this.facing * this.w * .3, y: this.y + this.h * .5 }; }
  onHurt(G, d, o) {
    const behind = (G.player.x + G.player.w / 2 - this.cx) * this.facing < 0;
    if (!behind && !this.armor) return;
  }
  hurt(G, dmg, o) {
    const armorUp = this.armor && !(this._armorDown > G.time);
    if (armorUp && !o.armorBreak) {
      const behind = (G.player.x + G.player.w / 2 - this.cx) * this.facing < 0;
      const recovering = !this.atk || this.atk.phase === 'r';   // armour drops its guard while resting
      if (!behind && !recovering) {
        G.particles.spark(this.cx + this.facing * this.w * .3, this.cy, 12, '#e8c25a', 320);
        if (!this._cue || G.time - this._cue > 3) {
          this._cue = G.time;
          G.fx.text(this.cx, this.y - 14, 'ARMOUR — SPIN (K) OR HIT HIS BACK', { color: '#e8c25a', size: 18, life: 1.1 });
          G.audio.sfx('error');
        }
        G.fx.shake(3);
        if (!this._toastT || G.time - this._toastT > 7) { this._toastT = G.time; G.hud?.toast?.('FRONT HITS BOUNCE — press K (Tail Cyclone) to crack his armour, or circle behind him', '🛡', 'gold', 4600); }
        return false;
      }
      dmg = Math.ceil(dmg * (behind ? 1.5 : .8));
    } else if (armorUp && o.armorBreak) {
      // every spin / finisher cracks the golden armour — three cracks shatter its guard
      this._cracks = (this._cracks || 0) + 1;
      G.audio.sfx('wallbreak'); G.fx.shake(9);
      G.particles.burst(this.cx, this.cy, 20, { color: ['#ffd166', '#fff3d0'], spd: 320, size: 5, life: .8, gravity: 550 });
      if (this._cracks >= 3) {
        this._cracks = 0; this._armorDown = G.time + 6;
        G.fx.text(this.cx, this.y - 18, 'ARMOUR SHATTERED — STRIKE NOW!', { color: '#ffd166', size: 21, life: 1.4, crit: true });
        G.hud?.bossCue?.('ARMOUR BROKEN', 'every hit lands full — pour it on');
      } else {
        G.fx.text(this.cx, this.y - 14, 'CRACK ' + this._cracks + '/3', { color: '#ffe9a8', size: 17, life: .9, crit: true });
      }
    }
    return super.hurt(G, dmg, o);
  }
  onPhase(G) {
    if (this.phase === 2) { this.summonBanners(G); }
    if (this.phase === 3) {
      this.armor = false; this.touchDmg = 2; this.scale = 1.06;
      G.hud?.bossCue?.('THE CROWN CRACKS', 'his pride is exposed — press the attack');
      G.audio.sfx('wallbreak');
      G.particles.burst(this.cx, this.y + 10, 60, { color: ['#ffd166', '#fff3d0'], spd: 420, size: 6, life: 1.2, gravity: 700 });
    }
  }
  summonBanners(G) {
    const A = this.arena(G);
    for (let i = 0; i < 3; i++) {
      const e = new Enemy({ type: 'shooter', x: lerp(A.l + 80, A.r - 80, i / 2), y: A.floor, kind: 'banner', turret: true, scale: 1.1 }, G);
      e.healer = true; e.hp = 10; e.maxHp = 10;
      G.enemies.push(e);
    }
    G.hud?.bossCue?.('BANNERS OF PRIDE', 'they feed his vanity — cut them down');
  }
  thinkAlways(G, dt) {
    let heal = 0;
    for (const e of G.enemies) if (e.healer && !e.dead) heal += 1.2 * dt;
    if (heal > 0) {
      this.hp = Math.min(this.maxHp * (1 - (this.phase - 1) / this.maxPhase + .02), this.hp + heal);
      if (rand(0, 1) < dt * 12) G.particles.add({ x: this.cx + rand(-60, 60), y: this.y + rand(0, this.h), vx: 0, vy: -60, life: .6, size: 3, color: '#e8c25a', shape: 'dot', glowy: true });
    }
  }
  think(G) {
    const p = G.player, d = Math.abs(p.x - this.cx), r = rand(0, 1);
    if (d > 300 && r < .38) return this.atkLeap(G);
    if (r < .3) return this.atkHammer(G);
    if (r < .55) return this.atkStomp(G);
    if (r < .78) return this.atkCrown(G);
    return this.atkWalk(G);
  }
  atkHammer(G) {
    this.setAttack('hammer', {
      windup: .8, active: .26, recover: 1.35, tick: .1,
      onStart: (GG) => { GG.audio.sfx('shootBig'); },
      onActive: (GG) => {
        if (this._slammed) return; this._slammed = true;
        const A = this.arena(GG);
        GG.fx.shake(16); GG.audio.sfx('explosion');
        GG.particles.dust(this.cx + this.facing * 90, A.floor, 26, GG.level.palette.groundTop);
        GG.particles.shockwave(this.cx + this.facing * 90, A.floor, 260, '#e8c25a', .6);
        for (const s of [-1, 1]) this.shockwave(GG, s, 1, 400, 'orb', A.floor - 16);
        GG.world.damageArea(GG, { x: this.cx + this.facing * 40 - 70, y: A.floor - 90, w: 150, h: 90 }, { dmg: 2, from: 'boss', hitPlayer: true, sx: this.cx });
      },
      onEnd: () => { this._slammed = false; },
      next: .5,
    });
  }
  atkLeap(G) {
    this.setAttack('leap', {
      windup: .45, active: 1.2, recover: .8,
      onStart: (GG) => {
        this.leap(GG, GG.player.x + GG.player.w / 2, (G2) => {
          const A = this.arena(G2);
          G2.fx.shake(20); G2.audio.sfx('explosion');
          G2.particles.shockwave(this.cx, A.floor, 340, '#e8c25a', .7);
          G2.particles.dust(this.cx, A.floor, 30, G2.level.palette.groundTop);
          for (const s of [-1, 1]) { this.shockwave(G2, s, 1, 460, 'orb', A.floor - 16); this.shockwave(G2, s, 1, 300, 'orb', A.floor - 16); }
          G2.world.damageArea(G2, { x: this.cx - 110, y: A.floor - 70, w: 220, h: 70 }, { dmg: 2, from: 'boss', hitPlayer: true, sx: this.cx });
        });
      },
    });
  }
  atkStomp(G) {
    this.setAttack('stomp', {
      windup: .55, active: .5, recover: .9, tick: .25,
      onActive: (GG) => {
        const A = this.arena(GG);
        this.shockwave(GG, this.facing, 1, 340, 'orb', A.floor - 14);
        GG.fx.shake(6);
      },
    });
  }
  atkCrown(G) {
    this.setAttack('crown', {
      windup: .7, active: .7, recover: .8, tick: .22,
      onStart: (GG) => { GG.audio.sfx('powerup'); },
      onActive: (GG) => {
        const n = 3;
        for (let i = 0; i < n; i++) {
          const a = this.aim(GG, (i - 1) * .3);
          this.fire(GG, { x: this.cx, y: this.y + 12, vx: Math.cos(a) * 470, vy: Math.sin(a) * 470, kind: 'shard', dmg: 1, color: '#ffd166' });
        }
      },
    });
  }
  atkWalk(G) {
    this.setAttack('walk', {
      windup: .2, active: 1.4, recover: .3, tick: .1,
      onActive: (GG) => { this.moveToward(GG, GG.player.x, this.phase >= 3 ? 210 : 130, .016); },
    });
  }
  drawBody(ctx, t, G, flash) {
    const W = this.w, H = this.h;
    // cape
    ctx.save();
    ctx.fillStyle = flash ? '#fff' : '#7a1020';
    ctx.beginPath();
    ctx.moveTo(-W * .3, -H * .84);
    ctx.quadraticCurveTo(-W * .78, -H * .4 + Math.sin(t * 2) * 10, -W * .5, 0);
    ctx.lineTo(W * .1, 0);
    ctx.quadraticCurveTo(-W * .1, -H * .5, -W * .1, -H * .84);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = rgba('#ffd166', .5); ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
    demonBody(ctx, {
      w: W, h: H, color: this.armor ? '#c9a44a' : '#a8763a', color2: '#3a2a10', accent: '#ffe9a8', eyeColor: '#ff5a5a',
      eyes: 2, horns: 2, arms: true, legs: 2, crown: true, fangs: true, mouthOpen: .22, belly: true, bellyColor: '#ffd166', bellyAlpha: .2,
      pupil: sign(G.player.x - this.cx) * -this.facing, armPose: this.atk?.phase === 'w' ? -.5 : .2,
    }, t, flash);
    // hammer
    ctx.save();
    const sw = this.atk?.phase === 'w' ? -1.2 * this.windupK : this.atk?.phase === 'a' ? .9 : -.2;
    ctx.translate(W * .42, -H * .6); ctx.rotate(sw);
    ctx.strokeStyle = '#5a4a34'; ctx.lineWidth = 9; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W * .55, -H * .1); ctx.stroke();
    ctx.fillStyle = flash ? '#fff' : '#8a7a5a';
    roundRect(ctx, W * .44, -H * .24, W * .3, H * .26, 6); ctx.fill();
    ctx.strokeStyle = rgba('#ffe9a8', .8); ctx.lineWidth = 2.4; ctx.stroke();
    ctx.fillStyle = '#ffd166';
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(W * .74, -H * .22 + i * H * .08); ctx.lineTo(W * .86, -H * .18 + i * H * .08); ctx.lineTo(W * .74, -H * .14 + i * H * .08); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    // armour plates shine
    if (this.armor) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba('#ffe9a8', .35 + Math.sin(t * 3) * .1); ctx.lineWidth = 3;
      ellipse(ctx, 0, -H * .55, W * .46, H * .34); ctx.stroke();
      ctx.restore();
    }
  }
}

/* =========================== DAY 3 · MOHASURA =========================== */
export class Mohasura extends Boss {
  constructor(G, day, x, y) {
    super(G, day, x, y);
    this.flying = true; this.decoys = []; this.splitCd = 3;
    this.immuneText = 'WHICH ONE IS REAL?';
    this.touchDmg = 1;
  }
  hurt(G, dmg, o) {
    // while split, only the true body takes damage; hits on decoys are handled elsewhere
    return super.hurt(G, dmg, o);
  }
  onPhase(G) {
    if (this.phase === 2) this.split(G);
    if (this.phase === 3) { this.split(G); G.hud?.bossCue?.('THE ILLUSIONS BITE', 'find the one that casts a shadow'); }
  }
  split(G) {
    this.decoys.forEach((d) => (d.dead = true));
    this.decoys = [];
    const A = this.arena(G);
    const n = this.phase >= 3 ? 8 : 6;
    for (let i = 0; i < n; i++) {
      this.decoys.push({ x: lerp(A.l + 60, A.r - 60, (i + .5) / n), y: A.floor - this.h - rand(10, 90), dead: false, hp: 1, t: rand(0, 9), ph: rand(0, TAU) });
    }
    const ri = randInt(0, n - 1);
    this.x = this.decoys[ri].x; this.y = this.decoys[ri].y;
    this.decoys.splice(ri, 1);
    G.audio.sfx('phase');
    G.particles.burst(this.cx, this.cy, 40, { color: ['#c792ff', '#fff'], spd: 300, size: 5, life: .9 });
    G.hud?.bossCue?.('NINE BODIES, ONE TRUTH', 'the real one casts a shadow · its eye is open');
  }
  think(G) {
    const r = rand(0, 1);
    if (this.decoys.length && r < .3) return this.atkSwap(G);
    if (r < .55) return this.atkShards(G);
    if (r < .8) return this.atkBeam(G);
    return this.atkSplit(G);
  }
  thinkAlways(G, dt) {
    for (const d of this.decoys) { d.t += dt; d.y += Math.sin(d.t * 2 + d.ph) * .3; }
    this.decoys = this.decoys.filter((d) => !d.dead);
    if (this.decoys.length === 0) { this.splitCd -= dt; if (this.splitCd <= 0) { this.splitCd = rand(3.4, 5); this.split(G); } }
    // decoy attacks in phase 3
    if (this.phase >= 3 && this.decoys.length) {
      this._dcd = (this._dcd || 0) - dt;
      if (this._dcd <= 0) {
        this._dcd = rand(1.4, 2.4);
        const d = pick(this.decoys);
        const a = Math.atan2(G.player.y + 17 - d.y, G.player.x + 13 - d.x);
        G.projectiles.push(new Projectile({ x: d.x + this.w / 2, y: d.y + this.h / 2, vx: Math.cos(a) * 330, vy: Math.sin(a) * 330, kind: 'dark', dmg: 1, owner: 'enemy', life: 3, color: '#c792ff' }));
      }
    }
  }
  atkShards(G) {
    this.setAttack('shards', {
      windup: .5, active: .3, recover: .7, tick: .3,
      onActive: (GG) => {
        const n = 10;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + this.t;
          this.fire(GG, { x: this.cx, y: this.cy, vx: Math.cos(a) * 330, vy: Math.sin(a) * 330, kind: 'shard', dmg: 1, color: '#e0b8ff', life: 2.6 });
        }
      },
    });
  }
  atkBeam(G) {
    this.setAttack('beam', {
      windup: .7, active: 1.1, recover: .7, tick: .1,
      onStart: (GG) => { this.beamA = this.aim(GG); GG.audio.sfx('laser'); },
      onActive: (GG) => {
        this.beamA += .5 * .016 * (this.facing > 0 ? 1 : -1) * 3;
        const len = 900, ex = this.cx, ey = this.cy;
        this.beam = { ex, ey, bx: ex + Math.cos(this.beamA) * len, by: ey + Math.sin(this.beamA) * len };
        const p = GG.player, px = p.x + p.w / 2, py = p.y + p.h / 2;
        const tt = clamp(((px - ex) * Math.cos(this.beamA) + (py - ey) * Math.sin(this.beamA)) / len, 0, 1);
        if (dist(px, py, ex + Math.cos(this.beamA) * len * tt, ey + Math.sin(this.beamA) * len * tt) < 24) p.hurt(GG, 1, { sx: ex, kx: sign(px - ex) * 300, ky: -240 });
      },
      onEnd: () => { this.beam = null; },
    });
  }
  atkSwap(G) {
    this.setAttack('swap', {
      windup: .3, active: .1, recover: .5,
      onStart: (GG) => {
        const d = pick(this.decoys);
        if (!d) return;
        GG.particles.burst(this.cx, this.cy, 24, { color: '#c792ff', spd: 260, size: 4, life: .6 });
        const nx = d.x, ny = d.y;
        d.x = this.x; d.y = this.y;
        this.x = nx; this.y = ny;
        GG.particles.burst(this.cx, this.cy, 24, { color: '#c792ff', spd: 260, size: 4, life: .6 });
        GG.audio.sfx('phase');
      },
    });
  }
  atkSplit(G) { this.setAttack('split', { windup: .5, active: .1, recover: .6, onStart: (GG) => this.split(GG) }); }
  drawExtras(ctx, cam, t, G) {
    if (this.beam) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba('#c792ff', .75); ctx.lineWidth = 11;
      ctx.beginPath(); ctx.moveTo(this.beam.ex - cam.cx, this.beam.ey - cam.cy); ctx.lineTo(this.beam.bx - cam.cx, this.beam.by - cam.cy); ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3.4; ctx.stroke(); ctx.restore();
    }
    // decoys (float higher, no shadow, eyes closed)
    for (const d of this.decoys) {
      if (d.dead) continue;
      const x = d.x + this.w / 2 - cam.cx, y = d.y + this.h - cam.cy;
      if (x < -200 || x > cam.w + 200) continue;
      ctx.save(); ctx.translate(x, y + Math.sin(d.t * 2 + d.ph) * 6 - 12);
      ctx.globalAlpha = .82;
      ctx.scale(this.facing, 1);
      this.paintBody(ctx, t, G, false, true);
      ctx.restore();
    }
  }
  drawBody(ctx, t, G, flash) { this.paintBody(ctx, t, G, flash, false); }
  paintBody(ctx, t, G, flash, decoy) {
    const W = this.w, H = this.h;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    glow(ctx, 0, -H * .55, W * .9, '#c792ff', decoy ? .14 : .26);
    ctx.restore();
    // four arms in a lotus mudra
    ctx.strokeStyle = flash ? '#fff' : '#6a4fb0'; ctx.lineWidth = W * .07; ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const s = i < 2 ? -1 : 1, k = i % 2;
      const a = Math.sin(t * 1.6 + i) * .2;
      ctx.beginPath();
      ctx.moveTo(s * W * .26, -H * (.7 - k * .12));
      ctx.quadraticCurveTo(s * W * (.6 + a * .2), -H * (.78 - k * .1 + a * .1), s * W * (.52 + a * .3), -H * (.95 - k * .06));
      ctx.stroke();
      ctx.fillStyle = flash ? '#fff' : '#b98bff';
      ctx.beginPath(); ctx.arc(s * W * (.52 + a * .3), -H * (.95 - k * .06), W * .07, 0, TAU); ctx.fill();
    }
    // robes
    const g = ctx.createLinearGradient(0, -H, 0, 0);
    g.addColorStop(0, flash ? '#ffffff' : '#8f6fd4'); g.addColorStop(1, flash ? '#ffd0ff' : '#2b1a4d');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-W * .4, 0);
    ctx.quadraticCurveTo(-W * .3, -H * .7, 0, -H * .82);
    ctx.quadraticCurveTo(W * .3, -H * .7, W * .4, 0);
    ctx.quadraticCurveTo(0, -H * .1, -W * .4, 0);
    ctx.fill();
    ctx.strokeStyle = rgba('#e0b8ff', .5); ctx.lineWidth = 2; ctx.stroke();
    // mask
    ctx.fillStyle = flash ? '#fff' : '#f0e6ff';
    ellipse(ctx, 0, -H * .88, W * .22, H * .12); ctx.fill();
    ctx.strokeStyle = rgba('#6a4fb0', .8); ctx.lineWidth = 2; ctx.stroke();
    // mask eyes: real one open, decoys closed
    ctx.fillStyle = '#2b1a4d';
    if (decoy) {
      ctx.strokeStyle = '#2b1a4d'; ctx.lineWidth = 2.4;
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * W * .1 - 6, -H * .89); ctx.lineTo(s * W * .1 + 6, -H * .89); ctx.stroke(); }
    } else {
      for (const s of [-1, 1]) { ellipse(ctx, s * W * .09, -H * .89, 6.4, 8); ctx.fill(); }
      ctx.fillStyle = '#ff5a7a';
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * W * .09 + sign(G.player.x - this.cx) * 2, -H * .89, 3, 0, TAU); ctx.fill(); }
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, 0, -H * .89, 30, '#ff5a7a', .4); ctx.restore();
    }
    // third eye on the mask
    ctx.fillStyle = rgba('#c792ff', .9);
    ellipse(ctx, 0, -H * .96, 4, 6.4); ctx.fill();
    // floating halo of runes
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba('#e0b8ff', .5); ctx.lineWidth = 1.6;
    ctx.translate(0, -H * .88); ctx.rotate(t * .6);
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU;
      ctx.beginPath(); ctx.arc(Math.cos(a) * W * .34, Math.sin(a) * W * .18, 4, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }
}

/* =========================== DAY 4 · LOBHASURA ========================== */
export class Lobhasura extends Boss {
  constructor(G, day, x, y) {
    super(G, day, x, y);
    this.bellyGlow = 0; this.growth = 0; this.touchDmg = 2;
    this.immuneText = 'HE HOARDS EVERYTHING';
  }
  weak(G) { return { x: this.cx, y: this.y + this.h * .52 }; }
  hurt(G, dmg, o) {
    if (this.inhaling) { dmg = Math.ceil(dmg * 3); G.fx.text(this.cx, this.y - 20, 'VAULT OPEN ×3', { color: '#ffd166', size: 20, crit: true, life: .8 }); }
    return super.hurt(G, dmg, o);
  }
  think(G) {
    const r = rand(0, 1), d = Math.abs(G.player.x - this.cx);
    if (r < .3) return this.atkInhale(G);
    if (r < .55) return this.atkCoins(G);
    if (r < .75) return this.atkArms(G);
    if (r < .9) return this.atkGold(G);
    return this.atkSlam(G);
  }
  atkInhale(G) {
    this.setAttack('inhale', {
      windup: .6, active: 1.9, recover: .9, tick: .06,
      onStart: (GG) => { this.inhaling = true; GG.audio.sfx('pull'); GG.hud?.bossCue?.('THE VAULT OPENS', 'his belly glows — strike it now!'); },
      onActive: (GG) => {
        this.bellyGlow = 1;
        const p = GG.player, px = p.x + p.w / 2, py = p.y + p.h / 2;
        const dd = dist(this.cx, this.y + this.h * .5, px, py);
        if (dd < 420 && !p.phasing) {
          const a = Math.atan2(this.y + this.h * .5 - py, this.cx - px);
          const f = (1 - dd / 420) * 1500 * .016;
          p.vx += Math.cos(a) * f; p.vy += Math.sin(a) * f * .6;
        }
        for (const pk of GG.pickups) {
          if (pk.dead) continue;
          const d2 = dist(this.cx, this.y + this.h * .5, pk.x, pk.y);
          if (d2 < 420) {
            const a = Math.atan2(this.y + this.h * .5 - pk.y, this.cx - pk.x);
            pk.x += Math.cos(a) * 240 * .016; pk.y += Math.sin(a) * 240 * .016; pk.grounded = false;
            if (d2 < 44) { pk.dead = true; this.growth++; this.hp = Math.min(this.maxHp, this.hp + 8); this.scale += .015; GG.audio.sfx('coin'); GG.particles.burst(this.cx, this.y + this.h * .5, 12, { color: '#ffd166', spd: 180, size: 4, life: .5 }); }
          }
        }
        if (rand(0, 1) < .5) {
          const a = rand(0, TAU), rr = rand(200, 420);
          GG.particles.add({ x: this.cx + Math.cos(a) * rr, y: this.y + this.h * .5 + Math.sin(a) * rr * .5, vx: -Math.cos(a) * 320, vy: -Math.sin(a) * 160, life: .5, size: rand(2, 4), color: '#ffd166', shape: 'dot', glowy: true, drag: 0 });
        }
      },
      onEnd: () => { this.inhaling = false; this.bellyGlow = 0; },
      next: 1.2,
    });
  }
  atkCoins(G) {
    this.setAttack('coins', {
      windup: .5, active: .9, recover: .6, tick: .13,
      onActive: (GG) => {
        const a = this.aim(GG, rand(-.34, .1));
        this.fire(GG, { x: this.cx, y: this.y + this.h * .3, vx: Math.cos(a) * 430, vy: Math.sin(a) * 430 - 120, kind: 'coin', dmg: 1, gravity: 620 });
      },
    });
  }
  atkArms(G) {
    this.setAttack('arms', {
      windup: .55, active: .7, recover: .8, tick: .1,
      onStart: (GG) => { this.armSweep = 0; },
      onActive: (GG) => {
        this.armSweep = Math.min(1, (this.armSweep || 0) + .06);
        const A = this.arena(GG);
        const reach = W_reach(this) * this.armSweep;
        const dir = this.facing;
        GG.world.damageArea(GG, { x: this.cx + (dir > 0 ? 0 : -reach), y: A.floor - 74, w: reach, h: 74 }, { dmg: 2, from: 'boss', hitPlayer: true, sx: this.cx });
        if (rand(0, 1) < .5) GG.particles.dust(this.cx + dir * reach, A.floor, 3, GG.level.palette.groundTop);
      },
      onEnd: () => { this.armSweep = 0; },
    });
  }
  atkGold(G) {
    this.setAttack('gold', {
      windup: .7, active: .4, recover: .9, tick: .4,
      onStart: (GG) => {
        const A = this.arena(GG);
        for (let i = 0; i < 3; i++) {
          const gx = clamp(GG.player.x + rand(-220, 220), A.l, A.r - 120);
          GG.world.webs.push({ x: gx, y: A.floor - 20, w: 120, h: 22, life: 8, solid: false, gold: true });
          GG.particles.burst(gx + 60, A.floor - 10, 20, { color: ['#ffd166', '#fff3d0'], spd: 200, size: 4, life: .8, gravity: 500 });
        }
        GG.audio.sfx('wallbreak');
        GG.hud?.toast?.('Cursed gold — it will slow you', '⚠');
      },
    });
  }
  atkSlam(G) {
    this.setAttack('slam', {
      windup: .65, active: .2, recover: 1.1,
      onStart: (GG) => { this.leap(GG, GG.player.x, (G2) => {
        const A = this.arena(G2);
        G2.fx.shake(18); G2.audio.sfx('explosion');
        G2.particles.shockwave(this.cx, A.floor, 320, '#ffd166', .7);
        for (const s of [-1, 1]) { this.shockwave(G2, s, 1, 420, 'coin', A.floor - 18); }
        G2.world.damageArea(G2, { x: this.cx - 120, y: A.floor - 80, w: 240, h: 80 }, { dmg: 2, from: 'boss', hitPlayer: true, sx: this.cx });
      }); },
    });
  }
  drawBody(ctx, t, G, flash) {
    const W = this.w, H = this.h;
    // many grasping arms
    ctx.strokeStyle = flash ? '#fff' : '#8a6428'; ctx.lineWidth = W * .075; ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const s = i % 2 ? 1 : -1, k = Math.floor(i / 2);
      const a = Math.sin(t * 2.2 + i * 1.3) * .3 + (this.armSweep || 0) * s * 1.1;
      ctx.beginPath();
      ctx.moveTo(s * W * .3, -H * (.66 - k * .12));
      ctx.quadraticCurveTo(s * W * (.62 + a * .3), -H * (.5 - k * .1), s * W * (.5 + a * .55), -H * (.2 - k * .06));
      ctx.stroke();
      ctx.fillStyle = flash ? '#fff' : '#ffd166';
      ctx.beginPath(); ctx.arc(s * W * (.5 + a * .55), -H * (.2 - k * .06), W * .07, 0, TAU); ctx.fill();
    }
    demonBody(ctx, {
      w: W, h: H, color: '#e0b23a', color2: '#4a3410', accent: '#fff3d0', eyeColor: '#ff5a5a',
      eyes: 2, horns: 0, arms: false, legs: 2, mouthOpen: this.inhaling ? 1 : .35, fangs: true,
      belly: true, bellyColor: '#fff3d0', bellyAlpha: .25 + (this.bellyGlow || 0) * .5, bellyGlow: this.bellyGlow > 0,
      pupil: sign(G.player.x - this.cx) * -this.facing,
    }, t, flash);
    // vault door in the belly
    ctx.save();
    ctx.translate(0, -H * .48);
    ctx.fillStyle = flash ? '#fff' : '#5a4210';
    ctx.beginPath(); ctx.arc(0, 0, W * .2, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#ffe9a8'; ctx.lineWidth = 3; ctx.stroke();
    ctx.save(); ctx.rotate(t * .5);
    ctx.strokeStyle = rgba('#ffe9a8', .9); ctx.lineWidth = 4;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(i / 4 * TAU) * W * .15, Math.sin(i / 4 * TAU) * W * .15); ctx.stroke(); }
    ctx.restore();
    if (this.inhaling) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, 0, 0, W * .5, '#fff3d0', .6); ctx.restore(); }
    ctx.restore();
    // coin crown
    ctx.fillStyle = '#ffd166';
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.arc(i * W * .09, -H * 1.06 - Math.abs(i) * -4, W * .05, 0, TAU); ctx.fill(); ctx.strokeStyle = '#8a5a12'; ctx.lineWidth = 1.4; ctx.stroke(); }
  }
}
function W_reach(b) { return b.w * 1.5; }

/* =========================== DAY 5 · KRODHASURA ========================= */
export class Krodhasura extends Boss {
  constructor(G, day, x, y) {
    super(G, day, x, y);
    this.flying = true; this.touchDmg = 2; this.heat = 0;
    this.immuneText = 'RAGE BURNS OFF YOUR BLOWS';
  }
  weak(G) { return { x: this.cx, y: this.y + this.h * .35 }; }
  thinkAlways(G, dt) {
    this.heat = clamp(this.heat + dt * .045 * (this.atk ? 2 : 1) - (G.time - (this._lastHit || 0) > 3 ? dt * .3 : 0), 0, 1);
    G.audio.setIntensity(.7 + this.heat * .3);
    if (rand(0, 1) < dt * 30) {
      G.particles.add({ x: this.cx + rand(-this.w * .4, this.w * .4), y: this.y + rand(0, this.h), vx: rand(-40, 40), vy: rand(-160, -60), life: rand(.4, .9), size: rand(2, 6), color: pick(['#ff8a1f', '#ffd166', '#ff5a1e']), shape: 'dot', glowy: true, drag: .8 });
    }
  }
  think(G) {
    const r = rand(0, 1), d = Math.abs(G.player.x - this.cx);
    if (this.phase >= 2 && r < .22) return this.atkMeteors(G);
    if (this.phase >= 3 && r < .4) return this.atkEruption(G);
    if (d > 260 && r < .6) return this.atkRush(G);
    if (r < .8) return this.atkFire(G);
    return this.atkRoar(G);
  }
  onPhase(G) {
    if (this.phase === 2) G.hud?.bossCue?.('THE MOUNTAIN WAKES', 'he calls fire from the sky');
    if (this.phase === 3) { G.hud?.bossCue?.('BLIND FURY', 'the arena itself is erupting'); this.scale = 1.1; }
    if (this.phase === 4) { G.hud?.bossCue?.('BURN IT ALL', 'nothing is left to control'); this.touchDmg = 2; }
  }
  atkFire(G) {
    this.setAttack('fire', {
      windup: .42, active: .8, recover: .5, tick: .16,
      onActive: (GG) => {
        const n = this.phase >= 3 ? 2 : 1;
        for (let i = 0; i < n; i++) {
          const a = this.aim(GG, rand(-.18, .18));
          this.fire(GG, { x: this.cx + Math.cos(a) * 40, y: this.cy, vx: Math.cos(a) * 520, vy: Math.sin(a) * 520, kind: 'fireball', dmg: 1, big: true, trail: { color: '#ff8a1f', life: .4, size: .8 } });
        }
      },
    });
  }
  atkRush(G) {
    this.setAttack('rush', {
      windup: .6, active: .8, recover: .7, tick: .05,
      onStart: (GG) => { this.facing = sign(GG.player.x - this.cx) || this.facing; GG.audio.sfx('charge'); },
      onActive: (GG) => {
        this.vx = this.facing * 780;
        const A = this.arena(GG);
        if (this.cx < A.l + 40 || this.cx > A.r - 40) this.facing *= -1;
        GG.world.damageArea(GG, { x: this.x - 10, y: this.y, w: this.w + 20, h: this.h }, { dmg: 2, from: 'boss', hitPlayer: true, sx: this.cx });
        if (rand(0, 1) < .8) GG.particles.add({ x: this.cx, y: A.floor - 8, vx: -this.facing * rand(60, 220), vy: rand(-120, -20), life: rand(.4, .9), size: rand(4, 9), color: pick(['#ff8a1f', '#ffd166']), shape: 'dot', glowy: true, drag: 1.2 });
      },
    });
  }
  atkMeteors(G) {
    this.setAttack('meteors', {
      windup: .8, active: 1.8, recover: .7, tick: .26,
      onStart: (GG) => { this.marks = []; const A = this.arena(GG); for (let i = 0; i < 7; i++) this.marks.push({ x: lerp(A.l + 40, A.r - 40, rand(0, 1)), t: i * .26, done: false }); GG.audio.sfx('shootBig'); },
      onActive: (GG) => {
        const A = this.arena(GG);
        for (const m of this.marks) {
          m.t -= .016 * 3;
          if (m.t <= 0 && !m.done) {
            m.done = true;
            GG.projectiles.push(new Projectile({ x: m.x, y: A.floor - 560, vx: 0, vy: 780, kind: 'fireball', dmg: 2, owner: 'enemy', life: 2, ghost: true, big: true, onExpire: (G2) => {
              G2.particles.burst(m.x, A.floor - 10, 26, { color: ['#ff8a1f', '#ffd166'], spd: 320, size: 6, life: .8, gravity: 500 });
              G2.fx.shake(7); G2.audio.sfx('explosion');
              G2.world.damageArea(G2, { x: m.x - 62, y: A.floor - 80, w: 124, h: 80 }, { dmg: 1, from: 'boss', hitPlayer: true, sx: m.x });
            } }));
          }
        }
      },
    });
  }
  drawExtras(ctx, cam, t, G) {
    if (this.marks) {
      const A = this.arena(G);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const m of this.marks) {
        if (m.done) continue;
        const x = m.x - cam.cx, y = A.floor - cam.cy;
        ctx.strokeStyle = rgba('#ff5a1e', .5 + Math.sin(t * 14) * .25); ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(x, y - 4, 44, 12, 0, 0, TAU); ctx.stroke();
        ctx.fillStyle = rgba('#ff8a1f', .16); ctx.fill();
      }
      ctx.restore();
    }
  }
  atkEruption(G) {
    this.setAttack('eruption', {
      windup: .7, active: .3, recover: 1,
      onStart: (GG) => {
        const A = this.arena(GG);
        for (let i = 0; i < 5; i++) {
          const gx = lerp(A.l + 50, A.r - 50, i / 4);
          GG.world.data.hazards.push({ kind: 'flame', x: gx, y: A.floor, w: 46, h: 210, period: 3.2, onDur: 1.5, phase: i * .18, t: 2.4, temp: true, life: 16 });
        }
        GG.audio.sfx('explosion'); GG.fx.shake(14);
        GG.hud?.bossCue?.('ERUPTION', 'the floor is fire — keep moving');
      },
    });
  }
  atkRoar(G) {
    this.setAttack('roar', {
      windup: .8, active: .3, recover: 1,
      onStart: (GG) => {
        GG.audio.sfx('roar'); GG.fx.shake(16);
        GG.particles.shockwave(this.cx, this.cy, 460, '#ff6b3d', .8);
        const A = this.arena(GG);
        for (const s of [-1, 1]) for (let i = 0; i < 3; i++) this.shockwave(GG, s, 1, 340 + i * 90, 'fire', A.floor - 20);
      },
    });
  }
  drawBody(ctx, t, G, flash) {
    const W = this.w, H = this.h;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    glow(ctx, 0, -H * .5, W * 1.3, '#ff5a1e', .3 + this.heat * .3);
    ctx.restore();
    // flame hair
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 9; i++) {
      const fx = (i - 4) * W * .09;
      const fh = H * (.2 + Math.abs(Math.sin(t * 6 + i)) * .28) * (1 + this.heat);
      const g = ctx.createLinearGradient(fx, -H * .98, fx, -H * .98 - fh);
      g.addColorStop(0, rgba('#fff3d0', .9)); g.addColorStop(.4, rgba('#ff8a1f', .7)); g.addColorStop(1, rgba('#ff3d00', 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(fx - W * .05, -H * .96);
      ctx.quadraticCurveTo(fx + Math.sin(t * 8 + i) * 8, -H * .96 - fh * .6, fx, -H * .96 - fh);
      ctx.quadraticCurveTo(fx + W * .05 + Math.sin(t * 7 + i) * 6, -H * .96 - fh * .5, fx + W * .05, -H * .96);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    demonBody(ctx, {
      w: W, h: H, color: '#8c2c0c', color2: '#2a0a04', accent: '#ffb03a', eyeColor: '#fff3d0',
      eyes: 2, horns: 2, arms: true, legs: 0, fangs: true, mouthOpen: .3 + this.heat * .7,
      belly: true, bellyColor: '#ff6b3d', bellyAlpha: .35 + this.heat * .3, bellyGlow: true,
      pupil: sign(G.player.x - this.cx) * -this.facing, armPose: .3 + this.heat * .4,
    }, t, flash);
    // lava cracks
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba('#ff8a1f', .5 + this.heat * .4 + Math.sin(t * 5) * .1); ctx.lineWidth = 2.6;
    for (let i = 0; i < 6; i++) {
      const sx = (hash2(i) - .5) * W * .6;
      ctx.beginPath(); ctx.moveTo(sx, -H * .8);
      let cy = -H * .8;
      for (let k = 0; k < 3; k++) { cy += H * .16; ctx.lineTo(sx + (hash2(i + k * 3) - .5) * W * .2, cy); }
      ctx.stroke();
    }
    ctx.restore();
  }
}
function hash2(n) { const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); }

/* ============================ DAY 6 · KAMASURA ========================== */
export class Kamasura extends Boss {
  constructor(G, day, x, y) {
    super(G, day, x, y);
    this.flying = true; this.touchDmg = 1; this.dashN = 0;
    this.immuneText = 'SHE IS EVERYWHERE YOU WANT HER';
  }
  weak(G) { return { x: this.cx, y: this.y + this.h * .3 }; }
  think(G) {
    const r = rand(0, 1);
    if (this.phase >= 2 && r < .24) return this.atkSpores(G);
    if (r < .48) return this.atkPetals(G);
    if (r < .74) return this.atkDance(G);
    if (r < .9) return this.atkBloom(G);
    return this.atkWhip(G);
  }
  onPhase(G) {
    if (this.phase === 2) G.hud?.bossCue?.('THE AIR THICKENS', 'her spores will turn your limbs against you');
    if (this.phase === 3) { G.hud?.bossCue?.('INTOXICATION', 'she moves faster than thought'); this.scale = 1.05; }
  }
  atkPetals(G) {
    this.setAttack('petals', {
      windup: .45, active: 1.2, recover: .5, tick: .09,
      onStart: (GG) => { this._spiral = 0; },
      onActive: (GG) => {
        this._spiral += .55;
        for (let k = 0; k < 2; k++) {
          const a = this._spiral + k * Math.PI;
          this.fire(GG, { x: this.cx, y: this.cy, vx: Math.cos(a) * 340, vy: Math.sin(a) * 340, kind: 'petal', dmg: 1, life: 3.2, spin: 10 });
        }
      },
    });
  }
  atkSpores(G) {
    this.setAttack('spores', {
      windup: .6, active: .4, recover: .9,
      onStart: (GG) => {
        const A = this.arena(GG);
        for (let i = 0; i < 3; i++) {
          const gx = clamp(GG.player.x + rand(-260, 260), A.l, A.r - 150);
          GG.world.data.hazards.push({ kind: 'gas', x: gx, y: A.floor - 150, w: 150, h: 150, effect: i % 2 ? 'slow' : 'reverse', t: 0, temp: true, life: 11 });
        }
        GG.audio.sfx('smoke');
        GG.particles.burst(this.cx, this.cy, 40, { color: ['#ff9fc4', '#c792ff'], spd: 260, size: 8, life: 1.4, shape: 'smoke' });
        GG.hud?.bossCue?.('SPORES', 'purple slows · pink reverses your controls');
      },
    });
  }
  atkDance(G) {
    this.setAttack('dance', {
      windup: .35, active: 1.5, recover: .5, tick: .3,
      onStart: (GG) => { this.dashN = this.phase >= 3 ? 5 : 3; GG.audio.sfx('dash'); },
      onActive: (GG) => {
        if (this.dashN <= 0) return;
        this.dashN--;
        const A = this.arena(GG);
        const tx = clamp(GG.player.x + rand(-200, 200), A.l, A.r);
        const ty = A.floor - this.h - rand(0, 180);
        for (let i = 0; i < 8; i++) GG.particles.add({ x: lerp(this.cx, tx, i / 8), y: lerp(this.cy, ty + this.h / 2, i / 8), vx: 0, vy: 0, life: .4, size: 8, color: '#ff6fa5', shape: 'dot', glowy: true });
        this.x = tx - this.w / 2; this.y = ty;
        GG.particles.petals(this.cx, this.cy, 10);
        const a = this.aim(GG);
        this.fire(GG, { x: this.cx, y: this.cy, vx: Math.cos(a) * 430, vy: Math.sin(a) * 430, kind: 'petal', dmg: 1 });
      },
    });
  }
  atkBloom(G) {
    this.setAttack('bloom', {
      windup: .7, active: .6, recover: .8, tick: .2,
      onStart: (GG) => {
        const A = this.arena(GG);
        for (let i = 0; i < 4; i++) {
          const e = new Enemy({ type: 'shooter', x: lerp(A.l + 70, A.r - 70, i / 3), y: A.floor, kind: 'bloom', turret: true, scale: .9 }, GG);
          e.hp = 8; e.maxHp = 8;
          GG.enemies.push(e);
        }
        GG.audio.sfx('powerup');
      },
    });
  }
  atkWhip(G) {
    this.setAttack('whip', {
      windup: .5, active: .5, recover: .7, tick: .12,
      onActive: (GG) => {
        const A = this.arena(GG);
        const dir = sign(GG.player.x - this.cx) || this.facing;
        GG.projectiles.push(new Projectile({ x: this.cx, y: A.floor - 22, vx: dir * 560, vy: 0, kind: 'thornvine', dmg: 1, owner: 'enemy', life: 2.6, gravity: 0, ghost: true, color: '#6fae4a', shape: 'vine', r: 15, spin: 0 }));
      },
    });
  }
  drawBody(ctx, t, G, flash) {
    const W = this.w, H = this.h;
    // petal wings
    ctx.save();
    for (const s of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const a = (i - 2) * .34 + Math.sin(t * 2.4 + i) * .07;
        ctx.save();
        ctx.translate(s * W * .2, -H * .78); ctx.rotate(s * (a + Math.PI / 2.4));
        const g = ctx.createLinearGradient(0, 0, 0, -H * .6);
        g.addColorStop(0, flash ? '#ffffff' : rgba('#ff6fa5', .95));
        g.addColorStop(1, flash ? '#ffe0ee' : rgba('#ffd6e8', .55));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(W * .22, -H * .3, 0, -H * .62);
        ctx.quadraticCurveTo(-W * .22, -H * .3, 0, 0);
        ctx.fill();
        ctx.strokeStyle = rgba('#ffffff', .3); ctx.lineWidth = 1.4; ctx.stroke();
        ctx.restore();
      }
    }
    ctx.restore();
    // flowing form
    const g2 = ctx.createLinearGradient(0, -H, 0, 0);
    g2.addColorStop(0, flash ? '#fff' : '#ff9fc4'); g2.addColorStop(.6, flash ? '#ffd0e4' : '#c22a6a'); g2.addColorStop(1, flash ? '#ffb0d0' : '#4d1030');
    ctx.fillStyle = g2;
    ctx.beginPath();
    ctx.moveTo(-W * .3, 0);
    for (let i = 0; i <= 8; i++) {
      const k = i / 8;
      ctx.lineTo(-W * .3 + Math.sin(t * 3 + k * 6) * W * .07 * k, -H * k);
    }
    ctx.lineTo(W * .3, -H);
    for (let i = 8; i >= 0; i--) {
      const k = i / 8;
      ctx.lineTo(W * .3 + Math.sin(t * 3 + k * 6 + 1) * W * .07 * k, -H * k);
    }
    ctx.closePath(); ctx.fill();
    // head + hair of vines
    ctx.fillStyle = flash ? '#fff' : '#ffd6e8';
    ellipse(ctx, 0, -H * 1.02, W * .18, H * .1); ctx.fill();
    ctx.strokeStyle = flash ? '#fff' : '#6fae4a'; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI * .9 + i * .3;
      ctx.beginPath(); ctx.moveTo(0, -H * 1.04);
      ctx.quadraticCurveTo(Math.cos(a) * W * .3, -H * 1.2 + Math.sin(t * 2 + i) * 8, Math.cos(a) * W * .48, -H * (.86 + Math.sin(t * 1.6 + i) * .1));
      ctx.stroke();
    }
    // eyes
    ctx.fillStyle = '#4d1030';
    for (const s of [-1, 1]) ellipse(ctx, s * W * .07, -H * 1.03, 4.6, 6); ctx.fill();
    ctx.fillStyle = '#fff3d0';
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * W * .07 + 1, -H * 1.04, 1.8, 0, TAU); ctx.fill(); }
    // lotus halo
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba('#ffb3d1', .5); ctx.lineWidth = 2;
    ctx.translate(0, -H * 1.02); ctx.rotate(t * .5);
    for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; ctx.beginPath(); ctx.ellipse(Math.cos(a) * W * .3, Math.sin(a) * W * .3, 7, 3.4, a, 0, TAU); ctx.stroke(); }
    glow(ctx, 0, 0, W * .6, '#ff6fa5', .2);
    ctx.restore();
  }
}

/* =========================== DAY 7 · MAMATASURA ========================= */
export class Mamatasura extends Boss {
  constructor(G, day, x, y) {
    super(G, day, x, y);
    this.threads = []; this.touchDmg = 1;
    this.immuneText = 'SHE IS ANCHORED — CUT HER THREADS';
    this.buildThreads(G);
  }
  buildThreads(G) {
    const A = this.arena(G);
    this.threads = [];
    for (let i = 0; i < 4; i++) this.threads.push({ x: lerp(A.l + 60, A.r - 60, i / 3), y: A.y - A.h + 30, hp: 3, alive: true, t: rand(0, 9) });
    this.invuln = Math.max(this.invuln, 0);
    this.anchored = true;
  }
  weak(G) { return { x: this.cx, y: this.y + this.h * .45 }; }
  thinkAlways(G, dt) {
    let alive = 0;
    for (const th of this.threads) {
      th.t += dt;
      if (th.alive) alive++;
      else { th.regen = (th.regen || 0) + dt; if (th.regen > 11) { th.alive = true; th.hp = 3; th.regen = 0; } }
    }
    this.anchored = alive > 0;
    if (!this.anchored) { this.vulnerableT = (this.vulnerableT || 0) + dt; }
    else this.vulnerableT = 0;
    // threads can be attacked
    for (const th of this.threads) {
      if (!th.alive) continue;
      const box = { x: th.x - 14, y: th.y, w: 28, h: Math.max(20, this.y + this.h - th.y) };
      const pbox = G.player.atk ? G.player.attackBox() : null;
      if (pbox && aabb(pbox, box) && !th.hitLock) {
        th.hp--; th.hitLock = .3;
        G.audio.sfx('hit'); G.particles.burst(th.x, th.y + 60, 12, { color: ['#cfe9ff', '#fff'], spd: 200, size: 3.4, life: .5 });
        if (th.hp <= 0) {
          th.alive = false; th.regen = 0;
          G.audio.sfx('wallbreak'); G.fx.shake(8);
          G.particles.burst(th.x, th.y + 80, 30, { color: ['#cfe9ff', '#9fd8ff', '#fff'], spd: 300, size: 4, life: 1 });
          G.fx.text(th.x, th.y + 60, 'THREAD CUT', { color: '#cfe9ff', size: 18, crit: true });
        }
      }
      if (th.hitLock) th.hitLock -= dt;
    }
    if (!this.anchored && !this._fallen) {
      this._fallen = true;
      G.hud?.bossCue?.('SHE FALLS', 'attachment severed — strike!');
      G.audio.sfx('gate');
    }
    if (this.anchored) this._fallen = false;
  }
  hurt(G, dmg, o) {
    if (this.anchored && !o.armorBreak) {
      if (!this._cue || G.time - this._cue > 3.2) {
        this._cue = G.time;
        G.fx.text(this.cx, this.y - 16, 'CUT THE FOUR THREADS', { color: '#9fd8ff', size: 19, life: 1.2, crit: true });
        G.audio.sfx('error');
        for (const th of this.threads) if (th.alive) G.particles.ring(th.x, th.y + 60, 16, '#9fd8ff', .5);
      }
      G.particles.spark(this.cx, this.cy, 8, '#cfe9ff', 240);
      return false;
    }
    return super.hurt(G, Math.ceil(dmg * (this.anchored ? 1 : 1.6)), o);
  }
  onPhase(G) {
    if (this.phase === 2) { this.buildThreads(G); G.hud?.bossCue?.('SHE REWEAVES', 'four new threads'); }
    if (this.phase === 3) { this.scale = 1.12; G.hud?.bossCue?.('THE MOTHER WAKES', 'she will not let go'); }
  }
  think(G) {
    const r = rand(0, 1);
    if (this.anchored) {
      if (r < .34) return this.atkWeb(G);
      if (r < .62) return this.atkGrapple(G);
      if (r < .84) return this.atkSpawn(G);
      return this.atkDrop(G);
    }
    this.cd = .5;
  }
  atkWeb(G) {
    this.setAttack('web', {
      windup: .5, active: .9, recover: .6, tick: .18,
      onActive: (GG) => {
        const n = 3;
        for (let i = 0; i < n; i++) {
          const a = this.aim(GG, (i - 1) * .3);
          GG.projectiles.push(new Projectile({ x: this.cx, y: this.cy, vx: Math.cos(a) * 400, vy: Math.sin(a) * 400 - 80, kind: 'web', dmg: 1, owner: 'enemy', life: 2.6, gravity: 320, onHitPlayer: (G2) => { G2.player.debuff('slow', 1); G2.world.spawnSticky(G2, G2.player.x, G2.player.y + G2.player.h, 90); } }));
        }
        GG.audio.sfx('web');
      },
    });
  }
  atkGrapple(G) {
    this.setAttack('grapple', {
      windup: .65, active: .5, recover: 1,
      onStart: (GG) => {
        const p = GG.player;
        const a = this.aim(GG);
        this.tongue = { t: 0, a, len: 0 };
        GG.audio.sfx('web');
      },
      onActive: (GG) => {
        if (!this.tongue) return;
        this.tongue.len = Math.min(760, this.tongue.len + 1500 * .016);
        const tx = this.cx + Math.cos(this.tongue.a) * this.tongue.len;
        const ty = this.cy + Math.sin(this.tongue.a) * this.tongue.len;
        const p = GG.player;
        if (!p.phasing && dist(tx, ty, p.x + p.w / 2, p.y + p.h / 2) < 34) {
          p.debuff('slow', 2.2);
          p.hurt(GG, 1, { sx: this.cx, kx: sign(this.cx - p.x) * 260, ky: -220 });
          GG.world.spawnSticky(GG, p.x, p.y + p.h, 100);
          GG.hud?.toast?.('Bound by attachment — dodge free!', '🕸');
          this.tongue = null;
        }
        if (this.tongue && this.tongue.len >= 760) this.tongue = null;
      },
      onEnd: () => { this.tongue = null; },
    });
  }
  atkSpawn(G) {
    this.setAttack('spawn', {
      windup: .6, active: .2, recover: .8,
      onStart: (GG) => {
        const A = this.arena(GG);
        const n = this.phase >= 3 ? 4 : 3;
        for (let i = 0; i < n; i++) GG.enemies.push(new Enemy({ type: 'crawler', x: lerp(A.l + 50, A.r - 50, rand(0, 1)), y: A.floor, kind: 'spiderling', scale: .8 }, GG));
        GG.audio.sfx('smoke');
      },
    });
  }
  atkDrop(G) {
    this.setAttack('drop', {
      windup: .5, active: .9, recover: .7, tick: .3,
      onActive: (GG) => {
        const A = this.arena(GG);
        const x = clamp(GG.player.x + rand(-120, 120), A.l, A.r);
        GG.projectiles.push(new Projectile({ x, y: A.y - A.h + 40, vx: 0, vy: 480, kind: 'web', dmg: 1, owner: 'enemy', life: 3, ghost: true, scale: 1.6, onExpire: (G2) => { G2.world.spawnSticky(G2, x, A.floor, 130); G2.particles.burst(x, A.floor - 10, 18, { color: '#cfe9ff', spd: 200, size: 4, life: .7 }); } }));
      },
    });
  }
  drawExtras(ctx, cam, t, G) {
    const A = this.arena(G);
    // threads
    for (const th of this.threads) {
      const x = th.x - cam.cx;
      ctx.save();
      if (th.alive) {
        ctx.strokeStyle = rgba('#d8f0ff', .85); ctx.lineWidth = 4 + Math.sin(th.t * 3) * .8;
        ctx.beginPath(); ctx.moveTo(x, th.y - cam.cy);
        ctx.quadraticCurveTo(x + Math.sin(th.t * 2) * 12, (th.y + this.y + this.h * .3) / 2 - cam.cy, this.cx - cam.cx, this.y + this.h * .3 - cam.cy);
        ctx.stroke();
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        glow(ctx, x, th.y + 40 - cam.cy, 26, '#9fd8ff', .5 + Math.sin(th.t * 4) * .2);
        ctx.restore();
        // hp pips
        ctx.fillStyle = 'rgba(0,0,0,.6)'; roundRect(ctx, x - 18, th.y - cam.cy - 14, 36, 6, 3); ctx.fill();
        ctx.fillStyle = '#9fd8ff'; roundRect(ctx, x - 17, th.y - cam.cy - 13, 34 * (th.hp / 3), 4, 2); ctx.fill();
      } else {
        ctx.strokeStyle = rgba('#d8f0ff', .2); ctx.lineWidth = 2; ctx.setLineDash([6, 8]);
        ctx.beginPath(); ctx.moveTo(x, th.y - cam.cy); ctx.lineTo(x, th.y + 60 - cam.cy); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.restore();
    }
    if (this.tongue) {
      ctx.save(); ctx.strokeStyle = '#d8f0ff'; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(this.cx - cam.cx, this.cy - cam.cy);
      ctx.lineTo(this.cx + Math.cos(this.tongue.a) * this.tongue.len - cam.cx, this.cy + Math.sin(this.tongue.a) * this.tongue.len - cam.cy);
      ctx.stroke();
      ctx.strokeStyle = rgba('#fff', .7); ctx.lineWidth = 2.4; ctx.stroke(); ctx.restore();
    }
  }
  drawBody(ctx, t, G, flash) {
    const W = this.w, H = this.h;
    // legs
    ctx.strokeStyle = flash ? '#fff' : '#2a5570'; ctx.lineWidth = 8; ctx.lineCap = 'round';
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
      const ph = Math.sin(t * 3 + i * 1.1 + (s > 0 ? 2 : 0)) * 12;
      const bx = s * W * (.2 + i * .1), by = -H * .55;
      ctx.beginPath(); ctx.moveTo(bx * .4, by);
      ctx.quadraticCurveTo(s * W * (.5 + i * .12), by - H * .3 + ph, s * W * (.66 + i * .1), 0 + ph * .4);
      ctx.stroke();
      ctx.strokeStyle = flash ? '#fff' : '#9fd8ff'; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(s * W * (.66 + i * .1), 0 + ph * .4); ctx.lineTo(s * W * (.68 + i * .1), 8 + ph * .4); ctx.stroke();
      ctx.strokeStyle = flash ? '#fff' : '#2a5570'; ctx.lineWidth = 8;
    }
    // abdomen
    const g = ctx.createRadialGradient(-W * .1, -H * .5, 4, 0, -H * .45, W * .6);
    g.addColorStop(0, flash ? '#fff' : '#4e7d99'); g.addColorStop(1, flash ? '#d0e8ff' : '#0e2434');
    ctx.fillStyle = g;
    ellipse(ctx, 0, -H * .45, W * .5, H * .38); ctx.fill();
    ctx.strokeStyle = rgba('#9fd8ff', .5); ctx.lineWidth = 2; ctx.stroke();
    // silk pattern
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba('#d8f0ff', .3); ctx.lineWidth = 1.4;
    for (let i = 1; i <= 3; i++) { ellipse(ctx, 0, -H * .45, W * .5 * (i / 4), H * .38 * (i / 4)); ctx.stroke(); }
    ctx.restore();
    // head (human-ish face)
    ctx.fillStyle = flash ? '#fff' : '#cfe3ef';
    ellipse(ctx, W * .3, -H * .72, W * .2, H * .14); ctx.fill();
    ctx.fillStyle = '#0e2434';
    for (const s of [-1, 1]) ellipse(ctx, W * .3 + s * W * .07, -H * .75, 4.4, 5.6); ctx.fill();
    ctx.fillStyle = '#ff5a7a';
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(W * .3 + s * W * .07, -H * .75, 2, 0, TAU); ctx.fill(); }
    ctx.strokeStyle = '#0e2434'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(W * .24, -H * .66); ctx.quadraticCurveTo(W * .3, -H * .63, W * .36, -H * .66); ctx.stroke();
    // hanging cocoons
    ctx.fillStyle = rgba('#d8f0ff', .55);
    for (let i = 0; i < 3; i++) {
      const cx2 = (i - 1) * W * .3, cy2 = -H * .12 + Math.sin(t * 1.4 + i) * 4;
      ctx.strokeStyle = rgba('#d8f0ff', .5); ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(cx2, -H * .2); ctx.lineTo(cx2, cy2 - 12); ctx.stroke();
      ellipse(ctx, cx2, cy2, 9, 13); ctx.fill();
    }
    if (this.anchored) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba('#9fd8ff', .3 + Math.sin(t * 3) * .1); ctx.lineWidth = 3;
      ellipse(ctx, 0, -H * .5, W * .72, H * .55); ctx.stroke(); ctx.restore();
    }
  }
}

/* ========================= DAY 8 · ABHIMANASURA ========================= */
export class Abhimanasura extends Boss {
  constructor(G, day, x, y) {
    super(G, day, x, y);
    this.flying = true; this.touchDmg = 2; this.mirrors = [];
    this.immuneText = 'HE FEEDS ON YOUR ATTENTION';
    this.buildMirrors(G, 2);
  }
  onPhase(G) {
    if (this.phase === 2) { this.spawnGuards(G); G.hud?.bossCue?.('THE MIRRORS SHIELD HIM', 'shatter every mirror — any weapon works'); }
    if (this.phase === 3) { this.spawnGuards(G); G.hud?.bossCue?.('LOOK AWAY', 'he is powerless when you refuse to see him'); this.mirrorless = true; }
    if (this.phase === 4) { G.hud?.bossCue?.('HE WEARS YOUR FACE', 'the ego copies everything you are'); this.mimicry = true; }
  }
  buildMirrors(G, n = 4) {
    const A = this.arena(G);
    this.mirrors = [];
    for (let i = 0; i < n; i++) this.mirrors.push({ x: lerp(A.l + 70, A.r - 70, n === 1 ? .5 : i / (n - 1)), y: A.floor, hp: 5, lock: 0, alive: true, t: rand(0, 9), h: 150, w: 46 });
  }
  spawnGuards(G) {
    const A = this.arena(G);
    for (let i = 0; i < 2; i++) {
      const e = new Enemy({ type: 'guard', x: lerp(A.l + 120, A.r - 120, i), y: A.floor, patrol: 170 }, G);
      G.enemies.push(e);
    }
  }
  thinkAlways(G, dt) {
    const p = G.player;
    // EVERY weapon shatters ego-glass: swings, cyclone, boomerang, charge — Phase-touch shatters fastest
    const srcs = [];
    if (p.atk) srcs.push(p.attackBox());
    if (p.cycSpin > 0) { const r = 80 + 4 * p.tier; srcs.push({ x: p.x + p.w / 2 - r, y: p.y + p.h / 2 - r, w: r * 2, h: r * 2 }); }
    if (p.boomerang) srcs.push({ x: p.boomerang.x - 14, y: p.boomerang.y - 14, w: 28, h: 28 });
    if (p.chargeT > 0) srcs.push({ x: p.x - 8, y: p.y - 4, w: p.w + 16, h: p.h + 8 });
    for (const m of this.mirrors) {
      m.t += dt;
      if (m.lock > 0) m.lock -= dt;
      if (!m.alive) continue;
      const box = { x: m.x - m.w / 2, y: m.y - m.h, w: m.w, h: m.h };
      for (const s of srcs) {
        if (m.lock <= 0 && aabb(s, box)) {
          m.hp -= p.phasing ? 3 : 1; m.lock = .3;
          G.audio.sfx('hit'); G.particles.burst(m.x, m.y - m.h * .6, 16, { color: ['#dfe8ff', '#fff'], spd: 280, size: 4, life: .6, shape: 'shard' });
          if (p.phasing && (!this._pc || G.time - this._pc > 4)) { this._pc = G.time; G.fx.text(m.x, m.y - m.h - 12, 'PHASE-TOUCH SHATTERS GLASS', { color: '#b9a7d6', size: 16, life: 1.1, crit: true }); }
          if (m.hp <= 0) {
            m.alive = false;
            G.audio.sfx('wallbreak'); G.fx.shake(10);
            G.particles.burst(m.x, m.y - m.h * .5, 40, { color: ['#dfe8ff', '#8ea0d8', '#fff'], spd: 400, size: 5, life: 1.1, gravity: 700, shape: 'shard' });
            G.fx.text(m.x, m.y - m.h, 'MIRROR SHATTERED', { color: '#dfe8ff', size: 18, crit: true });
          }
          break;
        }
      }
    }
    const alive = this.mirrors.filter((m) => m.alive).length;
    this.mirrorShield = alive > 0 && this.phase < 3;
    // "look away" vulnerability in phase 3 — but Phase-form is unseen by the ego
    if (this.phase >= 3 && !this.mirrorShield) {
      this.watched = sign(this.cx - (p.x + p.w / 2)) === p.facing && !p.phasing;
    } else this.watched = false;
  }
  hurt(G, dmg, o) {
    if (this.mirrorShield) {
      if (!this._cue || G.time - this._cue > 3) {
        this._cue = G.time;
        G.fx.text(this.cx, this.y - 16, 'SHATTER THE MIRRORS', { color: '#dfe8ff', size: 19, life: 1.2, crit: true });
        G.audio.sfx('error');
      }
      G.particles.spark(this.cx, this.cy, 10, '#dfe8ff', 260);
      return false;
    }
    if (this.watched) {
      if (!this._cue2 || G.time - this._cue2 > 2.6) {
        this._cue2 = G.time;
        G.fx.text(this.cx, this.y - 16, 'HE NEEDS AN AUDIENCE — LOOK AWAY', { color: '#ffe6a3', size: 18, life: 1.3, crit: true });
        G.hud?.bossCue?.('TURN YOUR BACK', 'ego cannot live unobserved');
        G.audio.sfx('error');
      }
      G.particles.spark(this.cx, this.cy, 8, '#ffe6a3', 220);
      return false;
    }
    return super.hurt(G, dmg, o);
  }
  think(G) {
    const r = rand(0, 1);
    if (this.mimicry && r < .3) return this.atkCopy(G);
    if (r < .3) return this.atkShards(G);
    if (r < .55) return this.atkClones(G);
    if (r < .8) return this.atkReflect(G);
    return this.atkSweep(G);
  }
  atkShards(G) {
    this.setAttack('shards', {
      windup: .5, active: .4, recover: .6, tick: .4,
      onActive: (GG) => {
        const n = 14;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + this.t * .5;
          this.fire(GG, { x: this.cx, y: this.cy, vx: Math.cos(a) * 380, vy: Math.sin(a) * 380, kind: 'shard', dmg: 1, life: 2.4 });
        }
      },
    });
  }
  atkClones(G) {
    this.setAttack('clones', {
      windup: .7, active: .2, recover: .9,
      onStart: (GG) => {
        const A = this.arena(GG);
        const n = this.phase >= 4 ? 3 : 2;
        for (let i = 0; i < n; i++) GG.enemies.push(new Enemy({ type: 'clone', x: lerp(A.l + 60, A.r - 60, rand(0, 1)), y: A.floor - 40 }, GG));
        GG.audio.sfx('phase');
        GG.particles.burst(this.cx, this.cy, 30, { color: ['#8b5cf6', '#dfe8ff'], spd: 280, size: 5, life: .8 });
      },
    });
  }
  atkReflect(G) {
    this.setAttack('reflect', {
      windup: .8, active: 1.4, recover: .7, tick: .1,
      onStart: (GG) => { this.laserA = this.aim(GG); GG.audio.sfx('laser'); },
      onActive: (GG) => {
        const A = this.arena(GG);
        this.laserA = lerp(this.laserA, Math.PI * .12 * (this.laserA > 0 ? 1 : -1), .01);
        const len = 1100;
        const ex = this.cx, ey = this.cy;
        this.beam = { ex, ey, bx: ex + Math.cos(this.laserA) * len, by: ey + Math.sin(this.laserA) * len };
        const p = GG.player, px = p.x + p.w / 2, py = p.y + p.h / 2;
        const tt = clamp(((px - ex) * Math.cos(this.laserA) + (py - ey) * Math.sin(this.laserA)) / len, 0, 1);
        if (dist(px, py, ex + Math.cos(this.laserA) * len * tt, ey + Math.sin(this.laserA) * len * tt) < 22) p.hurt(GG, 1, { sx: ex, kx: sign(px - ex) * 300, ky: -240 });
      },
      onEnd: () => { this.beam = null; },
    });
  }
  atkSweep(G) {
    this.setAttack('sweep', {
      windup: .55, active: 1.1, recover: .6, tick: .12,
      onStart: (GG) => { this.sweepDir = sign(GG.player.x - this.cx) || 1; },
      onActive: (GG) => {
        const A = this.arena(GG);
        this.x += this.sweepDir * 340 * .016;
        if (this.cx < A.l + 40 || this.cx > A.r - 40) this.sweepDir *= -1;
        GG.world.damageArea(GG, { x: this.x - 10, y: this.y, w: this.w + 20, h: this.h }, { dmg: 2, from: 'boss', hitPlayer: true, sx: this.cx });
        if (rand(0, 1) < .6) GG.particles.burst(this.cx, this.cy, 2, { color: ['#dfe8ff', '#fff'], spd: 120, size: 3, life: .4, shape: 'shard' });
      },
    });
  }
  atkCopy(G) {
    this.setAttack('copy', {
      windup: .4, active: .8, recover: .6, tick: .2,
      onStart: (GG) => { GG.hud?.bossCue?.('HE COPIES YOU', ''); },
      onActive: (GG) => {
        const p = GG.player;
        const a = Math.atan2(p.y - this.cy, p.x - this.cx);
        for (let i = -1; i <= 1; i++) this.fire(GG, { x: this.cx, y: this.cy, vx: Math.cos(a + i * .22) * 460, vy: Math.sin(a + i * .22) * 460, kind: 'dark', dmg: 1 });
      },
    });
  }
  drawExtras(ctx, cam, t, G) {
    for (const m of this.mirrors) {
      if (!m.alive) continue;
      const x = m.x - cam.cx, y = m.y - cam.cy;
      ctx.save();
      const g = ctx.createLinearGradient(x - m.w / 2, y - m.h, x + m.w / 2, y);
      g.addColorStop(0, rgba('#dfe8ff', .5)); g.addColorStop(.5, rgba('#8ea0d8', .8)); g.addColorStop(1, rgba('#2a3358', .9));
      ctx.fillStyle = g;
      roundRect(ctx, x - m.w / 2, y - m.h, m.w, m.h, 6); ctx.fill();
      ctx.strokeStyle = rgba('#ffe6a3', .8); ctx.lineWidth = 3; ctx.stroke();
      // reflection of Mushika inside
      ctx.save();
      ctx.beginPath(); ctx.rect(x - m.w / 2 + 3, y - m.h + 3, m.w - 6, m.h - 6); ctx.clip();
      ctx.globalAlpha = .5;
      ctx.translate(x, y - m.h * .5 + Math.sin(t * 2 + m.t) * 6);
      ctx.scale(.9, .9);
      ctx.fillStyle = '#1a1030';
      ellipse(ctx, 0, 0, 11, 13); ctx.fill();
      ctx.beginPath(); ctx.arc(-7, -14, 6, 0, TAU); ctx.arc(7, -14, 6, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      glow(ctx, x, y - m.h * .5, m.w * 1.5, '#dfe8ff', .18 + Math.sin(t * 3 + m.t) * .06);
      ctx.restore();
      // hp
      ctx.fillStyle = 'rgba(0,0,0,.6)'; roundRect(ctx, x - 22, y - m.h - 16, 44, 6, 3); ctx.fill();
      ctx.fillStyle = '#dfe8ff'; roundRect(ctx, x - 21, y - m.h - 15, 42 * (m.hp / 6), 4, 2); ctx.fill();
      ctx.restore();
    }
    if (this.beam) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba('#dfe8ff', .8); ctx.lineWidth = 10;
      ctx.beginPath(); ctx.moveTo(this.beam.ex - cam.cx, this.beam.ey - cam.cy); ctx.lineTo(this.beam.bx - cam.cx, this.beam.by - cam.cy); ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
    }
    if (this.watched) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba('#ffe6a3', .35 + Math.sin(t * 5) * .15); ctx.lineWidth = 4;
      const x = this.cx - cam.cx, y = this.y + this.h / 2 - cam.cy;
      ctx.beginPath(); ctx.arc(x, y, this.w * .8, 0, TAU); ctx.stroke();
      ctx.restore();
    }
  }
  drawBody(ctx, t, G, flash) {
    const W = this.w, H = this.h;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    glow(ctx, 0, -H * .55, W, '#dfe8ff', .22);
    // orbiting shards
    for (let i = 0; i < 7; i++) {
      const a = t * .9 + i / 7 * TAU;
      const rx = Math.cos(a) * W * .8, ry = Math.sin(a) * H * .35;
      ctx.save(); ctx.translate(rx, -H * .55 + ry); ctx.rotate(a * 2);
      ctx.fillStyle = rgba('#ffffff', .55);
      ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(5, 0); ctx.lineTo(0, 9); ctx.lineTo(-5, 0); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    // crystalline body
    const g = ctx.createLinearGradient(0, -H, 0, 0);
    g.addColorStop(0, flash ? '#ffffff' : '#eef3ff'); g.addColorStop(.5, flash ? '#e8eeff' : '#8ea0d8'); g.addColorStop(1, flash ? '#c8d4ff' : '#1b2444');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -H * 1.16);
    ctx.lineTo(W * .34, -H * .74); ctx.lineTo(W * .26, -H * .2); ctx.lineTo(W * .4, 0);
    ctx.lineTo(-W * .4, 0); ctx.lineTo(-W * .26, -H * .2); ctx.lineTo(-W * .34, -H * .74);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = rgba('#ffffff', .65); ctx.lineWidth = 2; ctx.stroke();
    // facet lines
    ctx.strokeStyle = rgba('#ffffff', .28); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(0, -H * 1.16); ctx.lineTo(0, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-W * .34, -H * .74); ctx.lineTo(W * .26, -H * .2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W * .34, -H * .74); ctx.lineTo(-W * .26, -H * .2); ctx.stroke();
    // the elephant-face mask (Gajamukhasura's old face)
    ctx.save();
    ctx.translate(0, -H * .86);
    ctx.fillStyle = flash ? '#fff' : '#ffe6a3';
    ellipse(ctx, 0, 0, W * .22, H * .12); ctx.fill();
    ctx.beginPath(); ctx.arc(-W * .2, -2, W * .11, 0, TAU); ctx.arc(W * .2, -2, W * .11, 0, TAU); ctx.fill();
    // trunk
    ctx.strokeStyle = flash ? '#fff' : '#ffe6a3'; ctx.lineWidth = W * .09; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, H * .05);
    ctx.quadraticCurveTo(Math.sin(t * 2) * 14, H * .2, Math.sin(t * 2) * 22, H * .34); ctx.stroke();
    // tusks
    ctx.strokeStyle = '#fff8e6'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-W * .1, H * .06); ctx.lineTo(-W * .17, H * .16); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W * .1, H * .06); ctx.lineTo(W * .17, H * .16); ctx.stroke();
    // eyes
    ctx.fillStyle = '#12060c';
    for (const s of [-1, 1]) ellipse(ctx, s * W * .1, -H * .02, 5.4, 6.6); ctx.fill();
    ctx.fillStyle = this.watched ? '#ffe66b' : '#ff5a7a';
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * W * .1, -H * .02, 2.6, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
}

/* ============================= DAY 9 · SINDHU =========================== */
const SEALS = ['boomerang', 'charge', 'truesight', 'pull', 'shield', 'focus', 'phase', 'smoke'];

export class Sindhu extends Boss {
  constructor(G, day, x, y) {
    super(G, day, x, y);
    this.flying = true; this.touchDmg = 2; this.stage = 1;
    this.immuneText = 'THE NECTAR PROTECTS HIM';
    this.seals = []; this.sealPhase = false;
    this.parashu = { ring: 0, hits: 0, need: 3, state: 'idle', t: 0 };
    this.w *= 1.1; this.h *= 1.1;
  }
  weak(G) { return { x: this.cx, y: this.y + this.h * .58 }; }
  onPhase(G) {
    if (this.phase === 2) { this.stage = 2; this.nodes = this.makeNodes(G, 3, 'nectar'); G.hud?.bossCue?.('TIDE OF ENVY', 'shatter the three nectar-nodes'); this.guardKind = 'nodes'; }
    if (this.phase === 3) { this.stage = 3; this.armor = true; this.guardKind = 'armor'; this.chargeHits = 0; G.hud?.bossCue?.('ARMOUR OF PRIDE', 'only Ekadanta\u2019s Charge can break it'); }
    if (this.phase === 4) { this.stage = 4; this.armor = false; this.guardKind = 'furnace'; this.absorbNeed = 3; G.hud?.bossCue?.('FURNACE OF RAGE', 'absorb three flames with the Shield, then release'); }
    if (this.phase === 5) { this.stage = 5; this.guardKind = null; this.beginSeals(G); }
  }
  makeNodes(G, n, kind) {
    const out = [];
    for (let i = 0; i < n; i++) out.push({ a: (i / n) * TAU, r: 190, hp: 3, lock: 0, alive: true, kind });
    return out;
  }
  beginSeals(G) {
    this.sealPhase = true;
    this.invuln = 999;
    this.seals = SEALS.map((id, i) => ({ id, done: false, a: (i / SEALS.length) * TAU }));
    G.audio.sfx('boon');
    G.hud?.bossCue?.('THE EIGHT SEALS', 'use every boon — shatter them all');
    G.hud?.showSeals?.(this.seals);
    this.refreshPlayer(G);
  }
  thinkAlways(G, dt) {
    // orbiting nodes
    if (this.nodes.length) {
      let alive = 0;
      for (const n of this.nodes) {
        n.a += dt * .8;
        if (n.alive) alive++;
        const nx = this.cx + Math.cos(n.a) * n.r, ny = this.cy + Math.sin(n.a) * n.r * .55;
        n.x = nx; n.y = ny;
        // EVERY weapon shatters nodes: swings, boomerang, cyclone, charge
        const box = { x: nx - 22, y: ny - 22, w: 44, h: 44 };
        const p = G.player;
        const srcs = [];
        if (p.atk) srcs.push(p.attackBox());
        if (p.boomerang) srcs.push({ x: p.boomerang.x - 14, y: p.boomerang.y - 14, w: 28, h: 28 });
        if (p.cycSpin > 0) { const r = 80 + 4 * p.tier; srcs.push({ x: p.x + p.w / 2 - r, y: p.y + p.h / 2 - r, w: r * 2, h: r * 2 }); }
        if (p.chargeT > 0) srcs.push({ x: p.x - 8, y: p.y - 4, w: p.w + 16, h: p.h + 8 });
        if (n.lock > 0) n.lock -= dt;
        for (const s of srcs) {
          if (n.lock <= 0 && aabb(s, box)) { n.hp--; n.lock = .28; G.audio.sfx('hit'); G.particles.burst(nx, ny, 12, { color: ['#7fe8ff', '#fff'], spd: 240, size: 4, life: .5 }); break; }
        }
        // while nodes guard him, Sindhu sinks low so the ring is within reach
        if (this.guardKind === 'nodes') { const A = this.arena(G); const ty = A.floor - this.h - 40; this.y += clamp(ty - this.y, -90 * dt, 90 * dt); }
        if (n.hp <= 0 && n.alive) {
          n.alive = false;
          G.audio.sfx('explosion'); G.fx.shake(9);
          G.particles.burst(nx, ny, 34, { color: ['#7fe8ff', '#e0f8ff', '#fff'], spd: 340, size: 5, life: .9 });
          G.fx.text(nx, ny - 20, 'NODE SHATTERED', { color: '#7fe8ff', size: 18, crit: true });
        }
      }
      if (alive === 0 && this.guardKind === 'nodes') {
        this.guardKind = null; this.invuln = 0;
        G.hud?.bossCue?.('HE IS EXPOSED', 'strike!');
        G.audio.sfx('gate');
        this.stagger(G, 3.4);
      }
    }
    // armour / furnace guards (also broken directly from hurt() and notifyAbsorb())
    if (this.guardKind === 'armor' && this.chargeHits >= 3) this.breakArmour(G);
    if (this.guardKind === 'furnace' && this.absorbed >= this.absorbNeed) this.breakFurnace(G);
    // seals
    if (this.sealPhase) {
      for (const s of this.seals) { s.a += dt * .3; }
      const left = this.seals.filter((s) => !s.done).length;
      if (left === 0 && !this._sealsDone) {
        this._sealsDone = true;
        this.sealPhase = false; this.invuln = 999;
        G.hud?.hideSeals?.();
        G.audio.sfx('boon'); G.fx.flash('bless'); G.fx.shake(24); G.fx.stop(.4);
        for (let i = 0; i < 6; i++) G.particles.shockwave(this.cx, this.cy, 200 + i * 120, i % 2 ? '#ffe6a3' : '#7fe8ff', 1 + i * .2);
        G.particles.confetti(this.cx, this.cy, 90);
        G.hud?.bossCue?.('THE NECTAR BOWL IS BARE', '');
        this.startParashu(G);
      }
    }
    // nectar droplets heal him
    const drops = G.enemies.filter((e) => e.healsBoss && !e.dead).length;
    if (this.stage >= 2 && drops < 2 && rand(0, 1) < dt * .12 && G.enemies.length < 10) {
      const A = this.arena(G);
      const e = new Enemy({ type: 'flyer', x: rand(A.l + 60, A.r - 60), y: A.floor - rand(150, 260), kind: 'garuda', scale: .7 }, G);
      e.healsBoss = true; e.hp = 2; e.maxHp = 2; G.enemies.push(e);
      if (!this._dropCue) { this._dropCue = true; G.hud?.toast?.('THE NECTAR DROPS FEED HIM — swat them down (J or K)!', '💧', 'gold', 6000); }
    }
    for (const e of G.enemies) {
      if (e.healsBoss && !e.dead) {
        this.hp = Math.min(this.maxHp * .99, this.hp + 2.5 * dt);
        if (rand(0, 1) < dt * 8) G.particles.add({ x: e.cx, y: e.cy, vx: (this.cx - e.cx) * .6, vy: (this.cy - e.cy) * .6, life: .6, size: 3, color: '#7fe8ff', shape: 'dot', glowy: true, drag: 0 });
      }
    }
  }
  breakArmour(G) {
    if (this.guardKind !== 'armor') return;
    this.armor = false; this.guardKind = null; this.invuln = 0; this.chargeHits = 0;
    G.audio.sfx('wallbreak'); G.fx.shake(20); G.fx.stop(.12);
    G.particles.burst(this.cx, this.cy, 70, { color: ['#e8c25a', '#fff3d0', '#ffd166'], spd: 480, size: 6, life: 1.2, gravity: 600 });
    G.particles.shockwave(this.cx, this.cy, 420, '#ffd166', .8);
    G.hud?.bossCue?.('THE ARMOUR BREAKS', 'now — while he reels');
    this.stagger(G, 4);
  }
  breakFurnace(G) {
    if (this.guardKind !== 'furnace') return;
    this.guardKind = null; this.invuln = 0; this.absorbed = 0;
    G.audio.sfx('explosion'); G.fx.shake(18); G.fx.stop(.12);
    G.particles.burst(this.cx, this.cy, 60, { color: ['#ff8a1f', '#ffd166', '#fff3d0'], spd: 460, size: 6, life: 1.1, gravity: 400 });
    G.particles.shockwave(this.cx, this.cy, 400, '#ff8a1f', .8);
    G.hud?.bossCue?.('HIS FURY TURNED BACK', 'release the Shield (C)!');
    this.stagger(G, 4);
  }
  stagger(G, dur) {
    this.state = 'stagger'; this.st = 0; this.staggerT = dur; this.atk = null;
    this.invuln = 0;
    G.audio.sfx('roar');
    G.particles.burst(this.cx, this.cy, 40, { color: ['#fff3d0', this.meta.color], spd: 340, size: 5, life: 1 });
  }
  hurt(G, dmg, o) {
    // nodes block normal damage
    if (this.guardKind === 'nodes') {
      // boomerang/attack hits nodes handled in thinkAlways; also allow direct node hit by projectile
      G.particles.spark(this.cx, this.cy, 8, '#7fe8ff', 240);
      if (!this._c1 || G.time - this._c1 > 3) { this._c1 = G.time; G.fx.text(this.cx, this.y - 18, 'SHATTER THE NECTAR NODES', { color: '#7fe8ff', size: 19, life: 1.2, crit: true }); G.audio.sfx('error'); }
      return false;
    }
    if (this.guardKind === 'armor') {
      if (o.from === 'charge' || o.armorBreak) {
        this.chargeHits = (this.chargeHits || 0) + 1;
        G.audio.sfx('wallbreak'); G.fx.shake(14);
        if (this.chargeHits < 3) G.fx.stop(.09);
        G.particles.burst(this.cx, this.cy, 40, { color: ['#e8c25a', '#fff'], spd: 420, size: 6, life: .9, gravity: 600 });
        G.fx.text(this.cx, this.y - 16, `ARMOUR ${this.chargeHits}/3`, { color: '#ffd166', size: 22, crit: true, life: 1 });
        if (this.chargeHits >= 3) this.breakArmour(G);
        return false;
      }
      G.particles.spark(this.cx, this.cy, 8, '#e8c25a', 240);
      if (!this._c2 || G.time - this._c2 > 3) { this._c2 = G.time; G.fx.text(this.cx, this.y - 18, 'CHARGE HIM (Ekadanta)', { color: '#ffd166', size: 19, life: 1.2, crit: true }); G.audio.sfx('error'); }
      return false;
    }
    if (this.guardKind === 'furnace') {
      G.particles.spark(this.cx, this.cy, 8, '#ff8a1f', 240);
      if (!this._c3 || G.time - this._c3 > 3) { this._c3 = G.time; G.fx.text(this.cx, this.y - 18, 'ABSORB HIS FIRE WITH THE SHIELD', { color: '#ff8a1f', size: 19, life: 1.2, crit: true }); G.audio.sfx('error'); }
      return false;
    }
    if (this.sealPhase) {
      G.particles.spark(this.cx, this.cy, 8, '#ffe6a3', 240);
      if (!this._c4 || G.time - this._c4 > 3) { this._c4 = G.time; G.fx.text(this.cx, this.y - 18, 'USE EACH BOON — SHATTER THE SEALS', { color: '#ffe6a3', size: 19, life: 1.3, crit: true }); G.audio.sfx('error'); }
      return false;
    }
    return super.hurt(G, dmg, o);
  }
  notifyAbsorb(G) {
    if (this.guardKind !== 'furnace') return;
    this.absorbed = (this.absorbed || 0) + 1;
    G.fx.text(this.cx, this.y - 22, `ABSORBED ${this.absorbed}/${this.absorbNeed}`, { color: '#ff8a1f', size: 20, crit: true, life: .9 });
    G.audio.sfx('reflect');
    if (this.absorbed >= this.absorbNeed) {
      G.hud?.bossCue?.('HIS FURY IS YOURS', 'release the Shield (C) to break him');
      this.breakFurnace(G);
    }
  }
  /** called when the player successfully uses a boon during the seal phase */
  breakSeal(G, boonId) {
    if (!this.sealPhase) return false;
    const s = this.seals.find((x) => x.id === boonId && !x.done);
    if (!s) return false;
    s.done = true;
    G.audio.sfx('wallbreak'); G.fx.shake(14); G.fx.stop(.08);
    const sx = this.cx + Math.cos(s.a) * 210, sy = this.cy + Math.sin(s.a) * 120;
    G.particles.burst(sx, sy, 40, { color: ['#ffe6a3', '#fff3d0', '#7fe8ff'], spd: 400, size: 6, life: 1 });
    G.particles.shockwave(sx, sy, 220, '#ffe6a3', .6);
    const b = BOONS.find((x) => x.id === boonId);
    G.fx.text(sx, sy - 24, `${b.key.toUpperCase()} SEAL BROKEN`, { color: '#ffe6a3', size: 20, crit: true, life: 1.2 });
    G.hud?.updateSeals?.(this.seals);
    this.hp -= this.maxHp * .012;
    this.refreshPlayer(G);
    return true;
  }
  refreshPlayer(G) {
    const p = G.player;
    p.bhakti = p.maxBhakti;
    for (const k of Object.keys(p.cds)) p.cds[k] = 0;
    p.invuln = Math.max(p.invuln, .4);
  }
  think(G) {
    if (this.state === 'stagger' || this.sealPhase) { this.cd = .8; return; }
    const r = rand(0, 1);
    if (this.stage >= 3 && r < .22) return this.atkTsunami(G);
    if (this.stage >= 2 && r < .44) return this.atkLaser(G);
    if (r < .68) return this.atkNectar(G);
    if (r < .86) return this.atkSlam(G);
    return this.atkArms(G);
  }
  update(dt, G) {
    if (this.state === 'stagger') {
      this.st += dt; this.t += dt;
      this.staggerT -= dt;
      this.bob = Math.sin(this.t * 20) * 3;
      if (rand(0, 1) < dt * 20) G.particles.burst(this.cx + rand(-60, 60), this.cy + rand(-60, 60), 2, { color: ['#fff3d0', this.meta.color], spd: 120, size: 4, life: .6 });
      if (this.staggerT <= 0) { this.state = 'fight'; this.cd = .6; if (this.guardKind === null && this.stage < 5) this.invuln = 0; }
      // still allow touch damage
      const p = G.player;
      if (!p.dead && aabb(this.hitRect, p)) p.hurt(G, 1, { sx: this.cx, kx: sign(p.x - this.cx) * 400, ky: -300 });
      return;
    }
    super.update(dt, G);
  }
  atkNectar(G) {
    this.setAttack('nectar', {
      windup: .55, active: 1.2, recover: .6, tick: .17,
      onActive: (GG) => {
        const n = this.stage >= 4 ? 3 : 2;
        for (let i = 0; i < n; i++) {
          const a = this.aim(GG, (i - (n - 1) / 2) * .26 + rand(-.06, .06));
          this.fire(GG, { x: this.cx, y: this.cy, vx: Math.cos(a) * 470, vy: Math.sin(a) * 470, kind: 'nectar', dmg: 1, homing: this.stage >= 3 ? .8 : 0, trail: { color: '#7fe8ff', life: .4, size: .7 } });
        }
      },
    });
  }
  atkSlam(G) {
    this.setAttack('slam', {
      windup: .7, active: .3, recover: 1,
      onStart: (GG) => {
        const A = this.arena(GG);
        GG.audio.sfx('explosion'); GG.fx.shake(18);
        GG.particles.shockwave(this.cx, A.floor, 420, '#7fe8ff', .8);
        for (const s of [-1, 1]) { this.shockwave(GG, s, 2, 430, 'nectar', A.floor - 20); this.shockwave(GG, s, 1, 280, 'nectar', A.floor - 20); }
        GG.world.damageArea(GG, { x: this.cx - 130, y: A.floor - 90, w: 260, h: 90 }, { dmg: 2, from: 'boss', hitPlayer: true, sx: this.cx });
        for (let i = 0; i < 30; i++) GG.particles.add({ x: this.cx + rand(-140, 140), y: A.floor, vx: rand(-200, 200), vy: rand(-420, -120), life: rand(.5, 1.2), size: rand(3, 7), color: '#bfeeff', shape: 'dot', glowy: true, gravity: 700 });
      },
    });
  }
  atkTsunami(G) {
    this.setAttack('tsunami', {
      windup: 1, active: .3, recover: 1.2,
      onStart: (GG) => {
        const A = this.arena(GG);
        GG.audio.sfx('shootBig');
        for (const s of [-1, 1]) {
          GG.projectiles.push(new Projectile({ x: this.cx + s * 40, y: A.floor - 46, vx: s * 330, vy: 0, kind: 'wave', dmg: 2, owner: 'enemy', life: 4, gravity: 0, ghost: true, r: 46, scale: 1.6, color: '#7fe8ff', shape: 'wave' }));
        }
        GG.hud?.bossCue?.('TSUNAMI', 'jump!');
      },
    });
  }
  atkLaser(G) {
    this.setAttack('laser', {
      windup: .9, active: 1.8, recover: .8, tick: .1,
      onStart: (GG) => { this.laserY = GG.world.data.bossArena.y - 60; GG.audio.sfx('laser'); GG.hud?.bossCue?.('SPIRIT BARRIER', 'Phase through it'); },
      onActive: (GG) => {
        this.laserY = lerp(this.laserY, GG.player.y + GG.player.h / 2, .012);
        const A = this.arena(GG);
        this.beam = { ex: A.l - 40, ey: this.laserY, bx: A.r + 40, by: this.laserY };
        const p = GG.player;
        if (Math.abs(p.y + p.h / 2 - this.laserY) < 20 && !p.phasing) p.hurt(GG, 1, { sx: this.cx, kx: sign(p.x - this.cx) * 320, ky: -200 });
        if (rand(0, 1) < .7) GG.particles.add({ x: rand(A.l, A.r), y: this.laserY, vx: rand(-60, 60), vy: rand(-60, 60), life: .3, size: rand(2, 5), color: '#7fe8ff', shape: 'dot', glowy: true });
      },
      onEnd: () => { this.beam = null; },
    });
  }
  atkArms(G) {
    this.setAttack('arms', {
      windup: .5, active: 1.4, recover: .6, tick: .1,
      onStart: (GG) => { this.armDir = sign(GG.player.x - this.cx) || 1; },
      onActive: (GG) => {
        const A = this.arena(GG);
        this.x += this.armDir * 240 * .016;
        if (this.cx < A.l + 60 || this.cx > A.r - 60) this.armDir *= -1;
        this.facing = this.armDir;
        GG.world.damageArea(GG, { x: this.x - 12, y: this.y, w: this.w + 24, h: this.h }, { dmg: 2, from: 'boss', hitPlayer: true, sx: this.cx });
      },
    });
  }
  onHurt(G, d) {
    if (this.guardKind === 'furnace' && G.player.shielded) { /* handled by absorb */ }
  }
  /* ---- parashu finale ---- */
  startParashu(G) {
    this.state = 'parashu'; this.st = 0;
    this.parashu = { ring: 2.4, hits: 0, need: 3, state: 'ring', t: 0, flash: 0 };
    G.audio.setMode('silence');
    G.audio.sfx('blessing');
    G.fx.flash('bless');
    G.hud?.bossCue?.('THE PARASHU DESCENDS', 'press ATTACK when the ring meets the axe');
    G.hud?.hideBoss?.();
  }
  parashuUpdate(dt, G) {
    const q = this.parashu;
    q.t += dt; q.flash = Math.max(0, q.flash - dt * 2);
    this.t += dt;
    if (q.state === 'ring') {
      q.ring -= dt * (1.05 + q.hits * .34);
      if (G.input.pressed('attack') || G.input.pressed('jump')) {
        const err = Math.abs(q.ring - .62);
        if (err < (G.settings?.difficulty === 'story' ? .17 : .09)) {
          q.hits++; q.flash = 1; q.ring = 2.4;
          G.audio.sfx('axe'); G.fx.shake(22); G.fx.stop(.16); G.fx.flash('hit');
          G.particles.burst(this.cx, this.y + this.h * .58, 60, { color: ['#fff8e6', '#ffe6a3', '#7fe8ff'], spd: 520, size: 7, life: 1.1, gravity: 300 });
          G.particles.shockwave(this.cx, this.y + this.h * .58, 300 + q.hits * 120, '#fff8e6', .7);
          G.fx.text(this.cx, this.y - 20, q.hits === 1 ? 'THE BOWL CRACKS' : q.hits === 2 ? 'THE NECTAR TREMBLES' : 'SHATTERED', { color: '#fff8e6', size: 26, crit: true, life: 1.4 });
          this.hp -= this.maxHp * .08;
          if (q.hits >= q.need) { q.state = 'final'; q.t = 0; }
        } else {
          q.ring = 2.4;
          G.audio.sfx('error'); G.fx.shake(6);
          G.fx.text(this.cx, this.y - 20, 'THE MOMENT PASSES', { color: '#ff9fb0', size: 18, life: .9 });
        }
      }
      if (q.ring <= .1) { q.ring = 2.4; G.audio.sfx('error'); }
    } else if (q.state === 'final') {
      if (q.t > 1.1 && !this._final) {
        this._final = true;
        this.hp = 0;
        G.audio.sfx('axe');
        this.beginDeath(G);
      }
    }
  }
  drawExtras(ctx, cam, t, G) {
    // beam
    if (this.beam) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba('#7fe8ff', .55); ctx.lineWidth = 34;
      ctx.beginPath(); ctx.moveTo(this.beam.ex - cam.cx, this.beam.ey - cam.cy); ctx.lineTo(this.beam.bx - cam.cx, this.beam.by - cam.cy); ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 8; ctx.stroke();
      ctx.restore();
    }
    // nodes
    for (const n of this.nodes) {
      if (!n.alive) continue;
      const x = n.x - cam.cx, y = n.y - cam.cy;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      glow(ctx, x, y, 46, '#7fe8ff', .45);
      ctx.restore();
      ctx.save(); ctx.translate(x, y); ctx.rotate(t * 1.4);
      ctx.fillStyle = '#e0f8ff'; starPath(ctx, 0, 0, 6, 20, 9); ctx.fill();
      ctx.strokeStyle = '#7fe8ff'; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
      ctx.fillStyle = 'rgba(0,0,0,.6)'; roundRect(ctx, x - 18, y - 34, 36, 5, 3); ctx.fill();
      ctx.fillStyle = '#7fe8ff'; roundRect(ctx, x - 17, y - 33, 34 * clamp(n.hp / 4, 0, 1), 3, 2); ctx.fill();
    }
    // seals
    if (this.sealPhase) {
      for (const s of this.seals) {
        const x = this.cx + Math.cos(s.a) * 210 - cam.cx;
        const y = this.cy + Math.sin(s.a) * 120 - cam.cy;
        ctx.save();
        ctx.translate(x, y);
        if (!s.done) {
          ctx.globalCompositeOperation = 'lighter';
          glow(ctx, 0, 0, 40, '#ffe6a3', .3 + Math.sin(t * 4 + s.a) * .12);
          ctx.globalCompositeOperation = 'source-over';
          ctx.strokeStyle = '#ffe6a3'; ctx.lineWidth = 2.6;
          ctx.beginPath(); ctx.arc(0, 0, 22, 0, TAU); ctx.stroke();
          ctx.rotate(t * .8);
          starPath(ctx, 0, 0, 8, 22, 12); ctx.stroke();
        } else {
          ctx.strokeStyle = rgba('#6ee7a8', .5); ctx.lineWidth = 2; ctx.setLineDash([4, 5]);
          ctx.beginPath(); ctx.arc(0, 0, 20, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        }
        ctx.restore();
      }
    }
    // parashu QTE
    if (this.state === 'parashu') {
      const q = this.parashu;
      const x = this.cx - cam.cx, y = this.y + this.h * .58 - cam.cy;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, x, y, 220, '#ffe6a3', .35 + q.flash * .5);
      ctx.globalCompositeOperation = 'source-over';
      // target ring
      ctx.strokeStyle = rgba('#ffe6a3', .9); ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(x, y, 62, 0, TAU); ctx.stroke();
      // shrinking ring
      const r = 62 + q.ring * 150;
      ctx.strokeStyle = q.ring < .8 ? '#fff8e6' : '#7fe8ff'; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
      // the axe
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 3) * .06);
      ctx.fillStyle = '#fff8e6';
      ctx.beginPath(); ctx.moveTo(-8, -46); ctx.quadraticCurveTo(52, -34, 44, 6); ctx.quadraticCurveTo(18, 14, -8, 6); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#ffe6a3'; ctx.lineWidth = 3; ctx.stroke();
      ctx.strokeStyle = '#8a5a12'; ctx.lineWidth = 9; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-6, 4); ctx.lineTo(-46, 52); ctx.stroke();
      ctx.restore();
      ctx.restore();
      // prompt text
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = '700 15px Rajdhani, sans-serif';
      ctx.fillStyle = 'rgba(255,240,210,.9)';
      ctx.fillText(`STRIKE ${q.hits}/${q.need}`, x, y + 108);
      ctx.restore();
    }
  }
  drawBody(ctx, t, G, flash) {
    const W = this.w, H = this.h;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    glow(ctx, 0, -H * .5, W * 1.3, '#7fe8ff', .24);
    ctx.restore();
    // wave body
    const g = ctx.createLinearGradient(0, -H * 1.2, 0, 0);
    g.addColorStop(0, flash ? '#ffffff' : '#bfeeff'); g.addColorStop(.35, flash ? '#dff6ff' : '#2a76b5'); g.addColorStop(1, flash ? '#9fd8ff' : '#06203a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-W * .46, 0);
    for (let i = 0; i <= 12; i++) {
      const k = i / 12;
      ctx.lineTo(-W * .46 + Math.sin(t * 2 + k * 5) * 10 * k, -H * k * 1.05);
    }
    ctx.quadraticCurveTo(0, -H * 1.24, W * .46, -H * 1.05);
    for (let i = 12; i >= 0; i--) {
      const k = i / 12;
      ctx.lineTo(W * .46 - Math.sin(t * 2 + k * 5 + 2) * 10 * k, -H * k * 1.05);
    }
    ctx.closePath(); ctx.fill();
    // foam crests
    ctx.strokeStyle = rgba('#ffffff', .5); ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      const yy = -H * (.2 + i * .22);
      ctx.beginPath();
      for (let x = -W * .44; x <= W * .44; x += 12) ctx.lineTo(x, yy + Math.sin(t * 3 + x * .05 + i) * 5);
      ctx.stroke();
    }
    // four arms holding weapons
    ctx.strokeStyle = flash ? '#fff' : '#1b5489'; ctx.lineWidth = W * .09; ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const s = i % 2 ? 1 : -1, k = Math.floor(i / 2);
      const a = Math.sin(t * 1.8 + i) * .25;
      ctx.beginPath();
      ctx.moveTo(s * W * .3, -H * (.86 - k * .18));
      ctx.quadraticCurveTo(s * W * (.72 + a * .2), -H * (.9 - k * .1), s * W * (.82 + a * .3), -H * (1.06 - k * .16));
      ctx.stroke();
      // weapon
      ctx.save(); ctx.translate(s * W * (.82 + a * .3), -H * (1.06 - k * .16)); ctx.rotate(s * (.4 + a));
      if (i % 3 === 0) { ctx.fillStyle = '#e8c25a'; ctx.beginPath(); ctx.moveTo(0, -26); ctx.lineTo(9, 8); ctx.lineTo(-9, 8); ctx.closePath(); ctx.fill(); }
      else if (i % 3 === 1) { ctx.strokeStyle = '#dfe8ff'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, 0, 15, .6, TAU - .6); ctx.stroke(); }
      else { ctx.fillStyle = '#ff6b3d'; ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU); ctx.fill(); }
      ctx.restore();
    }
    // head with coral crown
    ctx.fillStyle = flash ? '#fff' : '#63b8e8';
    ellipse(ctx, 0, -H * 1.1, W * .24, H * .12); ctx.fill();
    ctx.fillStyle = '#ff8a6a';
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath(); ctx.moveTo(i * W * .07 - 5, -H * 1.16);
      ctx.lineTo(i * W * .07, -H * (1.24 + Math.abs(i) * -.02 + hash3(i) * .06));
      ctx.lineTo(i * W * .07 + 5, -H * 1.16); ctx.closePath(); ctx.fill();
    }
    // eyes
    ctx.fillStyle = '#04121f';
    for (const s of [-1, 1]) ellipse(ctx, s * W * .1, -H * 1.1, 7, 8.6); ctx.fill();
    ctx.fillStyle = '#ffe6a3';
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * W * .1 + sign(G.player.x - this.cx) * -this.facing * 2, -H * 1.1, 3.4, 0, TAU); ctx.fill(); }
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const s of [-1, 1]) glow(ctx, s * W * .1, -H * 1.1, 26, '#ffe6a3', .5);
    ctx.restore();
    // the amrita bowl in the belly
    const by = -H * .5;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const pulse = .5 + Math.sin(t * 3) * .16 + (this.sealPhase ? .3 : 0);
    glow(ctx, 0, by, W * .55, '#e0f8ff', pulse * .6);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = rgba('#e0f8ff', .9);
    ctx.beginPath(); ctx.moveTo(-W * .16, by - 10);
    ctx.quadraticCurveTo(0, by + 26, W * .16, by - 10);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#ffe6a3'; ctx.lineWidth = 3; ctx.stroke();
    // cracks appear with each parashu hit
    const hits = this.parashu?.hits || 0;
    if (hits > 0) {
      ctx.strokeStyle = '#fff8e6'; ctx.lineWidth = 2.4;
      for (let i = 0; i < hits * 3; i++) {
        ctx.beginPath(); ctx.moveTo(0, by - 6);
        ctx.lineTo((hash3(i) - .5) * W * .3, by + (hash3(i + 9) - .3) * 30); ctx.stroke();
      }
    }
    ctx.restore();
  }
}
function hash3(n) { const s = Math.sin(n * 78.233 + 12.9898) * 43758.5453; return s - Math.floor(s); }

/* ------------------------------ registration ----------------------------- */
export const BOSS_CLASSES = {
  matsara: Matsurasura, mada: Madasura, moha: Mohasura, lobha: Lobhasura,
  krodha: Krodhasura, kama: Kamasura, mamata: Mamatasura, abhimana: Abhimanasura, sindhu: Sindhu,
};
export function createBoss(G, id, day, x, y) {
  const C = BOSS_CLASSES[id] || Matsurasura;
  return new C(G, day, x, y);
}
/* projectile shapes used by bosses that are not in entities' style table */
export const EXTRA_PROJ_SHAPES = ['vine', 'wave'];
