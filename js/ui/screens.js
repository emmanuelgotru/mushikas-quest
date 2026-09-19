/* ===========================================================================
   ui/screens.js — menus, calendar, codex, cutscenes, boon ceremony, credits
   =========================================================================== */
import { clamp, rgba, TAU } from '../core/utils.js';
import { BOONS } from '../data/boons.js';
import { BOSSES, VICES, CODEX_STORY, CODEX_MUSHIKA, SHLOKAS, DEATH_QUOTES, CREDITS, EPILOGUE } from '../data/lore.js';
import { LEVEL_DEFS, buildLevel } from '../data/levels.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

export class Screens {
  constructor(G) {
    this.G = G;
    this.stack = [];
    this.current = null;
    this.storyIdx = 0; this.storyLines = []; this.storyCb = null; this.typeT = null;
    this.menuIdx = 0;
    this._bindGlobal();
    this.buildSettings();
    this.buildControls();
    this.buildCodex();
  }

  /* ------------------------------ plumbing ------------------------------ */
  show(id, opts = {}) {
    const el = document.getElementById('screen-' + id);
    if (!el) return;
    if (this.current && this.current !== id) document.getElementById('screen-' + this.current)?.classList.remove('active');
    el.classList.add('active');
    this.current = id;
    if (id === 'controls') this.buildControls();   // rebuild so touch/keyboard labels match the device
    this.G.onScreen?.(id, opts);
  }
  hide(id) { document.getElementById('screen-' + id)?.classList.remove('active'); }
  hideAll() { $$('.screen').forEach((s) => s.classList.remove('active')); this.current = null; }
  toggle(id, on) { document.getElementById('screen-' + id)?.classList.toggle('active', on); }

