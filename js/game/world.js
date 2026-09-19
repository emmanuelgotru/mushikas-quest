/* ===========================================================================
   game/world.js — level runtime + all procedural rendering (biomes, parallax,
   terrain, weather, post-processing).
   =========================================================================== */
import { TAU, clamp, lerp, rand, sign, dist, rgba, glow, ellipse, starPath, roundRect, aabb, makeRng, mixHex } from '../core/utils.js';
import { updateHazards, drawHazards, Projectile, Pickup, Shrine, Switch, Anchor, Gate } from './entities.js';
import { Enemy } from './enemies.js';

const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const fbm = (x, seed) => Math.sin(x * .0031 + seed) * .5 + Math.sin(x * .0087 + seed * 2.3) * .3 + Math.sin(x * .0213 + seed * 4.1) * .2;

export class World {
  constructor(G, data) {
    this.G = G;
    this.data = data;
    G.level = data;
    this.rng = makeRng(data.day * 991 + 7);
    this.t = 0;
    this.checkpoint = { x: data.spawn.x, y: data.spawn.y };
    this.prompt = null;
    this.webs = [];
    this.weather = [];
    this.stickies = [];
    this.bgSeed = data.day * 13.7;
    this.bossStarted = false;
    this.arenaSealed = false;
    this.shakeTrees = 0;
    // runtime objects
    this.shrines = data.shrines.map((s) => new Shrine(s.x, s.y));
    this.switches = data.switches.map((s) => new Switch(s));
    this.anchors = data.anchors.map((a) => new Anchor(a.x, a.y));
    this.gates = data.gates.map((g, i) => new Gate(g, i));
    data.gateObjs = this.gates;
    for (const s of data.solids) { s.rt = { crumble: -1, vanish: -1, broken: false, timer: 0, revealed: false, permanent: false }; }
    this.spawnEnemies(G);
    for (const m of data.modaks) G.pickups.push(new Pickup(m.x, m.y, 'modak'));
    // weather particles (screen space)
    const env = data.env;
    const n = Math.round(90 * (env.weatherRate || .5));
    for (let i = 0; i < n; i++) this.weather.push(this.newWeather(true));
    // rising lava for the volcano
    this.lavaRise = 0;
  }

  spawnEnemies(G) {
    G.enemies.length = 0;
    for (const spec of this.data.enemies) {
      if (spec.type === 'shooter' && spec.turret) spec.kind = spec.kind;
      G.enemies.push(new Enemy(spec, G));
    }
  }

  newWeather(anywhere = false) {
    const G = this.G, cam = G.camera, env = this.data.env;
    const w = cam.w || 960, h = cam.h || 600;
    const kind = env.weather;
    const base = { x: rand(-40, w + 40), y: anywhere ? rand(-40, h + 40) : rand(-160, -10), vx: 0, vy: 40, r: 2, rot: rand(0, TAU), spin: rand(-2, 2), a: rand(.3, .9) };
    switch (kind) {
      case 'spore': return { ...base, vy: rand(-14, 8), vx: rand(-16, 16), r: rand(1.4, 3.4), life: rand(6, 14) };
      case 'ash': return { ...base, vy: rand(50, 120), vx: rand(-40, -8), r: rand(1, 3), a: rand(.25, .7), glow: true };
      case 'petals': return { ...base, vy: rand(28, 64), vx: rand(-46, -10), r: rand(3, 6.5), spin: rand(-3, 3) };
      case 'bubbles': return { ...base, y: anywhere ? rand(0, h) : h + rand(10, 60), vy: rand(-70, -26), vx: rand(-12, 12), r: rand(1.6, 5.4), a: rand(.2, .55) };
      case 'silk': return { ...base, vy: rand(12, 30), vx: rand(-8, 8), r: rand(1, 2.4), a: rand(.2, .5) };
      case 'dust': return { ...base, vy: rand(6, 22), vx: rand(-20, 20), r: rand(1, 2.6), glow: true, a: rand(.25, .7) };
      case 'mote': return { ...base, vy: rand(-10, 10), vx: rand(-10, 10), r: rand(1.2, 3.2), glow: true };
      case 'shard': return { ...base, vy: rand(20, 60), vx: rand(-20, 20), r: rand(1.6, 4), spin: rand(-4, 4), glow: true, a: rand(.3, .8) };
      case 'banner': return { ...base, vy: rand(18, 40), vx: rand(-30, -6), r: rand(2, 4), a: rand(.2, .5) };
      default: return { ...base, vy: rand(20, 50), r: rand(1, 2.6) };
    }
  }

  /* ------------------------------ collision ------------------------------ */
  activeSolids(G) {
    const out = [];
    const sight = G.player.sight;
    for (const s of this.data.solids) {
      if (s.rt.broken) continue;
      if (s.kind === 'hidden') {
        const rev = sight || s.rt.permanent;
        s.rt.revealed = rev;
        if (!rev) continue;
      }
      out.push(s);
    }
    for (const g of this.gates) {
      if (g.open) continue;
      if (!g.passable(G)) out.push(g.rect);
    }
    for (const w of this.webs) if (w.solid) out.push(w);
    if (this.arenaSealed) out.push(this.sealRect);
    return out;
  }
  enemySolids(G, e) {
    const out = [];
    for (const s of this.data.solids) {
      if (s.rt.broken || s.kind === 'hidden' || s.oneway) continue;
      out.push(s);
    }
    if (this.arenaSealed) out.push(this.sealRect);
    return out;
  }

  /* -------------------------------- update ------------------------------- */
  update(dt, G) {
    this.t += dt;
    const p = G.player;
    // moving platforms
    for (const s of this.data.solids) {
      if (!s.move) continue;
      const m = s.move;
      m.t += dt * m.spd;
      const nx = m.ox + Math.sin(m.t) * m.dx;
      const ny = m.oy + Math.sin(m.t) * m.dy;
      s.mvdx = nx - s.x; s.mvdy = ny - s.y;
      s.x = nx; s.y = ny;
    }
    // crumble / vanish
    for (const s of this.data.solids) {
      const rt = s.rt;
      if (rt.crumble >= 0) {
        rt.crumble += dt;
        if (rt.crumble > .62 && !rt.broken) {
          rt.broken = true; rt.timer = 3.4;
          G.audio.sfx('gate'); G.fx.shake(3);
          G.particles.burst(s.x + s.w / 2, s.y + 6, 18, { color: [this.data.palette.groundTop, '#c9b394'], spd: 190, size: 4.4, life: .9, gravity: 700, shape: 'square' });
        }
      }
      if (rt.vanish >= 0) {
        rt.vanish += dt;
        if (rt.vanish > .3 && !rt.broken) {
          rt.broken = true; rt.timer = 3.2;
          G.particles.burst(s.x + s.w / 2, s.y + 6, 14, { color: ['#c792ff', '#fff'], spd: 130, size: 3.4, life: .7 });
          G.audio.sfx('phase');
        }
      }
      if (rt.broken) {
        rt.timer -= dt;
        if (rt.timer <= 0) {
          rt.broken = false; rt.crumble = -1; rt.vanish = -1;
          // don't respawn inside the player
          if (aabb(p, s)) { rt.broken = true; rt.timer = .5; }
          else G.particles.burst(s.x + s.w / 2, s.y + 6, 8, { color: [this.data.palette.glow], spd: 90, size: 3, life: .5 });
        }
      }
    }
    // temporary boss-spawned hazards expire
    for (let i = this.data.hazards.length - 1; i >= 0; i--) {
      const h = this.data.hazards[i];
      if (h.temp) { h.life -= dt; if (h.life <= 0) this.data.hazards.splice(i, 1); }
      if (h.kind === 'lava') {
        if (h.oy == null) { h.oy = h.y; h.oh = h.h; }
        const r = h.rise || 0;
        h.y = h.oy - r; h.h = h.oh + r;
      }
    }
    for (const g of this.gates) g.update(dt, G);
    /* auto-bless: walking up to an unlit shrine lights it — checkpoints
       should never depend on noticing a key prompt mid-fight            */
    const ap = G.player;
    if (ap && !G.boss) for (const s of this.shrines) {
      if (!s.lit && Math.abs(ap.x + ap.w / 2 - s.x) < 52 && Math.abs(ap.y + ap.h - s.y) < 110) { this.interact(G); break; }
    }
    for (const s of this.shrines) s.update(dt, G);
    for (const s of this.switches) s.update(dt, G);
    for (const a of this.anchors) a.update(dt);
    // webs
    for (let i = this.webs.length - 1; i >= 0; i--) {
      const w = this.webs[i]; w.life -= dt;
      if (w.life <= 0) this.webs.splice(i, 1);
      else if (aabb(p, w) && !p.phasing) { p.debuff('slow', .4); }
    }
    // rising lava (volcano)
    if (this.data.risingLava && this.t > 12) {
      this.lavaRise = Math.min(150, this.lavaRise + dt * 3.2);
      for (const h of this.data.hazards) if (h.kind === 'lava') h.rise = this.lavaRise;
    }
    updateHazards(G, dt);
    this.updateProjectiles(dt, G);
    // pickups
    for (let i = G.pickups.length - 1; i >= 0; i--) {
      const pk = G.pickups[i];
      pk.update(dt, G);
      if (pk.dead) G.pickups.splice(i, 1);
    }
    // enemies
    for (let i = G.enemies.length - 1; i >= 0; i--) {
      const e = G.enemies[i];
      e.update(dt, G);
      if (e.dead) G.enemies.splice(i, 1);
    }
    // prompts & interaction
    this.updatePrompt(G);
    // boss trigger
    const ar = this.data.bossArena;
    if (ar && !this.bossStarted && !G.boss && p.x + p.w > ar.x + 90) {
      this.bossStarted = true;
      G.startBoss?.();
    }
    if (G.boss) {
      this.arenaSealed = true;
      this.sealRect = { x: ar.x - 60, y: ar.y - ar.h, w: 60, h: ar.h };
    } else if (this.arenaSealed && !G.boss) {
      this.arenaSealed = false;
    }
    // weather
    this.updateWeather(dt, G);
  }

