/* ===========================================================================
   game/entities.js — projectiles, pickups, shrines, switches, anchors, gates,
   and all environmental hazards.
   =========================================================================== */
import { TAU, clamp, rand, pick, dist, rgba, glow, aabb, roundRect, starPath, ellipse, lerp } from '../core/utils.js';

/* ------------------------------ PROJECTILES ------------------------------ */
const PROJ_STYLE = {
  orb:       { r: 9,  color: '#b6ff7a', shape: 'orb' },
  acid:      { r: 10, color: '#9dff5a', shape: 'blob' },
  fire:      { r: 13, color: '#ff8a1f', shape: 'fire' },
  fireball:  { r: 16, color: '#ff6b3d', shape: 'fire' },
  spore:     { r: 11, color: '#ff9fc4', shape: 'spore' },
  petal:     { r: 9,  color: '#ff6fa5', shape: 'petal' },
  coin:      { r: 8,  color: '#ffd166', shape: 'coin' },
  web:       { r: 11, color: '#cfe9ff', shape: 'web' },
  shard:     { r: 9,  color: '#dfe8ff', shape: 'shard' },
  laser:     { r: 7,  color: '#ff5a7a', shape: 'bolt' },
  nectar:    { r: 12, color: '#7fe8ff', shape: 'orb' },
  dark:      { r: 11, color: '#8b5cf6', shape: 'orb' },
  reflected: { r: 15, color: '#fff3d0', shape: 'star' },
  tusk:      { r: 14, color: '#7fe3ff', shape: 'tusk' },
  holy:      { r: 18, color: '#ffe6a3', shape: 'star' },
  axe:       { r: 26, color: '#fff8e6', shape: 'axe' },
  vine:      { r: 16, color: '#7ee06b', shape: 'vine' },
  wave:      { r: 46, color: '#7fe8ff', shape: 'wave' },
  thornvine: { r: 15, color: '#6fae4a', shape: 'vine' },
};

