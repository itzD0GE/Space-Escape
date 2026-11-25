// Keyboard, mouse, touch and gamepad, reduced to the one input the sim understands:
// flags + a movement vector quantized to -127..127 (so replays are exact).
import { F } from './sim.js';
import { TUNE } from './data.js';

const MOVE = { KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };

export class Input {
  constructor(arena, settings, hooks) {
    this.arena = arena; this.set = settings; this.hooks = hooks; // hooks: pause(), mute(), any()
    this.keys = {}; this.mode = 'keys'; this.target = { x: 0, y: 0 }; this.fire = false; this.touchFire = false;
    this.dashQ = false; this.bombQ = false; this.padPause = false; this.touchPt = null; this.anchor = null;
    this.isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    this.sim = null; this.scale = 1; this.locked = false; this.releasing = false;

    // Pointer lock keeps the mouse inside the game. Esc (a browser rule) always releases it.
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === arena;
      if (this.locked && this.sim) { this.target.x = this.sim.p.x; this.target.y = this.sim.p.y; this.mode = 'mouse'; }
      if (was && !this.locked && !this.releasing) hooks.lockLost();
      this.releasing = false;
    });

    document.addEventListener('keydown', (e) => {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (this.capture) { e.preventDefault(); this.capture(e.code); this.capture = null; return; }
      const k = this.set.keys;
      if (MOVE[e.code] || e.code === k.fire || e.code === 'Space') e.preventDefault();
      if (!e.repeat) {
        if (e.code === k.pause || e.code === 'Escape') hooks.pause();
        if (e.code === 'KeyM') hooks.mute();
        hooks.any(e);
      }
      this.keys[e.code] = true;
      if (MOVE[e.code]) this.mode = 'keys';
    });
    document.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = {}; this.fire = false; });

    document.addEventListener('pointermove', (e) => this.point(e));
    arena.addEventListener('pointerdown', (e) => {
      hooks.any(e);
      if (e.pointerType === 'touch') { this.touchPt = e.pointerId; this.touchFire = true; this.anchor = null; this.point(e, true); return; }
      if (!this.locked) { this.point(e, true); hooks.arenaClick(); }
      if (e.button === 0) this.fire = true; else if (e.button === 2) this.dashQ = true; else if (e.button === 1) { e.preventDefault(); this.bombQ = true; }
    });
    document.addEventListener('pointerup', (e) => { if (e.pointerType === 'touch') { if (e.pointerId === this.touchPt) { this.touchPt = null; this.anchor = null; } } else if (e.button === 0) this.fire = false; });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    // keep the page from scrolling or zooming while a finger is flying the ship
    for (const t of ['touchstart', 'touchmove']) arena.addEventListener(t, (e) => e.preventDefault(), { passive: false });
  }

  // Convert a pointer position to arena coordinates.
  point(e, start = false) {
    if (e.pointerType === 'touch' && e.pointerId !== this.touchPt) return;
    const r = this.arena.getBoundingClientRect(), x = (e.clientX - r.left) / this.scale, y = (e.clientY - r.top) / this.scale;
    if (e.pointerType === 'touch') {
      this.mode = 'touch';
      if (this.set.touchScheme === 'relative' && this.sim) {
        // relative drag: the ship moves as the finger moves, wherever the finger is
        if (start || !this.anchor) this.anchor = { fx: x, fy: y, sx: this.sim.p.x, sy: this.sim.p.y };
        this.target.x = this.anchor.sx + (x - this.anchor.fx) * 1.25; this.target.y = this.anchor.sy + (y - this.anchor.fy) * 1.25;
      } else { this.target.x = x; this.target.y = y - 40 / this.scale; } // direct: ship sits just above the finger
      this.touchAt = { x, y };
    } else if (this.locked) {
      // locked: the real cursor is frozen, so steer a virtual one that cannot leave the arena
      const W = this.sim ? this.sim.W : 800, H = this.sim ? this.sim.H : 600;
      this.mode = 'mouse';
      this.target.x = Math.max(0, Math.min(W, this.target.x + e.movementX / this.scale));
      this.target.y = Math.max(0, Math.min(H, this.target.y + e.movementY / this.scale));
    } else if (e.movementX || e.movementY || start) { this.mode = 'mouse'; this.target.x = x; this.target.y = y; }
  }

  pad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const g of pads) if (g && g.connected) return g;
    return null;
  }

  // One input for one sim tick.
  poll(sim) {
    this.sim = sim;
    const k = this.set.keys, p = sim.p;
    let f = 0, dx = 0, dy = 0;
    for (const code in MOVE) if (this.keys[code]) { dx += MOVE[code][0]; dy += MOVE[code][1]; }
    let fire = this.fire || this.keys[k.fire] || this.touchFire, dash = this.dashQ || this.keys[k.dash], bomb = this.bombQ || this.keys[k.bomb];
    this.dashQ = this.bombQ = false;

    const g = this.pad();
    if (g) {
      const ax = g.axes[0] || 0, ay = g.axes[1] || 0, b = (i) => g.buttons[i] && g.buttons[i].pressed;
      if (Math.hypot(ax, ay) > 0.18 || b(12) || b(13) || b(14) || b(15)) this.mode = 'pad';
      if (this.mode === 'pad') { dx = Math.abs(ax) > 0.18 ? ax : b(14) ? -1 : b(15) ? 1 : 0; dy = Math.abs(ay) > 0.18 ? ay : b(12) ? -1 : b(13) ? 1 : 0; }
      fire = fire || b(0) || b(7); dash = dash || b(1) || b(4) || b(5); bomb = bomb || b(2) || b(3);
      const pause = b(9); if (pause && !this.padPause) this.hooks.pause(); this.padPause = pause;
    }

    if (this.mode === 'mouse' || this.mode === 'touch') {
      if (this.mode === 'mouse' || this.touchPt !== null) {
        const cap = p.speed * TUNE.ptrSpeedMul;
        dx = (this.target.x - p.x) / cap; dy = (this.target.y - p.y) / cap;
        const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
        if (m < 0.04) dx = dy = 0;
      } else dx = dy = 0;
      f |= F.PTR;
    } else { const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; } }

    if (fire) f |= F.FIRE; if (dash) f |= F.DASH; if (bomb) f |= F.BOMB;
    return { f, dx: Math.round(dx * 127), dy: Math.round(dy * 127) };
  }

  lock() {
    if (!this.set.lockMouse || this.locked || this.mode === 'touch' || !this.arena.requestPointerLock) return;
    try { const p = this.arena.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* refused without a click: the next click in the arena retries */ }
  }
  unlock() { if (this.locked) { this.releasing = true; document.exitPointerLock(); } }

  reset() { this.touchFire = false; this.fire = false; this.dashQ = this.bombQ = false; }
}
