// All sound is synthesized with the Web Audio API: no audio files to host.
// Music is scheduled on the audio clock (not setInterval), so it never drifts.

const SCALES = {
  ambient: [196, 220, 246.94, 293.66, 220, 246.94, 196, 174.61],
  asteroid: [146.83, 174.61, 220, 174.61, 146.83, 130.81, 146.83, 174.61],
  alien: [220, 261.63, 329.63, 392, 329.63, 261.63, 220, 196],
  drone: [196, 246.94, 293.66, 392, 293.66, 246.94, 196, 246.94],
  blackhole: [98, 123.47, 146.83, 184.99, 146.83, 123.47, 98, 110],
  boba: [261.63, 329.63, 392, 523.25, 392, 329.63, 293.66, 349.23]
};

export class Audio {
  constructor(settings) {
    this.set = settings; this.ctx = null; this.unlocked = false; this.muted = false;
    this.theme = null; this.intensity = 0; this.playing = false; this.step = 0; this.nextT = 0; this.lastShoot = 0;
  }

  unlock() {
    if (this.unlocked) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC());
    this.master = c.createGain();
    const comp = c.createDynamicsCompressor();
    this.master.connect(comp); comp.connect(c.destination);
    this.sfxBus = c.createGain(); this.musicBus = c.createGain();
    this.sfxBus.connect(this.master); this.musicBus.connect(this.master);
    const len = c.sampleRate, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf; // one shared noise buffer instead of a new one per sound
    this.unlocked = true;
    if (c.state === 'suspended') c.resume();
    this.applyVolume();
    setInterval(() => this.schedule(), 25);
    [220, 277.18, 329.63, 440].forEach((f, i) => this.tone(f, null, 0.2, 'triangle', 0.12, i * 0.12, 0, this.sfxBus));
  }

  applyVolume() {
    if (!this.unlocked) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted || this.paused ? 0 : 0.8, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.set.sfx, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.set.music, t, 0.05);
  }
  setMuted(m) { this.muted = m; this.applyVolume(); }
  setPaused(p) { this.paused = p; this.applyVolume(); }

  tone(freq, end, dur, type, vol, at = 0, pan = 0, bus = this.sfxBus) {
    const c = this.ctx, t = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (end) o.frequency.exponentialRampToValueAtTime(end, t + dur);
    g.gain.setValueAtTime(1e-4, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(1e-4, t + dur);
    o.connect(g); this.out(g, pan, bus); o.start(t); o.stop(t + dur + 0.03);
  }
  burst(dur, f0, f1, vol, type = 'lowpass', pan = 0, at = 0, bus = this.sfxBus) {
    const c = this.ctx, t = c.currentTime + at, n = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
    n.buffer = this.noise; fl.type = type;
    fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    g.gain.setValueAtTime(1e-4, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(1e-4, t + dur);
    n.connect(fl); fl.connect(g); this.out(g, pan, bus); n.start(t, Math.random() * 0.5, dur + 0.05);
  }
  out(node, pan, bus) {
    if (pan && this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = pan; node.connect(p); p.connect(bus); } else node.connect(bus);
  }

  // pan: -1 (left) .. 1 (right)
  sfx(n, pan = 0) {
    if (!this.unlocked) return;
    pan *= 0.6;
    const r = Math.random();
    switch (n) {
      case 'shoot': {
        const now = performance.now(); if (now - this.lastShoot < 70) return; this.lastShoot = now;
        this.tone(1900 + r * 60, 240, 0.13, 'sawtooth', 0.2, 0, pan); this.tone(950, 150, 0.15, 'sine', 0.14, 0.01, pan); this.tone(150, 55, 0.07, 'sine', 0.12, 0, pan); this.burst(0.03, 8000, 3000, 0.05, 'highpass', pan);
        break;
      }
      case 'enemyHit': this.tone(190 + r * 30, 55, 0.22, 'sawtooth', 0.3, 0, pan); this.burst(0.24, 4200, 300, 0.35, 'lowpass', pan); break;
      case 'tink': this.tone(1400, 900, 0.08, 'square', 0.12, 0, pan); break;
      case 'collectible': [660, 880, 1180].forEach((f, i) => this.tone(f, null, 0.1, 'sine', 0.22, i * 0.05, pan)); break;
      case 'damage': this.tone(220 + r * 20, 65, 0.28, 'sawtooth', 0.32, 0, pan); this.burst(0.3, 3000, 200, 0.4, 'lowpass', pan); break;
      case 'wave': [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, null, 0.22, 'triangle', 0.22, i * 0.07)); break;
      case 'easterEgg': [440, 554.37, 659.25, 880].forEach((f, i) => this.tone(f, null, 0.28, 'sine', 0.22, i * 0.09)); break;
      case 'powerup': this.tone(700, 1400, 0.22, 'sine', 0.26, 0, pan); this.burst(0.08, 5000, 3000, 0.05, 'highpass', pan); break;
      case 'dash': this.burst(0.18, 1200, 6000, 0.22, 'bandpass', pan); this.tone(300, 900, 0.12, 'sine', 0.1, 0, pan); break;
      case 'graze': this.tone(1800 + r * 400, 2600, 0.05, 'sine', 0.07, 0, pan); break;
      case 'bomb': this.tone(120, 30, 0.9, 'sine', 0.5); this.burst(0.9, 6000, 80, 0.5); this.tone(60, 40, 0.6, 'triangle', 0.4, 0.05); break;
      case 'elite': this.tone(110, 220, 0.3, 'sawtooth', 0.18, 0, pan); this.tone(165, 330, 0.3, 'square', 0.08, 0.06, pan); break;
      case 'evolve': [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, null, 0.3, 'triangle', 0.2, i * 0.08)); break;
      case 'achievement': [659.25, 880, 1318.5].forEach((f, i) => this.tone(f, null, 0.25, 'sine', 0.18, i * 0.1)); break;
      case 'count': this.tone(440, null, 0.12, 'square', 0.1); break;
      case 'go': this.tone(880, null, 0.3, 'square', 0.12); break;
    }
  }

  // ---- music: a small step sequencer with layers that come in as intensity rises ----
  music(on, theme = null) { this.playing = on; this.theme = theme; if (on && this.unlocked) this.nextT = Math.max(this.nextT, this.ctx.currentTime + 0.05); }
  setIntensity(i) { this.intensity = i; } // 0 calm .. 3 frantic

  schedule() {
    if (!this.unlocked || !this.playing || this.paused) return;
    const c = this.ctx, boss = !!this.theme, stepDur = boss ? 0.13 : 0.21;
    if (this.nextT < c.currentTime - 0.3) this.nextT = c.currentTime + 0.05;
    while (this.nextT < c.currentTime + 0.12) {
      const at = this.nextT - c.currentTime, s = this.step++, notes = SCALES[this.theme] || SCALES.ambient, f = notes[(s >> 1) % notes.length], b = this.musicBus, hi = this.intensity;
      if (s % 2 === 0) this.tone(f, null, stepDur * 1.8, boss ? 'sawtooth' : 'triangle', boss ? 0.09 : 0.07, at, 0, b);
      if (s % 4 === 0) this.tone(f / 2, null, stepDur * 3, 'sine', 0.09, at, 0, b); // bass
      if (hi >= 1 && s % 2 === 1) this.tone(f * 2, null, stepDur * 0.8, 'square', 0.022, at, s % 4 === 1 ? -0.5 : 0.5, b); // arp
      if (hi >= 2 || boss) this.burst(0.03, 9000, 7000, s % 4 === 2 ? 0.07 : 0.03, 'highpass', 0, at, b); // hats
      if ((hi >= 3 || boss) && s % 8 === 0) { this.tone(110, 40, 0.16, 'sine', 0.3, at, 0, b); } // kick
      this.nextT += stepDur;
    }
  }
}