  updateWeather(dt, G) {
    const cam = G.camera, env = this.data.env;
    for (const w of this.weather) {
      w.x += (w.vx + Math.sin(this.t * .8 + w.rot) * 12) * dt;
      w.y += w.vy * dt;
      w.rot += w.spin * dt;
      if (w.y > cam.h + 40 || w.y < -200 || w.x < -80 || w.x > cam.w + 80) Object.assign(w, this.newWeather(false));
    }
  }
  drawWeather(ctx, G, t) {
    const env = this.data.env, col = env.weatherColor;
    ctx.save();
    // drifting additive light-motes
    {
      const cw = G.camera.w, ch = G.camera.h;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 22; i++) {
        const mx = ((i * 173.3 + t * (8 + (i % 6) * 3.5)) % (cw + 80)) - 40;
        const my = ch * (.18 + ((i * 97) % 60) / 100) + Math.sin(t * .6 + i) * 16;
        const al = .10 + .10 * Math.sin(t * 1.3 + i * 2.2);
        if (al <= .02) continue;
        ctx.globalAlpha = al; ctx.fillStyle = i % 3 ? '#ffe6a3' : '#ffffff';
        ctx.beginPath(); ctx.arc(mx, my, 1.4 + (i % 3), 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
    for (const w of this.weather) {
      ctx.globalAlpha = w.a ?? .5;
      switch (env.weather) {
        case 'petals':
          ctx.save(); ctx.translate(w.x, w.y); ctx.rotate(w.rot);
          ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, 0, w.r, w.r * .5, 0, 0, TAU); ctx.fill(); ctx.restore();
          break;
        case 'shard':
          ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(w.x, w.y); ctx.rotate(w.rot);
          ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, -w.r * 2); ctx.lineTo(w.r, 0); ctx.lineTo(0, w.r * 2); ctx.lineTo(-w.r, 0); ctx.closePath(); ctx.fill(); ctx.restore();
          break;
        case 'silk':
          ctx.strokeStyle = col; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(w.x, w.y); ctx.lineTo(w.x - w.vx * .2, w.y - 14); ctx.stroke(); break;
        case 'banner':
          ctx.fillStyle = rgba(col, .4); ctx.fillRect(w.x, w.y, w.r * .8, w.r * 2.6); break;
        default:
          if (w.glow) { ctx.globalCompositeOperation = 'lighter'; glow(ctx, w.x, w.y, w.r * 4, col, .5); ctx.globalCompositeOperation = 'source-over'; }
          ctx.fillStyle = col; ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, TAU); ctx.fill();
          if (env.weather === 'bubbles') { ctx.strokeStyle = rgba('#ffffff', .5); ctx.lineWidth = 1; ctx.stroke(); }
      }
    }
    ctx.restore();
  }

  updateProjectiles(dt, G) {
    const p = G.player;
    for (let i = G.projectiles.length - 1; i >= 0; i--) {
      const pr = G.projectiles[i];
      pr.update(dt, G);
      if (pr.dead) { G.projectiles.splice(i, 1); continue; }
      if (pr.owner === 'enemy') {
        // shield absorption
        if (p.shielded && !p.dead && dist(pr.x, pr.y, p.x + p.w / 2, p.y + p.h / 2) < 40 + pr.r) {
          p.absorb(G, pr.dmg);
          G.particles.burst(pr.x, pr.y, 12, { color: ['#6ee7a8', '#fff3d0'], spd: 200, size: 3.6, life: .4 });
          pr.dead = true; G.projectiles.splice(i, 1); continue;
        }
        if (!p.dead && !p.phasing && pr.hits(p)) {
          if (pr.onHitPlayer) pr.onHitPlayer(G);
          const hit = p.hurt(G, pr.dmg, { sx: pr.x, kx: sign(pr.vx) * pr.knock * .5, ky: -200 });
          if (pr.kind === 'web') this.spawnSticky(G, p.x - 20, p.y + p.h, 80);
          pr.dead = true; G.projectiles.splice(i, 1); continue;
        }
      } else if (pr.owner === 'player' && !pr.boomerang) {
        const box = { x: pr.x - pr.r, y: pr.y - pr.r, w: pr.r * 2, h: pr.r * 2 };
        let hitSomething = false;
        for (const e of G.enemies) {
          if (e.dead) continue;
          if (pr.hitIds && pr.hitIds.has(e)) continue;
          if (aabb(box, e)) {
            this.hurtEnemy(G, e, { dmg: pr.dmg, from: pr.kind === 'reflected' ? 'reflect' : 'player', kx: sign(pr.vx) * pr.knock, ky: -140, crit: pr.kind === 'reflected' });
            pr.hitIds?.add(e);
            hitSomething = true;
            if (pr.pierce > 0) pr.pierce--; else break;
          }
        }
        if (G.boss && !G.boss.dead && aabb(box, G.boss.hitRect || G.boss)) {
          G.boss.hurt(G, pr.dmg, { kx: sign(pr.vx) * 60, crit: pr.kind === 'reflected', from: pr.kind === 'reflected' ? 'reflect' : 'player' });
          if (pr.pierce > 0) pr.pierce--; else hitSomething = true;
        }
        this.checkSwitchHit(G, pr.x, pr.y, pr.r);
        if (hitSomething && pr.pierce <= 0) { pr.expire(G); G.projectiles.splice(i, 1); }
      } else if (pr.owner === 'player' && pr.boomerang) {
        if (G.boss && !G.boss.dead && pr.hits(G.boss.hitRect ? { x: G.boss.hitRect.x, y: G.boss.hitRect.y, w: G.boss.hitRect.w, h: G.boss.hitRect.h } : G.boss)) {
          if (!pr.hitCd.get('boss') || pr.t - pr.hitCd.get('boss') > .4) {
            pr.hitCd.set('boss', pr.t);
            G.boss.hurt(G, pr.dmg, { kx: sign(pr.vx) * 40, from: 'boomerang' });
          }
        }
      }
    }
  }

  /* ------------------------------- combat -------------------------------- */
  damageArea(G, box, o = {}) {
    const { dmg = 1, from = 'player', kx = 200, ky = -80, hitSet = null, hitCdMap = null, cd = .3, crit = false, armorBreak = false, hitPlayer = false, sx = 0 } = o;
    let hitAny = false;
    if (!hitPlayer) {
      for (const e of G.enemies) {
        if (e.dead) continue;
        if (hitSet && hitSet.has(e)) continue;
        if (hitCdMap && hitCdMap.get(e) !== undefined && this.t - hitCdMap.get(e) < cd) continue;
        if (aabb(box, e)) {
          hitCdMap?.set(e, this.t);
          hitSet?.add(e);
          this.hurtEnemy(G, e, { dmg, from, kx, ky, crit, armorBreak });
          hitAny = true;
        }
      }
      const b = G.boss;
      if (b && !b.dead) {
        const br = b.hitRect || b;
        const key = 'boss';
        const okSet = !hitSet || !hitSet.has(key);
        const okCd = !hitCdMap || hitCdMap.get(key) === undefined || this.t - hitCdMap.get(key) > cd;
        if (okSet && okCd && aabb(box, br)) {
          hitCdMap?.set(key, this.t); hitSet?.add(key);
          b.hurt(G, dmg, { kx: kx * .3, from, crit, armorBreak });
          hitAny = true;
        }
      }
      // breakables: cracked walls handled by charge
      if (armorBreak || from === 'charge') {
        for (const g of this.gates) {
          if (g.open || g.kind !== 'crack') continue;
          if (aabb(box, g.rect)) { g.breakOpen(G); hitAny = true; }
        }
        for (const s of this.data.solids) {
          if (s.breakable && !s.rt.broken && aabb(box, s)) {
            s.rt.broken = true; s.rt.timer = 1e9;
            G.audio.sfx('wallbreak'); G.fx.shake(10);
            G.particles.burst(s.x + s.w / 2, s.y + s.h / 2, 30, { color: [this.data.palette.groundTop, '#fff3d0'], spd: 300, size: 5, life: 1, gravity: 800, shape: 'square' });
          }
        }
      }
    } else {
      const p = G.player;
      if (!p.dead && !p.phasing && aabb(box, p)) { p.hurt(G, dmg, { sx, kx: sign(p.x + p.w / 2 - sx) * 300, ky }); hitAny = true; }
      for (const e of G.enemies) { if (!e.dead && aabb(box, e)) { this.hurtEnemy(G, e, { dmg: Math.ceil(dmg / 2), from: 'blast', kx: sign(e.cx - sx) * 300, ky: -200 }); } }
    }
    return hitAny;
  }
  hurtEnemy(G, e, o) { return e.hurt(G, o); }
  checkSwitchHit(G, x, y, r) {
    for (const s of this.switches) {
      if (s.hit) continue;
      if (s.hidden && !G.player.sight) continue;
      if (dist(x, y, s.x, s.y) < r + s.r) {
        s.trigger(G, true);
        if (G.player.boomerang) { /* keeps flying */ }
        return true;
      }
    }
    return false;
  }
  openGate(g, G) {
    g.open = true; g.solid = false; g.anim = 1;
    G.audio.sfx('gate'); G.fx.shake(5);
    G.particles.burst(g.x + g.w / 2, g.y + g.h / 2, 26, { color: [this.data.palette.glow, '#fff3d0'], spd: 240, size: 4, life: .8 });
    G.particles.ring(g.x + g.w / 2, g.y + g.h / 2, 20, this.data.palette.glow, .7);
    G.hud?.toast?.('Gate opened', '✦');
  }
  spawnSticky(G, x, y, w) {
    this.webs.push({ x: x - w / 2, y: y - 12, w, h: 14, life: 9, solid: false });
    G.particles.burst(x, y - 6, 10, { color: '#cfe9ff', spd: 110, size: 3, life: .6 });
  }
  startCrumble(G, s) { if (s.rt.crumble < 0 && !s.rt.broken) s.rt.crumble = 0; }
  startVanish(G, s) { if (s.rt.vanish < 0 && !s.rt.broken) { s.rt.vanish = 0; G.audio.sfx('phase'); } }
  onChargeHitWall(G, p, s) {
    if (s.breakable && !s.rt.broken) {
      s.rt.broken = true; s.rt.timer = 1e9;
      G.audio.sfx('wallbreak'); G.fx.shake(12); G.fx.stop(.08);
      G.particles.burst(s.x + s.w / 2, s.y + s.h / 2, 34, { color: [this.data.palette.groundTop, '#ffd775', '#fff3d0'], spd: 340, size: 6, life: 1.1, gravity: 900, shape: 'square' });
    } else { p.vx = 0; G.fx.shake(3); }
  }
  inHazard(G, x, y) {
    for (const h of this.data.hazards) {
      if (['spike', 'lava', 'thorn', 'void', 'water'].includes(h.kind)) {
        if (x > h.x && x < h.x + h.w && y > (h.cy ?? h.y) - 20 && y < (h.cy ?? h.y) + h.h) return true;
      }
    }
    return false;
  }
  interact(G) {
    const p = G.player;
    for (const s of this.shrines) {
      if (dist(p.x + p.w / 2, p.y + p.h / 2, s.x, s.y - 40) < 90) {
        this.checkpoint = { x: s.x, y: s.y - 60 };
        if (s.light(G)) {
          p.heal(p.maxHp); p.fullReset(G);
          G.audio.sfx('checkpoint');
          G.hud?.toast?.('Shrine lit · progress saved', '🪔', 'gold');
          G.saveCheckpoint(G.run.day, this.checkpoint);
          G.fx.flash('bless');
          return true;
        } else {
          p.heal(p.maxHp); p.fullReset(G);
          G.audio.sfx('checkpoint');
          G.hud?.toast?.('Devotion restored', '🪔');
          return true;
        }
      }
    }
    return false;
  }
  updatePrompt(G) {
    const p = G.player;
    this.prompt = null;
    for (const s of this.shrines) {
      if (dist(p.x + p.w / 2, p.y + p.h / 2, s.x, s.y - 40) < 92) {
        this.prompt = { key: 'F', text: s.lit ? 'Restore Devotion' : 'Light the Shrine · Save', act: 'shrine' };
        return;
      }
    }
    for (const g of this.gates) {
      if (g.open) continue;
      const r = g.rect;
      if (dist(p.x + p.w / 2, p.y + p.h / 2, r.x + r.w / 2, r.y + r.h / 2) < 130) {
        if (g.kind === 'boss') { this.prompt = { key: '→', text: 'The Asura waits beyond', act: null }; return; }
        const owned = p.owned.has(g.requires);
        if (!g._taught && owned && Math.abs(p.x + p.w / 2 - (g.rect.x + g.rect.w / 2)) < 170) {
          g._taught = true;
          const teach = { switch: 'Hit the glimmering rune with your Boomerang (C) to raise this gate', crack: 'Charge (C) into the cracked wall to smash it open' };
          G.hud?.toast?.(teach[g.kind] || ('This door answers only to ' + (G.boonName?.(g.requires) || g.requires) + ' — stand close and press F'), '🗝', 'gold', 6000);
        }
        this.prompt = {
          key: owned ? 'C' : '—',
          text: owned ? `${g.requiresLabel || 'Use ' + (g.requires || '')}` : (g.note || 'Sealed'),
          act: owned ? 'gate' : null, gate: g,
        };
        if (owned) this.prompt.text = 'Use ' + (G.boonName?.(g.requires) || g.requires);
        return;
      }
    }
  }
  tryGateWithBoon(G) {
    const pr = this.prompt;
    if (!pr || pr.act !== 'gate' || !pr.gate) return false;
    const g = pr.gate;
    if (!G.player.owned.has(g.requires)) { G.audio.sfx('error'); G.hud?.toast?.(g.note || 'Sealed by dark power', '✖'); return false; }
    G.player.useSpecial(G, g.requires);
    g.interact(G, g.requires);
    return true;
  }

  /* ================================ RENDER ================================ */
  draw(ctx, G, t) {
    const cam = G.camera, pal = this.data.palette, env = this.data.env;
    this.drawFar(ctx, G, t);
    this.drawMid(ctx, G, t);
    /* One convention: anything handed `cam` subtracts it itself (screen space).
       Layers drawn in raw world coordinates get an explicit translate.        */
    const rx = Math.round(cam.cx), ry = Math.round(cam.cy);
    ctx.save();
    if (cam.rot) { ctx.translate(cam.w / 2, cam.h / 2); ctx.rotate(cam.rot); ctx.translate(-cam.w / 2, -cam.h / 2); }
    ctx.save();
    ctx.translate(-rx, -ry);
    this.drawTerrain(ctx, G, t);
    this.drawDecor(ctx, G, t, 'bg');
    this.drawTexts(ctx, G, t);
    this.drawWebs(ctx, G, t);
    ctx.restore();
    drawHazards(ctx, cam, G, t, 'bg');
    for (const a of this.anchors) a.draw(ctx, cam, t, G);
    for (const s of this.switches) s.draw(ctx, cam, t, G);
    for (const g of this.gates) g.draw(ctx, cam, t, G);
    for (const s of this.shrines) s.draw(ctx, cam, t, G);
    drawHazards(ctx, cam, G, t, 'fg');
    for (const pk of G.pickups) pk.draw(ctx, cam, t, G);
    G.boss?.drawUnder?.(ctx, cam, t, G);
    for (const e of G.enemies) e.draw(ctx, cam, t, G);
    G.player.draw(ctx, cam, t, G);
    G.boss?.draw?.(ctx, cam, t, G);
    for (const pr of G.projectiles) pr.draw(ctx, cam, t, G);
    G.particles.draw(ctx, cam);
    G.fx.drawRipples(ctx, cam);
    ctx.save();
    ctx.translate(-rx, -ry);
    this.drawDecor(ctx, G, t, 'fg');
    ctx.restore();
    ctx.restore();
    G.fx.drawTexts(ctx, cam);
    this.drawNear(ctx, G, t);
    this.drawWeather(ctx, G, t);
    this.drawPost(ctx, G, t);
    ctx.restore();
  }

  drawSky(ctx, G, t) {
    const cam = G.camera, pal = this.data.palette, env = this.data.env, b = this.data.biome;
    const g = ctx.createLinearGradient(0, 0, 0, cam.h);
    g.addColorStop(0, pal.sky[0]); g.addColorStop(.62, pal.sky[1]); g.addColorStop(1, mixHex(pal.sky[1], pal.far, .5));
    ctx.fillStyle = g; ctx.fillRect(0, 0, cam.w, cam.h);
    // stars
    if (['labyrinth', 'mirror', 'ocean', 'fortress'].includes(b)) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 90; i++) {
        const sx = ((hash(i) * cam.w * 1.4 - cam.x * .04) % (cam.w + 40) + cam.w + 40) % (cam.w + 40) - 20;
        const sy = hash(i + 99) * cam.h * .7;
        const a = .25 + Math.sin(t * 1.6 + i) * .2;
        ctx.fillStyle = rgba('#ffffff', Math.max(0, a) * .7);
        ctx.beginPath(); ctx.arc(sx, sy, hash(i + 7) * 1.5 + .4, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
    // celestial body + divine mandala
    const cxp = cam.w * .74 - cam.x * .02, cyp = cam.h * .2 - cam.y * .02;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (b === 'volcano' || b === 'mines') {
      glow(ctx, cxp, cyp, 190, pal.accent, .16);
    } else {
      glow(ctx, cxp, cyp, 150, b === 'ocean' ? '#7fe8ff' : '#ffd9a0', .22);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = b === 'ocean' ? rgba('#dff6ff', .9) : rgba('#fff1cf', .92);
      ctx.beginPath(); ctx.arc(cxp, cyp, 34, 0, TAU); ctx.fill();
      if (b !== 'ocean') { ctx.fillStyle = rgba(pal.sky[0], .55); ctx.beginPath(); ctx.arc(cxp - 12, cyp - 8, 30, 0, TAU); ctx.fill(); }
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, cxp, cyp, 90, '#fff1cf', .3);
    }
    ctx.restore();
    // rotating mandala in the heavens — clipped above the horizon so the
    // additive petals can never wash over the play band
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, cam.w, cam.h * .52); ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = b === 'ocean' ? .18 : .12;
    mandalaRing(ctx, cam.w * .5 - cam.x * .03, cam.h * .34 - cam.y * .03, Math.min(cam.w, cam.h) * .46, 16, t * .04, pal.glow);
    ctx.restore();
    if (env.cosmic) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 26; i++) {
        const x = ((hash(i * 3) * 2200 - cam.x * .06) % 2200 + 2200) % 2200;
        if (x > cam.w + 60) continue;
        const y = hash(i * 5) * cam.h * .8;
        glow(ctx, x, y, 30 + hash(i) * 40, i % 3 ? '#7fe8ff' : '#ffe6a3', .1);
      }
      ctx.restore();
    }
  }

  drawFar(ctx, G, t) {
    const cam = G.camera, pal = this.data.palette, b = this.data.biome;
    const par = .12, baseY = cam.h * .78;
    const off = cam.x * par;
    ctx.save();
    ctx.translate(-off, -cam.y * par * .55);
    ctx.fillStyle = pal.far;
    ctx.globalAlpha = .95;
    const start = Math.floor((off - 320) / 260) * 260;
    const end = off + cam.w + 320;
    for (let x = start; x < end; x += 260) {
      const i = Math.round(x / 260);
      const sx = x;
      switch (b) {
        case 'fortress': case 'mirror': towerShape(ctx, sx, baseY, 90 + hash(i) * 70, 170 + hash(i + 3) * 200, hash(i + 5) > .5); break;
        case 'volcano': volcanoShape(ctx, sx, baseY, 190 + hash(i) * 130, t, i); break;
        case 'mines': case 'labyrinth': case 'web': stalagmiteShape(ctx, sx, baseY, 70 + hash(i) * 90, 120 + hash(i + 2) * 190); break;
        case 'ocean': waveShape(ctx, sx, baseY, 200, t * .5, i); break;
        default: hillShape(ctx, sx, baseY, 200 + hash(i) * 180, 90 + hash(i + 4) * 130);
      }
    }
    ctx.restore();
  }

  drawMid(ctx, G, t) {
    const cam = G.camera, pal = this.data.palette, b = this.data.biome, env = this.data.env;
    const par = .34, baseY = cam.h * .92;
    ctx.save();
    ctx.translate(-cam.x * par, -cam.y * par * .6);
    const step = 210;
    const start = Math.floor((cam.x * par - 200) / step) * step;
    const end = cam.x * par + cam.w + 200;
    for (let x = start, i = 0; x < end; x += step, i++) {
      const idx = Math.round(x / step);
      const h = hash(idx * 1.7);
      ctx.fillStyle = pal.mid;
      ctx.globalAlpha = .95;
      switch (b) {
        case 'swamp': treeShape(ctx, x, baseY, 40 + h * 30, 150 + h * 120, pal.mid, pal.near, t, idx); break;
        case 'garden': treeShape(ctx, x, baseY, 34 + h * 26, 130 + h * 150, pal.mid, '#8a2f74', t, idx, true); break;
        case 'fortress': pillarShape(ctx, x, baseY, 60 + h * 30, 240 + h * 180, pal.mid, pal.accent, idx); break;
        case 'mirror': crystalShape(ctx, x, baseY, 40 + h * 40, 200 + h * 220, pal.mid, pal.accent, t, idx); break;
        case 'labyrinth': pillarShape(ctx, x, baseY, 44 + h * 26, 220 + h * 200, pal.mid, pal.accent, idx, true); break;
        case 'mines': stalagmiteShape(ctx, x, baseY, 60 + h * 60, 140 + h * 180, pal.mid); ctx.fillStyle = rgba(pal.accent, .35); ctx.beginPath(); ctx.arc(x + 10, baseY - 60 - h * 90, 5 + h * 5, 0, TAU); ctx.fill(); break;
        case 'volcano': volcanoShape(ctx, x, baseY, 150 + h * 130, t, idx, pal.mid); break;
        case 'web': webArch(ctx, x, baseY, 120 + h * 90, 190 + h * 140, pal.mid, pal.accent, t); break;
        case 'ocean': waveShape(ctx, x, baseY, 200, t, idx, pal.mid); break;
        default: hillShape(ctx, x, baseY, 180 + h * 120, 110 + h * 90, pal.mid);
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  drawNear(ctx, G, t) {
    const cam = G.camera, pal = this.data.palette, b = this.data.biome, env = this.data.env;
    const par = 1.32;
    ctx.save();
    ctx.translate(-cam.x * par, -cam.y * par);
    ctx.globalAlpha = .82;
    const step = 330;
    const start = Math.floor((cam.x * par - 300) / step) * step;
    const end = cam.x * par + cam.w + 300;
    ctx.fillStyle = mixHex(pal.near, '#000000', .55);
    for (let x = start, i = 0; x < end; x += step, i++) {
      const idx = Math.round(x / step);
      const h = hash(idx * 3.3 + 11);
      if (h > .45) {
        // foreground silhouette frond / rock / column at the bottom
        const bh = 90 + h * 180;
        const yb = cam.y * par + cam.h + 20;
        ctx.beginPath();
        if (b === 'swamp' || b === 'garden') {
          ctx.moveTo(x, yb);
          ctx.quadraticCurveTo(x + 30, yb - bh * .6, x + 12 + Math.sin(t + idx) * 8, yb - bh);
          ctx.quadraticCurveTo(x + 52, yb - bh * .5, x + 60, yb);
        } else if (b === 'web') {
          ctx.moveTo(x, yb); ctx.lineTo(x + 16, yb - bh); ctx.lineTo(x + 34, yb);
        } else {
          ctx.moveTo(x, yb); ctx.lineTo(x + 8, yb - bh); ctx.lineTo(x + 44, yb - bh * .82); ctx.lineTo(x + 56, yb);
        }
        ctx.closePath(); ctx.fill();
      }
      if (h < .3) {
        // hanging top silhouette
        const th = 60 + h * 160;
        const yt = cam.y * par - 20;
        ctx.beginPath(); ctx.moveTo(x + 80, yt);
        ctx.quadraticCurveTo(x + 100, yt + th, x + 120, yt);
        ctx.closePath(); ctx.fill();
      }
    }
    ctx.restore();
  }

  /* ------------------------------ terrain -------------------------------- */
  drawTerrain(ctx, G, t) {
    const cam = G.camera, pal = this.data.palette, b = this.data.biome, p = G.player;
    for (const s of this.data.solids) {
      if (s.rt.broken) continue;
      if (s.x + s.w < cam.x - 60 || s.x > cam.x + cam.w + 60) continue;
      if (s.y + s.h < cam.y - 60 || s.y > cam.y + cam.h + 60) continue;
      if (s.kind === 'hidden') {
        const rev = s.rt.revealed;
        if (!rev) {
          if (p.sight === false && hash(s.x) > .985) { /* faint shimmer hint */ }
          continue;
        }
        ctx.save();
        ctx.globalAlpha = s.rt.permanent ? .95 : .78;
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, s.x + s.w / 2, s.y + s.h / 2, s.w * .7, '#c792ff', .28);
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = rgba('#e0b8ff', .95); ctx.lineWidth = 2.4;
        ctx.setLineDash([9, 6]); ctx.lineDashOffset = -t * 22;
        roundRect(ctx, s.x, s.y, s.w, s.h, 6); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = rgba('#c792ff', .2); ctx.fill();
        ctx.restore();
        continue;
      }
      this.drawSolid(ctx, s, G, t);
    }
    // arena seal door
    if (this.arenaSealed && this.sealRect) {
      const r = this.sealRect;
      ctx.save();
      const g = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y);
      g.addColorStop(0, '#2a1c08'); g.addColorStop(.5, '#8a6428'); g.addColorStop(1, '#3a2a10');
      ctx.fillStyle = g; ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = rgba(pal.accent, .8); ctx.lineWidth = 3; ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(r.x + r.w / 2, r.y + r.h / 2); ctx.rotate(t * .4);
      ctx.strokeStyle = rgba('#ffe6a3', .8); ctx.lineWidth = 2.6; starPath(ctx, 0, 0, 8, 22, 10); ctx.stroke();
      ctx.restore();
    }
  }

  drawSolid(ctx, s, G, t) {
    const pal = this.data.palette, b = this.data.biome;
    const isGround = s.kind === 'ground' || s.kind === 'ceiling' || s.kind === 'wall';
    ctx.save();
    if (s.kind === 'vanish') {
      const k = s.rt.vanish >= 0 ? clamp(1 - s.rt.vanish / .3, 0, 1) : 1;
      ctx.globalAlpha = .55 + k * .45;
    }
    if (s.kind === 'crumble') {
      const k = s.rt.crumble >= 0 ? clamp(s.rt.crumble / .62, 0, 1) : 0;
      ctx.translate(Math.sin(t * 40) * k * 3, 0);
      ctx.globalAlpha = 1 - k * .25;
    }
    // body
    const g = ctx.createLinearGradient(0, s.y, 0, s.y + Math.min(s.h, 420));
    g.addColorStop(0, isGround ? pal.groundTop : mixHex(pal.ground, pal.groundTop, .45));
    g.addColorStop(.09, pal.ground);
    g.addColorStop(1, mixHex(pal.ground, '#000000', .55));
    ctx.fillStyle = g;
    ctx.fillRect(s.x, s.y, s.w, s.h);
    // top highlight
    if (!isGround || s.kind === 'ground') {
      ctx.fillStyle = rgba(pal.glow, .28);
      ctx.fillRect(s.x, s.y, s.w, 3);
    }
    // texture
    const seed = Math.floor(s.x * .13 + s.y * .07);
    ctx.save();
    ctx.beginPath(); ctx.rect(s.x, s.y, s.w, s.h); ctx.clip();
    if (b === 'mines' || b === 'mirror' || b === 'labyrinth') {
      for (let i = 0; i < Math.min(30, s.w / 26); i++) {
        const hx = s.x + hash(seed + i) * s.w, hy = s.y + hash(seed + i + 40) * Math.min(s.h, 400);
        ctx.fillStyle = rgba(pal.accent, .12 + hash(seed + i + 9) * .2);
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + 7, hy + 5); ctx.lineTo(hx + 2, hy + 12); ctx.lineTo(hx - 5, hy + 6); ctx.closePath(); ctx.fill();
      }
    } else if (b === 'fortress') {
      ctx.strokeStyle = rgba('#000', .3); ctx.lineWidth = 1.6;
      const bh = 26, bw = 54;
      for (let y = s.y; y < s.y + Math.min(s.h, 500); y += bh) {
        ctx.beginPath(); ctx.moveTo(s.x, y); ctx.lineTo(s.x + s.w, y); ctx.stroke();
        const off = (Math.floor((y - s.y) / bh) % 2) * bw / 2;
        for (let x = s.x + off; x < s.x + s.w; x += bw) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + bh); ctx.stroke(); }
      }
    } else if (b === 'volcano') {
      ctx.strokeStyle = rgba('#ff6b3d', .3); ctx.lineWidth = 2;
      for (let i = 0; i < Math.min(12, s.w / 60); i++) {
        const hx = s.x + hash(seed + i) * s.w;
        ctx.beginPath(); ctx.moveTo(hx, s.y);
        let cy = s.y;
        for (let k = 0; k < 4; k++) { cy += 34; ctx.lineTo(hx + (hash(seed + i + k) - .5) * 22, cy); }
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = rgba('#000', .16);
      for (let i = 0; i < Math.min(40, s.w / 22); i++) {
        const hx = s.x + hash(seed + i * 2) * s.w, hy = s.y + 8 + hash(seed + i * 3 + 20) * Math.min(s.h - 10, 400);
        ctx.beginPath(); ctx.ellipse(hx, hy, 3 + hash(seed + i) * 6, 2 + hash(seed + i + 5) * 4, 0, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
    // edge shading
    ctx.fillStyle = rgba('#000', .34); ctx.fillRect(s.x, s.y + Math.min(s.h, 400) - 30, s.w, 30);

    // --- top dressing per kind/biome ---
    const top = s.y;
    if (s.kind === 'ground' || s.kind === 'stone' || s.kind === 'crumble' || s.kind === 'quicksand' || s.kind === 'sticky') {
      switch (b) {
        case 'swamp': case 'garden':
          ctx.strokeStyle = b === 'garden' ? rgba('#8fd45a', .8) : rgba(pal.groundTop, .9); ctx.lineWidth = 2;
          for (let x = s.x + 4; x < s.x + s.w; x += 11) {
            const hh = 6 + hash(x) * 12;
            ctx.beginPath(); ctx.moveTo(x, top + 2);
            ctx.quadraticCurveTo(x + Math.sin(t * 1.6 + x * .05) * 4, top - hh * .6, x + Math.sin(t * 1.6 + x * .05) * 7, top - hh);
            ctx.stroke();
          }
          if (b === 'garden') for (let x = s.x + 20; x < s.x + s.w; x += 90) {
            if (hash(x + 3) > .5) { ctx.fillStyle = pick2(x, ['#ff6fa5', '#ffd166', '#ff9fc4']); ctx.beginPath(); ctx.arc(x, top - 6, 4.6, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff3d0'; ctx.beginPath(); ctx.arc(x, top - 6, 1.8, 0, TAU); ctx.fill(); }
          }
          break;
        case 'fortress': case 'mirror': case 'labyrinth':
          ctx.fillStyle = mixHex(pal.groundTop, '#ffffff', .18);
          for (let x = s.x; x < s.x + s.w - 8; x += 26) ctx.fillRect(x, top - 9, 15, 10);
          break;
        case 'mines':
          ctx.fillStyle = rgba('#ffe9a8', .55);
          for (let x = s.x + 8; x < s.x + s.w; x += 46) { ctx.beginPath(); ctx.arc(x, top + 3, 3.4, 0, TAU); ctx.fill(); }
          break;
        case 'volcano':
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = rgba('#ff6b3d', .5 + Math.sin(t * 2) * .12); ctx.lineWidth = 2.4;
          ctx.beginPath(); ctx.moveTo(s.x, top + 2); ctx.lineTo(s.x + s.w, top + 2); ctx.stroke();
          ctx.restore();
          break;
        case 'web':
          ctx.strokeStyle = rgba('#cfe9ff', .5); ctx.lineWidth = 1.4;
          for (let x = s.x; x < s.x + s.w; x += 22) { ctx.beginPath(); ctx.moveTo(x, top); ctx.quadraticCurveTo(x + 11, top + 7, x + 22, top); ctx.stroke(); }
          break;
        case 'ocean':
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = rgba('#bfeeff', .5); ctx.lineWidth = 2;
          ctx.beginPath();
          for (let x = s.x; x <= s.x + s.w; x += 14) ctx.lineTo(x, top + Math.sin(t * 2 + x * .05) * 2.4);
          ctx.stroke(); ctx.restore();
          break;
      }
    }
    if (s.kind === 'crumble') {
      ctx.strokeStyle = rgba('#000', .55); ctx.lineWidth = 1.6;
      for (let i = 0; i < 4; i++) { const x = s.x + (i + .5) * s.w / 4; ctx.beginPath(); ctx.moveTo(x, s.y); ctx.lineTo(x + (hash(i + s.x) - .5) * 8, s.y + s.h); ctx.stroke(); }
      ctx.fillStyle = rgba(pal.accent, .18); ctx.fillRect(s.x, s.y, s.w, s.h);
    }
    if (s.kind === 'vanish') {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(pal.accent, .55 + Math.sin(t * 5) * .2); ctx.lineWidth = 2;
      roundRect(ctx, s.x, s.y, s.w, s.h, 5); ctx.stroke(); ctx.restore();
    }
    if (s.kind === 'bounce') {
      ctx.save();
      const k = Math.sin(t * 3) * 2;
      ctx.fillStyle = '#ff9fc4';
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI - Math.PI / 2 + Math.sin(t * 2) * .1;
        ctx.save(); ctx.translate(s.x + s.w / 2, s.y + 6); ctx.rotate(a + Math.PI / 2);
        ctx.beginPath(); ctx.ellipse(0, -12 - k, 8, 15, 0, 0, TAU); ctx.fill(); ctx.restore();
      }
      ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(s.x + s.w / 2, s.y + 6, 6, 0, TAU); ctx.fill();
      ctx.restore();
    }
    if (s.kind === 'sticky') {
      ctx.save(); ctx.strokeStyle = rgba('#d8f0ff', .55); ctx.lineWidth = 1.6;
      for (let x = s.x; x < s.x + s.w; x += 14) {
        ctx.beginPath(); ctx.moveTo(x, s.y);
        ctx.quadraticCurveTo(x + 7, s.y + 10 + Math.sin(t * 2 + x) * 3, x + 14, s.y);
        ctx.stroke();
      }
      ctx.restore();
    }
    if (s.kind === 'quicksand') {
      ctx.save();
      const g2 = ctx.createLinearGradient(0, s.y, 0, s.y + s.h);
      g2.addColorStop(0, '#ffe9a8'); g2.addColorStop(.4, '#d8a44a'); g2.addColorStop(1, '#6b4a12');
      ctx.fillStyle = g2; ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 12; i++) {
        const hx = s.x + hash(i + s.x) * s.w, hy = s.y + hash(i + 30) * s.h;
        glow(ctx, hx, hy, 8 + Math.sin(t * 3 + i) * 3, '#fff3d0', .5);
      }
      ctx.restore();
    }
    if (s.kind === 'log' || s.kind === 'leaf' || s.kind === 'ledge') {
      ctx.save();
      ctx.strokeStyle = rgba('#000', .35); ctx.lineWidth = 1.4;
      if (s.kind === 'log') {
        ctx.fillStyle = '#6b4a24'; ctx.fillRect(s.x, s.y, s.w, s.h);
        ctx.strokeStyle = '#4a3218';
        for (let x = s.x + 8; x < s.x + s.w; x += 18) { ctx.beginPath(); ctx.ellipse(x, s.y + s.h / 2, 4, 6, 0, 0, TAU); ctx.stroke(); }
        ctx.fillStyle = rgba('#7ee06b', .5);
        for (let x = s.x + 5; x < s.x + s.w; x += 22) { ctx.beginPath(); ctx.ellipse(x, s.y, 6, 3, 0, 0, TAU); ctx.fill(); }
      } else {
        ctx.fillStyle = b === 'garden' ? '#4a8a34' : mixHex(pal.ground, pal.groundTop, .6);
        roundRect(ctx, s.x, s.y, s.w, s.h, 5); ctx.fill();
        ctx.strokeStyle = rgba(pal.glow, .35); ctx.lineWidth = 1.6; ctx.stroke();
      }
      ctx.restore();
    }
    if (s.oneway) { ctx.fillStyle = rgba('#000', .25); ctx.fillRect(s.x, s.y + s.h - 3, s.w, 3); }
    ctx.restore();
  }

  drawDecor(ctx, G, t, layer) {
    const cam = G.camera, pal = this.data.palette, b = this.data.biome;
    ctx.save();
    if (layer === 'bg') {
      // hanging elements from ceilings & wall decor
      for (const s of this.data.solids) {
        if (s.kind !== 'ceiling' && s.kind !== 'wall' && s.h < 200) continue;
        if (s.x + s.w < cam.x - 60 || s.x > cam.x + cam.w + 60) continue;
        const yb = s.y + s.h;
        for (let x = s.x + 30; x < s.x + s.w - 20; x += 118) {
          const h = hash(x * .7 + s.y);
          if (h > .62) continue;
          const len = 40 + h * 120;
          switch (b) {
            case 'web':
              ctx.strokeStyle = rgba('#cfe9ff', .4); ctx.lineWidth = 1.4;
              ctx.beginPath(); ctx.moveTo(x, yb); ctx.lineTo(x + Math.sin(t + x) * 3, yb + len); ctx.stroke();
              if (h < .3) { ctx.fillStyle = rgba('#9fd8ff', .5); ellipse(ctx, x, yb + len + 8, 8, 11); ctx.fill(); }
              break;
            case 'mines':
              ctx.strokeStyle = '#3a2a10'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, yb); ctx.lineTo(x, yb + len * .5); ctx.stroke();
              ctx.save(); ctx.globalCompositeOperation = 'lighter';
              glow(ctx, x, yb + len * .5 + 8, 26 + Math.sin(t * 3 + x) * 3, '#ffd166', .5);
              ctx.fillStyle = '#ffe9a8'; ctx.beginPath(); ctx.arc(x, yb + len * .5 + 8, 5, 0, TAU); ctx.fill(); ctx.restore();
              break;
            case 'fortress':
              ctx.fillStyle = rgba('#e8c25a', .34);
              ctx.beginPath(); ctx.moveTo(x - 13, yb); ctx.lineTo(x + 13, yb); ctx.lineTo(x + 13, yb + len); ctx.lineTo(x, yb + len + 16); ctx.lineTo(x - 13, yb + len); ctx.closePath(); ctx.fill();
              break;
            case 'volcano':
              ctx.strokeStyle = rgba('#ff6b3d', .5); ctx.lineWidth = 2;
              ctx.beginPath(); ctx.moveTo(x, yb); ctx.lineTo(x, yb + len); ctx.stroke();
              ctx.fillStyle = rgba('#ffb03a', .6 + Math.sin(t * 4 + x) * .3); ctx.beginPath(); ctx.arc(x, yb + len, 3, 0, TAU); ctx.fill();
              break;
            case 'labyrinth': case 'mirror':
              ctx.save(); ctx.globalCompositeOperation = 'lighter';
              ctx.strokeStyle = rgba(pal.accent, .3); ctx.lineWidth = 1.4;
              ctx.translate(x, yb + len * .5); ctx.rotate(t * .5 + x);
              starPath(ctx, 0, 0, 6, 11, 5); ctx.stroke(); ctx.restore();
              break;
            default:
              ctx.strokeStyle = rgba(pal.groundTop, .45); ctx.lineWidth = 2.4;
              ctx.beginPath(); ctx.moveTo(x, yb);
              ctx.quadraticCurveTo(x + Math.sin(t * .8 + x) * 12, yb + len * .6, x + Math.sin(t * .8 + x) * 18, yb + len);
              ctx.stroke();
              for (let k = .3; k < 1; k += .3) {
                ctx.fillStyle = rgba(pal.groundTop, .5);
                ctx.beginPath(); ctx.ellipse(x + Math.sin(t * .8 + x) * 18 * k, yb + len * k, 6, 3, k, 0, TAU); ctx.fill();
              }
          }
        }
      }
      // ground decor: bushes, rocks, bones, diyas
      for (const s of this.data.solids) {
        if (s.kind !== 'ground') continue;
        if (s.x + s.w < cam.x - 60 || s.x > cam.x + cam.w + 60) continue;
        for (let x = s.x + 40; x < s.x + s.w - 30; x += 148) {
          const h = hash(x * 1.31 + s.y);
          if (h > .7) continue;
          const yb = s.y;
          ctx.save(); ctx.translate(x, yb);
          if (b === 'swamp' || b === 'garden') {
            ctx.fillStyle = rgba(b === 'garden' ? '#5aa83a' : pal.groundTop, .7);
            for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.ellipse(i * 9, -8 - Math.abs(i) * -3, 7, 14, i * .2, 0, TAU); ctx.fill(); }
          } else if (b === 'mines') {
            ctx.fillStyle = rgba('#ffe9a8', .35);
            ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(-4, -22); ctx.lineTo(8, -14); ctx.lineTo(16, 0); ctx.closePath(); ctx.fill();
          } else if (b === 'ocean') {
            ctx.strokeStyle = rgba('#7fe8ff', .4); ctx.lineWidth = 2;
            for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * 8, 0); ctx.quadraticCurveTo(i * 8 + Math.sin(t + i) * 8, -18, i * 8 + Math.sin(t * 1.4 + i) * 14, -34); ctx.stroke(); }
          } else if (b === 'volcano') {
            ctx.fillStyle = rgba('#3a1a12', .9);
            ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(-6, -18); ctx.lineTo(6, -10); ctx.lineTo(16, 0); ctx.closePath(); ctx.fill();
          } else {
            ctx.fillStyle = rgba(mixHex(pal.ground, '#ffffff', .16), .8);
            roundRect(ctx, -16, -18, 32, 18, 6); ctx.fill();
          }
          ctx.restore();
        }
      }
    }
    ctx.restore();
  }

  drawWebs(ctx, G, t) {
    for (const w of this.webs) {
      ctx.save();
      ctx.globalAlpha = clamp(w.life / 2, 0, 1) * .8;
      ctx.fillStyle = w.gold ? rgba('#ffd166', .5) : rgba('#cfe9ff', .35);
      ellipse(ctx, w.x + w.w / 2, w.y + w.h / 2, w.w / 2, w.h); ctx.fill();
      if (w.gold) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, w.x + w.w / 2, w.y + w.h / 2, w.w * .7, '#ffd166', .3); ctx.restore(); }
      ctx.strokeStyle = rgba('#ffffff', .5); ctx.lineWidth = 1.2;
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(w.x, w.y + w.h * (i / 3)); ctx.lineTo(w.x + w.w, w.y + w.h * (i / 3)); ctx.stroke(); }
      ctx.restore();
    }
  }

  drawTexts(ctx, G, t) {
    const cam = G.camera;
    ctx.save();
    ctx.textAlign = 'center';
    for (const tx of this.data.texts) {
      if (tx.x < cam.x - 300 || tx.x > cam.x + cam.w + 300) continue;
      const str = G.touchUI ? tx.str
        .replace(/Move with A\/D/g, 'Walk with the stick').replace(/Jump SPACE/g, 'Tap JUMP')
        .replace(/Swipe J/g, 'Tap SWIPE').replace(/Dodge SHIFT/g, 'Tap DODGE')
        .replace(/\(C\)/g, '(SPECIAL)').replace(/press C/g, 'tap SPECIAL') : tx.str;
      ctx.font = '600 15px Rajdhani, system-ui, sans-serif';
      const w = ctx.measureText(str).width + 28;
      const sx = clamp(tx.x, cam.x + w / 2 + 10, cam.x + cam.w - w / 2 - 10);
      ctx.fillStyle = 'rgba(8,4,18,.62)';
      roundRect(ctx, sx - w / 2, tx.y - 16, w, 30, 8); ctx.fill();
      ctx.strokeStyle = rgba(this.data.palette.accent, .45); ctx.lineWidth = 1.2; ctx.stroke();
      ctx.fillStyle = rgba('#fff3d0', .92);
      ctx.fillText(str, sx, tx.y + 5);
    }
    ctx.restore();
  }

  /* ------------------------------ post fx -------------------------------- */
  drawPost(ctx, G, t) {
    const cam = G.camera, env = this.data.env, pal = this.data.palette, p = G.player;
    ctx.save();
    // biome fog
    if (env.mist) {
      ctx.globalAlpha = env.mist * .5;
      const g = ctx.createLinearGradient(0, cam.h * .35, 0, cam.h);
      g.addColorStop(0, rgba(pal.fog, 0)); g.addColorStop(1, pal.fog);
      ctx.fillStyle = g; ctx.fillRect(0, 0, cam.w, cam.h);
      ctx.globalAlpha = 1;
    }
    // darkness
    if (env.dark > 0 && !p.sight) {
      const px = p.x + p.w / 2 - cam.cx, py = p.y + p.h / 2 - cam.cy;
      const r = 300 - env.dark * 190 + (p.smoked ? -40 : 0);
      const g = ctx.createRadialGradient(px, py, r * .25, px, py, r * 2.1);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(.55, rgba('#02010a', env.dark * .55));
      g.addColorStop(1, rgba('#02010a', Math.min(.94, env.dark + .42)));
      ctx.fillStyle = g; ctx.fillRect(0, 0, cam.w, cam.h);
    }
    // lava light
    if (env.lavaLight) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgba('#ff5a1e', .05 + Math.sin(t * 2.2) * .02);
      ctx.fillRect(0, cam.h * .5, cam.w, cam.h * .5);
      ctx.globalCompositeOperation = 'source-over';
    }
    // True Sight grade
    if (p.sight) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgba('#c792ff', .07 + Math.sin(t * 3) * .02); ctx.fillRect(0, 0, cam.w, cam.h);
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = rgba('#e0b8ff', .16); ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const r = ((t * 90 + i * 220) % 700);
        ctx.globalAlpha = clamp(1 - r / 700, 0, 1) * .5;
        ctx.beginPath(); ctx.arc(p.x + p.w / 2 - cam.cx, p.y + p.h / 2 - cam.cy, r, 0, TAU); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    // Focus grade
    if (p.focusT > 0) {
      const k = clamp(p.focusT / 3.4, 0, 1);
      ctx.fillStyle = rgba('#1a3a6a', .26 * k); ctx.fillRect(0, 0, cam.w, cam.h);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const px = p.x + p.w / 2 - cam.cx, py = p.y + p.h / 2 - cam.cy;
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * TAU + t * .3;
        const r0 = 150 + hash(i) * 60, r1 = r0 + 90 * k;
        ctx.strokeStyle = rgba('#bfe4ff', .1 * k);
        ctx.lineWidth = 2 + hash(i + 5) * 3;
        ctx.beginPath(); ctx.moveTo(px + Math.cos(a) * r0, py + Math.sin(a) * r0); ctx.lineTo(px + Math.cos(a) * r1, py + Math.sin(a) * r1); ctx.stroke();
      }
      glow(ctx, px, py, 190, '#8fd3ff', .16 * k);
      ctx.restore();
    }
    // smoke form darkening
    if (p.smoked) {
      ctx.fillStyle = rgba('#2a1c40', .2); ctx.fillRect(0, 0, cam.w, cam.h);
    }
    // low health vignette
    if (p.hp <= 1 && !p.dead) {
      const a = .18 + Math.sin(t * 5) * .1;
      const g = ctx.createRadialGradient(cam.w / 2, cam.h / 2, cam.h * .25, cam.w / 2, cam.h / 2, cam.h * .85);
      g.addColorStop(0, 'rgba(190,0,30,0)'); g.addColorStop(1, rgba('#c1121f', a + .25));
      ctx.fillStyle = g; ctx.fillRect(0, 0, cam.w, cam.h);
    }
    // boss presence grade
    if (G.boss && !G.boss.dead) {
      const g = ctx.createRadialGradient(cam.w / 2, cam.h / 2, cam.h * .3, cam.w / 2, cam.h / 2, cam.h * .95);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, rgba(G.boss.meta.color2 || '#200', .38));
      ctx.fillStyle = g; ctx.fillRect(0, 0, cam.w, cam.h);
    }

    /* ---- atmosphere boost: god-rays · drifting haze · vignette · heartbeat ---- */
    {
      // cached ray+haze layer (rebuilt only on resize); drifted & pulsed at draw time
      if (!this._atmoC || this._atmoC._w !== cam.w || this._atmoC._h !== cam.h) {
        const cv = this._atmoC = document.createElement('canvas'); cv.width = Math.max(2, cam.w >> 1); cv.height = Math.max(2, cam.h >> 1); cv._w = cam.w; cv._h = cam.h;
        const c2 = cv.getContext('2d'); c2.scale(.5, .5);
        const rayCol = pal.accent || '#ffe6a3';
        c2.globalCompositeOperation = 'lighter';
        for (let r = 0; r < 5; r++) {
          const x = (r * .23 + .06) * cam.w, wd = cam.w * .06;
          const g2 = c2.createLinearGradient(x, 0, x + wd * 2.2, cam.h);
          g2.addColorStop(0, rgba(rayCol, .12)); g2.addColorStop(.6, rgba(rayCol, .04)); g2.addColorStop(1, rgba(rayCol, 0));
          c2.fillStyle = g2;
          c2.beginPath(); c2.moveTo(x, -10); c2.lineTo(x + wd, -10);
          c2.lineTo(x + wd * 2.6 + cam.h * .35, cam.h + 10); c2.lineTo(x + cam.h * .35, cam.h + 10);
          c2.closePath(); c2.fill();
        }
        const fg = pal.fog || '#cfd8ff';
        for (let hz = 0; hz < 3; hz++) {
          const hx = cam.w * (.2 + .3 * hz), hy = cam.h * (.5 + .16 * hz);
          const g3 = c2.createRadialGradient(hx, hy, 10, hx, hy, 280);
          g3.addColorStop(0, rgba(fg, .07)); g3.addColorStop(1, rgba(fg, 0));
          c2.fillStyle = g3; c2.beginPath(); c2.ellipse(hx, hy, 300, 90, 0, 0, TAU); c2.fill();
        }
      }
      const pulse = .75 + .25 * Math.sin(t * .5);
      const dx = Math.sin(t * .07) * 26, dy = Math.sin(t * .05 + 1.3) * 8;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = pulse;
      ctx.drawImage(this._atmoC, dx, dy, cam.w, cam.h);
      ctx.restore();

      const hpf = p.hp / p.maxHp;
      if (hpf <= .34 && p.hp > 0) {
        const beat = Math.pow(Math.max(0, Math.sin(t * 5.2)), 3) * .5 + .12;
        const g5 = ctx.createRadialGradient(cam.w / 2, cam.h / 2, cam.h * .34, cam.w / 2, cam.h / 2, cam.h * .85);
        g5.addColorStop(0, 'rgba(255,40,40,0)'); g5.addColorStop(1, `rgba(255,30,30,${(beat * .5).toFixed(3)})`);
        ctx.fillStyle = g5; ctx.fillRect(0, 0, cam.w, cam.h);
      }
    }
    ctx.restore();
  }
}

