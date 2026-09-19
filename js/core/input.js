/* ===========================================================================
   core/input.js — keyboard + gamepad + touch, with edge detection & buffering
   =========================================================================== */

const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down', KeyS: 'down',
  Space: 'jump', KeyW: 'jump',
  KeyJ: 'attack', KeyX: 'attack',
  ShiftLeft: 'dodge', ShiftRight: 'dodge', KeyL: 'dodge',
  KeyC: 'special', KeyZ: 'special',
  KeyV: 'surge',
  KeyQ: 'swap', Tab: 'swap',
  KeyE: 'interact', KeyF: 'interact',
  Escape: 'pause', KeyP: 'pause',
  Enter: 'confirm',
  Digit1: 'b1', Digit2: 'b2', Digit3: 'b3', Digit4: 'b4',
  Digit5: 'b5', Digit6: 'b6', Digit7: 'b7', Digit8: 'b8',
  KeyM: 'mute',
  KeyH: 'hint',
  KeyK: 'cyclone',
};

const GP_MAP = { 0: 'jump', 1: 'dodge', 2: 'special', 3: 'swap', 4: 'dodge', 5: 'special', 9: 'pause', 8: 'pause', 12: 'up', 13: 'down', 14: 'left', 15: 'right' };

export const ACTIONS = ['left', 'right', 'up', 'down', 'jump', 'attack', 'dodge', 'special', 'swap', 'interact', 'pause', 'confirm', 'surge', 'cyclone'];

export class Input {
  constructor(game) {
    this.g = game;
    this.held = Object.create(null);
    this.down = Object.create(null);
    this.up = Object.create(null);
    this.buffer = Object.create(null); // action -> seconds remaining
    this.axisX = 0; this.axisY = 0;
    this.touch = { active: false, x: 0, y: 0 };
    this.lastPointer = null;
    this.enabled = true;
    this.anyKeyThisFrame = false;
    this._bind();
  }

  _bind() {
    const setAct = (act, val) => {
      if (!act) return;
      if (val && !this.held[act]) this.down[act] = true;
      if (!val && this.held[act]) this.up[act] = true;
      this.held[act] = val;
      if (val) this.anyKeyThisFrame = true;
    };

    window.addEventListener('keydown', (e) => {
      const act = (e.altKey && e.code === 'Enter') ? 'fullscreen' : KEYMAP[e.code];
      if (act) {
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
        if (!e.repeat) setAct(act, true);
        else this.held[act] = true;
      }
      this.anyKeyThisFrame = true;
      if (e.code === 'F1') { e.preventDefault(); this.g.toggleDebug?.(); }
    }, { passive: false });

    window.addEventListener('keyup', (e) => { const act = (e.altKey && e.code === 'Enter') ? 'fullscreen' : KEYMAP[e.code]; if (act) setAct(act, false); });
    window.addEventListener('blur', () => { for (const a of Object.keys(this.held)) { if (this.held[a]) this.up[a] = true; this.held[a] = false; } });

    window.addEventListener('contextmenu', (e) => { if (this.g.touchUI) e.preventDefault(); });
    document.addEventListener('gesturestart', (e) => e.preventDefault());

    // touch buttons
    document.querySelectorAll('#touch .tbtn').forEach((btn) => {
      const act = btn.dataset.act;
      const on = (e) => { e.preventDefault(); setAct(act, true); btn.classList.add('press'); };
      const off = (e) => { e.preventDefault(); setAct(act, false); btn.classList.remove('press'); };
      btn.addEventListener('touchstart', on, { passive: false });
      btn.addEventListener('touchend', off, { passive: false });
      btn.addEventListener('touchcancel', off, { passive: false });
      btn.addEventListener('mousedown', on); btn.addEventListener('mouseup', off); btn.addEventListener('mouseleave', off);
    });

    // thumbstick
    const stick = document.getElementById('tstick');
    const knob = document.getElementById('tknob');
    if (stick) {
      let id = null, cx = 0, cy = 0;
      const start = (e) => {
        const t = e.changedTouches ? e.changedTouches[0] : e;
        id = e.changedTouches ? t.identifier : 'mouse';
        const r = stick.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2;
        this.touch.active = true; move(e); e.preventDefault();
      };
      const move = (e) => {
        if (!this.touch.active) return;
        let t = e;
        if (e.changedTouches) { t = null; for (const tt of e.changedTouches) if (tt.identifier === id) t = tt; if (!t) return; }
        const r = stick.getBoundingClientRect(), max = r.width * .42;
        let dx = t.clientX - cx, dy = t.clientY - cy;
        const d = Math.hypot(dx, dy) || 1;
        const cl = Math.min(d, max); dx = (dx / d) * cl; dy = (dy / d) * cl;
        knob.style.transform = `translate(${dx}px,${dy}px)`;
        this.touch.x = dx / max; this.touch.y = dy / max;
        setAct('left', this.touch.x < -.32); setAct('right', this.touch.x > .32);
        setAct('down', this.touch.y > .55);
        e.preventDefault();
      };
      const end = (e) => {
        this.touch.active = false; this.touch.x = 0; this.touch.y = 0;
        knob.style.transform = ''; setAct('left', false); setAct('right', false); setAct('down', false);
        id = null; if (e && e.preventDefault) e.preventDefault();
      };
      stick.addEventListener('touchstart', start, { passive: false });
      stick.addEventListener('touchmove', move, { passive: false });
      stick.addEventListener('touchend', end, { passive: false });
      stick.addEventListener('touchcancel', end, { passive: false });
    }
  }

