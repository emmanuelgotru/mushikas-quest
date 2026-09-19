/* ===========================================================================
   ui/hud.js — DOM heads-up display: hearts, bhakti, boons, boss bar, toasts
   =========================================================================== */
import { clamp } from '../core/utils.js';
import { BOONS } from '../data/boons.js';

const HEART_SVG = (full) => `<svg viewBox="0 0 24 24"><defs><linearGradient id="hg${full ? 'f' : 'e'}" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="${full ? '#fff0c8' : '#3a2a4a'}"/><stop offset="45%" stop-color="${full ? '#ff9a2e' : '#2a1c38'}"/><stop offset="100%" stop-color="${full ? '#c1440e' : '#1a1026'}"/></linearGradient></defs>
<path d="M12 21.2C7 17.6 2.8 14.2 2.8 9.6 2.8 6.6 5.1 4.4 7.9 4.4c1.7 0 3.2.8 4.1 2.1.9-1.3 2.4-2.1 4.1-2.1 2.8 0 5.1 2.2 5.1 5.2 0 4.6-4.2 8-9.2 11.6z" fill="url(#hg${full ? 'f' : 'e'})" stroke="${full ? 'rgba(255,220,150,.85)' : 'rgba(255,255,255,.14)'}" stroke-width="1.1"/>
${full ? '<ellipse cx="8.6" cy="8.6" rx="2.1" ry="1.5" fill="rgba(255,255,255,.55)" transform="rotate(-28 8.6 8.6)"/>' : ''}</svg>`;

export class HUD {
  constructor(G) {
    this.G = G;
    this.el = document.getElementById('hud');
    this.d = {
      daynum: document.getElementById('hud-daynum'),
      dayname: document.getElementById('hud-dayname'),
      hearts: document.getElementById('hud-hearts'),
      bhakti: document.getElementById('hud-bhakti'),
      bhaktiWrap: document.querySelector('.hud-meter-wrap .hud-meter'),
      modaks: document.getElementById('hud-modakcount'),
      modakTotal: document.getElementById('hud-modaktotal'),
      combo: document.getElementById('hud-combo'),
      comboNum: document.getElementById('hud-combonum'),
      comboBar: document.getElementById('hud-combobar'),
      timer: document.getElementById('hud-timer'),
      boons: document.getElementById('hud-boons'),
      prompt: document.getElementById('hud-prompt'),
      promptKey: document.getElementById('hud-prompt-key'),
      promptText: document.getElementById('hud-prompt-text'),
      hint: document.getElementById('hud-hint'),
      objective: document.getElementById('hud-objective'),
      boss: document.getElementById('boss-bar'),
      bossName: document.getElementById('boss-name'),
      bossSanskrit: document.getElementById('boss-sanskrit'),
      bossTitle: document.getElementById('boss-title'),
      bossFill: document.getElementById('boss-fill'),
      bossGhost: document.getElementById('boss-ghost'),
      bossPips: document.getElementById('boss-pips'),
      bossPhase: document.getElementById('boss-phase'),
      cue: document.getElementById('boss-cue'),
      toasts: document.getElementById('toasts'),
    };
    this._hearts = -1; this._boonKey = ''; this._ghostHp = 1;
    this._sealsEl = null;
  }
  show(v) { this.el.classList.toggle('hidden', !v); }

  setDay(n, name) { this.d.daynum.textContent = n; this.d.dayname.textContent = name; }

