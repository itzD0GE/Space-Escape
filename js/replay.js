// Input log for a run: run-length encoded [count, flags, dx, dy] bytes, base64 for transport.
// Feeding the log back into a fresh Sim with the same seed reproduces the run exactly.
import { Sim, SIM_VERSION } from './sim.js';

export class Recorder {
  constructor() { this.b = []; this.n = 0; }
  push(f, dx, dy) {
    const b = this.b, i = b.length - 4;
    this.n++;
    if (i >= 0 && b[i] < 255 && b[i + 1] === f && b[i + 2] === (dx & 255) && b[i + 3] === (dy & 255)) b[i]++;
    else b.push(1, f, dx & 255, dy & 255);
  }
  encode() {
    let s = '';
    for (let i = 0; i < this.b.length; i += 8192) s += String.fromCharCode.apply(null, this.b.slice(i, i + 8192));
    return btoa(s);
  }
}

export function decode(b64) {
  const s = atob(b64), out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// Steps a sim from a decoded log, one input per call. Returns false when the log is exhausted.
export class Player {
  constructor(bytes) { this.b = bytes; this.i = 0; this.left = bytes.length ? bytes[0] : 0; }
  next(sim) {
    if (this.i >= this.b.length) return false;
    const b = this.b, i = this.i;
    sim.step(b[i + 1], (b[i + 2] << 24) >> 24, (b[i + 3] << 24) >> 24);
    if (--this.left <= 0) { this.i += 4; this.left = this.b[this.i] || 0; }
    return true;
  }
}

export function packRun(sim, rec) {
  return { v: SIM_VERSION, seed: sim.seed, W: sim.W, H: sim.H, mode: sim.mode, ship: sim.shipId, targetWave: sim.targetWave, score: sim.score, wave: sim.wave, ticks: sim.tick, log: rec.encode() };
}

// Re-simulate a packed run. Used for ghosts and for offline score verification.
export function simFromRun(run, quiet = true) {
  if (!run || run.v !== SIM_VERSION) return null;
  const sim = new Sim({ seed: run.seed, W: run.W, H: run.H, mode: run.mode, ship: run.ship, targetWave: run.targetWave, quiet });
  return { sim, player: new Player(decode(run.log)) };
}

export function verifyRun(run) {
  const r = simFromRun(run);
  if (!r) return { ok: false, why: 'version mismatch' };
  while (r.player.next(r.sim));
  return { ok: r.sim.score === run.score && r.sim.wave === run.wave, score: r.sim.score, wave: r.sim.wave };
}