export class Projectile {
  constructor(o) {
    Object.assign(this, {
      x: 0, y: 0, vx: 0, vy: 0, kind: 'orb', dmg: 1, owner: 'enemy', life: 4, age: 0,
      gravity: 0, homing: 0, pierce: 0, hitIds: null, spin: 0, rot: 0, knock: 240,
      effect: null, onExpire: null, onHit: null, trail: null, scale: 1, dead: false,
    }, o);
    const st = PROJ_STYLE[this.kind] || PROJ_STYLE.orb;
    this.r = (o.r ?? st.r) * this.scale;
    this.color = o.color || st.color;
    this.shape = o.shape || st.shape;
    if (this.pierce > 0) this.hitIds = new Set();
  }
  get w() { return this.r * 2; }
  update(dt, G) {
    if (!Number.isFinite(this.x) || !Number.isFinite(this.y) || !Number.isFinite(this.vx) || !Number.isFinite(this.vy)) { this.dead = true; return; }
    this.age += dt;
    if (this.age > this.life) { this.expire(G); return; }
    if (this.homing && G.player && !G.player.dead) {
      const tx = G.player.x + G.player.w / 2, ty = G.player.y + G.player.h / 2;
      const a = Math.atan2(ty - this.y, tx - this.x);
      const cur = Math.atan2(this.vy, this.vx);
      let d = ((a - cur + Math.PI * 3) % TAU) - Math.PI;
      const na = cur + clamp(d, -this.homing * dt, this.homing * dt);
      const sp = Math.hypot(this.vx, this.vy);
      this.vx = Math.cos(na) * sp; this.vy = Math.sin(na) * sp;
    }
    this.vy += this.gravity * dt;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.rot += (this.spin || 6) * dt;
    if (this.trail && G.particles) {
      if (rand(0, 1) < .85) G.particles.add({ x: this.x + rand(-3, 3), y: this.y + rand(-3, 3), vx: -this.vx * .06, vy: -this.vy * .06, life: this.trail.life || .3, size: this.r * (this.trail.size || .5), color: this.trail.color || this.color, shape: this.trail.shape || 'dot', drag: 2, glowy: true });
    }
    // world bounds / solids
    const lv = G.level;
    if (lv) {
      if (this.x < -60 || this.x > lv.w + 60 || this.y > WORLD_BOTTOM) { this.expire(G); return; }
      if (!this.ghost) {
        for (const s of lv.solids) {
          if (!s.solid || s.kind === 'hidden' && !s.revealed) continue;
          if (this.x > s.x - this.r && this.x < s.x + s.w + this.r && this.y > s.y - this.r && this.y < s.y + s.h + this.r) {
            if (this.onWall) { this.onWall(G, s); } else this.expire(G);
            return;
          }
        }
      }
    }
  }
  expire(G) {
    if (this.dead) return;
    this.dead = true;
    if (G.particles) G.particles.burst(this.x, this.y, this.shape === 'fire' ? 12 : 7, { color: [this.color, '#fff3d0'], spd: 130, size: this.r * .42, life: .34, gravity: 90 });
    if (this.onExpire) this.onExpire(G);
  }
  hits(ent) {
    return this.x + this.r > ent.x && this.x - this.r < ent.x + ent.w && this.y + this.r > ent.y && this.y - this.r < ent.y + ent.h;
  }
  draw(ctx, cam, t, G) {
    const x = this.x - cam.cx, y = this.y - cam.cy, r = this.r;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, x, y, r * 3.4, this.color, .5);
    ctx.globalCompositeOperation = 'source-over';
    ctx.translate(x, y); ctx.rotate(this.rot);
    switch (this.shape) {
      case 'fire': {
        for (let i = 0; i < 3; i++) {
          ctx.globalAlpha = .85 - i * .22;
          ctx.fillStyle = i === 0 ? '#fff3d0' : i === 1 ? this.color : '#c1121f';
          const rr = r * (1 - i * .22);
          ctx.beginPath();
          ctx.moveTo(0, -rr * 1.5);
          ctx.quadraticCurveTo(rr, -rr * .3, rr * .8, rr * .7);
          ctx.quadraticCurveTo(0, rr * 1.3, -rr * .8, rr * .7);
          ctx.quadraticCurveTo(-rr, -rr * .3, 0, -rr * 1.5);
          ctx.fill();
        }
        break;
      }
      case 'blob': {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        for (let i = 0; i <= 12; i++) { const a = (i / 12) * TAU; const rr = r * (1 + Math.sin(a * 3 + t * 8) * .16); ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.arc(-r * .3, -r * .3, r * .26, 0, TAU); ctx.fill();
        break;
      }
      case 'spore': {
        ctx.fillStyle = rgba(this.color, .35); ctx.beginPath(); ctx.arc(0, 0, r * 1.5, 0, TAU); ctx.fill();
        ctx.fillStyle = this.color; ctx.beginPath(); ctx.arc(0, 0, r * .8, 0, TAU); ctx.fill();
        for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + t * 2; ctx.beginPath(); ctx.arc(Math.cos(a) * r * 1.15, Math.sin(a) * r * 1.15, r * .22, 0, TAU); ctx.fill(); }
        break;
      }
      case 'petal': {
        ctx.fillStyle = this.color;
        ctx.beginPath(); ctx.ellipse(0, 0, r * 1.3, r * .55, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = rgba('#ffffff', .5); ctx.beginPath(); ctx.ellipse(r * .3, -r * .12, r * .5, r * .2, 0, 0, TAU); ctx.fill();
        break;
      }
      case 'coin': {
        ctx.fillStyle = '#8a5a12'; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
        ctx.fillStyle = this.color; ctx.beginPath(); ctx.arc(-r * .12, -r * .12, r * .88, 0, TAU); ctx.fill();
        ctx.fillStyle = '#8a5a12'; ctx.font = `700 ${r * 1.1}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('ॐ', 0, r * .05);
        break;
      }
      case 'web': {
        ctx.strokeStyle = this.color; ctx.lineWidth = 1.6;
        for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); ctx.stroke(); }
        for (let k = 1; k <= 2; k++) { ctx.beginPath(); ctx.arc(0, 0, r * k * .5, 0, TAU); ctx.stroke(); }
        break;
      }
      case 'shard': {
        ctx.fillStyle = this.color; ctx.beginPath(); ctx.moveTo(0, -r * 1.6); ctx.lineTo(r * .7, 0); ctx.lineTo(0, r * 1.6); ctx.lineTo(-r * .7, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.moveTo(0, -r * 1.2); ctx.lineTo(r * .3, 0); ctx.lineTo(0, r * .4); ctx.closePath(); ctx.fill();
        break;
      }
      case 'bolt': {
        ctx.strokeStyle = this.color; ctx.lineWidth = r * .5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-r * 2.4, 0); ctx.lineTo(r * 1.4, 0); ctx.stroke();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = r * .2; ctx.beginPath(); ctx.moveTo(-r * 2, 0); ctx.lineTo(r * 1.2, 0); ctx.stroke();
        break;
      }
      case 'star': {
        ctx.fillStyle = '#fff8e6'; starPath(ctx, 0, 0, 5, r * 1.25, r * .5, t * 3); ctx.fill();
        ctx.fillStyle = this.color; starPath(ctx, 0, 0, 5, r * .8, r * .3, t * 3); ctx.fill();
        break;
      }
      case 'tusk': {
        ctx.rotate(Math.sin(t * 20) * .1);
        ctx.fillStyle = '#eaf6ff';
        ctx.beginPath(); ctx.moveTo(-r * 1.5, 0); ctx.quadraticCurveTo(0, -r * 1.1, r * 1.5, -r * .1); ctx.quadraticCurveTo(0, -r * .35, -r * 1.5, r * .3); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = rgba('#7fe3ff', .9); ctx.lineWidth = 2; ctx.stroke();
        break;
      }
      case 'vine': {
        ctx.strokeStyle = this.color; ctx.lineWidth = 8; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-r * 1.6, 0);
        ctx.quadraticCurveTo(0, Math.sin(t * 12) * r * .5, r * 1.6, 0); ctx.stroke();
        ctx.fillStyle = '#b6ff7a';
        for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * r * .8, -2); ctx.lineTo(i * r * .8 + 5, -9); ctx.lineTo(i * r * .8 + 9, -1); ctx.closePath(); ctx.fill(); }
        break;
      }
      case 'wave': {
        const g2 = ctx.createLinearGradient(0, -r, 0, r);
        g2.addColorStop(0, rgba('#ffffff', .85)); g2.addColorStop(.4, rgba(this.color, .8)); g2.addColorStop(1, rgba('#0a2c48', .25));
        ctx.fillStyle = g2;
        ctx.beginPath(); ctx.moveTo(-r * 1.2, r);
        ctx.quadraticCurveTo(-r * .4, -r * .6 + Math.sin(t * 9) * 6, r * .5, -r);
        ctx.quadraticCurveTo(r * 1.1, -r * .2, r * .9, r);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = rgba('#ffffff', .7); ctx.lineWidth = 2.4; ctx.stroke();
        break;
      }
      case 'axe': {
        ctx.fillStyle = '#ffe6a3';
        ctx.beginPath(); ctx.moveTo(-r * .2, -r); ctx.quadraticCurveTo(r * 1.5, -r * .8, r * 1.2, r * .1); ctx.quadraticCurveTo(r * .5, r * .3, -r * .2, r * .1); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#8a5a12'; ctx.lineWidth = r * .22; ctx.beginPath(); ctx.moveTo(-r * .3, r * .1); ctx.lineTo(-r * 1.4, r * 1.3); ctx.stroke();
        break;
      }
      default: {
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
        g.addColorStop(0, '#ffffff'); g.addColorStop(.42, this.color); g.addColorStop(1, rgba(this.color, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
  }
}
const WORLD_BOTTOM = 1900;

/* -------------------------------- PICKUPS -------------------------------- */
export class Pickup {
  constructor(x, y, type = 'modak', o = {}) {
    Object.assign(this, { x, y, ox: x, oy: y, w: 22, h: 22, type, vy: 0, vx: 0, age: rand(0, 6), grounded: false, dead: false, life: o.life || 0, magnet: 0, value: o.value ?? 1 });
    if (type === 'heart') { this.w = this.h = 26; }
    if (type === 'bhakti') { this.w = this.h = 18; }
  }
  update(dt, G) {
    this.age += dt;
    if (this.life) { this.life -= dt; if (this.life <= 0) this.dead = true; }
    const p = G.player;
    if (!this.grounded) {
      this.vy += 900 * dt; this.y += this.vy * dt; this.x += this.vx * dt; this.vx *= .98;
      for (const s of G.level.solids) {
        if (!s.solid) continue;
        if (this.x + this.w > s.x && this.x < s.x + s.w && this.y + this.h > s.y && this.y + this.h < s.y + s.h + 22 && this.vy > 0) {
          this.y = s.y - this.h; this.vy = 0; this.vx = 0; this.grounded = true; break;
        }
      }
      if (this.y > 1700) this.dead = true;
    }
    if (p && !p.dead) {
      const d = dist(this.x, this.y, p.x + p.w / 2, p.y + p.h / 2);
      const pullR = this.type === 'bhakti' ? 190 : 120;
      if (d < pullR && (this.magnet > 0 || G.player.magnetAura)) {
        const a = Math.atan2(p.y + p.h / 2 - this.y, p.x + p.w / 2 - this.x);
        const sp = 460 * (1 - d / pullR) + 90;
        this.x += Math.cos(a) * sp * dt; this.y += Math.sin(a) * sp * dt; this.grounded = false; this.vy = 0;
      }
      if (d < 26) this.collect(G);
    }
  }
  collect(G) {
    if (this.dead) return;
    this.dead = true;
    const p = G.player;
    if (this.type === 'modak') {
      G.run.collected?.add?.(this.ox + ',' + this.oy);
      G.run.modaks += this.value; G.save.modaks += this.value;
      p.addBhakti(5); G.stats.modaks++;
      p.heal(1);   // every sweet nourishes: +1 heart now
      const mt = G.run.modaks;
      if (mt % 3 === 0 && p.maxHp < 10) { p.maxHp++; p.heal(1); G.hud?.toast?.('SWEET BLESSING — +1 MAX HEART (now ' + p.maxHp + ')', '🍬', 'gold', 4200); G.audio.sfx('powerup'); }
      if (mt % 4 === 0 && p.shieldPips < 3) { p.shieldPips++; G.hud?.toast?.('MODAK ARMOUR — a shield pip now eats one hit for you', '🛡', 'gold', 4200); G.audio.sfx('wallbreak'); }
      G.audio.sfx('modak', {});
      G.particles.burst(this.x, this.y, 12, { color: ['#ffd166', '#fff3d0', '#ff8a1f'], spd: 170, size: 3.4, life: .5 });
      G.fx.text(this.x, this.y - 10, '+1', { color: '#ffd166', size: 16, life: .6 });
      G.hud?.popModak?.();
    } else if (this.type === 'heart') {
      p.heal(1); G.audio.sfx('heart'); G.particles.burst(this.x, this.y, 20, { color: ['#ff6f8f', '#fff'], spd: 200, size: 4, life: .7 });
      G.fx.text(this.x, this.y - 12, '+DEVOTION', { color: '#ff9fb0', size: 17, life: .9, crit: true });
    } else if (this.type === 'bhakti') {
      p.addBhakti(18); G.audio.sfx('powerup'); G.particles.ring(this.x, this.y, 20, '#ffe6a3', .45);
    } else if (this.type === 'shard') {
      G.run.collected?.add?.(this.ox + ',' + this.oy);
      G.run.shards = (G.run.shards || 0) + 1; G.audio.sfx('coin');
      G.fx.text(this.x, this.y - 10, 'SECRET SHARD', { color: '#dfe8ff', size: 15, life: 1, crit: true });
      G.particles.burst(this.x, this.y, 24, { color: ['#dfe8ff', '#8fd3ff'], spd: 220, size: 3.6, life: .8 });
    }
  }
  draw(ctx, cam, t, G) {
    const bob = Math.sin(this.age * 3.4) * 4;
    const x = this.x - cam.cx + this.w / 2, y = this.y - cam.cy + this.h / 2 + bob;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (this.type === 'modak') {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const pr = .75 + .25 * Math.sin(t * 3 + this.x * .01);
      const g = ctx.createRadialGradient(x, y, 2, x, y, 20 * pr);
      g.addColorStop(0, 'rgba(255,214,102,.4)'); g.addColorStop(1, 'rgba(255,214,102,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 20 * pr, 0, TAU); ctx.fill();
      ctx.restore();
      glow(ctx, x, y, 30, '#ffc761', .42 + Math.sin(this.age * 4) * .1);
      ctx.globalCompositeOperation = 'source-over';
      ctx.translate(x, y); ctx.rotate(Math.sin(this.age * 2) * .12);
      // modak: pleated sweet dumpling
      ctx.fillStyle = '#ffe3ab';
      ctx.beginPath(); ctx.moveTo(0, -11); ctx.bezierCurveTo(9, -4, 11, 6, 0, 11); ctx.bezierCurveTo(-11, 6, -9, -4, 0, -11); ctx.fill();
      ctx.strokeStyle = 'rgba(190,130,50,.75)'; ctx.lineWidth = 1.1;
      for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(0, -10); ctx.quadraticCurveTo(i * 3.4, 0, i * 4.2, 10); ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.ellipse(-3.4, -3, 2.6, 4, -.4, 0, TAU); ctx.fill();
      ctx.fillStyle = '#f0a02a'; ctx.beginPath(); ctx.arc(0, -11.5, 2.1, 0, TAU); ctx.fill();
    } else if (this.type === 'heart') {
      glow(ctx, x, y, 34, '#ff6f8f', .5);
      ctx.globalCompositeOperation = 'source-over';
      ctx.translate(x, y); ctx.scale(1 + Math.sin(this.age * 6) * .07, 1 + Math.sin(this.age * 6) * .07);
      ctx.fillStyle = '#ff5f7f';
      ctx.beginPath(); ctx.moveTo(0, 9); ctx.bezierCurveTo(-13, -1, -9, -12, 0, -6); ctx.bezierCurveTo(9, -12, 13, -1, 0, 9); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.ellipse(-4, -4, 2.6, 3.6, -.5, 0, TAU); ctx.fill();
    } else if (this.type === 'bhakti') {
      glow(ctx, x, y, 26, '#ffe6a3', .55);
      ctx.globalCompositeOperation = 'source-over';
      ctx.translate(x, y); ctx.rotate(this.age * 2);
      ctx.fillStyle = '#fff3d0'; starPath(ctx, 0, 0, 4, 9, 3); ctx.fill();
    } else if (this.type === 'shard') {
      glow(ctx, x, y, 34, '#8fd3ff', .5);
      ctx.globalCompositeOperation = 'source-over';
      ctx.translate(x, y); ctx.rotate(Math.sin(this.age) * .3);
      ctx.fillStyle = '#e6f2ff'; ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(8, 0); ctx.lineTo(0, 13); ctx.lineTo(-8, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(140,200,255,.8)'; ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(8, 0); ctx.lineTo(0, 3); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
}

/* -------------------------------- SHRINE --------------------------------- */
export class Shrine {
  constructor(x, y) { this.x = x; this.y = y; this.w = 74; this.h = 96; this.lit = false; this.pulse = 0; this.t = rand(0, 9); }
  get rect() { return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h }; }
  update(dt, G) {
    this.t += dt;
    this.pulse = Math.max(0, this.pulse - dt);
    if (this.lit && rand(0, 1) < dt * 9) {
      G.particles.add({ x: this.x + rand(-14, 14), y: this.y - 62, vx: rand(-10, 10), vy: rand(-46, -18), life: rand(.7, 1.6), size: rand(2, 4.4), color: pick(['#ffd775', '#ff8a1f', '#fff3d0']), shape: 'dot', drag: .5, glowy: true, flicker: true });
    }
  }
  light(G) {
    if (this.lit) return false;
    this.lit = true; this.pulse = 1;
    G.audio.sfx('shrine');
    G.particles.burst(this.x, this.y - 50, 40, { color: ['#ffd775', '#fff3d0', '#ff8a1f'], spd: 220, size: 4, life: 1.1, gravity: -40 });
    G.particles.ring(this.x, this.y - 50, 26, '#ffe6a3', .8);
    G.fx.ripple(this.x, this.y - 50, '#ffe6a3', 260, .8);
    return true;
  }
  draw(ctx, cam, t, G) {
    const x = this.x - cam.cx, y = this.y - cam.cy;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, x, y - 52, this.lit ? 96 + Math.sin(t * 3) * 8 : 42, this.lit ? '#ffb43a' : '#5a4a78', this.lit ? .38 : .16);
    ctx.globalCompositeOperation = 'source-over';
    // base
    ctx.fillStyle = '#3b2a4e'; roundRect(ctx, x - 34, y - 22, 68, 22, 5); ctx.fill();
    ctx.fillStyle = this.lit ? '#6b4a20' : '#33254a'; roundRect(ctx, x - 28, y - 30, 56, 12, 4); ctx.fill();
    // pillar / sanctum
    ctx.fillStyle = this.lit ? '#7a5a2a' : '#2c2140';
    roundRect(ctx, x - 20, y - 74, 40, 46, 5); ctx.fill();
    ctx.strokeStyle = rgba(this.lit ? '#ffd775' : '#6b5a8a', .8); ctx.lineWidth = 2; ctx.stroke();
    // arch
    ctx.beginPath(); ctx.moveTo(x - 20, y - 74); ctx.quadraticCurveTo(x, y - 100, x + 20, y - 74); ctx.closePath();
    ctx.fillStyle = this.lit ? '#8a6428' : '#332749'; ctx.fill(); ctx.stroke();
    // idol (tiny Ganesha silhouette)
    ctx.save(); ctx.translate(x, y - 52);
    ctx.fillStyle = this.lit ? '#ffd98a' : '#4b3b66';
    ellipse(ctx, 0, 6, 11, 10); ctx.fill();
    ellipse(ctx, -8, -2, 5.5, 6.5); ctx.fill(); ellipse(ctx, 8, -2, 5.5, 6.5); ctx.fill();
    ellipse(ctx, 0, -3, 8, 7.5); ctx.fill();
    ctx.beginPath(); ctx.moveTo(1, 0); ctx.quadraticCurveTo(7, 5, 3, 10); ctx.lineWidth = 3; ctx.strokeStyle = ctx.fillStyle; ctx.stroke();
    ctx.restore();
    // flame
    if (this.lit) {
      const f = 1 + Math.sin(t * 12) * .12;
      ctx.save(); ctx.translate(x, y - 36); ctx.scale(f, f * 1.12);
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(0, 6, 0, -20);
      g.addColorStop(0, 'rgba(255,120,20,.95)'); g.addColorStop(.5, 'rgba(255,200,80,.9)'); g.addColorStop(1, 'rgba(255,250,220,.95)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(0, -20); ctx.quadraticCurveTo(7, -4, 4, 6); ctx.quadraticCurveTo(0, 9, -4, 6); ctx.quadraticCurveTo(-7, -4, 0, -20); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }
}

/* ------------------------------- SWITCH ---------------------------------- */
export class Switch {
  constructor(o) { Object.assign(this, { x: 0, y: 0, r: 22, hit: false, kind: 'rune', hidden: false, gate: -1, t: rand(0, 9), anim: 0 }, o); }
  update(dt, G) {
    this.t += dt; this.anim = Math.max(0, this.anim - dt * 2);
    if (this.hidden && !G.player.sight) this.visible = false; else this.visible = true;
  }
  trigger(G, byBoomerang = false) {
    if (this.hit) return false;
    this.hit = true; this.anim = 1;
    G.audio.sfx('switch');
    G.particles.burst(this.x, this.y, 26, { color: ['#7fe3ff', '#fff'], spd: 210, size: 3.6, life: .7 });
    G.particles.ring(this.x, this.y, 20, '#7fe3ff', .6);
    const g = G.level.gates[this.gate];
    if (g) G.world.openGate(g, G);
    return true;
  }
  draw(ctx, cam, t, G) {
    if (!this.visible) return;
    const x = this.x - cam.cx, y = this.y - cam.cy + Math.sin(this.t * 2) * 5;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, x, y, 42, this.hit ? '#6ee7a8' : '#7fe3ff', .45 + Math.sin(t * 4) * .12);
    ctx.globalCompositeOperation = 'source-over';
    ctx.translate(x, y); ctx.rotate(this.hit ? 0 : t * .8);
    ctx.strokeStyle = this.hit ? '#6ee7a8' : '#bff2ff'; ctx.lineWidth = 2.6;
    starPath(ctx, 0, 0, 6, this.r, this.r * .5); ctx.stroke();
    ctx.rotate(-(this.hit ? 0 : t * 1.6));
    ctx.fillStyle = this.hit ? 'rgba(110,231,168,.85)' : 'rgba(127,227,255,.85)';
    ctx.beginPath(); ctx.arc(0, 0, this.r * .34, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

/* -------------------------------- ANCHOR --------------------------------- */
export class Anchor {
  constructor(x, y) { this.x = x; this.y = y; this.r = 20; this.t = rand(0, 9); this.pulse = 0; }
  update(dt) { this.t += dt; this.pulse = Math.max(0, this.pulse - dt * 2.4); }
  draw(ctx, cam, t, G) {
    const x = this.x - cam.cx, y = this.y - cam.cy;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, x, y, 46 + this.pulse * 30, '#ff9f6e', .34 + Math.sin(t * 3 + this.t) * .1 + this.pulse * .4);
    ctx.globalCompositeOperation = 'source-over';
    ctx.translate(x, y);
    // lotus ring
    const petals = 8, r = this.r + this.pulse * 6;
    ctx.rotate(t * .35);
    for (let i = 0; i < petals; i++) {
      const a = (i / petals) * TAU;
      ctx.save(); ctx.rotate(a);
      ctx.fillStyle = rgba('#ffb98a', .8);
      ctx.beginPath(); ctx.moveTo(0, -r * .5); ctx.quadraticCurveTo(r * .42, -r * .1, 0, r * .55); ctx.quadraticCurveTo(-r * .42, -r * .1, 0, -r * .5); ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#fff1de'; ctx.beginPath(); ctx.arc(0, 0, r * .3, 0, TAU); ctx.fill();
    ctx.strokeStyle = rgba('#fff', .6); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(0, 0, r * .78, 0, TAU); ctx.stroke();
    ctx.restore();
  }
}

/* --------------------------------- GATES --------------------------------- */
export class Gate {
  constructor(o, idx) {
    Object.assign(this, { kind: 'crack', x: 0, y: 0, w: 48, h: 160, open: false, anim: 0, requires: '', note: '', idx }, o);
    this.solid = true; this.shards = [];
    if (this.kind === 'crack') for (let i = 0; i < 9; i++) this.shards.push({ x: rand(0, this.w), y: rand(0, this.h), r: rand(4, 12), rot: rand(0, TAU) });
  }
  get rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
  /** can the player walk through right now? */
  passable(G) {
    if (this.open) return true;
    if (this.kind === 'boss') return true;   // ceremonial door — it swings open as you approach
    const p = G.player;
    if (this.kind === 'phase' && p.phasing) return true;
    if (this.kind === 'smoke' && p.smoked) return true;
    if (this.kind === 'truesight' && p.sight) return true;
    return false;
  }
  /** returns true if this gate consumes the currently used boon */
  interact(G, boonId) {
    if (this.open) return false;
    if (this.requires && this.requires !== boonId) return false;
    switch (this.kind) {
      case 'crack': if (boonId === 'charge') { this.breakOpen(G); return true; } return false;
      case 'tether': if (boonId === 'pull') { G.world.openGate(this, G); return true; } return false;
      case 'shield': if (boonId === 'shield') { G.world.openGate(this, G); return true; } return false;
      case 'focus': if (boonId === 'focus') { G.world.openGate(this, G); return true; } return false;
      case 'truesight': if (boonId === 'truesight') { G.world.openGate(this, G); return true; } return false;
      case 'phase': if (boonId === 'phase') return false; // walked through, not opened
      case 'smoke': if (boonId === 'smoke') return false;
      default: return false;
    }
  }
  breakOpen(G) {
    this.open = true; this.solid = false; this.anim = 1;
    G.audio.sfx('wallbreak'); G.fx.shake(14); G.fx.stop(.09);
    G.particles.burst(this.x + this.w / 2, this.y + this.h / 2, 46, { color: ['#c9a06a', '#8a6a3a', '#ffd775', '#fff3d0'], spd: 330, size: 6, life: 1.1, gravity: 900, shape: 'square' });
    G.particles.shockwave(this.x + this.w / 2, this.y + this.h / 2, 190, '#ffd775', .5);
    G.hud?.toast?.('Wall shattered', '⛨');
  }
  update(dt, G) {
    this.anim = Math.max(0, this.anim - dt * 1.6);
    // the boss door grinds open as Mushika approaches the arena
    if (this.kind === 'boss' && !this.opened && G.player && !G.boss) {
      const p = G.player;
      if (Math.abs(p.x + p.w / 2 - (this.x + this.w / 2)) < 165 && Math.abs(p.y + p.h - (this.y + this.h)) < 300) {
        this.opened = true; this.open = true; this.anim = 1;
        G.audio.sfx('gate'); G.fx.shake(7);
        G.particles.burst(this.x + this.w / 2, this.y + this.h / 2, 34, { color: ['#ffd775', '#8a6428', '#fff3d0'], spd: 270, size: 5, life: .95, gravity: 520 });
        G.particles.shockwave(this.x + this.w / 2, this.y + this.h / 2, 150, '#ffd775', .5);
        G.hud?.toast?.('The sealed door grinds open', '⛩');
      }
    }
  }
  draw(ctx, cam, t, G) {
    if (this.open && this.kind !== 'phase' && this.kind !== 'smoke') {
      if (this.anim > 0) { /* debris already spawned */ }
      return;
    }
    const x = this.x - cam.cx, y = this.y - cam.cy;
    const pal = G.level.palette;
    ctx.save();
    if (this.kind === 'boss') {
      // ornate sealed door
      const g = ctx.createLinearGradient(x, y, x, y + this.h);
      g.addColorStop(0, '#4a3410'); g.addColorStop(.5, '#8a6428'); g.addColorStop(1, '#2a1c08');
      ctx.fillStyle = g; roundRect(ctx, x, y, this.w, this.h, 6); ctx.fill();
      ctx.strokeStyle = rgba(pal.accent, .8); ctx.lineWidth = 2; ctx.stroke();
      ctx.save(); ctx.translate(x + this.w / 2, y + this.h / 2); ctx.rotate(t * .5);
      ctx.strokeStyle = rgba('#ffe6a3', .85); ctx.lineWidth = 2.4; starPath(ctx, 0, 0, 8, 16, 7); ctx.stroke();
      ctx.restore();
      ctx.globalCompositeOperation = 'lighter'; glow(ctx, x + this.w / 2, y + this.h / 2, 44, pal.accent, .3 + Math.sin(t * 3) * .1);
    } else if (this.kind === 'crack') {
      ctx.fillStyle = shadeMix(pal.ground, pal.groundTop, .4);
      roundRect(ctx, x, y, this.w, this.h, 4); ctx.fill();
      ctx.strokeStyle = rgba('#000', .5); ctx.lineWidth = 1.6;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(x + rand(0, this.w), y);
        let cx = x + this.w / 2, cy = y;
        for (let k = 0; k < 4; k++) { cy += this.h / 4; cx += rand(-9, 9); ctx.lineTo(clamp(cx, x, x + this.w), cy); }
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, x + this.w / 2, y + this.h / 2, 40, pal.accent, .18 + Math.sin(t * 2.6) * .08);
    } else if (this.kind === 'phase' || this.kind === 'smoke' || this.kind === 'truesight') {
      const col = this.kind === 'phase' ? '#a0f0ff' : this.kind === 'smoke' ? '#b9a7d6' : '#c792ff';
      ctx.globalAlpha = this.kind === 'truesight' && !G.player.sight ? .12 : .8;
      const g = ctx.createLinearGradient(x, y, x + this.w, y + this.h);
      g.addColorStop(0, rgba(col, .06)); g.addColorStop(.5, rgba(col, .5)); g.addColorStop(1, rgba(col, .06));
      ctx.fillStyle = g; ctx.fillRect(x, y, this.w, this.h);
      ctx.strokeStyle = rgba(col, .9); ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const yy = y + (i / 5) * this.h + Math.sin(t * 2 + i) * 3;
        ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + this.w, yy); ctx.stroke();
      }
      ctx.globalCompositeOperation = 'lighter'; glow(ctx, x + this.w / 2, y + this.h / 2, 60, col, .3);
    } else if (this.kind === 'switch') {
      const g = ctx.createLinearGradient(x, y, x, y + this.h);
      g.addColorStop(0, '#6b5a3a'); g.addColorStop(1, '#2a2418');
      ctx.fillStyle = g; ctx.fillRect(x, y, this.w, this.h);
      ctx.strokeStyle = rgba('#d8c39a', .7); ctx.lineWidth = 3;
      for (let i = 0; i < Math.floor(this.h / 18); i++) { ctx.beginPath(); ctx.moveTo(x, y + i * 18 + 4); ctx.lineTo(x + this.w, y + i * 18 + 4); ctx.stroke(); }
    } else if (this.kind === 'shield') {
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(x, y, x + this.w, y + this.h);
      g.addColorStop(0, 'rgba(255,90,20,.2)'); g.addColorStop(.5, 'rgba(255,190,60,.75)'); g.addColorStop(1, 'rgba(255,90,20,.2)');
      ctx.fillStyle = g;
      for (let i = 0; i < this.h; i += 6) {
        const w = this.w * (.7 + Math.sin(t * 6 + i * .2) * .3);
        ctx.fillRect(x + (this.w - w) / 2, y + i, w, 5);
      }
      glow(ctx, x + this.w / 2, y + this.h / 2, 90, '#ff8a1f', .3);
    } else if (this.kind === 'focus' || this.kind === 'tether') {
      const col = this.kind === 'focus' ? '#8fd3ff' : '#ff9f6e';
      ctx.strokeStyle = rgba(col, .85); ctx.lineWidth = 3;
      for (let i = 0; i < 5; i++) {
        const a = t * (1 + i * .3) + i;
        ctx.beginPath(); ctx.ellipse(x + this.w / 2, y + this.h / 2, this.w * .5 + i * 4, this.h * (.2 + i * .17), a, 0, TAU); ctx.stroke();
      }
      ctx.globalCompositeOperation = 'lighter'; glow(ctx, x + this.w / 2, y + this.h / 2, 70, col, .26);
    } else {
      ctx.fillStyle = shadeMix(pal.ground, pal.groundTop, .3);
      ctx.fillRect(x, y, this.w, this.h);
    }
    ctx.restore();
  }
}
function shadeMix(a, b, t) { return lerpColor(a, b, t); }
function lerpColor(h1, h2, t) {
  const p = (h) => { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
  try {
    const a = p(h1), b = p(h2);
    return `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`;
  } catch (e) { return h1; }
}

/* -------------------------------- HAZARDS -------------------------------- */
export function updateHazards(G, dt) {
  const lv = G.level, p = G.player;
  for (const h of lv.hazards) {
    h.t = (h.t || 0) + dt;
    switch (h.kind) {
      case 'laser': {
        const cyc = ((h.t + h.phase) % h.period);
        h.on = cyc < (h.onDur ?? 1.2);
        h.warn = cyc > h.period - .55;
        if (h.on && !p.invuln && !p.phasing && aabb(p, { x: h.x, y: h.y, w: h.w, h: h.h })) p.hurt(G, 1, { src: 'laser', kx: p.x < h.x + h.w / 2 ? -220 : 220, ky: -160 });
        break;
      }
      case 'flame': {
        const cyc = ((h.t + h.phase) % h.period);
        const onDur = h.onDur ?? 1.1;
        h.on = cyc < onDur;
        h.warn = !h.on && cyc > h.period - .65;
        h.intensity = h.on ? clamp(Math.min(cyc / .1, (onDur - cyc) / .22), 0, 1) : 0;
        if (h.on) {
          const box = { x: h.x - h.w * .3, y: h.y - h.h, w: h.w * 1.6, h: h.h };
          if (!p.phasing && !p.shielded && aabb(p, box)) p.hurt(G, 1, { src: 'flame', ky: -240 });
          if (p.shielded && aabb(p, box)) p.absorb(G, 2);
          if (rand(0, 1) < dt * 34) G.particles.add({ x: h.x + rand(-10, 10), y: h.y - rand(0, h.h), vx: rand(-36, 36), vy: rand(-230, -110), life: rand(.3, .7), size: rand(3, 8), color: pick(['#ffd775', '#ff8a1f', '#ff5a1e']), shape: 'dot', drag: 1.4, glowy: true });
        }
        break;
      }
      case 'crusher': {
        const cyc = ((h.t + h.phase) % h.period);
        const fall = clamp((cyc - h.period * .45) / .34, 0, 1);
        const rise = clamp((cyc - h.period * .62) / (h.period * .38), 0, 1);
        const k = fall < 1 ? fall * fall : 1 - rise;
        h.cy = h.oy + k * h.drop;
        h.vy = k;
        const box = { x: h.x, y: h.cy, w: h.w, h: h.h };
        if (aabb(p, box) && !p.phasing) {
          if (fall > .1 && fall < 1) p.hurt(G, 2, { src: 'crusher', ky: 60, kx: p.x < h.x + h.w / 2 ? -320 : 320 });
          else { p.y = h.cy - p.h; p.vy = Math.min(p.vy, 0); }
        }
        if (fall >= 1 && !h.slammed) {
          h.slammed = true; G.fx.shake(9); G.audio.sfx('land');
          G.particles.dust(h.x + h.w / 2, h.cy + h.h, 12, '#c9b394');
        }
        if (fall < .9) h.slammed = false;
        break;
      }
      case 'gas': {
        if (aabb(p, h)) {
          p.debuff(h.effect, dt);
          if (rand(0, 1) < dt * 22) G.particles.add({ x: h.x + rand(0, h.w), y: h.y + rand(0, h.h), vx: rand(-14, 14), vy: rand(-24, -6), life: rand(1, 2.2), size: rand(8, 20), sizeEnd: rand(20, 40), color: h.effect === 'slow' ? '#c792ff' : '#ff9fc4', shape: 'smoke', drag: .6, glowy: false });
        }
        break;
      }
      case 'water': {
        if (aabb(p, h)) {
          p.inWater = true; p.vx *= Math.pow(.06, dt); p.vy *= Math.pow(.12, dt);
          p.drown = (p.drown || 0) + dt;
          if (p.drown > 2.4) { p.hurt(G, 1, { src: 'water', ky: -260 }); p.drown = 0; }
          if (rand(0, 1) < dt * 8) G.particles.bubbles(p.x + p.w / 2, p.y, 1, lv.palette.water);
        }
        break;
      }
      case 'lava': case 'void': {
        if (aabb(p, h) && !p.phasing) {
          p.hurt(G, h.kind === 'void' ? 2 : 1, { src: h.kind, ky: -430, kx: rand(-90, 90), pierce: true });
          if (h.kind === 'lava') { G.audio.sfx('splash'); G.particles.burst(p.x, p.y + p.h, 18, { color: ['#ff8a1f', '#ffd166'], spd: 260, size: 4, life: .6, gravity: 700 }); }
        }
        break;
      }
      case 'spike': case 'thorn': {
        if (aabb(p, h) && !p.phasing && !p.invuln) p.hurt(G, 1, { src: h.kind, ky: -330 });
        break;
      }
    }
  }
}

export function drawHazards(ctx, cam, G, t, layer = 'all') {
  const lv = G.level, pal = lv.palette;
  for (const h of lv.hazards) {
    const x = h.x - cam.cx, y = (h.cy ?? h.y) - cam.cy;
    if (x + h.w < -80 || x > cam.w + 80) continue;
    switch (h.kind) {
      case 'spike': {
        if (layer !== 'fg') break;
        const n = Math.max(1, Math.floor(h.w / 18));
        for (let i = 0; i < n; i++) {
          const sx = x + (i + .5) * (h.w / n), sw = h.w / n * .8;
          ctx.fillStyle = '#cfd6e2';
          ctx.beginPath(); ctx.moveTo(sx - sw / 2, y + h.h); ctx.lineTo(sx, y); ctx.lineTo(sx + sw / 2, y + h.h); ctx.closePath(); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,.55)';
          ctx.beginPath(); ctx.moveTo(sx - sw / 6, y + h.h); ctx.lineTo(sx, y + 2); ctx.lineTo(sx + sw / 12, y + h.h); ctx.closePath(); ctx.fill();
        }
        if (G.player.sight) { ctx.globalCompositeOperation = 'lighter'; glow(ctx, x + h.w / 2, y + h.h / 2, h.w * .6, '#ff5a7a', .3); ctx.globalCompositeOperation = 'source-over'; }
        break;
      }
      case 'thorn': {
        if (layer !== 'fg') break;
        ctx.strokeStyle = '#3f6b2a'; ctx.lineWidth = 4;
        ctx.beginPath();
        for (let i = 0; i <= h.w; i += 12) ctx.lineTo(x + i, y + h.h - Math.abs(Math.sin(i * .1)) * h.h * .8);
        ctx.stroke();
        ctx.fillStyle = '#7ee06b';
        for (let i = 6; i < h.w; i += 22) { ctx.beginPath(); ctx.moveTo(x + i, y + h.h * .3); ctx.lineTo(x + i + 5, y + h.h * .3 - 9); ctx.lineTo(x + i + 9, y + h.h * .3 + 2); ctx.fill(); }
        break;
      }
      case 'lava': {
        if (layer === 'fg') {
          const g = ctx.createLinearGradient(0, y, 0, y + h.h);
          g.addColorStop(0, '#fff3a0'); g.addColorStop(.22, '#ff8a1f'); g.addColorStop(1, '#8c1a04');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.moveTo(x, y + 10);
          for (let i = 0; i <= h.w; i += 16) ctx.lineTo(x + i, y + Math.sin(t * 2.4 + i * .05) * 6 + Math.sin(t * 5 + i * .11) * 2.4);
          ctx.lineTo(x + h.w, y + h.h); ctx.lineTo(x, y + h.h); ctx.closePath(); ctx.fill();
          ctx.globalCompositeOperation = 'lighter';
          glow(ctx, x + h.w / 2, y + 8, Math.min(h.w * .6, 320), '#ff8a1f', .3);
          ctx.globalCompositeOperation = 'source-over';
          break;
        }
        if (layer === 'bg') { ctx.globalCompositeOperation = 'lighter'; glow(ctx, x + h.w / 2, y, h.w * .5, '#ff5a1e', .12); ctx.globalCompositeOperation = 'source-over'; }
        break;
      }
      case 'water': {
        if (layer !== 'fg') break;
        const g = ctx.createLinearGradient(0, y, 0, y + h.h);
        g.addColorStop(0, rgba(pal.water, .55)); g.addColorStop(1, rgba('#04140c', .9));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(x, y + 6);
        for (let i = 0; i <= h.w; i += 20) ctx.lineTo(x + i, y + Math.sin(t * 1.6 + i * .04) * 4);
        ctx.lineTo(x + h.w, y + h.h); ctx.lineTo(x, y + h.h); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = rgba(pal.glow, .3); ctx.lineWidth = 1.5; ctx.stroke();
        break;
      }
      case 'void': {
        if (layer !== 'fg') break;
        const g = ctx.createLinearGradient(0, y, 0, y + h.h);
        g.addColorStop(0, 'rgba(127,232,255,.16)'); g.addColorStop(.4, 'rgba(10,25,60,.85)'); g.addColorStop(1, '#01030a');
        ctx.fillStyle = g; ctx.fillRect(x, y, h.w, h.h);
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 7; i++) {
          const sx = x + ((i * 97 + t * 34) % h.w);
          ctx.fillStyle = rgba('#bfeeff', .5); ctx.beginPath(); ctx.arc(sx, y + 8 + Math.sin(t * 2 + i) * 4, 1.8, 0, TAU); ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
      case 'gas': {
        if (layer !== 'fg') break;
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 7; i++) {
          const px = x + ((i * 137 + Math.sin(t * .7 + i) * 30) % h.w);
          const py = y + h.h * .5 + Math.sin(t * .9 + i * 1.7) * h.h * .34;
          glow(ctx, px, py, 46 + Math.sin(t + i) * 10, h.effect === 'slow' ? '#c792ff' : '#ff9fc4', .14);
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = rgba(h.effect === 'slow' ? '#c792ff' : '#ff9fc4', .22); ctx.lineWidth = 2;
        ctx.setLineDash([7, 9]); ctx.strokeRect(x, y, h.w, h.h); ctx.setLineDash([]);
        break;
      }
      case 'laser': {
        if (layer !== 'fg') break;
        const col = '#ff5a7a';
        ctx.fillStyle = '#2a1030'; roundRect(ctx, x - 5, y - 14, h.w + 10, 14, 4); ctx.fill();
        roundRect(ctx, x - 5, y + h.h, h.w + 10, 14, 4); ctx.fill();
        ctx.globalCompositeOperation = 'lighter';
        if (h.on) {
          glow(ctx, x + h.w / 2, y + h.h / 2, h.w * 3.4, col, .3);
          ctx.fillStyle = rgba(col, .85); ctx.fillRect(x, y, h.w, h.h);
          ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fillRect(x + h.w * .3, y, h.w * .4, h.h);
        } else if (h.warn) {
          ctx.fillStyle = rgba(col, .2 + Math.sin(t * 26) * .16); ctx.fillRect(x + h.w * .35, y, h.w * .3, h.h);
        } else {
          ctx.fillStyle = rgba(col, .07); ctx.fillRect(x + h.w * .42, y, h.w * .16, h.h);
        }
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
      case 'flame': {
        if (layer !== 'fg') break;
        ctx.fillStyle = '#3a1a12'; roundRect(ctx, x - 8, y - 12, h.w + 16, 16, 5); ctx.fill();
        ctx.globalCompositeOperation = 'lighter';
        const k = h.intensity || 0;
        if (k > 0 || h.warn) {
          const hh = h.h * (h.warn && !k ? .18 : k);
          for (let i = 0; i < 4; i++) {
            const w = h.w * (.85 - i * .17);
            const g = ctx.createLinearGradient(0, y, 0, y - hh);
            g.addColorStop(0, rgba('#ffffff', .9 - i * .16));
            g.addColorStop(.3, rgba('#ffd166', .8 - i * .14));
            g.addColorStop(1, rgba('#ff3d00', 0));
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.moveTo(x + (h.w - w) / 2, y);
            ctx.quadraticCurveTo(x + h.w / 2 + Math.sin(t * 18 + i) * 9, y - hh * .6, x + h.w / 2, y - hh);
            ctx.quadraticCurveTo(x + h.w / 2 - Math.sin(t * 18 + i) * 9, y - hh * .6, x + (h.w + w) / 2, y);
            ctx.closePath(); ctx.fill();
          }
        }
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
      case 'crusher': {
        if (layer !== 'fg') break;
        ctx.strokeStyle = '#4a3b2a'; ctx.lineWidth = 7;
        ctx.beginPath(); ctx.moveTo(x + h.w / 2, y - 400); ctx.lineTo(x + h.w / 2, y); ctx.stroke();
        const g = ctx.createLinearGradient(x, y, x, y + h.h);
        g.addColorStop(0, '#8a7a5a'); g.addColorStop(.5, '#5a4a34'); g.addColorStop(1, '#2a2018');
        ctx.fillStyle = g; roundRect(ctx, x, y, h.w, h.h, 6); ctx.fill();
        ctx.strokeStyle = rgba(pal.accent, .5); ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = '#d8d2c4';
        for (let i = 0; i < Math.floor(h.w / 16); i++) {
          ctx.beginPath(); ctx.moveTo(x + i * 16 + 4, y + h.h); ctx.lineTo(x + i * 16 + 12, y + h.h); ctx.lineTo(x + i * 16 + 8, y + h.h + 12); ctx.closePath(); ctx.fill();
        }
        break;
      }
    }
  }
}