  _bindGlobal() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      this.G.audio.resume();
      this.G.audio.sfx('ui');
      this.handleAction(btn.dataset.act, btn);
    });
    document.addEventListener('fullscreenchange', () => this.syncFs());
    document.addEventListener('mouseover', (e) => {
      const btn = e.target.closest('.mbtn');
      if (btn && this._lastHover !== btn) { this._lastHover = btn; this.G.audio.ready && this.G.audio.sfx('ui'); }
    });
  }

  syncFs() {
    const on = !!document.fullscreenElement;
    document.querySelectorAll('[data-act="fullscreen"] .mbtn-txt b').forEach((el) => { el.textContent = on ? 'Exit Fullscreen' : 'Fullscreen'; });
    const c = document.getElementById('btn-fs');
    if (c) { c.classList.toggle('on', on); c.title = on ? 'Exit fullscreen (Alt+Enter)' : 'Fullscreen (Alt+Enter)'; }
  }

  handleAction(act, el) {
    const G = this.G;
    switch (act) {
      case 'play': G.startQuest(); break;
      case 'levels': this.showLevels(); break;
      case 'codex': this.showCodex(); break;
      case 'controls': this.show('controls'); break;
      case 'bossrush': G.startBossRush?.(); break;
      case 'settings': this.show('settings'); break;
      case 'fullscreen': G.toggleFullscreen(); this.syncFs(); break;
      case 'hint': G.resume?.(); setTimeout(() => G.showHint(), 350); break;
      case 'back': this.back(); break;
      case 'resume': G.resume?.(); break;
      case 'restart': G.input.enabled = true; G.restartDay?.(); break;
      case 'quit': G.input.enabled = true; G.quitToCalendar?.(); break;
      case 'retry': G.input.enabled = true; G.retry?.(); break;
      case 'wipe': this.confirmWipe(); break;
      case 'skipcredits': G.finishCredits?.(); break;
      case 'startday': {
        const day = +el.dataset.day;
        G.startDay?.(day);
        break;
      }
      case 'settab': this.setSetting(el.dataset.k, el.dataset.v, el); break;
      case 'codextab': this.setCodexTab(el.dataset.tab); break;
    }
  }
  back() {
    const order = ['settings', 'controls', 'codex', 'levels'];
    const cur = this.current;
    if (cur === 'pause') { this.G.resume?.(); return; }
    if (this.G.state === 'howto') {           // dismissing the first-run tutorial returns to the game
      this.hide(cur); this.current = null; this.stack.length = 0;
      return;
    }
    if (order.includes(cur)) { this.show(this.stack.pop() || 'title'); }
    else this.show('title');
  }
  push(id) { if (this.current) this.stack.push(this.current); this.show(id); }

  /* -------------------------------- TITLE -------------------------------- */
  showTitle() {
    this.stack = [];
    this.show('title');
    const G = this.G;
    const s = G.save;
    const done = Object.keys(s.days || {}).length;
    const info = $('#title-saveinfo');
    if (done > 0) {
      const best = Math.max(...Object.values(s.days).map((d) => d.day || 0), 0);
      info.textContent = `Progress: Day ${best} · ${s.modaks || 0} modaks · ${done}/9 realms purified`;
    } else info.textContent = 'A new quest awaits · 9 realms · 8 divine boons';
    $$('#title-menu .mbtn').forEach((b, i) => {
      b.classList.toggle('sel', i === this.menuIdx);
      if (b.dataset.act === 'bossrush') b.toggleAttribute('disabled', !s.finished);
      const t = b.querySelector('.mbtn-txt b');
      if (b.dataset.act === 'play' && done > 0) t.textContent = 'Continue the Quest';
    });
  }
  menuMove(dir) {
    const items = $$('#title-menu .mbtn').filter((b) => !b.hasAttribute('disabled'));
    if (!items.length) return;
    this.menuIdx = (this.menuIdx + dir + items.length) % items.length;
    items.forEach((b, i) => b.classList.toggle('sel', i === this.menuIdx));
    this.G.audio.sfx('ui');
  }
  menuConfirm() {
    const items = $$('#title-menu .mbtn').filter((b) => !b.hasAttribute('disabled'));
    const b = items[this.menuIdx];
    if (b) { this.G.audio.sfx('uiBig'); this.handleAction(b.dataset.act, b); }
  }

  /* ------------------------------- CALENDAR ------------------------------ */
  showLevels() {
    this.push('levels');
    const grid = $('#cal-grid');
    const G = this.G;
    grid.innerHTML = '';
    let purified = 0;
    for (let i = 0; i < 9; i++) {
      const def = LEVEL_DEFS[i]();
      const rec = G.save.days?.[i + 1];
      const unlocked = i === 0 || G.save.days?.[i] || G.save.finished || G.save.unlockAll;
      if (rec) purified++;
      const card = document.createElement('button');
      card.className = 'day-card' + (unlocked ? '' : ' locked') + (rec ? ' done' : '');
      card.dataset.day = i + 1;
      card.dataset.act = unlocked ? 'startday' : '';
      const boss = BOSSES[i];
      card.innerHTML = `
        <canvas class="dc-art" width="420" height="260"></canvas>
        <div class="dc-scrim"></div>
        ${rec?.rank ? `<div class="dc-rank">${rec.rank}</div>` : ''}
        <div class="dc-top">
          <span class="dc-day">Day ${i + 1} · ${def.vice.split('·')[0].trim()}</span>
          <span class="dc-diya"></span>
        </div>
        <div class="dc-name">${def.name}</div>
        ${unlocked
          ? `<div class="dc-vice">${boss.name} — ${boss.title}</div>`
          : `<div class="dc-lock">🔒 sealed · purify Day ${i} first</div>`}
      `;
      grid.appendChild(card);
      paintDayCard(card.querySelector('canvas'), def, boss, rec, i);
      if (!unlocked) card.addEventListener('click', (e) => { e.preventDefault(); G.audio.sfx('error'); G.hud?.toast?.(`Day ${i + 1} is still sealed by darkness`, '🔒'); });
    }
    $('#cal-progress').textContent = Math.round((purified / 9) * 100) + '%';
    this.selectDay(1);
    grid.querySelectorAll('.day-card').forEach((c) => {
      c.addEventListener('mouseenter', () => { if (!c.classList.contains('locked')) this.selectDay(+c.dataset.day); });
      c.addEventListener('click', () => { if (!c.classList.contains('locked')) this.selectDay(+c.dataset.day); });
    });
  }
  selectDay(day) {
    this._selDay = day;
    $$('#cal-grid .day-card').forEach((c) => c.classList.toggle('sel', +c.dataset.day === day));
    const def = LEVEL_DEFS[day - 1]();
    const boss = BOSSES[day - 1];
    const boon = BOONS[day - 1];
    const rec = this.G.save.days?.[day];
    const unlocked = day === 1 || this.G.save.days?.[day - 1] || this.G.save.unlockAll;
    $('#cal-panel').innerHTML = `
      <h3>Day ${day} — ${def.name}</h3>
      <div class="cp-vice">${def.vice}</div>
      <p>${boss.myth}</p>
      <div class="cp-boss">
        <div class="cpb-ico" style="color:${boss.color};text-shadow:0 0 18px ${boss.color}">${boss.deva.slice(0, 1)}</div>
        <div><b>${boss.name}</b><span>${boss.title}</span></div>
      </div>
      <div class="cp-boon"><b>✦ Reward: ${boon.name}</b><span>${boon.desc}</span></div>
      <div class="cp-stats">
        <div class="cp-stat"><b>${rec ? rec.rank : '—'}</b><i>Rank</i></div>
        <div class="cp-stat"><b>${rec ? fmt(rec.time) : '—'}</b><i>Best</i></div>
        <div class="cp-stat"><b>${rec ? rec.modaks : 0}/${rec ? rec.modakTotal : '?'}</b><i>Modaks</i></div>
        <div class="cp-stat"><b>${boss.phases}</b><i>Phases</i></div>
      </div>
      <button class="mbtn primary" data-act="startday" data-day="${day}" ${unlocked ? '' : 'disabled'}>
        <span class="mbtn-ico">${unlocked ? '▶' : '🔒'}</span>
        <span class="mbtn-txt"><b>${unlocked ? (rec ? 'Re-enter Day ' + day : 'Begin Day ' + day) : 'Sealed'}</b><i>${unlocked ? boss.arena : 'Purify the previous realm'}</i></span>
      </button>`;
  }

  /* -------------------------------- CODEX -------------------------------- */
  buildCodex() {
    this.codexData = {
      story: `<div class="cx-sec"><div class="cx-body">${CODEX_STORY}</div></div>`,
      boons: `<div class="cx-sec"><h3>The Eight Divine Boons</h3><p class="lede">Each boon is a real aspect (name) of Shri Ganesha, and each one is the virtue that undoes the vice it is earned from.</p><div class="cx-grid">${
        BOONS.map((b) => `<div class="cx-card"><div class="cx-deva">${b.deva}</div><h4>${b.name}</h4><div class="cx-sub">Day ${b.day} · ${b.aspect}</div><p>${b.desc}</p><p style="color:${b.color};margin-top:8px"><b>Tip:</b> ${b.tip}</p></div>`).join('')
      }</div></div>`,
      vices: `<div class="cx-sec"><h3>The Nine Gates of Ruin</h3><p class="lede">The classical six inner enemies (ṣaḍripu) — desire, anger, greed, pride, delusion and envy — plus attachment, ego, and the refusal to be mortal.</p><div class="cx-grid">${
        VICES.map((v, i) => `<div class="cx-card"><div class="cx-deva">${v.deva}</div><h4>${v.n} — ${v.en}</h4><div class="cx-sub">Day ${i + 1} · ${v.gate} · ${BOSSES[i].name}</div><p>${v.line}</p><p style="color:#6ee7a8;margin-top:8px"><b>Antidote:</b> ${v.cure}</p></div>`).join('')
      }</div>
      <div class="cx-quote">${SHLOKAS.trividham.deva.replace(/\n/g, '<br>')}<small>${SHLOKAS.trividham.tr}</small></div></div>`,
      mushika: `<div class="cx-sec"><div class="cx-body">${CODEX_MUSHIKA}</div>
        <div class="cx-quote">${SHLOKAS.uddharet.deva.replace(/\n/g, '<br>')}<small>${SHLOKAS.uddharet.tr}</small></div></div>`,
    };
    this.setCodexTab('story');
  }
  setCodexTab(tab) {
    $$('#codex-tabs .ctab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
    $('#codex-body').innerHTML = this.codexData[tab] || '';
    $('#codex-body').scrollTop = 0;
  }
  showCodex() { this.push('codex'); }

  /* ------------------------------- SETTINGS ------------------------------ */
  buildSettings() {
    const G = this.G, s = G.settings;
    const seg = (k, label, sub, opts) => `
      <div class="set-row"><div class="sr-txt"><b>${label}</b><i>${sub}</i></div>
      <div class="set-seg">${opts.map((o) => `<button data-act="settab" data-k="${k}" data-v="${o.v}" class="${String(s[k]) === String(o.v) ? 'on' : ''}">${o.l}</button>`).join('')}</div></div>`;
    const slider = (k, label, sub, min, max, step) => `
      <div class="set-row"><div class="sr-txt"><b>${label}</b><i>${sub}</i></div>
      <input class="slider" type="range" min="${min}" max="${max}" step="${step}" value="${s[k]}" data-slider="${k}"></div>`;
    $('#settings-grid').innerHTML =
      seg('difficulty', 'Difficulty', 'Story = gentle · Dharma = unforgiving', [{ v: 'story', l: 'Story' }, { v: 'normal', l: 'Normal' }, { v: 'dharma', l: 'Dharma' }]) +
      slider('music', 'Music', 'Procedural raga soundtrack', 0, 1, .05) +
      slider('sfx', 'Effects', 'Combat & interface', 0, 1, .05) +
      seg('shake', 'Screen Shake', 'Reduce for comfort', [{ v: 1, l: 'Full' }, { v: .5, l: 'Soft' }, { v: 0, l: 'Off' }]) +
      seg('grain', 'Film Grain', 'CRT grain & scanlines', [{ v: 1, l: 'On' }, { v: 0, l: 'Off' }]) +
      seg('particles', 'Particles', 'Lower for weak devices', [{ v: 1, l: 'Full' }, { v: .6, l: 'Reduced' }, { v: .3, l: 'Minimal' }]) +
      seg('hints', 'Coach Marks', 'On-screen guidance', [{ v: 1, l: 'On' }, { v: 0, l: 'Off' }]) +
      seg('touch', 'Touch Controls', 'Auto-detects phones', [{ v: 'auto', l: 'Auto' }, { v: 'on', l: 'Always' }, { v: 'off', l: 'Off' }]);
    $('#settings-grid').querySelectorAll('[data-slider]').forEach((el) => {
      el.addEventListener('input', () => {
        const k = el.dataset.slider;
        G.settings[k] = +el.value;
        G.applySettings?.();
        if (k === 'music') G.audio.setVolumes(+G.settings.music, +G.settings.sfx, G.settings.muted);
        if (k === 'sfx') G.audio.setVolumes(+G.settings.music, +G.settings.sfx, G.settings.muted);
      });
    });
  }
  setSetting(k, v, el) {
    const G = this.G;
    const val = v === 'true' ? true : v === 'false' ? false : isNaN(+v) ? v : +v;
    G.settings[k] = val;
    el.parentElement.querySelectorAll('button').forEach((b) => b.classList.remove('on'));
    el.classList.add('on');
    G.applySettings?.();
    G.saveSettings?.();
    if (k === 'difficulty') G.hud?.toast?.('Difficulty: ' + String(v).toUpperCase(), '⚔');
  }
  buildControls() {
    const T = this.G.touchUI;
    const cards = [
      ['⇄', 'RUN', 'Move left and right', T ? 'Left stick' : 'A / D or ← →'],
      ['▲', 'JUMP', 'Press again in mid-air to jump twice!', T ? 'JUMP button' : 'SPACE'],
      ['✕', 'HIT', 'Tap-tap-tap — the 3rd hit is a BIG smash!', T ? 'SWIPE button' : 'J'],
      ['◉', 'SPIN', 'Whirlwind! Hits everything around you', T ? 'SPIN button' : 'K'],
      ['»', 'DASH', 'Super-quick dodge — nothing can touch you', T ? 'DODGE button' : 'SHIFT'],
      ['✦', 'MAGIC', 'Use your special god-power', T ? 'SPECIAL button' : 'C'],
      ['❈', 'TOUCH', 'Light shrines to save + heal, and open gates', T ? 'USE button (when it pops up)' : 'E or F'],
      ['ॐ', 'SUPER!', 'Gold meter full? Go SUPER STRONG for 9 seconds!', T ? 'ॐ button' : 'V'],
    ];
    $('#ctrl-cols').innerHTML = `
      <div class="kid-job">✦ <b>YOUR JOB:</b> run to the right → beat the big boss → win a NEW power → next day! Nine days, nine bosses. You can do it!</div>
      <div class="kid-grid">${cards.map((c) => `
        <div class="kid-card"><span class="kid-ico">${c[0]}</span><b class="kid-name">${c[1]}</b><span class="kid-say">${c[2]}</span><span class="kid-key">${c[3]}</span></div>`).join('')}
      </div>
      <div class="kid-tips">
        <span>♥ Getting hit is okay — shrines ❈ bring you back!</span>
        <span>? Stuck? Press <b>H</b>${T ? ' or the ? button in pause' : ''} for a friendly hint.</span>
        <span>★ Too tough? Make it easier any time in <b>Settings</b>.</span>
      </div>
      <div class="ctrl-note kid-more">Grown-up keys: Q swap power · 1–8 pick a power · P pause · M sound on/off · Alt+Enter fullscreen · gamepads work too!</div>`;
  }

  /* -------------------------------- STORY -------------------------------- */
  playStory(lines, cb, opts = {}) {
    this.storyLines = lines; this.storyIdx = 0; this.storyCb = cb;
    this.show('story');
    $('#story-skip').style.display = opts.skippable === false ? 'none' : '';
    this.storyAdvance(true);
    const next = () => this.storyAdvance();
    this._storyHandler = (e) => {
      if (e.type === 'keydown' && !['Space', 'Enter', 'KeyJ', 'ArrowRight'].includes(e.code)) return;
      e.preventDefault();
      next();
    };
    window.addEventListener('keydown', this._storyHandler);
    document.getElementById('screen-story').addEventListener('click', this._storyHandler);
    $('#story-skip').onclick = (e) => { e.stopPropagation(); this.endStory(); };
  }
  storyAdvance(first = false) {
    if (!first) this.storyIdx++;
    if (this.storyIdx >= this.storyLines.length) return this.endStory();
    const l = this.storyLines[this.storyIdx];
    const sp = $('#story-speaker');
    sp.textContent = l.s || '';
    sp.className = 'story-speaker ' + (l.cls || '');
    const el = $('#story-text');
    const text = l.t;
    clearInterval(this.typeT);
    // type out, preserving tags
    el.innerHTML = '';
    let i = 0;
    this.typeT = setInterval(() => {
      i += 2;
      el.innerHTML = text.slice(0, i);
      if (i >= text.length) { clearInterval(this.typeT); el.innerHTML = text; }
    }, 12);
    this.G.audio.sfx(l.cls === 'asura' ? 'error' : l.cls === 'ganesha' ? 'blessing' : 'ui');
  }
  endStory() {
    clearInterval(this.typeT);
    window.removeEventListener('keydown', this._storyHandler);
    document.getElementById('screen-story')?.removeEventListener('click', this._storyHandler);
    const cb = this.storyCb; this.storyCb = null;
    this.hide('story');
    cb?.();
  }

  /* --------------------------- BOON CEREMONY ----------------------------- */
  showBoon(day, stats, cb) {
    const boon = BOONS[day - 1];
    if (!boon) { cb?.(); return; }
    const boss = BOSSES[day - 1];
    const bless = BLESS(day);
    $('#boon-kicker').textContent = `${boss.name} is vanquished · the ${boss.vice.split('·')[0].trim().toLowerCase()} is conquered`;
    $('#boon-shloka').innerHTML = bless.deva.replace(/\n/g, '<br>');
    $('#boon-shloka-tr').textContent = bless.tr;
    $('#boon-icon').innerHTML = boon.icon;
    $('#boon-icon').style.color = boon.color;
    $('#boon-name').textContent = boon.name;
    $('#boon-aspect').textContent = boon.deva + ' · ' + boon.aspect;
    $('#boon-desc').textContent = boon.desc;
    $('#boon-keys').innerHTML = `
      <div class="bk"><b>C</b> ${boon.verb}</div>
      <div class="bk"><b>${boon.day}</b> select</div>
      ${boon.meter ? `<div class="bk"><b>${boon.meter}</b> bhakti</div>` : '<div class="bk"><b>—</b> drains while held</div>'}
      <div class="bk"><b>${boon.cd}s</b> cooldown</div>`;
    $('#boon-daynum').textContent = day;
    $('#boon-stats').innerHTML = `
      <div class="bs"><b>${fmt(stats.time)}</b><i>Time</i></div>
      <div class="bs"><b>${stats.rank}</b><i>Rank</i></div>
      <div class="bs"><b>${stats.modaks}/${stats.modakTotal}</b><i>Modaks</i></div>
      <div class="bs"><b>${stats.kills}</b><i>Asuras felled</i></div>
      <div class="bs"><b>${stats.deaths}</b><i>Falls</i></div>`;
    this.show('boon');
    const btn = $('#boon-continue');
    btn.onclick = () => { this.G.audio.sfx('uiBig'); this.hide('boon'); cb?.(); };
    this._boonCb = () => { this.hide('boon'); cb?.(); };
    setTimeout(() => {
      const inner = $('.boon-inner');
      inner?.animate?.([{ opacity: 0, transform: 'scale(.92)' }, { opacity: 1, transform: 'none' }], { duration: 700, easing: 'cubic-bezier(.2,.9,.25,1)' });
    }, 10);
  }

  /* ------------------------------- VICTORY ------------------------------- */
  showVictory(stats, cb) {
    $('#win-inner').innerHTML = `
      <div class="win-title">Dharma Restored</div>
      <div class="win-by">by Mythic Developers</div>
      <div class="win-deva">${SHLOKAS.gajananam.deva.replace(/\n/g, '<br>')}</div>
      <div class="win-tr">${SHLOKAS.gajananam.tr}</div>
      <div class="win-stats">
        <div class="ws"><b>${fmt(stats.totalTime)}</b><i>Total time</i></div>
        <div class="ws"><b>${stats.modaks}</b><i>Modaks</i></div>
        <div class="ws"><b>${stats.kills}</b><i>Asuras felled</i></div>
        <div class="ws"><b>${stats.deaths}</b><i>Falls</i></div>
        <div class="ws"><b>${stats.rank}</b><i>Final rank</i></div>
        <div class="ws"><b>${Math.round(stats.completion)}%</b><i>Completion</i></div>
      </div>
      <div class="win-epilogue" id="win-epi"></div>
      <div class="panel-btns" style="max-width:420px;margin:0 auto">
        <button class="mbtn primary" id="win-credits"><span class="mbtn-ico">✦</span><span class="mbtn-txt"><b>Watch the Epilogue &amp; Credits</b></span></button>
        <button class="mbtn" id="win-menu"><span class="mbtn-ico">⌂</span><span class="mbtn-txt"><b>Return to the Festival</b></span></button>
      </div>`;
    this.show('win');
    const epi = $('#win-epi');
    let i = 0;
    const t = setInterval(() => {
      if (i >= EPILOGUE.length) { clearInterval(t); return; }
      const line = EPILOGUE[i];
      epi.insertAdjacentHTML('beforeend', `<p style="margin-bottom:12px;${line.cls === 'ganesha' ? 'color:#ffe9bb' : ''}">${line.s ? '<b style="font-family:var(--f-head);letter-spacing:.14em;font-size:11px;color:var(--gold)">' + line.s + '</b><br>' : ''}${line.t}</p>`);
      const scroller = epi.parentElement;
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
      i++;
    }, 2600);
    this._epiT = t;
    $('#win-credits').onclick = () => { clearInterval(t); this.G.audio.sfx('uiBig'); cb?.('credits'); };
    $('#win-menu').onclick = () => { clearInterval(t); this.G.audio.sfx('uiBig'); cb?.('menu'); };
  }
  showCredits() {
    $('#credits-scroll').innerHTML = CREDITS.map((c) => `${c.h ? `<h3>${c.h}</h3>` : ''}<p class="${c.cls || ''}">${c.p}</p>`).join('');
    const sc = $('#credits-scroll');
    sc.style.animation = 'none'; void sc.offsetWidth; sc.style.animation = '';
    this.show('credits');
  }
  showGameOver(cb) {
    const cp = this.G.save.cp, day = this.G.run?.day;
    const note = document.querySelector('#screen-over [data-act="retry"] .mbtn-txt i');
    if (note) note.textContent = cp && cp.day === day
      ? 'Rise at your last lit shrine — boons & modaks kept'
      : 'No shrine lit yet this day — shrines auto-light as checkpoints';
    const q = DEATH_QUOTES[Math.floor(Math.random() * DEATH_QUOTES.length)];
    $('#over-quote').innerHTML = `${q.deva}<br><span style="font-family:var(--f-ui);font-size:13px;color:rgba(220,200,170,.7);font-style:italic">${q.tr}</span>`;
    this.show('over');
    this._overCb = cb;
    this.G.input.enabled = false;
  }
  confirmWipe() {
    if (!confirm('Erase all progress, boons and modaks? This cannot be undone.')) return;
    localStorage.removeItem('mushika_save_v1');
    location.reload();
  }
}

