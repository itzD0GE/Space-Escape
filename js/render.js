// Canvas renderer. Reads sim state, never changes it. All randomness here is cosmetic.
import { BOSSES, SVG } from './bosses.js';
import { AFFIX_COLOR } from './data.js';

const TAU = Math.PI * 2;
const img = (src) => { const i = new Image(); i.src = src; return i; };
const rnd = (a, b) => a + Math.random() * (b - a);
const DONUT = { donut: 'matcha', shoot: 'cinnamon', shield: 'vanilla', '1up': 'strawberry', multishot: 'blueberry' };
const ITEM_GLOW = { donut: '#39ff14', shoot: '#ff6600', shield: '#ffd700', '1up': '#ff0080', multishot: '#b06bff', mochi: '#ffb3c6', dango: '#ff9fc0', sushi: '#ff8a7a', taiyaki: '#e0a84e' };
const DVD_COLORS = ['#ff0080', '#00f5ff', '#39ff14', '#ff6600', '#ffd700', '#b06bff'];
const CONFETTI = ['#ff0080', '#00f5ff', '#39ff14', '#ff6600', '#ffd700'];
// [star colour, nebula A, nebula B] for each three-wave stretch
const BIOMES = [['#ffffff', '#1b3b8f', '#5a1b8f'], ['#bff7ff', '#0b6b7a', '#1b8f5a'], ['#ffe9c2', '#8f3b1b', '#8f1b4a'], ['#e3c9ff', '#4a1b8f', '#8f1b7d'], ['#c9ffd9', '#1b8f3b', '#6b7a0b']];

