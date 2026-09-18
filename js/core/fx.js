/* ===========================================================================
   core/fx.js — particles, camera, screen shake, hit-stop, floating text
   =========================================================================== */
import { TAU, clamp, lerp, damp, rand, pick, rgba, glow, starPath, ellipse } from './utils.js';

/* ------------------------------- PARTICLES ------------------------------- */
export class Particles {
  constructor(limit = 1600) {
    this.limit = limit;
    this.list = [];
    this.pool = [];
  }
  _get() {
    if (this.list.length >= this.limit) return null;
    return this.pool.pop() || {};
  }
  add(p) { const o = this._get(); if (!o) return null; Object.assign(o, DEFAULT_P, p); o.age = 0; o.dead = false; this.list.push(o); return o; }

  burst(x, y, n, opt = {}) {
    const { spd = 220, spread = TAU, dir = 0, color = '#ffd775', size = 4, life = .5, gravity = 0, shape = 'dot', drag = 2.2, glowy = true, sizeEnd = 0 } = opt;
    for (let i = 0; i < n; i++) {
      const a = dir + rand(-spread / 2, spread / 2);
      const s = spd * rand(.35, 1.25);
      this.add({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: life * rand(.65, 1.3), size: size * rand(.6, 1.4), sizeEnd, color: Array.isArray(color) ? pick(color) : color,
        shape, gravity, drag, glowy, rot: rand(0, TAU), spin: rand(-8, 8),
      });
    }
  }
  spark(x, y, n, color = '#fff3d0', spd = 300) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), s = spd * rand(.2, 1);
      this.add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(.14, .4), size: rand(1.5, 3.4), color, shape: 'spark', drag: 4, glowy: true, rot: a });
    }
  }
  ring(x, y, r, color = '#ffd775', life = .4, w = 4) {
    this.add({ x, y, life, size: r, sizeEnd: r * 2.4, color, shape: 'ring', drag: 0, glowy: true, w });
  }
  shockwave(x, y, r = 40, color = '#fff', life = .5) { this.add({ x, y, life, size: 4, sizeEnd: r, color, shape: 'wave', drag: 0, glowy: true, w: 6 }); }
  smoke(x, y, n = 6, color = '#6b5a86') {
    for (let i = 0; i < n; i++) this.add({ x: x + rand(-6, 6), y: y + rand(-6, 6), vx: rand(-24, 24), vy: rand(-52, -12), life: rand(.6, 1.5), size: rand(9, 22), sizeEnd: rand(26, 48), color, shape: 'smoke', drag: .8, glowy: false, rot: rand(0, TAU), spin: rand(-1.4, 1.4) });
  }
  dust(x, y, n = 5, color = '#c9b394') {
    for (let i = 0; i < n; i++) this.add({ x: x + rand(-8, 8), y, vx: rand(-70, 70), vy: rand(-60, -10), life: rand(.25, .6), size: rand(2, 5), sizeEnd: 0, color, shape: 'dot', drag: 2.6, gravity: 260, glowy: false });
  }
  petals(x, y, n = 8, colors = ['#ff8fbf', '#ffd775', '#ff5f8f']) {
    for (let i = 0; i < n; i++) this.add({ x, y, vx: rand(-60, 60), vy: rand(-120, -20), life: rand(1.2, 2.4), size: rand(4, 8), color: pick(colors), shape: 'petal', drag: .5, gravity: 60, glowy: true, rot: rand(0, TAU), spin: rand(-4, 4) });
  }
  bubbles(x, y, n = 6, color = '#9fe8ff') {
    for (let i = 0; i < n; i++) this.add({ x: x + rand(-10, 10), y, vx: rand(-16, 16), vy: rand(-90, -30), life: rand(.8, 1.8), size: rand(2.5, 6), color, shape: 'ring', drag: .4, glowy: true, w: 1.5, sizeEnd: 0 });
  }
  trail(x, y, color, size = 5, life = .28) { this.add({ x, y, vx: rand(-12, 12), vy: rand(-12, 12), life, size, sizeEnd: 0, color, shape: 'dot', drag: 3, glowy: true }); }
  glyph(x, y, ch, color = '#ffe6a3', life = 1) { this.add({ x, y, vx: 0, vy: -26, life, size: 22, color, shape: 'glyph', ch, glowy: true, drag: 1 }); }
  embers(x, y, w, h, color = '#ff9a3c', rate = 1) {
    for (let i = 0; i < rate; i++) this.add({ x: x + rand(0, w), y: y + rand(0, h), vx: rand(-12, 12), vy: rand(-46, -16), life: rand(1, 2.6), size: rand(1.4, 3.4), color, shape: 'dot', drag: .2, glowy: true, flicker: true });
  }
  confetti(x, y, n = 40) {
    const cols = ['#ffd775', '#ff8a1f', '#e0344a', '#39d6c2', '#fff3d0', '#ff5f8f'];
    for (let i = 0; i < n; i++) {
      const a = rand(-TAU * .42, -TAU * .08) + rand(-.5, .5), s = rand(180, 520);
      this.add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(1.2, 2.6), size: rand(3, 7), color: pick(cols), shape: 'square', drag: .55, gravity: 620, glowy: false, rot: rand(0, TAU), spin: rand(-14, 14) });
    }
  }

  update(dt, scale = 1) {
    const l = this.list;
    for (let i = l.length - 1; i >= 0; i--) {
      const p = l[i];
      p.age += dt * scale;
      if (p.age >= p.life) { l.splice(i, 1); if (this.pool.length < 2000) this.pool.push(p); continue; }
      if (p.drag) { const d = Math.exp(-p.drag * dt); p.vx *= d; p.vy *= d; }
      if (p.gravity) p.vy += p.gravity * dt;
      p.x += p.vx * dt * scale; p.y += p.vy * dt * scale;
      if (p.spin) p.rot += p.spin * dt;
    }
  }

  draw(ctx, cam) {
    const l = this.list; if (!l.length) return;
    ctx.save();
    for (let i = 0; i < l.length; i++) {
      const p = l[i];
      const t = p.age / p.life;
      const x = p.x - cam.x, y = p.y - cam.y;
      if (x < -140 || y < -140 || x > cam.w + 140 || y > cam.h + 140) continue;
      const a = p.glowy ? (1 - t) : (1 - t * t);
      const size = p.sizeEnd ? lerp(p.size, p.sizeEnd, t) : p.size * (1 - t * (p.shape === 'smoke' ? -.9 : .55));
      ctx.globalAlpha = clamp(p.flicker ? a * (.6 + Math.sin(p.age * 26) * .4) : a, 0, 1);
      ctx.globalCompositeOperation = p.glowy ? 'lighter' : 'source-over';
      ctx.fillStyle = p.color; ctx.strokeStyle = p.color;
      switch (p.shape) {
        case 'dot':
          if (p.glowy && size > 2.5) glow(ctx, x, y, size * 2.6, p.color, a * .55);
          ctx.beginPath(); ctx.arc(x, y, Math.max(.4, size), 0, TAU); ctx.fill(); break;
        case 'spark': {
          ctx.lineWidth = Math.max(1, size * .6); ctx.beginPath();
          ctx.moveTo(x, y); ctx.lineTo(x - p.vx * .022, y - p.vy * .022); ctx.stroke(); break;
        }
        case 'ring':
          ctx.lineWidth = p.w || 2; ctx.beginPath(); ctx.arc(x, y, Math.max(.5, size), 0, TAU); ctx.stroke(); break;
        case 'wave':
          ctx.lineWidth = (p.w || 5) * (1 - t); ctx.beginPath(); ctx.arc(x, y, Math.max(.5, size), 0, TAU); ctx.stroke(); break;
        case 'square':
          ctx.save(); ctx.translate(x, y); ctx.rotate(p.rot); ctx.fillRect(-size / 2, -size / 2, size, size * .62); ctx.restore(); break;
        case 'smoke':
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = a * .3;
          ctx.beginPath(); ctx.arc(x, y, Math.max(1, size), 0, TAU); ctx.fill(); break;
        case 'petal':
          ctx.save(); ctx.translate(x, y); ctx.rotate(p.rot);
          ctx.beginPath(); ctx.ellipse(0, 0, size, size * .5, 0, 0, TAU); ctx.fill();
          ctx.beginPath(); ctx.ellipse(size * .4, 0, size * .6, size * .28, .5, 0, TAU); ctx.fill();
          ctx.restore(); break;
        case 'star':
          ctx.save(); ctx.translate(x, y); ctx.rotate(p.rot); starPath(ctx, 0, 0, 5, size, size * .45); ctx.fill(); ctx.restore(); break;
        case 'glyph':
          ctx.font = `${p.size}px "Tiro Devanagari Sanskrit", serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(p.ch || 'ॐ', x, y); break;
      }
    }
    ctx.restore();
  }
  clear() { this.list.length = 0; }
}
const DEFAULT_P = { x: 0, y: 0, vx: 0, vy: 0, life: .5, age: 0, size: 4, sizeEnd: 0, color: '#fff', shape: 'dot', gravity: 0, drag: 0, glowy: true, rot: 0, spin: 0, w: 2, ch: '', flicker: false };

/* ------------------------------- CAMERA --------------------------------- */
export class Camera {
  constructor() { this.x = 0; this.y = 0; this.tx = 0; this.ty = 0; this.w = 960; this.h = 540; this.shake = 0; this.shakeT = 0; this.sx = 0; this.sy = 0; this.rot = 0; this.zoom = 1; this.bounds = null; this.lookX = 0; this.lookY = 0; }
  follow(target, dt, levelW, levelH) {
    const lead = clamp(target.vx * .16, -120, 120);
    this.tx = target.x + target.w / 2 + lead - this.w / 2;
    this.ty = target.y + target.h / 2 - this.h * .56 + clamp(target.vy * .06, -70, 90);
    if (this.bounds) {
      this.tx = clamp(this.tx, this.bounds.x, this.bounds.x + this.bounds.w - this.w);
      this.ty = clamp(this.ty, this.bounds.y, this.bounds.y + this.bounds.h - this.h);
    } else {
      this.tx = clamp(this.tx, 0, Math.max(0, levelW - this.w));
      this.ty = clamp(this.ty, -400, Math.max(-400, levelH - this.h));
    }
    this.x = damp(this.x, this.tx, 9, dt);
    this.y = damp(this.y, this.ty, 7.5, dt);
    this.sx = this.shake > 0 ? rand(-this.shake, this.shake) : 0;
    this.sy = this.shake > 0 ? rand(-this.shake, this.shake) : 0;
    this.rot = this.shake > 3 ? rand(-this.shake, this.shake) * .0009 : 0;
    this.shake = Math.max(0, this.shake - dt * (26 + this.shake * 3.4));
  }
  kick(amount) { this.shake = Math.min(38, this.shake + amount); }
  snap(x, y) { this.x = this.tx = x; this.y = this.ty = y; }
  get cx() { return this.x + this.sx; }
  get cy() { return this.y + this.sy; }
  toScreen(x, y) { return { x: x - this.x - this.sx, y: y - this.y - this.sy }; }
  visible(x, y, pad = 80) { return x > this.x - pad && x < this.x + this.w + pad && y > this.y - pad && y < this.y + this.h + pad; }
}

/* ------------------------------- FX BUS --------------------------------- */
export class FX {
  constructor(game) {
    this.g = game;
    this.hitStop = 0; this.timeScale = 1; this.targetTimeScale = 1;
    this.flashEl = document.getElementById('fx-flash');
    this.texts = [];
    this.ripples = [];
    this.chroma = 0;
    this.fade = 0;
  }
  /** Hit-stop. Never stacks and never re-triggers while frozen or on cooldown,
   *  so a per-frame effect can't lock the game into permanent slow-motion. */
  stop(t = .07) {
    if (this.hitStop > 0 || this.stopCd > 0) return;
    this.hitStop = Math.min(t, .14);
    this.stopCd = .3;
  }
  shake(n = 6) { this.g.camera?.kick(n * (this.g.settings?.shake ?? 1)); }
  rumble(n = 4, t = .3) { this.g.camera?.kick(n * (this.g.settings?.shake ?? 1)); }
  slow(t = 1, scale = .32) { this.slowT = t; this.slowScale = scale; }
  flash(kind = 'hit') {
    if (!this.flashEl) return;
    this.flashEl.classList.remove('hit', 'hurt', 'bless');
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add(kind);
  }
  text(x, y, str, opt = {}) {
    const { color = '#fff3d0', size = 18, life = .85, vy = -66, crit = false, outline = true } = opt;
    if (this.texts.length > 44) this.texts.shift();
    this.texts.push({ x, y, str, color, size, life, age: 0, vy, vx: rand(-24, 24), crit, outline });
  }
  ripple(x, y, color = '#ffe6a3', r = 300, life = .6) { this.ripples.push({ x, y, color, r, life, age: 0 }); }
  update(dt) {
    this.stopCd = Math.max(0, (this.stopCd || 0) - dt);
    if (this.slowT > 0) { this.slowT -= dt; this.targetTimeScale = this.slowScale; }
    else this.targetTimeScale = 1;
    this.timeScale = damp(this.timeScale, this.targetTimeScale, 12, dt);
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i]; t.age += dt;
      t.y += t.vy * dt; t.vy += 130 * dt; t.x += t.vx * dt; t.vx *= .94;
      if (t.age >= t.life) this.texts.splice(i, 1);
    }
    for (let i = this.ripples.length - 1; i >= 0; i--) { const r = this.ripples[i]; r.age += dt; if (r.age >= r.life) this.ripples.splice(i, 1); }
    this.chroma = Math.max(0, this.chroma - dt * 2.4);
  }
  drawTexts(ctx, cam) {
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      const k = t.age / t.life;
      const sc = t.crit ? (k < .18 ? lerp(1.7, 1, k / .18) : 1) : (k < .12 ? lerp(1.4, 1, k / .12) : 1);
      const x = t.x - cam.cx, y = t.y - cam.cy;
      ctx.globalAlpha = clamp(1 - Math.pow(k, 2.4), 0, 1);
      ctx.font = `900 ${t.size * sc}px "Rajdhani", system-ui, sans-serif`;
      if (t.outline) { ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(8,3,16,.85)'; ctx.strokeText(t.str, x, y); }
      if (t.crit) { ctx.shadowColor = t.color; ctx.shadowBlur = 16; }
      ctx.fillStyle = t.color; ctx.fillText(t.str, x, y); ctx.shadowBlur = 0;
    }
    ctx.restore();
  }
  drawRipples(ctx, cam) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const r of this.ripples) {
      const k = r.age / r.life;
      ctx.globalAlpha = (1 - k) * .5;
      ctx.strokeStyle = r.color; ctx.lineWidth = 3 * (1 - k) + .5;
      ctx.beginPath(); ctx.arc(r.x - cam.cx, r.y - cam.cy, r.r * k, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }
}