function BLESS(day) {
  const map = {
    1: SHLOKAS.vakra, 2: SHLOKAS.gayatri, 3: SHLOKAS.gajananam, 4: SHLOKAS.vakra,
    5: SHLOKAS.gayatri, 6: SHLOKAS.gajananam, 7: SHLOKAS.trividham, 8: SHLOKAS.uddharet, 9: SHLOKAS.nainam,
  };
  return map[day] || SHLOKAS.vakra;
}
function fmt(ms) {
  const s = Math.max(0, Math.floor((ms || 0) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/* ------------------------- procedural day-card art ----------------------- */
export function paintDayCard(cv, def, boss, rec, idx) {
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height, pal = def.palette;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, pal.sky[0]); g.addColorStop(1, pal.sky[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // stars
  ctx.fillStyle = 'rgba(255,255,255,.5)';
  for (let i = 0; i < 40; i++) { const x = hash(i + idx * 7) * W, y = hash(i + 99) * H * .6; ctx.globalAlpha = .2 + hash(i) * .5; ctx.fillRect(x, y, 1.4, 1.4); }
  ctx.globalAlpha = 1;
  // glow of the asura
  const gg = ctx.createRadialGradient(W * .5, H * .58, 6, W * .5, H * .58, W * .55);
  gg.addColorStop(0, rgba(boss.color, .55)); gg.addColorStop(1, rgba(boss.color, 0));
  ctx.fillStyle = gg; ctx.fillRect(0, 0, W, H);
  // mandala
  ctx.save(); ctx.globalAlpha = .16; ctx.strokeStyle = pal.glow; ctx.lineWidth = 1.2;
  ctx.translate(W * .5, H * .5);
  for (let r = 20; r < W * .5; r += 22) { ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke(); }
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * W * .5, Math.sin(a) * W * .5); ctx.stroke(); }
  ctx.restore();
  // silhouette skyline per biome
  ctx.fillStyle = pal.far;
  const baseY = H * .82;
  ctx.beginPath(); ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 12) {
    let y = baseY - 26;
    if (def.biome === 'fortress' || def.biome === 'mirror') y = baseY - (Math.sin(x * .05) > .6 ? 78 : 34);
    else if (def.biome === 'volcano') y = baseY - Math.abs(Math.sin(x * .012)) * 84;
    else if (def.biome === 'ocean') y = baseY - Math.sin(x * .03) * 14 - 12;
    else y = baseY - Math.abs(Math.sin(x * .02 + idx)) * 54;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
  // ground
  ctx.fillStyle = pal.ground; ctx.fillRect(0, H * .88, W, H * .12);
  ctx.fillStyle = pal.groundTop; ctx.fillRect(0, H * .88, W, 4);
  // boss silhouette
  ctx.save();
  ctx.translate(W * .5, H * .86);
  ctx.fillStyle = rgba('#000', .55);
  const bw = 62 * boss.size, bh = 74 * boss.size;
  ctx.beginPath();
  ctx.moveTo(-bw * .4, 0); ctx.quadraticCurveTo(-bw * .5, -bh * .7, 0, -bh); ctx.quadraticCurveTo(bw * .5, -bh * .7, bw * .4, 0);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = boss.color;
  ctx.beginPath(); ctx.arc(-bw * .12, -bh * .82, 4, 0, TAU); ctx.arc(bw * .12, -bh * .82, 4, 0, TAU); ctx.fill();
  ctx.restore();
  // diyas along the bottom
  for (let i = 0; i < 9; i++) {
    const x = 18 + i * (W - 36) / 8, y = H - 12;
    ctx.fillStyle = i <= idx ? '#ff9a2e' : '#3a2a4a';
    ctx.beginPath(); ctx.ellipse(x, y, 6, 3, 0, 0, TAU); ctx.fill();
    if (i <= idx) { ctx.fillStyle = '#ffe9a8'; ctx.beginPath(); ctx.ellipse(x, y - 5, 2.4, 4.4, 0, 0, TAU); ctx.fill(); }
  }
  // grade
  if (rec) {
    ctx.fillStyle = 'rgba(255,220,150,.1)'; ctx.fillRect(0, 0, W, H);
  }
  ctx.fillStyle = 'rgba(6,3,14,.35)'; ctx.fillRect(0, 0, W, H);
}
function hash(n) { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); }