export class Renderer {
  constructor(canvas, settings) {
    this.cv = canvas; this.ctx = canvas.getContext('2d'); this.set = settings;
    this.W = 800; this.H = 600; this.scale = 1;
    this.parts = []; this.shake = 0; this.flash = 0; this.banner = null; this.junk = []; this.trail = [];
    this.glows = new Map();
    this.sp = {
      ships: [1, 2, 3, 4, 5, 6].map((t) => img(`assets/player-ship-tier-${t}.png`)),
      boba: img('assets/boba-tea-boss.svg'), lilo: img('assets/boss-lilo.webp'), rock: img(SVG.rock), fast: img(SVG.rockFast), drone: img(SVG.drone),
      bosses: BOSSES.map((b) => img(b.art)), items: {}
    };
    for (const [k, v] of Object.entries(DONUT)) this.sp.items[k] = img(`assets/donut-${v}.png`);
    for (const k of ['mochi', 'dango', 'sushi', 'taiyaki']) this.sp.items[k] = img(SVG[k]);
    this.stars = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), z: Math.random() }));
  }

  resize(W, H) {
    this.W = W; this.H = H;
    const cw = this.cv.clientWidth || W, dpr = Math.min(2, window.devicePixelRatio || 1);
    this.scale = cw / W;
    this.cv.width = Math.round(cw * dpr); this.cv.height = Math.round(((cw * H) / W) * dpr);
    this.k = (cw * dpr) / W;
  }

  glow(c, r) { // cached soft radial sprite; much cheaper than shadowBlur
    const key = c + r;
    let g = this.glows.get(key);
    if (!g) {
      g = document.createElement('canvas'); g.width = g.height = r * 2;
      const x = g.getContext('2d'), grad = x.createRadialGradient(r, r, 0, r, r, r);
      grad.addColorStop(0, c); grad.addColorStop(0.35, c + '88'); grad.addColorStop(1, c + '00');
      x.fillStyle = grad; x.fillRect(0, 0, r * 2, r * 2);
      this.glows.set(key, g);
    }
    return g;
  }

  add(p) { if (this.parts.length < (this.set.reducedMotion ? 160 : 700)) this.parts.push(p); }
  burst(x, y, n, c, sp = 3, life = 30, size = 3) {
    if (this.set.reducedMotion) n = Math.ceil(n / 3);
    for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = rnd(0.3, 1) * sp; this.add({ t: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, size: rnd(0.6, 1.4) * size, c }); }
  }
  ring(x, y, r, c, life = 24, w = 3) { this.add({ t: 'ring', x, y, r, life, max: life, c, w }); }
  text(x, y, s, c, big = false) { this.add({ t: 'text', x, y, vy: -0.7, life: 70, max: 70, s, c, big }); }

  // Turn a simulation event into visuals.
  fx(e) {
    const rm = this.set.reducedMotion;
    switch (e.k) {
      case 'text': this.text(e.x, e.y, e.s, e.c); break;
      case 'boom': {
        const n = Math.min(26, 6 + e.size / 3);
        for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = rnd(0.8, 3.2); this.add({ t: 'rock', x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 55, max: 55, size: rnd(3, 7), c: ['#8a7460', '#5c4a3a', '#3d3226', '#b3987f'][i % 4], rot: Math.random() * TAU, vr: rnd(-0.2, 0.2) }); }
        this.burst(e.x, e.y, e.boss ? 60 : 10, e.c, e.boss ? 6 : 3.5, e.boss ? 50 : 26);
        this.ring(e.x, e.y, e.boss ? 160 : e.size * 1.4, e.c, e.boss ? 40 : 18);
        if (e.boss) this.ring(e.x, e.y, 260, '#ffffff', 55, 2);
        break;
      }
      case 'hit': this.burst(e.x, e.y, 4, '#a3f7ff', 2.4, 14, 2); break;
      case 'graze': this.burst(e.x, e.y, 5, '#ffffff', 2, 16, 2); if (Math.random() < 0.35) this.text(e.x, e.y, `GRAZE +${e.pts}`, '#00f5ff'); break;
      case 'pick': this.burst(e.x, e.y, 12, e.c, 2.6, 24); this.ring(e.x, e.y, 26, e.c, 16); break;
      case 'ring': this.ring(e.x, e.y, e.r, e.c); break;
      case 'dash': this.ring(e.x, e.y, 30, '#00f5ff', 14); break;
      case 'bomb': this.ring(e.x, e.y, 520, '#ffffff', 40, 6); this.ring(e.x, e.y, 380, '#00f5ff', 34, 4); this.burst(e.x, e.y, 80, '#a3f7ff', 9, 50); break;
      case 'bolt': this.add({ t: 'bolt', x: e.x1, y: e.y1, x2: e.x2, y2: e.y2, life: 12, max: 12 }); break;
      case 'shake': if (!rm && this.set.shake) this.shake = Math.max(this.shake, e.a); break;
      case 'flash': if (!rm) this.flash = 0.35; break;
      case 'banner': this.banner = { s: e.s, sub: e.sub || '', t: 0, max: e.small ? 80 : e.boba ? 270 : 150, c: e.boba ? '#ffe2a7' : e.boss ? '#ff2d95' : e.small ? '#ff2d95' : '#39ff14', small: e.small || e.boba }; break;
      case 'evo': this.banner = { s: `EVOLUTION: ${e.name.toUpperCase()}`, sub: e.desc, t: 0, max: 170, c: '#ffd166', small: true }; break;
      case 'egg': this.banner = { s: 'CORNER HIT! DVD LOGO RELEASED', sub: 'Catch it before it escapes for a jackpot', t: 0, max: 230, c: '#ffd700', small: true }; this.confetti(); break;
      case 'confetti': this.confetti(); break;
      case 'bossdead': this.text(e.x, e.y - 40, `${e.label.toUpperCase()} DESTROYED`, '#ffd166', true); break;
      case 'inter': this.junk = rm ? [] : Array.from({ length: 7 }, () => ({ x: rnd(0.1, 0.9) * this.W, y: rnd(0.1, 0.8) * this.H, vx: rnd(0.1, 0.4), vy: rnd(0.2, 0.6), rot: Math.random() * TAU, vr: rnd(-0.02, 0.02), kind: Math.floor(Math.random() * 4), size: rnd(18, 34), life: 300 })); break;
    }
  }

  confetti() {
    for (let i = 0; i < (this.set.reducedMotion ? 12 : 60); i++) this.add({ t: 'conf', x: Math.random() * this.W, y: rnd(-80, -5), vx: rnd(-0.5, 0.5), vy: rnd(1.5, 4), life: 220, max: 220, size: rnd(5, 9), c: CONFETTI[i % 5], rot: Math.random() * TAU, vr: rnd(-0.2, 0.2) });
  }

  sprite(im, x, y, size, rot = 0, alpha = 1) {
    if (!im.complete || !im.naturalWidth) return;
    const c = this.ctx;
    c.save(); c.translate(x, y); if (rot) c.rotate(rot); c.globalAlpha *= alpha;
    c.drawImage(im, -size / 2, -size / 2, size, size); c.restore();
  }
  lit(c, x, y, r) { const g = this.glow(c, 32); this.ctx.drawImage(g, x - r, y - r, r * 2, r * 2); }

  // alpha: how far we are between the previous and the current sim tick (0..1)
  draw(sim, alpha, ghost, time) {
    const c = this.ctx, W = this.W, H = this.H, rm = this.set.reducedMotion;
    const L = (o, k, pk) => o[pk] + (o[k] - o[pk]) * alpha;
    c.setTransform(this.k, 0, 0, this.k, 0, 0);
    c.clearRect(0, 0, W, H);
    if (this.shake > 0.3) { c.translate(rnd(-1, 1) * this.shake, rnd(-1, 1) * this.shake); this.shake *= 0.88; } else this.shake = 0;
    const p = sim.p, px = L(p, 'x', 'px'), py = L(p, 'y', 'py');

    // starfield
    const warp = (rm ? 0.4 : 1) * (1 + sim.wave * 0.06) * (p.dash > 0 ? 3 : 1);
    const biome = BIOMES[Math.floor((sim.wave - 1) / 3) % BIOMES.length];
    if (!rm) { // two slow drifting nebula clouds in the biome's colours
      c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.16;
      this.lit(biome[1], W * (0.3 + 0.1 * Math.sin(time / 9000)), H * 0.35, Math.max(W, H) * 0.45);
      this.lit(biome[2], W * (0.72 + 0.08 * Math.cos(time / 11000)), H * 0.7, Math.max(W, H) * 0.4);
      c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    }
    c.fillStyle = biome[0];
    for (const s of this.stars) {
      s.y += (0.0006 + s.z * 0.0035) * warp; if (s.y > 1) { s.y = 0; s.x = Math.random(); }
      const size = 0.8 + s.z * 1.8; c.globalAlpha = 0.15 + s.z * 0.45;
      c.fillRect(s.x * W, s.y * H, size, size * (1 + s.z * 4 * warp));
    }
    c.globalAlpha = 1;

    for (const j of this.junk) { j.x += j.vx; j.y += j.vy; j.rot += j.vr; j.life--; this.drawJunk(j); }
    this.junk = this.junk.filter((j) => j.life > 0);

    for (const q of sim.pearls) {
      c.globalAlpha = Math.min(1, q.life / 50);
      if (sim.pearlKind === 'bone') {
        c.save(); c.translate(q.x, q.y); c.rotate(q.x * 0.05); c.fillStyle = '#fff8e7'; c.strokeStyle = '#c9b68f'; c.lineWidth = 1;
        c.beginPath(); c.rect(-6, -2, 12, 4); for (const d of [-1, 1]) for (const k of [-1, 1]) { c.moveTo(d * 7 + 3, k * 2.5); c.arc(d * 7, k * 2.5, 3, 0, TAU); } c.fill(); c.stroke(); c.restore();
        continue;
      }
      c.fillStyle = q.pearl ? '#51274c' : '#d8895b'; c.strokeStyle = q.pearl ? '#e5a4c9' : '#ffe0a1';
      c.beginPath(); c.arc(q.x, q.y, q.pearl ? 6 : 9, 0, TAU); c.fill(); c.stroke();
    }
    c.globalAlpha = 1;

    c.globalCompositeOperation = 'lighter';
    for (const it of sim.items) this.lit(ITEM_GLOW[it.type], it.x, it.y, 22);
    c.globalCompositeOperation = 'source-over';
    for (const it of sim.items) {
      const blink = it.life < 90 && Math.floor(it.life / 6) % 2 ? 0.35 : 1;
      this.sprite(this.sp.items[it.type], it.x, it.y, (it.type === '1up' ? 26 : 22) * (1 + 0.12 * Math.sin(time / 300 + it.x)), 0, blink);
    }

    // enemies
    for (const e of sim.enemies) {
      const x = L(e, 'x', 'px'), y = L(e, 'y', 'py');
      if (e.boss || e.affix) { c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.55; this.lit(e.boss ? (e.elite ? '#ffd166' : '#ff2d95') : AFFIX_COLOR[e.affix], x, y, e.size * (e.boss ? 1.25 + 0.1 * Math.sin(time / 220) : 1.1)); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; }
      const im = e.boss ? (e.art === 'boba' ? this.sp.boba : e.art === 'lilo' ? this.sp.lilo : this.sp.bosses[e.art] || this.sp.rock) : e.kind === 'fast' ? this.sp.fast : e.kind === 'drone' ? this.sp.drone : this.sp.rock;
      const spin = e.art === 'lilo' ? Math.sin(time / 300) * 0.06 : e.boss && e.theme !== 'asteroid' ? Math.sin(time / 700) * 0.12 : (time / (e.kind === 'fast' ? 500 : 1000) + e.id) * (e.id % 2 ? 1 : -1);
      if (e.flash > (e.boss ? 3 : 0)) { c.save(); c.filter = e.boss ? 'brightness(1.5)' : 'brightness(2.2)'; if (!this.shape(e, x, y, time)) this.sprite(im, x, y, e.size * (e.art === 'lilo' ? 1.35 : 1.15), spin); c.restore(); } else if (!this.shape(e, x, y, time)) this.sprite(im, x, y, e.size * (e.art === 'lilo' ? 1.35 : 1.15), spin);
      if (e.guard > 0) { c.strokeStyle = '#ffd700'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, e.size * 0.75, 0, TAU); c.stroke(); }
      if (e.tele > 0) { // telegraph: the volley is coming down this line
        c.strokeStyle = `rgba(255,255,255,${0.25 + 0.5 * (1 - e.tele / 36)})`; c.lineWidth = 2; c.setLineDash([8, 8]);
        c.beginPath(); c.moveTo(x, y); c.lineTo(px, py); c.stroke(); c.setLineDash([]);
        this.ringStroke(x, y, e.size * (0.7 + e.tele / 36), '#ffffff', 0.6);
      }
    }

    // enemy bullets
    const cb = this.set.colorblind;
    c.globalCompositeOperation = 'lighter';
    for (const b of sim.bullets) this.lit(cb ? '#ffffff' : b.c, L(b, 'x', 'px'), L(b, 'y', 'py'), b.r * 3.2);
    c.globalCompositeOperation = 'source-over';
    for (const b of sim.bullets) {
      const x = L(b, 'x', 'px'), y = L(b, 'y', 'py');
      c.fillStyle = cb ? '#000000' : '#ffffff'; c.beginPath(); c.arc(x, y, b.r * 0.6, 0, TAU); c.fill();
      if (cb) { c.strokeStyle = '#ffffff'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, b.r, 0, TAU); c.stroke(); }
    }

    // player shots
    c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
    for (const s of sim.shots) {
      const x = L(s, 'x', 'px'), y = L(s, 'y', 'py');
      c.strokeStyle = '#00c8ff'; c.lineWidth = 5; c.globalAlpha = 0.45; c.beginPath(); c.moveTo(x - s.vx * 2.2, y - s.vy * 2.2); c.lineTo(x, y); c.stroke();
      c.strokeStyle = '#ffffff'; c.lineWidth = 2; c.globalAlpha = 1; c.beginPath(); c.moveTo(x - s.vx * 1.4, y - s.vy * 1.4); c.lineTo(x, y); c.stroke();
    }
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;

    if (ghost && ghost.sim.phase !== 'over') {
      const g = ghost.sim.p, gx = (L(g, 'x', 'px') / ghost.sim.W) * W, gy = (L(g, 'y', 'py') / ghost.sim.H) * H;
      c.globalAlpha = 0.38; c.globalCompositeOperation = 'lighter'; this.lit('#ff2d95', gx, gy, 26); c.globalCompositeOperation = 'source-over';
      this.sprite(this.sp.ships[Math.min(6, ghost.sim.wave) - 1], gx, gy, 30);
      c.globalAlpha = 0.7; c.fillStyle = '#ff2d95'; c.font = '700 9px Orbitron, monospace'; c.textAlign = 'center'; c.fillText(ghost.label, gx, gy - 20); c.globalAlpha = 1;
    }

    if (sim.phase !== 'over') this.drawPlayer(sim, px, py, time);

    if (sim.dvd && !sim.dvd.wait) {
      const d = sim.dvd, col = DVD_COLORS[d.hue % 6];
      c.globalCompositeOperation = 'lighter'; this.lit(col, d.x + 29, d.y + 17, 50); c.globalCompositeOperation = 'source-over';
      c.fillStyle = col; c.globalAlpha = d.life < 120 && Math.floor(d.life / 8) % 2 ? 0.4 : 0.9; c.beginPath(); c.roundRect(d.x, d.y, 58, 35, 5); c.fill();
      c.globalAlpha = 1; c.fillStyle = '#ffffff'; c.font = '900 13px Orbitron, monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('DVD', d.x + 29, d.y + 18); c.textBaseline = 'alphabetic';
    }

    if (this.cursor) { // where the locked mouse is pointing; the ship flies toward it
      const q = this.cursor; c.strokeStyle = 'rgba(0,245,255,0.75)'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(q.x, q.y, 6, 0, TAU); c.moveTo(q.x - 10, q.y); c.lineTo(q.x - 3, q.y); c.moveTo(q.x + 3, q.y); c.lineTo(q.x + 10, q.y); c.moveTo(q.x, q.y - 10); c.lineTo(q.x, q.y - 3); c.moveTo(q.x, q.y + 3); c.lineTo(q.x, q.y + 10); c.stroke();
    }

    this.drawParts();

    const boss = sim.enemies.find((e) => e.boss);
    if (boss) { // health bar rides under the boss so it never collides with the HUD
      const bw = Math.max(70, boss.size * 1.5), bx = Math.max(4, Math.min(W - bw - 4, L(boss, 'x', 'px') - bw / 2)), by = Math.max(8, Math.min(H - 12, L(boss, 'y', 'py') + boss.size * 0.8));
      c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(bx - 1, by - 1, bw + 2, 7);
      c.fillStyle = boss.enraged ? '#ff2d95' : '#ffd166'; c.fillRect(bx, by, bw * Math.max(0, boss.hp / boss.maxHp), 5);
    }

    if (this.banner) {
      const b = this.banner, t = b.t++ / b.max;
      if (t >= 1) this.banner = null; else {
        const fade = t < 0.1 ? t / 0.1 : t > 0.7 ? (1 - t) / 0.3 : 1, grow = 1 + Math.max(0, t - 0.7) * 2;
        const size = (b.small ? 0.036 : 0.075) * Math.min(W, 700) * grow;
        c.globalAlpha = fade; c.textAlign = 'center'; c.fillStyle = b.c; c.shadowColor = b.c; c.shadowBlur = 24;
        c.font = `900 ${size}px Orbitron, monospace`; c.fillText(b.s, W / 2, H * (b.small ? 0.3 : 0.48));
        if (b.sub) { c.fillStyle = '#ffd166'; c.shadowColor = '#ffd166'; c.font = `700 ${Math.max(11, size * 0.36)}px Orbitron, monospace`; c.fillText(b.sub.toUpperCase(), W / 2, H * (b.small ? 0.3 : 0.48) + size * 0.75); }
        c.shadowBlur = 0; c.globalAlpha = 1;
      }
    }
    if (this.flash > 0.01) { c.fillStyle = `rgba(255,255,255,${this.flash})`; c.fillRect(-20, -20, W + 40, H + 40); this.flash *= 0.8; }
  }

  ringStroke(x, y, r, col, a) { const c = this.ctx; c.globalAlpha = a; c.strokeStyle = col; c.lineWidth = 2; c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke(); c.globalAlpha = 1; }

  drawPlayer(sim, x, y, time) {
    const c = this.ctx, p = sim.p, tier = Math.min(6, sim.wave), size = (25 + (tier - 1) * 2) * 1.25, glow = sim.ship.glow;
    if (p.dash > 0 || this.trail.length) {
      if (p.dash > 0) this.trail.push({ x, y, a: 0.5 });
      for (const t of this.trail) { this.sprite(this.sp.ships[tier - 1], t.x, t.y, size, 0, t.a); t.a -= 0.05; }
      this.trail = this.trail.filter((t) => t.a > 0);
    }
    if (p.moving && Math.random() < 0.6) this.add({ t: 'spark', x: x + rnd(-3, 3), y: y + size * 0.42, vx: rnd(-0.3, 0.3), vy: rnd(1, 2.4), life: 18, max: 18, size: 2.2, c: glow });
    const hot = p.heat > 5, phase = sim.tick < sim.buffs.taiyaki;
    c.globalCompositeOperation = 'lighter';
    this.lit(hot ? '#ff6600' : phase ? '#e0a84e' : glow, x, y, size * (0.9 + 0.08 * Math.sin(time / 120)));
    this.lit(glow, x, y + size * 0.5, 8 + 3 * Math.sin(time / 45)); // engine flame
    c.globalCompositeOperation = 'source-over';
    const blink = p.inv > 0 && p.dash <= 0 && Math.floor(sim.tick / 4) % 2 ? 0.35 : 1;
    this.sprite(this.sp.ships[tier - 1], x, y, size, (p.x - p.px) * 0.035, blink);
    if (p.shield > 0) {
      c.strokeStyle = '#ffd700'; c.lineWidth = 2; c.globalAlpha = 0.35 + 0.2 * p.shield;
      c.beginPath(); c.arc(x, y, size * 0.85 + 2 * Math.sin(time / 160), 0, TAU); c.stroke(); c.globalAlpha = 1;
    }
    if (sim.bomb >= 100) this.ringStroke(x, y, size * 1.1 + 3 * Math.sin(time / 90), '#ffffff', 0.5);
    // dash cooldown pip
    if (p.dashCd > 0) { c.strokeStyle = '#00f5ff'; c.lineWidth = 2; c.globalAlpha = 0.6; c.beginPath(); c.arc(x, y, size * 0.7, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - p.dashCd / sim.dashCdMax)); c.stroke(); c.globalAlpha = 1; }
  }

  // Enemies and bosses that are drawn by hand instead of from an image. Returns true if it drew.
  shape(e, x, y, time) {
    const c = this.ctx, s = e.size / 2;
    if (e.art === 'cow') { this.cow(e, x, y, time); return true; }
    if (e.kind === 'dart' || e.kind === 'flanker') {
      const a = Math.atan2(e.y - e.py, e.x - e.px), col = e.kind === 'dart' ? '#ff5fd2' : '#39ff14';
      c.save(); c.translate(x, y); c.rotate(a); c.fillStyle = col; c.strokeStyle = '#ffffff'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(s * 1.2, 0); c.lineTo(-s, -s * 0.8); c.lineTo(-s * 0.4, 0); c.lineTo(-s, s * 0.8); c.closePath(); c.fill(); c.stroke(); c.restore();
      return true;
    }
    if (e.kind === 'sniper') {
      c.save(); c.translate(x, y); c.rotate(time / 900);
      c.fillStyle = '#3a0d14'; c.strokeStyle = '#ff4d4d'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(0, -s * 1.2); c.lineTo(s * 1.2, 0); c.lineTo(0, s * 1.2); c.lineTo(-s * 1.2, 0); c.closePath(); c.fill(); c.stroke(); c.restore();
      c.fillStyle = e.tele > 0 ? '#ffffff' : '#ff4d4d'; c.beginPath(); c.arc(x, y, s * 0.35, 0, TAU); c.fill();
      return true;
    }
    if (e.kind === 'mine') {
      const pulse = 1 + 0.15 * Math.sin(time / 110);
      c.save(); c.translate(x, y); c.rotate(time / 1400); c.strokeStyle = '#ff6600'; c.lineWidth = 2; c.fillStyle = '#2a1404';
      c.beginPath(); for (let i = 0; i < 16; i++) { const r = (i % 2 ? s * 0.75 : s * 1.25) * pulse, a = (i / 16) * TAU; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); c.fill(); c.stroke(); c.restore();
      c.fillStyle = Math.floor(time / 200) % 2 ? '#ff6600' : '#ffffff'; c.beginPath(); c.arc(x, y, 3, 0, TAU); c.fill();
      return true;
    }
    if (e.kind === 'carrier') {
      c.save(); c.translate(x, y); c.rotate(time / 2000); c.fillStyle = '#2b2408'; c.strokeStyle = '#ffd700'; c.lineWidth = 2.5;
      c.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; c.lineTo(Math.cos(a) * s * 1.15, Math.sin(a) * s * 1.15); } c.closePath(); c.fill(); c.stroke(); c.restore();
      c.strokeStyle = 'rgba(255,215,0,0.6)'; c.lineWidth = 1.5; c.beginPath(); c.arc(x, y, s * 0.55 + 2 * Math.sin(time / 200), 0, TAU); c.stroke();
      return true;
    }
    return false;
  }

  // Moolissa the Mad Cow: drawn live so her eyes can spin.
  cow(e, x, y, time) {
    const c = this.ctx, s = e.size / 2, fast = e.enraged ? 2.4 : 1, wob = Math.sin(time / 140) * 0.08;
    c.save(); c.translate(x, y); c.rotate(wob);
    c.lineWidth = 2; c.strokeStyle = '#2a2119';
    // horns and ears
    c.fillStyle = '#f2e6c8';
    for (const d of [-1, 1]) { c.beginPath(); c.moveTo(d * s * 0.55, -s * 0.75); c.quadraticCurveTo(d * s * 1.1, -s * 1.5, d * s * 0.78, -s * 0.55); c.closePath(); c.fill(); c.stroke(); }
    c.fillStyle = '#ffffff';
    for (const d of [-1, 1]) { c.beginPath(); c.ellipse(d * s * 1.02, -s * 0.35, s * 0.34, s * 0.2, d * 0.5, 0, TAU); c.fill(); c.stroke(); }
    // head with patches
    c.beginPath(); c.ellipse(0, 0, s * 0.92, s * 1.02, 0, 0, TAU); c.fillStyle = '#ffffff'; c.fill(); c.stroke();
    c.save(); c.clip(); c.fillStyle = '#1c1c1c';
    c.beginPath(); c.ellipse(-s * 0.6, -s * 0.55, s * 0.5, s * 0.42, 0.4, 0, TAU); c.fill();
    c.beginPath(); c.ellipse(s * 0.7, s * 0.1, s * 0.34, s * 0.5, -0.3, 0, TAU); c.fill(); c.restore();
    // snout
    c.fillStyle = '#ffb3c6'; c.beginPath(); c.ellipse(0, s * 0.52, s * 0.62, s * 0.4, 0, 0, TAU); c.fill(); c.stroke();
    c.fillStyle = '#7a3b52'; for (const d of [-1, 1]) { c.beginPath(); c.ellipse(d * s * 0.24, s * 0.46, s * 0.09, s * 0.12, 0, 0, TAU); c.fill(); }
    c.fillStyle = '#ff5f8a'; c.beginPath(); c.ellipse(s * 0.12, s * 0.9, s * 0.16, s * 0.22, 0.2, 0, TAU); c.fill(); c.stroke(); // tongue
    // the crazy eyes: different sizes, pupils orbiting in opposite directions
    [[-0.36, 0.33, 1], [0.38, 0.26, -1.6]].forEach(([ox, r, dir]) => {
      const ex = ox * s, ey = -s * 0.2, rr = r * s, a = (time / 160) * dir * fast;
      c.fillStyle = '#ffffff'; c.strokeStyle = e.enraged ? '#ff2d55' : '#2a2119'; c.lineWidth = e.enraged ? 3 : 2;
      c.beginPath(); c.arc(ex, ey, rr, 0, TAU); c.fill(); c.stroke();
      c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 1; c.beginPath();
      for (let t = 0; t < 14; t++) { const q = t / 14, sa = a + q * TAU * 2; c.lineTo(ex + Math.cos(sa) * rr * q * 0.9, ey + Math.sin(sa) * rr * q * 0.9); } c.stroke();
      c.fillStyle = '#111111'; c.beginPath(); c.arc(ex + Math.cos(a) * rr * 0.5, ey + Math.sin(a) * rr * 0.5, rr * 0.36, 0, TAU); c.fill();
      c.fillStyle = '#ffffff'; c.beginPath(); c.arc(ex + Math.cos(a) * rr * 0.5 - rr * 0.1, ey + Math.sin(a) * rr * 0.5 - rr * 0.1, rr * 0.1, 0, TAU); c.fill();
    });
    c.restore();
  }

  drawJunk(j) { // harmless intermission debris, drawn as simple line art
    const c = this.ctx, s = j.size / 2;
    c.save(); c.translate(j.x, j.y); c.rotate(j.rot); c.globalAlpha = Math.min(0.75, j.life / 60);
    c.strokeStyle = '#9bceff'; c.fillStyle = 'rgba(155,206,255,0.15)'; c.lineWidth = 1.5; c.beginPath();
    if (j.kind === 0) { c.rect(-s * 0.5, -s, s, s * 2); c.moveTo(-s * 0.25, s * 0.75); c.lineTo(s * 0.25, s * 0.75); } // phone
    else if (j.kind === 1) { c.rect(-s * 0.3, -s * 0.3, s * 0.6, s * 0.6); c.rect(-s, -s * 0.2, s * 0.6, s * 0.4); c.rect(s * 0.4, -s * 0.2, s * 0.6, s * 0.4); } // satellite
    else if (j.kind === 2) { c.moveTo(0, -s); c.lineTo(s * 0.4, s * 0.5); c.lineTo(-s * 0.4, s * 0.5); c.closePath(); c.moveTo(-s * 0.4, s * 0.5); c.lineTo(-s * 0.7, s); c.moveTo(s * 0.4, s * 0.5); c.lineTo(s * 0.7, s); } // rocket
    else { c.arc(0, 0, s * 0.6, 0, TAU); c.moveTo(-s, 0); c.lineTo(s, 0); } // probe
    c.fill(); c.stroke(); c.restore();
  }

  drawParts() {
    const c = this.ctx, out = [];
    for (const q of this.parts) {
      if (--q.life <= 0) continue;
      const a = q.life / q.max;
      if (q.t === 'spark') {
        q.x += q.vx; q.y += q.vy; q.vx *= 0.96; q.vy *= 0.96;
        c.globalCompositeOperation = 'lighter'; c.globalAlpha = a; this.lit(q.c, q.x, q.y, q.size * 2.4); c.globalCompositeOperation = 'source-over';
      } else if (q.t === 'rock' || q.t === 'conf') {
        q.x += q.vx; q.y += q.vy; q.rot += q.vr; if (q.t === 'rock') { q.vx *= 0.97; q.vy *= 0.97; }
        c.save(); c.translate(q.x, q.y); c.rotate(q.rot); c.globalAlpha = Math.min(1, a * 1.6); c.fillStyle = q.c;
        if (q.t === 'conf') c.fillRect(-q.size / 2, -q.size / 4, q.size, q.size / 2);
        else { c.beginPath(); c.moveTo(-q.size / 2, -q.size / 3); c.lineTo(q.size / 2, -q.size / 2); c.lineTo(q.size / 3, q.size / 2); c.lineTo(-q.size / 2, q.size / 4); c.closePath(); c.fill(); }
        c.restore();
      } else if (q.t === 'ring') {
        c.globalAlpha = a; c.strokeStyle = q.c; c.lineWidth = q.w * a + 0.5; c.beginPath(); c.arc(q.x, q.y, q.r * (1 - a * a), 0, TAU); c.stroke();
      } else if (q.t === 'bolt') {
        c.globalAlpha = a; c.strokeStyle = '#b06bff'; c.lineWidth = 3; c.shadowColor = '#00f5ff'; c.shadowBlur = 12; c.beginPath(); c.moveTo(q.x, q.y);
        for (let i = 1; i < 5; i++) c.lineTo(q.x + ((q.x2 - q.x) * i) / 5 + rnd(-7, 7), q.y + ((q.y2 - q.y) * i) / 5 + rnd(-7, 7));
        c.lineTo(q.x2, q.y2); c.stroke(); c.shadowBlur = 0;
      } else if (q.t === 'text') {
        q.y += q.vy; c.globalAlpha = Math.min(1, a * 2); c.fillStyle = q.c; c.textAlign = 'center';
        c.font = `900 ${q.big ? 18 : 13}px Orbitron, monospace`; c.shadowColor = q.c; c.shadowBlur = 8;
        c.fillText(q.s, Math.max(60, Math.min(this.W - 60, q.x)), Math.max(16, q.y)); c.shadowBlur = 0;
      }
      c.globalAlpha = 1;
      out.push(q);
    }
    this.parts = out;
  }
}
