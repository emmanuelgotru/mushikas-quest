/* ===========================================================================
   core/utils.js — math, RNG, collision, drawing helpers
   =========================================================================== */

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const inv = (a, b, v) => (b === a ? 0 : clamp((v - a) / (b - a), 0, 1));
export const sign = (v) => (v < 0 ? -1 : v > 0 ? 1 : 0);
/** frame-rate independent exponential smoothing */
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const approach = (v, target, step) => (v < target ? Math.min(v + step, target) : Math.max(v - step, target));
export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const chance = (p) => Math.random() < p;
export const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
export const dist2 = (x1, y1, x2, y2) => { const dx = x2 - x1, dy = y2 - y1; return dx * dx + dy * dy; };
export const angleTo = (x1, y1, x2, y2) => Math.atan2(y2 - y1, x2 - x1);

export const ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => t * (2 - t),
  inOutQuad: (t) => (t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  inCubic: (t) => t * t * t,
  outCubic: (t) => (--t) * t * t + 1,
  inOutCubic: (t) => (t < .5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1),
  outBack: (t, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
  outElastic: (t) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - .75) * (TAU / 3)) + 1),
  outExpo: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
};

/* ---------- deterministic RNG (for stable procedural level art) ---------- */
export function makeRng(seed = 1) {
  let s = seed >>> 0 || 1;
  const next = () => {
    s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
  return {
    next,
    range: (a, b) => a + next() * (b - a),
    int: (a, b) => Math.floor(a + next() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length) % arr.length],
    chance: (p) => next() < p,
  };
}

/* ---------- collision ---------- */
export function aabb(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
export function pointInRect(px, py, r) {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}
export function circleRect(cx, cy, cr, r) {
  const nx = clamp(cx, r.x, r.x + r.w), ny = clamp(cy, r.y, r.y + r.h);
  return dist2(cx, cy, nx, ny) <= cr * cr;
}
/** swept-ish resolution of an entity against a solid rect list */
export function moveAndCollide(e, solids, dx, dy) {
  const res = { hitX: false, hitY: false, ground: false, plats: [] };
  // X axis
  e.x += dx;
  for (const s of solids) {
    if (!s.solid || s.skip) continue;
    if (aabb(e, s)) {
      if (dx > 0) e.x = s.x - e.w; else if (dx < 0) e.x = s.x + s.w;
      e.vx = 0; res.hitX = true; res.plats.push(s);
    }
  }
  // Y axis
  e.y += dy;
  for (const s of solids) {
    if (!s.solid || s.skip) continue;
    if (aabb(e, s)) {
      if (dy > 0) { e.y = s.y - e.h; res.ground = true; e.standing = s; }
      else if (dy < 0) e.y = s.y + s.h;
      e.vy = 0; res.hitY = true; res.plats.push(s);
    }
  }
  return res;
}
/** one-way platform resolution (only lands when falling from above) */
export function oneWayCheck(e, p, prevBottom) {
  if (e.vy <= 0) return false;
  const bottom = e.y + e.h;
  return prevBottom <= p.y + 6 && bottom >= p.y && e.x + e.w > p.x + 2 && e.x < p.x + p.w - 2;
}

/* ---------- colour ---------- */
export function hexToRgb(h) {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
export function rgba(hex, a = 1) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
export function mixHex(h1, h2, t) {
  const a = hexToRgb(h1), b = hexToRgb(h2);
  const c = (x, y) => Math.round(lerp(x, y, t));
  return `rgb(${c(a.r, b.r)},${c(a.g, b.g)},${c(a.b, b.b)})`;
}
export function shade(hex, amt) {
  const { r, g, b } = hexToRgb(hex);
  const f = (v) => clamp(Math.round(v + 255 * amt), 0, 255);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

/* ---------- canvas drawing helpers ---------- */
export function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
export function ellipse(ctx, x, y, rx, ry, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(.01, rx), Math.max(.01, ry), rot, 0, TAU);
}
export function poly(ctx, pts, close = true) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  if (close) ctx.closePath();
}
/** n-pointed star / mandala petal ring */
export function starPath(ctx, cx, cy, spikes, outer, inner, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rot + (i * Math.PI) / spikes;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
}
/** soft radial glow blob (cheap "bloom") */
export function glow(ctx, x, y, r, color, alpha = .6) {
  if (!(r > 0) || !Number.isFinite(x) || !Number.isFinite(y)) return;   // NaN must never kill a frame
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(.45, rgba(color, alpha * .35));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
}
export function ring(ctx, x, y, r, color, w = 2, alpha = 1) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = w;
  ctx.beginPath(); ctx.arc(x, y, Math.max(.1, r), 0, TAU); ctx.stroke(); ctx.restore();
}
/** ornate mandala — used for menus, shrines, blessing fx */
export function mandala(ctx, cx, cy, r, petals, t, color = '#f6b93b', alpha = .5) {
  ctx.save();
  const baseA = ctx.globalAlpha;            // multiply, never overwrite, the caller's fade
  ctx.translate(cx, cy); ctx.rotate(t);
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, r * .014);
  for (let layer = 0; layer < 3; layer++) {
    const rr = r * (.42 + layer * .29);
    const n = petals + layer * 4;
    ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.globalAlpha = baseA * alpha * (.55 - layer * .12); ctx.stroke();
    ctx.globalAlpha = baseA * alpha * (.85 - layer * .2);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
      ctx.save(); ctx.translate(px, py); ctx.rotate(a + Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(0, -rr * .17);
      ctx.quadraticCurveTo(rr * .11, 0, 0, rr * .17);
      ctx.quadraticCurveTo(-rr * .11, 0, 0, -rr * .17);
      ctx.stroke(); ctx.restore();
    }
  }
  ctx.restore();
}

/* ---------- misc ---------- */
export function fmtTime(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
export const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];
export function devNum(n) {
  const d = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];
  return String(n).split('').map((c) => (/\d/.test(c) ? d[+c] : c)).join('');
}
/** simple object pool */
export class Pool {
  constructor(factory, reset) { this.factory = factory; this.reset = reset; this.free = []; this.live = []; }
  spawn() {
    const o = this.free.pop() || this.factory();
    this.reset(o); o.dead = false; this.live.push(o); return o;
  }
  sweep() {
    for (let i = this.live.length - 1; i >= 0; i--) {
      if (this.live[i].dead) { const o = this.live.splice(i, 1)[0]; if (this.free.length < 900) this.free.push(o); }
    }
  }
  clear() { while (this.live.length) this.free.push(this.live.pop()); }
}