  /** per-frame: gamepad poll + buffer decay + clear edges */
  update(dt) {
    // gamepad
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const p of pads) if (p && p.connected) { gp = p; break; }
    if (gp) {
      const ax = gp.axes[0] || 0;
      if (Math.abs(ax) > .25) { this.held.left = ax < -.3; this.held.right = ax > .3; this.down[ax < -.3 ? 'left' : 'right'] = true; }
      for (const [idx, act] of Object.entries(GP_MAP)) {
        const b = gp.buttons[idx];
        if (b && b.pressed) { if (!this.held[act]) this.down[act] = true; this.held[act] = true; }
        else if (this.held[act] && !KEYMAP_HAS(act, gp)) { this.up[act] = true; this.held[act] = false; }
      }
    }
    for (const k of Object.keys(this.buffer)) { this.buffer[k] -= dt; if (this.buffer[k] <= 0) delete this.buffer[k]; }
  }

  endFrame() { this.down = Object.create(null); this.up = Object.create(null); this.anyKeyThisFrame = false; }

  /** add an action to the input buffer (so a press right before landing still works) */
  buf(act, time = .14) { this.buffer[act] = Math.max(this.buffer[act] || 0, time); }
  consume(act) { if (this.buffer[act] > 0) { delete this.buffer[act]; return true; } return false; }

  pressed(act) { return this.enabled && !!this.down[act]; }
  released(act) { return this.enabled && !!this.up[act]; }
  raw(act) { return !!this.down[act]; }
  isDown(act) {
    if (!this.enabled) return false;
    return !!this.held[act];
  }
  /** 1 = right, -1 = left, 0 = none (respects control-reversal debuff) */
  axis(reverse = false) {
    let a = 0;
    if (this.isDown('left')) a -= 1;
    if (this.isDown('right')) a += 1;
    if (!a && this.touch.active) a = Math.abs(this.touch.x) > .2 ? Math.sign(this.touch.x) : 0;
    return reverse ? -a : a;
  }
  vertical() {
    let a = 0;
    if (this.isDown('up')) a -= 1;
    if (this.isDown('down')) a += 1;
    return a;
  }
}
function KEYMAP_HAS(act, gp) {
  for (const [idx, a] of Object.entries(GP_MAP)) {
    if (a === act && gp.buttons[idx] && gp.buttons[idx].pressed) return true;
  }
  return false;
}