  setHearts(hp, max, pips = 0) {
    if (hp === this._hearts && this._pips === pips && this.d.hearts.childElementCount === max + pips) return;
    const prev = this._hearts;
    this._hearts = hp; this._pips = pips;
    let html = '';
    for (let i = 0; i < max; i++) html += `<div class="heart ${i < hp ? 'full' : 'empty'}${prev > hp && i === hp ? ' lost' : ''}">${HEART_SVG(i < hp)}</div>`;
    for (let i = 0; i < pips; i++) html += `<div class="heart" style="width:15px" title="Modak armour — absorbs one hit"><span style="font-size:13px;line-height:1;filter:drop-shadow(0 0 5px #9fd8ff)">🛡</span></div>`;
    this.d.hearts.innerHTML = html;
  }
  setBhakti(v, max) {
    const pct = clamp(v / max, 0, 1) * 100;
    this.d.bhakti.style.width = pct + '%';
    this.d.bhaktiWrap?.classList.toggle('full', pct >= 100);
  }
  setModaks(n, total) { this.d.modaks.textContent = n; this.d.modakTotal.textContent = '/' + total; }
  popModak() {
    this.d.modaks.parentElement?.animate?.(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.28)' }, { transform: 'scale(1)' }],
      { duration: 260, easing: 'cubic-bezier(.2,1.6,.4,1)' }
    );
  }
  setCombo(n) {
    this.d.combo.classList.toggle('on', n > 1);
    this.d.comboNum.textContent = n;
  }
  setComboBar(k) { this.d.comboBar.style.width = clamp(k, 0, 1) * 100 + '%'; }
  setTimer(str) { this.d.timer.textContent = str; }

  setBoons(owned, sel, cds, surgeReady) {
    const key = [...owned].join(',') + '|' + sel + '|' + (surgeReady ? 'S' : '');
    if (key !== this._boonKey) {
      this._boonKey = key;
      this.d.boons.innerHTML = BOONS.map((b, i) => {
        const has = owned.has(b.id);
        return `<div class="boon-slot ${has ? '' : 'locked'} ${i === sel && has ? 'armed' : ''}" data-i="${i}" style="color:${b.color}">
          <span class="bs-glyph">${has ? b.icon : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.6a4 4 0 0 1 8 0v2.9"/></svg>'}</span>
          <span class="bs-key">${i + 1}</span>
          <div class="bs-cd"></div>
          <span class="bs-name">${has ? b.key : 'Day ' + b.day}</span>
        </div>`;
      }).join('') + `<div class="boon-slot ${surgeReady ? 'armed' : 'locked'}" data-surge="1" style="color:#ffe6a3">
          <span class="bs-glyph"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="8.4"/><path d="M12 3.6v16.8M3.6 12h16.8M6 6l12 12M18 6L6 18"/></svg></span>
          <span class="bs-key">V</span><div class="bs-cd"></div><span class="bs-name">Siddhi Surge</span>
        </div>`;
      this.d.boons.querySelectorAll('.boon-slot').forEach((el) => {
        el.style.pointerEvents = 'auto';
        el.addEventListener('click', () => {
          if (el.dataset.surge) this.G.player?.useSurge?.(this.G);
          else this.G.player?.selectBoon?.(+el.dataset.i);
        });
      });
    }
    // cooldown sweeps
    const slots = this.d.boons.children;
    for (let i = 0; i < BOONS.length; i++) {
      const b = BOONS[i], el = slots[i];
      if (!el) continue;
      const cd = cds[b.id] || 0;
      const pct = cd > 0 ? (1 - cd / b.cd) * 100 : 100;
      el.querySelector('.bs-cd').style.setProperty('--p', (100 - pct) + '%');
      el.classList.toggle('cooling', cd > 0);
      el.classList.toggle('armed', i === sel && owned.has(b.id));
    }
  }
  flashBoon(i) {
    const el = this.d.boons.children[i];
    el?.animate?.([{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }], { duration: 220 });
  }

  showBoss(meta, phases) {
    this._bossUp = true; this.hint('');
    this.d.boss.classList.remove('hidden');
    this.d.bossName.textContent = meta.name;
    this.d.bossSanskrit.textContent = meta.deva;
    this.d.bossTitle.textContent = meta.title;
    this.d.bossPips.innerHTML = Array.from({ length: phases }, () => '<i></i>').join('');
    this.d.bossFill.style.width = '100%';
    this.d.bossGhost.style.width = '100%';
    this._ghostHp = 1;
    this.d.bossPhase.textContent = '';
    this.d.boss.style.borderColor = meta.color;
    document.documentElement.style.setProperty('--boss-col', meta.color);
  }
  setBossHp(k) {
    this.d.bossFill.style.width = clamp(k, 0, 1) * 100 + '%';
    if (k < this._ghostHp - .001) {
      const from = this._ghostHp;
      this._ghostHp = k;
      this.d.bossGhost.style.transition = 'none';
      this.d.bossGhost.style.width = from * 100 + '%';
      requestAnimationFrame(() => {
        this.d.bossGhost.style.transition = 'width .6s cubic-bezier(.2,.9,.25,1)';
        this.d.bossGhost.style.width = k * 100 + '%';
      });
    } else this._ghostHp = k;
  }
  bossPhase(p, max, text) { this.d.bossPhase.textContent = text || `PHASE ${p} / ${max}`; }
  hideBoss() { this._bossUp = false; this.d.boss.classList.add('hidden'); this.d.bossPhase.textContent = ''; }

  bossCue(main, sub = '', dur = 2.2) {
    const c = this.d.cue;
    c.classList.remove('hidden', 'out');
    c.innerHTML = `<div class="cue-main">${main}</div>${sub ? `<div class="cue-sub">${sub}</div>` : ''}`;
    clearTimeout(this._cueT);
    this._cueT = setTimeout(() => {
      c.classList.add('out');
      setTimeout(() => { c.classList.add('hidden'); c.classList.remove('out'); }, 460);
    }, dur * 1000);
  }

  showSeals(seals) {
    this.hideSeals();
    const el = document.createElement('div');
    el.id = 'seal-row';
    el.style.cssText = 'position:absolute;left:50%;transform:translateX(-50%);bottom:86px;display:flex;gap:8px;z-index:2;pointer-events:none';
    el.innerHTML = seals.map((s) => {
      const b = BOONS.find((x) => x.id === s.id);
      return `<div data-seal="${s.id}" style="width:46px;height:46px;border-radius:11px;display:grid;place-items:center;border:1px solid ${b.color};background:rgba(10,5,22,.8);color:${b.color};box-shadow:0 0 18px ${b.color}55;transition:.3s">${b.icon}</div>`;
    }).join('');
    this.el.appendChild(el);
    this._sealsEl = el;
  }
  updateSeals(seals) {
    if (!this._sealsEl) return;
    for (const s of seals) {
      const el = this._sealsEl.querySelector(`[data-seal="${s.id}"]`);
      if (!el) continue;
      if (s.done) {
        el.style.filter = 'grayscale(1) brightness(.5)';
        el.style.borderColor = '#6ee7a8';
        el.style.boxShadow = '0 0 22px #6ee7a866';
        el.style.transform = 'scale(.88)';
      }
    }
  }
  hideSeals() { this._sealsEl?.remove(); this._sealsEl = null; }

  prompt(key, text) {
    this.d.prompt.classList.remove('hidden');
    this.d.promptKey.textContent = key;
    this.d.promptText.textContent = text;
  }
  hidePrompt() { this.d.prompt.classList.add('hidden'); }
  hint(text, dur = 4) {
    if (!text) { this.d.hint.classList.remove('on'); return; }
    if (this._bossUp) { this.toast(text, '✦', 'gold', 5200); return; }   // never overprint the boss bar
    if (this._hintText === text && this.d.hint.classList.contains('on')) return;
    this._hintText = text;
    this.d.hint.textContent = text;
    this.d.hint.classList.add('on');
    clearTimeout(this._hintT);
    this._hintT = setTimeout(() => this.d.hint.classList.remove('on'), dur * 1000);
  }
  objective(title, text) {
    this.d.objective.innerHTML = text ? `<b>${title}</b>${text}` : '';
  }
  toast(text, icon = '✦', kind = '', dur = 2600) {
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.innerHTML = `<span class="t-ico">${icon}</span><span>${text}</span>`;
    this.d.toasts.appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 420); }, dur);
    while (this.d.toasts.children.length > 4) this.d.toasts.firstChild.remove();
  }
  clear() {
    this.hideBoss(); this.hideSeals(); this.hidePrompt(); this.hint(''); this.objective('', '');
    this.d.toasts.innerHTML = ''; this._hearts = -1; this._boonKey = '';
  }
}