/* ------------------------- background motif painters ---------------------- */
function hillShape(ctx, x, baseY, w, h, color) {
  if (color) ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(x - w, baseY + 40);
  ctx.quadraticCurveTo(x, baseY - h, x + w, baseY + 40);
  ctx.closePath(); ctx.fill();
}
function volcanoShape(ctx, x, baseY, h, t, i, color) {
  if (color) ctx.fillStyle = color;
  const w = h * 1.5;
  ctx.beginPath(); ctx.moveTo(x - w, baseY + 60);
  ctx.lineTo(x - h * .18, baseY - h); ctx.lineTo(x + h * .18, baseY - h); ctx.lineTo(x + w, baseY + 60);
  ctx.closePath(); ctx.fill();
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  glow(ctx, x, baseY - h, h * .5, '#ff5a1e', .22 + Math.sin(t * 1.5 + i) * .07);
  ctx.restore();
}
function stalagmiteShape(ctx, x, baseY, w, h, color) {
  if (color) ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(x - w, baseY + 40);
  ctx.lineTo(x - w * .2, baseY - h); ctx.lineTo(x + w * .1, baseY - h * .7); ctx.lineTo(x + w * .5, baseY - h * 1.1); ctx.lineTo(x + w, baseY + 40);
  ctx.closePath(); ctx.fill();
}
function towerShape(ctx, x, baseY, w, h, pointed) {
  ctx.beginPath();
  ctx.moveTo(x - w / 2, baseY + 40); ctx.lineTo(x - w / 2, baseY - h);
  if (pointed) { ctx.lineTo(x - w * .28, baseY - h); ctx.lineTo(x, baseY - h - w * .7); ctx.lineTo(x + w * .28, baseY - h); }
  else { ctx.lineTo(x - w * .3, baseY - h - 16); ctx.lineTo(x + w * .3, baseY - h - 16); ctx.lineTo(x + w / 2, baseY - h); }
  ctx.lineTo(x + w / 2, baseY + 40);
  ctx.closePath(); ctx.fill();
}
function waveShape(ctx, x, baseY, w, t, i, color) {
  if (color) ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(x - w, baseY + 80);
  for (let k = -w; k <= w; k += 26) {
    ctx.lineTo(x + k, baseY - Math.sin((k + x) * .012 + t * .9 + i) * 26 - Math.sin((k + x) * .03 + t * 1.6) * 8);
  }
  ctx.lineTo(x + w, baseY + 80); ctx.closePath(); ctx.fill();
}
function treeShape(ctx, x, baseY, w, h, color, leaf, t, i, floral = false) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(x - w * .22, baseY + 20);
  ctx.quadraticCurveTo(x - w * .1, baseY - h * .5, x - w * .05, baseY - h);
  ctx.lineTo(x + w * .12, baseY - h);
  ctx.quadraticCurveTo(x + w * .16, baseY - h * .5, x + w * .28, baseY + 20);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = leaf;
  const sway = Math.sin(t * .8 + i) * 6;
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * TAU + i;
    const rx = w * (1.5 + hash(i + k) * .8), ry = h * (.24 + hash(i + k + 3) * .12);
    ctx.beginPath();
    ctx.ellipse(x + Math.cos(a) * rx * .5 + sway, baseY - h + Math.sin(a) * ry * .5, rx * .55, ry * .55, a * .2, 0, TAU);
    ctx.fill();
  }
  if (floral) {
    ctx.fillStyle = rgba('#ff9fc4', .5);
    for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.arc(x + (hash(i + k * 7) - .5) * w * 2 + sway, baseY - h + (hash(i + k * 3) - .5) * h * .4, 3 + hash(i + k) * 3, 0, TAU); ctx.fill(); }
  }
}
function pillarShape(ctx, x, baseY, w, h, color, accent, i, rune = false) {
  ctx.fillStyle = color;
  ctx.fillRect(x - w / 2, baseY - h, w, h + 40);
  ctx.fillRect(x - w * .68, baseY - h - 16, w * 1.36, 18);
  ctx.fillRect(x - w * .62, baseY - 12, w * 1.24, 16);
  ctx.fillStyle = rgba('#000', .22);
  for (let k = 0; k < 4; k++) ctx.fillRect(x - w / 2 + k * (w / 4), baseY - h, 2, h);
  if (rune) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rgba(accent, .5);
    ctx.beginPath(); ctx.arc(x, baseY - h * .55, 6, 0, TAU); ctx.fill();
    glow(ctx, x, baseY - h * .55, 26, accent, .3);
    ctx.restore();
  }
}
function crystalShape(ctx, x, baseY, w, h, color, accent, t, i) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - w, baseY + 30); ctx.lineTo(x - w * .3, baseY - h); ctx.lineTo(x + w * .2, baseY - h * .7); ctx.lineTo(x + w * .8, baseY - h * 1.1); ctx.lineTo(x + w, baseY + 30);
  ctx.closePath(); ctx.fill();
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = rgba(accent, .28 + Math.sin(t * 1.4 + i) * .1); ctx.lineWidth = 2; ctx.stroke();
  glow(ctx, x, baseY - h * .8, w * 1.2, accent, .1);
  ctx.restore();
}
function webArch(ctx, x, baseY, w, h, color, accent, t) {
  ctx.strokeStyle = color; ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(x - w, baseY + 30);
  ctx.quadraticCurveTo(x, baseY - h, x + w, baseY + 30); ctx.stroke();
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = rgba(accent, .25); ctx.lineWidth = 1.6;
  for (let k = 1; k <= 4; k++) {
    ctx.beginPath(); ctx.moveTo(x - w, baseY + 30);
    ctx.quadraticCurveTo(x, baseY - h * (k / 4.4), x + w, baseY + 30); ctx.stroke();
  }
  ctx.restore();
}
function mandalaRing(ctx, cx, cy, r, petals, t, color) {
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(t);
  const baseA = ctx.globalAlpha;               // honour the caller's opacity
  ctx.strokeStyle = color; ctx.lineWidth = 1.6;
  for (let layer = 0; layer < 3; layer++) {
    const rr = r * (.45 + layer * .27);
    ctx.globalAlpha = baseA * (.5 - layer * .13);
    ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.stroke();
    const n = petals + layer * 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      ctx.save(); ctx.translate(Math.cos(a) * rr, Math.sin(a) * rr); ctx.rotate(a + Math.PI / 2);
      ctx.beginPath(); ctx.moveTo(0, -rr * .12); ctx.quadraticCurveTo(rr * .07, 0, 0, rr * .12); ctx.quadraticCurveTo(-rr * .07, 0, 0, -rr * .12); ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();
}
function pick2(x, arr) { return arr[Math.floor(hash(x) * arr.length) % arr.length]; }
