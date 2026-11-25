// The whole game, as a deterministic fixed-step simulation with no DOM access.
// Same seed + same inputs => same run, in any browser and in Node. That is what
// makes replays, ghosts, the bot rival and offline score verification possible.
import { makeRng, dsin, dcos, datan2, dhyp, PI, TAU } from './rng.js';
import { BOSSES } from './bosses.js';
import { PERKS, EVOLUTIONS, SHIPS, MUTATORS, ELITE_AFFIXES, WEAPON_PERKS, TUNE } from './data.js';

export const HZ = 60;
export const SIM_VERSION = 3;
// Input flags for step(). Bits 4-5 carry a perk pick (1-3).
export const F = { FIRE: 1, DASH: 2, BOMB: 4, PTR: 8, ATTACK: 64 };

const T = (sec) => Math.round(sec * HZ);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const COW = { label: 'Moolissa the Mad Cow', elite: 'Moolissa, Udder Chaos', size: 76, speed: 0.5, speedW: 0, hp: 14, points: 3000, theme: 'drone', ability: 'cow', art: 'cow' };
const LILO = { label: 'Lilo the Red Heeler', elite: 'Lilo, Captain of the Pack', size: 66, speed: 1.7, speedW: 0, hp: 12, points: 3600, theme: 'alien', ability: 'lilo', art: 'lilo' };
const SPECIAL = { 3: 0, 5: 1, 7: 2 }; // wave -> marquee boss
const BOBA = { label: 'Boba Colossus', elite: 'Boba Colossus, Tapioca Tyrant', size: 66, speed: 0.68, speedW: 0, hp: 16, points: 2400, theme: 'boba', ability: 'boba', art: 'boba' };
const POWERUPS = [[0.06, '1up'], [0.22, 'shoot'], [0.38, 'multishot'], [0.54, 'shield'], [0.66, 'mochi'], [0.78, 'dango'], [0.89, 'sushi'], [1.01, 'taiyaki']];

export class Sim {
  constructor({ seed = 1, W = 800, H = 600, mode = 'solo', ship = 'vanguard', targetWave = 0, quiet = false } = {}) {
    Object.assign(this, { seed, W, H, mode, shipId: SHIPS[ship] ? ship : 'vanguard', targetWave, quiet });
    this.ship = SHIPS[this.shipId];
    this.rng = makeRng(seed);
    this.tick = 0;
    this.events = [];
    this.nextId = 1;
    this.pf = 0;
    const s = this.ship;
    this.p = { x: W / 2, y: H * 0.62, px: W / 2, py: H * 0.62, r: s.radius, lives: s.lives, speed: s.speed, inv: 0, dash: 0, dashCd: 0, dashDx: 0, dashDy: -1, faceA: 0, moving: false, shield: s.startShield ? 3 : 0, heat: 0, lastShot: -999, lastHeatHit: -999, autoFire: false };
    this.score = 0; this.wave = 1; this.waveMult = 1;
    this.combo = 1; this.comboT = 0;
    this.kills = 0; this.quota = 12; this.spawnRate = 600; this.spawnT = 480; this.collT = 0; this.powT = 0; this.hazT = 0;
    this.perks = {}; this.weaponOrder = []; this.evo = {};
    this.rapid = 0; this.multi = 0; this.multiUntil = 0;
    this.buffs = { mochi: 0, dango: 0, sushi: 0, taiyaki: 0 };
    this.enemies = []; this.bullets = []; this.shots = []; this.items = []; this.pearls = [];
    this.phase = 'play'; this.phaseT = 0; this.choices = [];
    this.bossActive = false; this.bossCycle = 0; this.bobaPending = false;
    this.streak = 0; this.tookDamage = false; this.mutator = null;
    this.bomb = 0; this.orbA = 0; this.pressure = 1; this.calm = 0; this.ease = 0;
    this.dvd = null; this.cornerCd = 0; this.dvdWave = 0;
    this.attacksOut = 0; this.killTotal = 0;
    this.stats = { kills: 0, grazes: 0, bosses: 0, dashes: 0, bombs: 0, hits: 0, dvd: 0, perfectDvd: 0, evos: 0, maxCombo: 1, maxStreak: 0, boba: 0, cow: 0, lilo: 0 };
    if (s.startPerk) { this.perks[s.startPerk] = 1; this.weaponOrder.push(s.startPerk); }
    this.recompute();
    this.spawnItem('donut'); this.spawnItem('donut');
    this.ev('banner', { s: 'WAVE 1' });
  }

  ev(k, o) { if (!this.quiet) this.events.push(o ? Object.assign({ k }, o) : { k }); }
  text(x, y, s, c) { this.ev('text', { x, y, s, c }); }
  L(id) { return this.perks[id] || 0; }
  mut(key, d) { return this.mutator && this.mutator[key] !== undefined ? this.mutator[key] : d; }

  // Derive every stat from perk levels, so losing a perk can never leave stale state.
  recompute() {
    const L = (id) => this.L(id), p = this.p, s = this.ship;
    let cd = 250;
    for (let i = 0; i < L('rapidfire'); i++) cd = Math.max(60, Math.round(cd * 0.8));
    this.orbital = L('orbital') > 0;
    this.orbShots = Math.min(4, L('orbital'));
    this.cd = this.orbital ? 45 : Math.max(30, Math.round((cd * s.fireMul) / (1 + 0.35 * this.rapid)));
    this.shotCount = Math.min(4, 1 + L('spreadfire'));
    this.pierce = L('pierce');
    p.speed = s.speed + L('thruster');
    this.pickupR = 25 + 15 * L('magnet');
    this.comboCap = 3 + 0.5 * L('combo');
    this.scoreMul = Math.min(2.25, 1 + 0.25 * L('scoresurge'));
    this.autoUnlocked = L('autofire') > 0 || this.orbital;
    if (!this.autoUnlocked) p.autoFire = false;
    this.directional = L('directional') > 0;
    this.chain = L('chain') > 0;
    this.homing = L('homing') > 0;
    this.dashCdMax = Math.round(T(TUNE.dashCooldown) * s.dashMul * (1 - 0.2 * L('afterburner')));
    this.grazeMul = s.bombMul * (1 + 0.4 * L('grazer'));
    for (const e of EVOLUTIONS) {
      const on = Object.keys(e.req).every((id) => L(id) >= e.req[id]);
      if (on && !this.evo[e.id]) { this.stats.evos++; this.ev('evo', { name: e.name, desc: e.desc }); this.ev('sfx', { n: 'evolve' }); }
      this.evo[e.id] = on;
    }
    this.comboWin = Math.round(T(3 + 0.3 * L('combo')) * (this.evo.jackpot ? 1.5 : 1));
  }

  step(f = 0, dx = 0, dy = 0) {
    if (this.phase === 'over' || this.phase === 'done') return;
    if (this.phase === 'perk') { const pick = (f >> 4) & 3; if (pick) this.choosePerk(pick - 1); this.pf = f; return; }
    this.tick++;
    const p = this.p;
    if (f & F.ATTACK) this.incomingAttack();
    this.movePlayer(f, dx, dy);
    this.updateWeapons(f);
    this.pf = f;
    if (p.inv > 0) p.inv--;
    if (p.dashCd > 0) p.dashCd--;
    if (this.cornerCd > 0) this.cornerCd--;
    if (this.comboT > 0 && --this.comboT === 0) this.combo = 1;
    if (this.multi && this.tick >= this.multiUntil) { this.multi = 0; }

    if (this.phase === 'celebrate') {
      this.updateShots(); this.updatePearls();
      if (--this.phaseT <= 0) this.nextWave();
      return;
    }
    this.direct();
    if (this.phase !== 'inter') {
      this.spawnT += TUNE.pace * this.pressure * this.mut('spawn', 1);
      if (this.spawnT > this.spawnRate) { this.spawnT = 0; this.spawnEnemy(); if (this.wave >= 6 && this.rng() < Math.min(0.5, (this.wave - 5) * 0.08)) this.spawnEnemy(); }
      if (this.mut('hazard', false) && ++this.hazT >= T(1.2)) { this.hazT = 0; this.hazard(); }
    }
    const donutMul = this.mut('donuts', 1);
    this.collT += donutMul;
    if (this.collT > 300 && this.items.filter((i) => i.type === 'donut').length < (donutMul > 1 ? 5 : 2)) { this.collT = 0; this.spawnItem('donut'); }
    if (++this.powT > 1000 && !this.items.some((i) => i.type !== 'donut')) { this.powT = 0; this.spawnItem(this.rollPowerup()); }
    this.updateItems();
    this.updateEnemies();
    this.updateBullets();
    this.updateShots();
    this.updatePearls();
    this.updateDvd();
    if (this.phase === 'over') return;

    if (this.phase === 'bossdead') {
      this.count();
      if (--this.phaseT <= 0) {
        this.bossActive = false;
        if (this.bobaPending) { this.bobaPending = false; this.phase = 'celebrate'; this.phaseT = T(10); this.clearField(); } else this.nextWave();
      }
    } else if (this.phase === 'inter') {
      this.count();
      if (--this.phaseT <= 0) {
        this.phase = 'play'; this.pearls.length = 0;
        this.ev('banner', { s: `WAVE ${this.wave}`, sub: this.mutator ? `${this.mutator.name}: ${this.mutator.desc}` : '' });
      }
    } else this.checkWave();
  }

  count() { // 3, 2, 1, GO! over the last 2.8 seconds of a phase
    const i = [T(2.8), T(2.1), T(1.4), T(0.7)].indexOf(this.phaseT);
    if (i >= 0) this.ev('count', { s: ['3', '2', '1', 'GO!'][i] });
  }

  // ---- player ----
  movePlayer(f, dx, dy) {
    const p = this.p;
    p.px = p.x; p.py = p.y;
    let vx = dx / 127, vy = dy / 127;
    const m = dhyp(vx, vy);
    if (m > 1) { vx /= m; vy /= m; }
    if ((f & F.DASH) && !(this.pf & F.DASH) && p.dashCd <= 0 && p.dash <= 0) {
      p.dash = TUNE.dashTicks; p.dashCd = this.dashCdMax;
      if (m > 0.15) { p.dashDx = vx / m; p.dashDy = vy / m; } else { p.dashDx = dsin(p.faceA); p.dashDy = -dcos(p.faceA); }
      this.stats.dashes++;
      this.ev('sfx', { n: 'dash', x: p.x }); this.ev('dash', { x: p.x, y: p.y });
    }
    if (p.dash > 0) {
      const sp = p.speed * TUNE.dashSpeedMul;
      p.x += p.dashDx * sp; p.y += p.dashDy * sp;
      p.dash--; if (p.inv < 4) p.inv = 4;
      p.moving = true;
    } else {
      const cap = f & F.PTR ? p.speed * TUNE.ptrSpeedMul : p.speed;
      p.x += vx * cap; p.y += vy * cap;
      p.moving = m > 0.06;
      if (m > 0.05) p.faceA = datan2(vx, -vy);
    }
    p.x = clamp(p.x, p.r, this.W - p.r); p.y = clamp(p.y, p.r, this.H - p.r);
    if (this.cornerCd <= 0 && (p.x < 26 || p.x > this.W - 26) && (p.y < 26 || p.y > this.H - 26)) { this.cornerCd = T(10); this.cornerHit(); }
  }

  updateWeapons(f) {
    const p = this.p;
    const pressed = (f & F.FIRE) && !(this.pf & F.FIRE);
    if (this.autoUnlocked && pressed) {
      p.autoFire = !p.autoFire;
      this.text(p.x, p.y - 20, p.autoFire ? 'AUTO FIRE ON' : 'AUTO FIRE OFF', p.autoFire ? '#39ff14' : '#ff6600');
    }
    const firing = this.autoUnlocked ? p.autoFire : !!(f & F.FIRE);
    if (this.orbital) this.orbA = (this.orbA + 0.1) % TAU;
    if (firing) this.shoot();
    if ((f & F.BOMB) && !(this.pf & F.BOMB) && this.bomb >= 100) this.detonate();
    // heat
    const hot = this.rapid > 6 && !this.evo.coolant && (firing || this.tick - p.lastShot < 9);
    if (!hot) { p.heat = Math.max(0, p.heat - 0.05); return; }
    p.heat = Math.min(100, p.heat + 0.12 * (this.rapid - 6));
    if (p.heat >= 100 && this.tick - p.lastHeatHit > T(0.9)) {
      p.lastHeatHit = this.tick; p.heat = 65;
      this.text(p.x, p.y - 20, 'OVERHEAT!', '#ff6600');
      this.hitPlayer(true);
    }
  }

  shoot() {
    const p = this.p;
    const ms = this.orbital ? 45 : this.tick < this.buffs.mochi ? Math.max(20, this.cd / 2) : this.cd;
    if (this.tick - p.lastShot < (ms * HZ) / 1000) return;
    p.lastShot = this.tick;
    const base = this.orbital ? this.orbA : this.directional ? p.faceA : 0;
    const n = this.orbital ? this.orbShots : Math.min(7, this.shotCount + this.multi);
    const width = n > 1 ? Math.min(150, (n - 1) * 9) : 0;
    for (let i = 0; i < n; i++) {
      const rad = base + ((n > 1 ? -width / 2 + (i * width) / (n - 1) : 0) * PI) / 180;
      const vx = dsin(rad) * 8, vy = -dcos(rad) * 8;
      this.shots.push({ x: p.x, y: p.y - 6, px: p.x, py: p.y - 6, vx, vy, pierce: 1 + this.pierce, homing: this.homing, tgt: 0, last: 0, life: T(3) });
    }
    this.ev('sfx', { n: 'shoot', x: p.x });
  }

  detonate() {
    const p = this.p;
    this.bomb = 0; this.stats.bombs++;
    p.inv = Math.max(p.inv, T(1.5));
    this.addScore(this.bullets.length * 10);
    this.bullets.length = 0;
    for (const e of this.enemies.slice()) {
      if (!this.enemies.includes(e)) continue;
      e.hp -= e.boss ? TUNE.bombBossDmg : TUNE.bombEnemyDmg; e.guard = 0; e.flash = 8;
      if (e.hp <= 0) this.kill(e, 1, true); else if (e.boss) this.bossThreshold(e);
    }
    this.text(p.x, p.y - 24, 'NOVA BOMB!', '#ffffff');
    this.ev('bomb', { x: p.x, y: p.y }); this.ev('sfx', { n: 'bomb' }); this.ev('shake', { a: 14 }); this.ev('flash'); this.ev('hitstop', { ms: 90 });
  }

  hitPlayer(overheat = false) {
    const p = this.p;
    if (!overheat) {
      if (p.inv > 0) return;
      if (this.tick < this.buffs.taiyaki) { p.inv = 12; this.text(p.x, p.y - 20, 'PHASE SHIELD!', '#e0a84e'); return; }
      if (p.shield > 0) {
        p.shield--; p.inv = T(0.5);
        this.text(p.x, p.y - 20, 'SHIELD -1', '#ffd700');
        this.ev('sfx', { n: 'powerup', x: p.x }); this.ev('vibe', { ms: 40 }); this.ev('ring', { x: p.x, y: p.y, r: 46, c: '#ffd700' });
        return;
      }
      this.tookDamage = true;
    }
    p.lives--; this.stats.hits++;
    this.loseWeapon();
    this.combo = 1; this.comboT = 0; this.calm = 0; this.ease = T(12);
    p.inv = T(1.2);
    // clear bullets around the ship so one hit never chains into two
    this.bullets = this.bullets.filter((b) => dhyp(b.x - p.x, b.y - p.y) > 90);
    this.ev('sfx', { n: 'damage', x: p.x }); this.ev('shake', { a: 10 }); this.ev('flash'); this.ev('hitstop', { ms: 80 }); this.ev('vibe', { ms: 120 });
    this.ev('boom', { x: p.x, y: p.y, size: 30, c: '#ff0080' });
    if (p.lives <= 0) { this.phase = 'over'; this.ev('over'); }
  }

  // Softer than v1: a hit costs the most recently gained weapon upgrade, not all of them.
  loseWeapon() {
    const p = this.p;
    this.rapid = Math.floor(this.rapid / 2); this.multi = 0;
    const id = this.weaponOrder.pop();
    if (id) {
      this.perks[id]--; if (this.perks[id] <= 0) delete this.perks[id];
      this.text(p.x, p.y - 20, `LOST: ${PERKS.find((k) => k.id === id).name.toUpperCase()}`, '#ff6600');
    }
    this.recompute();
  }

  // ---- scoring ----
  addScore(points) {
    const base = clamp(Number(points) || 0, 0, 1e6);
    this.score += Math.round(base * this.scoreMul * (this.tick < this.buffs.dango ? 2 : 1));
  }
  bumpCombo() {
    this.combo = this.comboT > 0 ? Math.min(this.combo + 0.5, this.comboCap) : 1;
    this.comboT = this.comboWin;
    if (this.combo > this.stats.maxCombo) this.stats.maxCombo = this.combo;
  }
  graze(x, y, pts, meter) {
    this.stats.grazes++;
    const got = Math.round(pts * (this.evo.jackpot ? 3 : 1));
    this.addScore(got);
    this.bomb = Math.min(100, this.bomb + meter * this.grazeMul);
    this.ev('graze', { x, y, pts: got }); this.ev('sfx', { n: 'graze', x });
  }

  // ---- enemies ----
  edgePoint(off) {
    const roll = this.rng(), r2 = this.rng();
    if (roll < 0.62) return [r2 * this.W, -off];
    if (roll < 0.79) return [this.W + off, r2 * this.H];
    if (roll < 0.96) return [-off, r2 * this.H];
    return [r2 * this.W, this.H + off];
  }

  spawnEnemy() {
    const w = this.wave, roll = this.rng();
    if (w >= 2 && roll < 0.1) { this.spawnSquad(); return; }
    const [x, y] = this.edgePoint(20);
    const hpBase = Math.max(1, 1 + Math.floor((w - 1) / 2)) + this.mut('hp', 0), sm = this.mut('speed', 1), dir = this.rng() < 0.5 ? -1 : 1;
    if (w >= 3 && roll < 0.22) { this.addEnemy({ x, y, speed: (1 + w * 0.05) * sm, size: 20, kind: 'sniper', points: 220, hp: hpBase, split: 0, shootT: T(2), tele: 0, dir }); return; }
    if (w >= 4 && roll < 0.34) { this.addEnemy({ x, y, speed: (1.5 + w * 0.1) * sm, size: 18, kind: 'flanker', points: 200, hp: hpBase, split: 0, dir }); return; }
    if (w >= 5 && roll < 0.42) { this.addEnemy({ x, y, speed: 0.4 * sm, size: 22, kind: 'mine', points: 160, hp: 1, split: 0 }); return; }
    if (w >= 6 && roll < 0.48) { this.addEnemy({ x, y, speed: (0.45 + w * 0.03) * sm, size: 30, kind: 'carrier', points: 320, hp: hpBase + 2, split: 0, pulseT: T(2) }); return; }
    const fast = this.rng() < 0.28 && w > 2;
    const heavy = !fast && this.rng() < 0.34;
    const size = fast ? 16 : heavy ? 38 : 22;
    const speed = (fast ? 1.1 + (w - 1) * 0.18 : (w === 1 ? 0.28 : 0.22 + (w - 1) * 0.12) + this.rng() * 0.11 + (w - 1) * 0.12) * this.mut('speed', 1);
    const e = this.addEnemy({ x, y, speed, size, kind: fast ? 'fast' : 'rock', points: fast ? 180 : heavy ? 240 : 120, hp: Math.max(1, 1 + Math.floor((w - 1) / 2)) + (heavy ? 1 : 0) + this.mut('hp', 0), split: heavy ? 2 : 0 });
    if (w >= TUNE.eliteFromWave && this.rng() < Math.min(0.3, 0.06 * (w - TUNE.eliteFromWave + 1))) {
      e.affix = ELITE_AFFIXES[Math.floor(this.rng() * ELITE_AFFIXES.length)];
      e.points *= 2; e.hp += 1;
      if (e.affix === 'shielded') e.guard = 2;
      if (e.affix === 'swift') e.speed *= 1.6;
      if (e.affix === 'shooter') e.shootT = T(1.5);
    }
  }

  spawnSquad() { // a V of darts that crosses the arena in a straight line
    const w = this.wave, fromLeft = this.rng() < 0.5, y0 = this.H * (0.15 + this.rng() * 0.45), sp = (2.2 + w * 0.12) * this.mut('speed', 1);
    for (let i = 0; i < 5; i++) {
      const k = Math.abs(i - 2);
      this.addEnemy({ x: (fromLeft ? -20 : this.W + 20) - (fromLeft ? 1 : -1) * k * 26, y: y0 + (i - 2) * 24, vx: fromLeft ? sp : -sp, vy: sp * 0.22, speed: sp, size: 14, kind: 'dart', straight: true, points: 110, hp: 1, split: 0 });
    }
  }

  addEnemy(o) {
    const e = Object.assign({ id: this.nextId++, px: o.x, py: o.y, vx: 0, vy: 0, burst: 0, drift: 0, flash: 0, grazed: false, boss: false, guard: 0, maxHp: o.hp }, o);
    this.enemies.push(e);
    return e;
  }

  incomingAttack() {
    for (let i = 0; i < 3; i++) this.addEnemy({ x: this.W * (0.2 + 0.3 * i), y: -20, speed: 1.3 + this.wave * 0.15, size: 16, kind: 'fast', points: 90, hp: 1, split: 0, attack: true });
    this.ev('banner', { s: 'RIVAL ATTACK!', small: true }); this.ev('sfx', { n: 'elite' });
  }

  hazard() {
    const [x, y] = this.edgePoint(10);
    const a = datan2(this.H * (0.2 + this.rng() * 0.6) - y, this.W * (0.2 + this.rng() * 0.6) - x);
    this.bullets.push(this.mkBullet(x, y, a, 2.6, '#ffb100', 5));
  }

  spawnBoss() {
    const w = this.wave, [x, y] = this.edgePoint(50);
    const special = [BOBA, COW, LILO][SPECIAL[w]] || (w > 7 && w % 6 === 0 ? [COW, LILO, BOBA][(w / 6) % 3] : null);
    const base = special || BOSSES[this.bossCycle % BOSSES.length];
    const elite = w >= 8 && (this.bossCycle + 1) % 3 === 0;
    this.bossCycle++;
    let size = base.size, speed = base.speed + w * base.speedW, hp = Math.round(base.hp * (TUNE.bossHpBase + TUNE.bossHpWave * w)), points = base.points;
    if (elite) { size += 10; speed += 0.16 + w * 0.03; hp = Math.round(hp * (1.35 + w * 0.06)); points = Math.round(points * 1.9); }
    const label = elite ? base.elite : base.label;
    this.addEnemy({ x, y, speed, size, kind: 'boss', boss: true, label, theme: base.theme, ability: base.ability, art: special ? base.art : BOSSES.indexOf(base), dir: 1, mode: 0, lunge: 0, points, hp, elite, aiT: 0, ai2: T(3.2), tele: 0, spin: 0, enraged: false, spiral: 0, split: 0 });
    this.bossActive = true;
    this.ev('banner', { s: `WAVE ${w}`, sub: label, boss: true }); this.ev('music', { theme: base.theme }); this.ev('sfx', { n: 'elite' });
  }

  mkBullet(x, y, a, sp, c, r = 4, homing = false) {
    return { x, y, px: x, py: y, vx: dcos(a) * sp, vy: dsin(a) * sp, r, c, homing, life: T(7), grazed: false };
  }
  ring(e, n, sp, c, off = 0) {
    for (let i = 0; i < n; i++) this.bullets.push(this.mkBullet(e.x, e.y, (TAU / n) * i + off, sp, c));
  }
  fan(e, n, spread, sp, c, r = 4) {
    const a = datan2(this.p.y - e.y, this.p.x - e.x);
    for (let i = 0; i < n; i++) this.bullets.push(this.mkBullet(e.x, e.y, a + (i - (n - 1) / 2) * spread, sp, c, r));
  }

  bossAI(e) {
    const p = this.p, rate = e.enraged ? 0.75 : 1;
    e.aiT++;
    const every = (sec) => { if (e.aiT >= T(sec) * rate) { e.aiT = 0; return true; } return false; };
    switch (e.ability) {
      case 'tracking': if (every(1.2)) this.bullets.push(this.mkBullet(e.x, e.y, datan2(p.y - e.y, p.x - e.x), 5.2, '#2ce2ff', 5, true)); break;
      case 'drone':
        if (every(1.5) && this.enemies.filter((d) => d.drone).length < 9) {
          for (let i = 0; i < 3; i++) { const a = (TAU / 3) * i + e.spin; this.addEnemy({ x: e.x + dcos(a) * 18, y: e.y + dsin(a) * 18, speed: 0.7 + this.wave * 0.08, size: 14, kind: 'drone', drone: true, points: 100, hp: 1, split: 0 }); }
          e.spin += 0.6; this.text(e.x, e.y, 'DRONE SWARM', '#d39cff');
        }
        break;
      case 'gravity': {
        const d = dhyp(p.x - e.x, p.y - e.y) || 1;
        if (d < 210 && p.dash <= 0) { p.x -= ((p.x - e.x) / d) * 0.7; p.y -= ((p.y - e.y) / d) * 0.7; }
        if (every(1.4)) this.fan(e, 1, 0, 4.8, '#8a7dff', 5);
        break;
      }
      case 'splitter': if (every(1.7)) { this.ring(e, 10, 3.4, '#ff8ab0', e.spin); e.spin += 0.37; } break;
      case 'arc': if (every(1.1)) { this.ring(e, 12, 3.9, '#fff58a', PI / 12 + e.spin); e.spin += 0.13; } break;
      case 'meteor':
        if (every(1.8)) for (const ty of [-20, this.H + 20]) this.bullets.push(this.mkBullet(e.x, e.y, datan2(ty - e.y, p.x + (this.rng() - 0.5) * 80 - e.x), 3.8, '#ff9f43', 5));
        break;
      case 'cow':
        if (every(1.6)) {
          const m = e.mode++ % 3;
          if (m === 0) { this.fan(e, 7, 0.18, 3.6, '#ffffff', 5); this.text(e.x, e.y, 'MILK SPRAY', '#ffffff'); } else if (m === 1) { this.ring(e, 14, 3, '#ffd166', e.spin); e.spin += 0.2; this.text(e.x, e.y, 'COWBELL!', '#ffd166'); this.ev('sfx', { n: 'tink', x: e.x }); } else {
            e.lunge = T(0.8); this.text(e.x, e.y, 'STAMPEDE!', '#ff6600');
            if (this.enemies.filter((d) => d.calf).length < 6) for (const o of [-30, 30]) this.addEnemy({ x: e.x + o, y: e.y, speed: 1.2 + this.wave * 0.1, size: 16, kind: 'fast', calf: true, points: 90, hp: 1, split: 0 });
          }
        }
        break;
      case 'lilo':
        if (every(1.3)) {
          const m = e.mode++ % 3;
          if (m === 0) { const n0 = this.bullets.length; this.fan(e, 3, 0.2, 4.4, '#c8ff3a', 6); for (let i = n0; i < this.bullets.length; i++) this.bullets[i].bounce = 2; this.text(e.x, e.y, 'FETCH!', '#c8ff3a'); } else if (m === 1) { this.ring(e, 10, 3.2, '#ff9a5a', e.spin); e.spin += 0.3; this.text(e.x, e.y, 'WOOF!', '#ff9a5a'); this.ev('ring', { x: e.x, y: e.y, r: 90, c: '#ff9a5a' }); } else { e.lunge = T(0.5); e.dir = -e.dir; }
        }
        break;
      case 'boba': if (every(1.35)) { this.fan(e, 3, 0.22, 4.2, '#f5a7c6', 5); this.text(e.x, e.y, 'BOBA BURST', '#f5a7c6'); } break;
      default: if (every(1.6)) { this.ring(e, 8, 3.5, '#ff8ab0', e.spin); e.spin += 0.37; }
    }
    if (e.lunge > 0) { // telegraph, then charge at where the player is
      e.tele = e.lunge;
      if (--e.lunge === 0) { const a = datan2(p.y - e.y, p.x - e.x), sp = e.ability === 'cow' ? 9 : 11; e.vx = dcos(a) * sp; e.vy = dsin(a) * sp; e.burst = T(e.ability === 'cow' ? 0.8 : 0.45); e.tele = 0; this.ev('sfx', { n: 'dash', x: e.x }); }
      return;
    }
    if (!e.enraged) return;
    // Phase two: a telegraphed aimed volley. Elites add a spiral.
    if (e.tele > 0) { if (--e.tele === 0) { this.fan(e, 5, 0.2, 4.6, '#ffffff', 5); this.ev('sfx', { n: 'elite', x: e.x }); } } else if (--e.ai2 <= 0) { e.ai2 = T(3.2); e.tele = T(0.6); }
    if (e.elite && e.hp <= e.maxHp * 0.25) {
      if (e.spiral > 0) { if (e.spiral-- % 2 === 0) this.bullets.push(this.mkBullet(e.x, e.y, e.spiral * 0.26, 3, '#ffd166')); } else if (this.tick % T(5) === 0) e.spiral = 48;
    }
  }

  bossThreshold(e) {
    if (!e.enraged && e.hp <= e.maxHp * 0.5) {
      e.enraged = true; e.speed *= 1.15;
      this.text(e.x, e.y - e.size, 'ENRAGED!', '#ff2d95');
      this.ev('ring', { x: e.x, y: e.y, r: e.size * 2, c: '#ff2d95' }); this.ev('shake', { a: 6 }); this.ev('sfx', { n: 'elite', x: e.x });
    }
  }

  updateEnemies() {
    const p = this.p;
    for (const e of this.enemies.slice()) {
      e.px = e.x; e.py = e.y;
      if (e.flash > 0) e.flash--;
      if (e.boss) this.bossAI(e);
      const dxp = p.x - e.x, dyp = p.y - e.y, d = dhyp(dxp, dyp) || 0.001;
      if (e.burst > 0) { e.x += e.vx; e.y += e.vy; e.vx *= 0.985; e.vy *= 0.985; e.burst--; } else if (e.drift > 0) {
        const cur = datan2(e.vy, e.vx);
        let delta = datan2(dyp, dxp) - cur;
        while (delta > PI) delta -= TAU;
        while (delta < -PI) delta += TAU;
        const a = cur + clamp(delta, -0.045, 0.045), sp = Math.max(e.speed * 0.5, dhyp(e.vx, e.vy) * 0.99);
        e.vx = dcos(a) * sp; e.vy = dsin(a) * sp; e.x += e.vx; e.y += e.vy; e.drift--;
      } else if (e.straight) { e.x += e.vx; e.y += e.vy; } else if (e.ability === 'lilo' || e.kind === 'sniper') {
        // hold a ring around the player and circle it: herding for Lilo, keeping range for snipers
        const R = e.boss ? 190 : 210, radial = clamp((d - R) / 60, -1, 1), ux = dxp / d, uy = dyp / d, tang = 1 - Math.abs(radial) * 0.6;
        e.x += (ux * radial - uy * e.dir * tang) * e.speed; e.y += (uy * radial + ux * e.dir * tang) * e.speed;
        if (e.x < 20 || e.x > this.W - 20 || e.y < 20 || e.y > this.H - 20) e.dir = -e.dir;
        e.x = clamp(e.x, 10, this.W - 10); e.y = clamp(e.y, 10, this.H - 10);
      } else if (e.kind === 'flanker') {
        const a = datan2(dyp, dxp) + e.dir * 0.95; e.x += dcos(a) * e.speed; e.y += dsin(a) * e.speed;
      } else if (e.kind === 'fast' && this.rng() < 0.02) {
        const a = this.rng() * TAU; e.x += dcos(a) * 30; e.y += dsin(a) * 30;
      } else {
        const st = Math.min(e.speed, d); e.x += (dxp / d) * st; e.y += (dyp / d) * st;
      }
      if (e.kind === 'sniper') {
        if (e.tele > 0) { if (--e.tele === 0) { this.bullets.push(this.mkBullet(e.x, e.y, datan2(dyp, dxp), 6, '#ff4d4d', 4)); this.ev('sfx', { n: 'tink', x: e.x }); } } else if (--e.shootT <= 0) { e.shootT = T(2.4); e.tele = T(0.5); }
      } else if (e.kind === 'mine' && d < 70) {
        this.enemies.splice(this.enemies.indexOf(e), 1); this.ring(e, 8, 2.4, '#ff6600');
        this.ev('boom', { x: e.x, y: e.y, size: 40, c: '#ff6600' }); this.ev('sfx', { n: 'enemyHit', x: e.x });
        continue;
      } else if (e.kind === 'carrier' && --e.pulseT <= 0) {
        e.pulseT = T(3);
        for (const o of this.enemies) if (o !== e && !o.boss && o.kind !== 'carrier' && dhyp(o.x - e.x, o.y - e.y) < 110) o.guard = Math.max(o.guard, 1);
        this.ev('ring', { x: e.x, y: e.y, r: 110, c: '#ffd700' });
      }
      if (e.affix === 'shooter' && --e.shootT <= 0) { e.shootT = T(2.2); this.fan(e, 1, 0, 3, '#ff2d95'); }
      const hitR = p.r + (e.size / 2) * 0.85;
      if (d < hitR) {
        if (p.inv > 0) { if (p.dash > 0 && !e.grazed && !e.boss) { e.grazed = true; this.graze(e.x, e.y, 60 * clamp(this.waveMult, 1, 4), 10); } continue; }
        this.hitPlayer();
        if (this.phase === 'over') return;
        if (e.boss) { this.ev('shake', { a: 8 }); continue; }
        this.enemies.splice(this.enemies.indexOf(e), 1);
        this.ev('boom', { x: e.x, y: e.y, size: e.size, c: '#8a7460' });
      } else if (!e.grazed && !e.boss && e.burst <= 0 && d < hitR + TUNE.grazeBand) {
        e.grazed = true; this.graze(e.x, e.y, 25 * clamp(this.waveMult, 1, 4), 6);
      }
    }
    this.enemies = this.enemies.filter((e) => e.boss || (e.x > -80 && e.x < this.W + 80 && e.y > -80 && e.y < this.H + 80));
  }

  updateBullets() {
    const p = this.p, out = [];
    for (const b of this.bullets) {
      b.px = b.x; b.py = b.y;
      if (b.homing && b.life > T(5)) {
        const cur = datan2(b.vy, b.vx);
        let delta = datan2(p.y - b.y, p.x - b.x) - cur;
        while (delta > PI) delta -= TAU;
        while (delta < -PI) delta += TAU;
        const a = cur + clamp(delta, -0.03, 0.03), sp = dhyp(b.vx, b.vy);
        b.vx = dcos(a) * sp; b.vy = dsin(a) * sp;
      }
      b.x += b.vx; b.y += b.vy;
      if (b.bounce > 0) { // tennis balls come back off the walls
        if (b.x < 4 || b.x > this.W - 4) { b.vx = -b.vx; b.bounce--; b.x = clamp(b.x, 4, this.W - 4); }
        if (b.y < 4 || b.y > this.H - 4) { b.vy = -b.vy; b.bounce--; b.y = clamp(b.y, 4, this.H - 4); }
      }
      if (--b.life <= 0 || b.x < -20 || b.x > this.W + 20 || b.y < -20 || b.y > this.H + 20) continue;
      const d = dhyp(b.x - p.x, b.y - p.y);
      if (d < p.r * 0.65 + b.r) {
        if (p.inv > 0) { if (p.dash > 0 && !b.grazed) { b.grazed = true; this.graze(b.x, b.y, 30, 8); } out.push(b); continue; }
        this.hitPlayer();
        if (this.phase === 'over') return;
        continue;
      }
      if (!b.grazed && d < p.r + b.r + TUNE.bulletGrazeBand) { b.grazed = true; this.graze(b.x, b.y, 15, 4); }
      out.push(b);
    }
    // hitPlayer may have cleared nearby bullets; keep only those still present
    this.bullets = out.filter((b) => this.bullets.includes(b));
  }

  updateShots() {
    const out = [];
    for (const s of this.shots) {
      s.px = s.x; s.py = s.y;
      if (s.homing) this.steer(s);
      s.x += s.vx; s.y += s.vy;
      if (--s.life <= 0 || s.x < -20 || s.x > this.W + 20 || s.y < -20 || s.y > this.H + 20) continue;
      let alive = true;
      if (this.phase !== 'celebrate') {
        for (const e of this.enemies) {
          if (e.id === s.last || dhyp(e.x - s.x, e.y - s.y) > e.size / 2 + 4) continue;
          s.last = e.id;
          this.damage(e, 1);
          if (this.evo.swarm && s.homing) {
            this.ev('ring', { x: s.x, y: s.y, r: 30, c: '#b06bff' });
            for (const o of this.enemies.slice()) if (o !== e && dhyp(o.x - s.x, o.y - s.y) < 30 + o.size / 2) this.damage(o, 1);
          }
          if (--s.pierce <= 0) { alive = false; break; }
        }
      }
      if (alive) out.push(s);
    }
    this.shots = out;
  }

  steer(s) {
    let t = s.tgt && this.enemies.find((e) => e.id === s.tgt);
    if (!t) {
      let best = 240;
      for (const e of this.enemies) { const d = dhyp(e.x - s.x, e.y - s.y); if (d < best) { best = d; t = e; } }
      s.tgt = t ? t.id : 0;
    }
    if (!t) return;
    const cur = datan2(s.vy, s.vx), turn = this.evo.swarm ? 0.24 : 0.12;
    let delta = datan2(t.y - s.y, t.x - s.x) - cur;
    while (delta > PI) delta -= TAU;
    while (delta < -PI) delta += TAU;
    const a = cur + clamp(delta, -turn, turn);
    s.vx = dcos(a) * 8; s.vy = dsin(a) * 8;
  }

  damage(e, n) {
    if (!this.enemies.includes(e)) return;
    e.flash = 6;
    if (e.guard > 0) { e.guard--; this.ev('ring', { x: e.x, y: e.y, r: e.size, c: '#ffd700' }); this.ev('sfx', { n: 'tink', x: e.x }); return; }
    e.hp -= n;
    this.ev('hit', { x: e.x, y: e.y });
    if (e.hp <= 0) this.kill(e, 1); else if (e.boss) this.bossThreshold(e);
  }

  kill(e, mul, noChain = false) {
    const i = this.enemies.indexOf(e);
    if (i < 0) return;
    this.enemies.splice(i, 1);
    this.addScore(e.points * this.waveMult * this.combo * mul * this.mut('pts', 1));
    this.kills++; this.stats.kills++; this.bumpCombo();
    this.bomb = Math.min(100, this.bomb + this.grazeMul);
    if (++this.killTotal % TUNE.attackEveryKills === 0) this.attacksOut++;
    this.ev('boom', { x: e.x, y: e.y, size: e.size, c: e.boss ? '#ff2d95' : e.affix ? '#ffd166' : '#8a7460', boss: e.boss });
    this.ev('sfx', { n: 'enemyHit', x: e.x });
    if (e.boss) this.bossDead(e);
    else {
      this.splitRock(e);
      if (e.affix === 'volatile' || e.kind === 'mine') this.ring(e, 6, 2.6, '#ff6600');
      if (e.affix) this.items.push({ type: 'donut', x: e.x, y: e.y, life: T(6.5) });
    }
    if (this.chain && !noChain) this.chainFrom(e.x, e.y, this.evo.storm ? 3 : 1);
  }

  chainFrom(x, y, jumps) {
    let t = null, best = 150;
    for (const e of this.enemies) { const d = dhyp(e.x - x, e.y - y); if (d < best) { best = d; t = e; } }
    if (!t) return;
    this.ev('bolt', { x1: x, y1: y, x2: t.x, y2: t.y });
    const tx = t.x, ty = t.y;
    if (t.boss) { t.hp -= 2; t.flash = 6; if (t.hp <= 0) this.kill(t, 1, true); else this.bossThreshold(t); } else this.kill(t, 0.5, true);
    if (jumps > 1) this.chainFrom(tx, ty, jumps - 1);
  }

  splitRock(e) {
    if (!e.split) return;
    const size = Math.max(14, Math.round(e.size * 0.62)), p = this.p;
    const travel = datan2(p.y - e.y, p.x - e.x), burst = T(0.9) + Math.floor(this.rng() * T(0.35));
    for (const dir of [-1, 1]) {
      const a = travel + dir * (PI / 2 + (this.rng() - 0.5) * 0.6), sp = 3.4 + this.rng() * 1.8;
      this.addEnemy({ x: e.x + dir * 8, y: e.y, speed: e.speed * 1.22, size, kind: 'rock', points: 85, hp: 1, split: e.split - 1, vx: dcos(a) * sp, vy: dsin(a) * sp, burst, drift: T(0.9) + Math.floor(this.rng() * T(0.4)) });
    }
  }

  bossDead(e) {
    this.stats.bosses++;
    const burst = T(0.95) + Math.floor(this.rng() * T(0.35));
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + this.rng() * 0.5, sp = 3.6 + this.rng() * 2;
      this.addEnemy({ x: e.x + dcos(a) * 20, y: e.y + dsin(a) * 20, speed: 0.6 + this.rng() * 0.4 + (this.wave - 1) * 0.08, size: 20, kind: 'rock', points: 120, hp: 1, split: 0, vx: dcos(a) * sp, vy: dsin(a) * sp, burst, drift: T(0.9) + Math.floor(this.rng() * T(0.4)) });
    }
    this.addScore(this.bullets.length * 10);
    this.bullets.length = 0;
    if (e.ability === 'cow') {
      this.stats.cow++;
      for (let i = 0; i < 10; i++) this.items.push({ type: 'donut', x: clamp(e.x + (this.rng() - 0.5) * 160, 20, this.W - 20), y: clamp(e.y + (this.rng() - 0.5) * 160, 20, this.H - 20), life: T(9) });
      this.ev('banner', { s: 'MOOOOO! UDDER DEFEAT', small: true });
    }
    if (e.ability === 'lilo') {
      this.stats.lilo++; this.pearlKind = 'bone';
      for (let i = 0; i < 16; i++) { const a = this.rng() * TAU, sp = 1.6 + this.rng() * 2.2; this.pearls.push({ x: e.x, y: e.y, vx: dcos(a) * sp, vy: dsin(a) * sp, min: 0.12 + this.rng() * 0.2, pearl: true, life: T(9) }); }
      this.ev('banner', { s: 'GOOD GIRL, LILO!', sub: 'She only wanted to play fetch', small: true });
    }
    if (e.ability === 'boba') {
      this.pearlKind = 'boba';
      this.stats.boba++; this.bobaPending = true;
      for (let i = 0; i < 30; i++) {
        const a = this.rng() * TAU, sp = 1.6 + this.rng() * 2.2;
        this.pearls.push({ x: e.x + (this.rng() - 0.5) * 20, y: e.y + (this.rng() - 0.5) * 20, vx: dcos(a) * sp, vy: dsin(a) * sp, min: 0.12 + this.rng() * 0.2, pearl: i % 3 !== 0, life: T(13) });
      }
      this.ev('banner', { s: 'BOBA COLOSSUS SPLASHED!', boba: true });
    }
    this.phase = 'bossdead'; this.phaseT = T(2.8);
    this.ev('bossdead', { x: e.x, y: e.y, label: e.label }); this.ev('shake', { a: 16 }); this.ev('hitstop', { ms: 140 }); this.ev('flash'); this.ev('music', { theme: null });
  }

  clearField() {
    for (const e of this.enemies) this.ev('boom', { x: e.x, y: e.y, size: e.size, c: '#8a7460' });
    this.enemies.length = 0; this.bullets.length = 0;
  }

  // ---- waves ----
  checkWave() {
    if (this.bossActive) { if (!this.enemies.some((e) => e.boss)) this.spawnBoss(); return; }
    if (this.kills >= this.quota) this.spawnBoss();
  }

  nextWave() {
    const clear = !this.tookDamage, p = this.p;
    this.streak = clear ? this.streak + 1 : 0;
    if (this.streak > this.stats.maxStreak) this.stats.maxStreak = this.streak;
    this.wave = Math.min(99, this.wave + 1);
    if (this.targetWave && this.wave > this.targetWave) { this.phase = 'done'; this.ev('done'); return; }
    this.kills = 0;
    this.waveMult = 1 + this.wave * 0.35;
    this.spawnRate = Math.max(90, this.spawnRate - 28 - this.wave * 2);
    this.quota = 10 + this.wave * 5;
    this.bossActive = false;
    const mult = clear ? 1 + Math.min(this.streak, TUNE.streakCap) * 0.5 : 1;
    const bonus = Math.round(500 * this.wave * this.combo * mult);
    this.addScore(bonus);
    this.text(p.x, p.y - 26, clear ? `NO-HIT CLEAR x${mult.toFixed(1)} +${bonus}` : `WAVE BONUS +${bonus}`, clear ? '#39ff14' : '#00f5ff');
    this.tookDamage = false;
    this.mutator = this.wave >= TUNE.mutatorFromWave && this.rng() < TUNE.mutatorChance ? MUTATORS[Math.floor(this.rng() * MUTATORS.length)] : null;
    this.ev('sfx', { n: 'wave' }); this.ev('wave', { wave: this.wave });
    this.offerPerks();
  }

  offerPerks() {
    const pool = PERKS.filter((k) => { const l = this.L(k.id); return k.once ? l < 1 : k.max ? l < k.max : true; });
    this.choices = [];
    while (this.choices.length < 3 && pool.length) {
      const total = pool.reduce((a, k) => a + (k.rare ? 1 : 6), 0);
      let roll = this.rng() * total, i = 0;
      while (i < pool.length - 1 && roll > (pool[i].rare ? 1 : 6)) { roll -= pool[i].rare ? 1 : 6; i++; }
      this.choices.push(pool.splice(i, 1)[0].id);
    }
    if (!this.choices.length) { this.startInter(); return; }
    this.phase = 'perk'; this.ev('perk');
  }

  choosePerk(i) {
    const id = this.choices[i] || this.choices[0];
    this.choices = [];
    if (id === 'orbital' && !this.orbital) {
      for (const w of WEAPON_PERKS) if (w !== 'orbital') delete this.perks[w];
      this.weaponOrder = []; this.rapid = 0; this.multi = 0;
    }
    this.perks[id] = this.L(id) + 1;
    if (WEAPON_PERKS.includes(id)) this.weaponOrder.push(id);
    if (id === 'hull') this.gainLife(this.p.x, this.p.y - 20);
    if (id === 'orbital' || id === 'autofire') this.p.autoFire = true;
    this.recompute();
    this.ev('sfx', { n: 'powerup' }); this.ev('picked', { id });
    this.startInter();
  }

  gainLife(x, y) { // lives are capped; past the cap a 1UP pays out in points instead
    if (this.p.lives < TUNE.livesCap) { this.p.lives++; this.text(x, y, '+1 LIFE', '#ff2d95'); } else { const pts = Math.round(2000 * this.waveMult); this.addScore(pts); this.text(x, y, `MAX LIVES +${pts}`, '#ff2d95'); }
  }

  startInter() { this.phase = 'inter'; this.phaseT = T(5); this.spawnT = 0; this.ev('inter'); }

  direct() { // difficulty director: lean in while the pilot is cruising, back off after a hit
    this.calm++;
    let m;
    if (this.ease > 0) { this.ease--; m = 0.7; } else m = 1 + Math.min(0.9, (this.calm / T(60)) * 0.9) + (this.combo >= this.comboCap ? 0.1 : 0);
    if (this.p.lives === 1) m *= 0.85;
    this.pressure = m;
  }

  // ---- items ----
  rollPowerup() {
    const roll = this.rng();
    let type = POWERUPS.find((r) => roll < r[0])[1];
    if (this.p.lives === 1 && this.rng() < 0.3) type = 'shield'; // mercy drop
    return type;
  }
  spawnItem(type) {
    this.items.push({ type, x: 15 + this.rng() * (this.W - 30), y: 15 + this.rng() * (this.H - 30), life: T(type === 'donut' ? 6.5 : 8) });
  }
  updateItems() {
    const p = this.p, lvl = this.L('magnet'), out = [];
    const reach = this.pickupR + (this.tick < this.buffs.sushi ? 90 : 0);
    for (const it of this.items) {
      if (--it.life <= 0) continue;
      const dx = p.x - it.x, dy = p.y - it.y, d = dhyp(dx, dy);
      if (lvl && d > 4 && d < 70 + lvl * 40) { const sp = 0.35 + lvl * 0.25; it.x += (dx / d) * sp; it.y += (dy / d) * sp; }
      if (d < reach) { this.pickup(it); continue; }
      out.push(it);
    }
    this.items = out;
  }
  pickup(it) {
    if (it.type === 'donut') { this.addScore(200 * this.waveMult * this.combo); this.ev('sfx', { n: 'collectible', x: it.x }); this.ev('pick', { x: it.x, y: it.y, c: '#39ff14' }); return; }
    this.activate(it.type, it.x, it.y);
    this.ev('sfx', { n: 'powerup', x: it.x }); this.ev('pick', { x: it.x, y: it.y, c: '#ffd700' });
  }
  activate(type, x, y) {
    const p = this.p, b = this.buffs, t = this.tick;
    if (type === 'shoot') { this.rapid = Math.min(TUNE.rapidCap, this.rapid + 1); this.recompute(); this.text(x, y, this.rapid > 1 ? `RAPID FIRE x${this.rapid}!` : 'RAPID FIRE!', '#ff6600'); } else if (type === 'multishot') {
      this.multi = Math.min(7 - this.shotCount, this.multi + 1); this.multiUntil = Math.max(this.multiUntil, t) + T(6);
      this.text(x, y, `MULTI-SHOT x${this.shotCount + this.multi}!`, '#b06bff');
    } else if (type === 'shield') { p.shield = 3; this.text(x, y, 'SHIELD!', '#ffd700'); } else if (type === '1up') { this.gainLife(x, y); } else if (type === 'mochi') { b.mochi = t + T(10); this.text(x, y, 'MOCHI OVERDRIVE!', '#ffb3c6'); } else if (type === 'dango') { b.dango = t + T(12); this.text(x, y, 'DANGO FRENZY x2!', '#ff9fc0'); } else if (type === 'sushi') { b.sushi = t + T(10); this.text(x, y, 'SUSHI MAGNET!', '#ff8a7a'); } else if (type === 'taiyaki') { b.taiyaki = t + T(5); this.text(x, y, 'TAIYAKI PHASE!', '#e0a84e'); }
  }

  updatePearls() {
    const p = this.p, out = [];
    for (const q of this.pearls) {
      const sp = dhyp(q.vx, q.vy);
      if (sp > q.min) { q.vx *= 0.94; q.vy *= 0.94; } else if (sp > 0) { q.vx *= q.min / sp; q.vy *= q.min / sp; }
      q.x += q.vx; q.y += q.vy;
      if (--q.life <= 0 || q.x < -70 || q.x > this.W + 70 || q.y < -70 || q.y > this.H + 70) continue;
      if (q.pearl && dhyp(q.x - p.x, q.y - p.y) < this.pickupR) {
        const got = Math.round(140 * this.waveMult * this.combo);
        this.addScore(got); this.text(q.x, q.y, `+${got}`, '#ffb7e0'); this.ev('sfx', { n: 'collectible', x: q.x });
        continue;
      }
      out.push(q);
    }
    this.pearls = out;
  }

  // ---- DVD corner easter egg ----
  cornerHit() {
    const p = this.p;
    if (this.dvdWave === this.wave || this.dvd) { this.text(p.x, p.y - 20, 'CORNER HIT!', '#00f5ff'); return; }
    this.dvdWave = this.wave;
    this.addScore(150 * this.waveMult);
    this.dvd = { wait: T(4), life: T(15), x: this.rng() * (this.W - 100), y: this.rng() * (this.H - 60), vx: this.rng() < 0.5 ? 1.8 : -1.8, vy: this.rng() < 0.5 ? 1.35 : -1.35, cornerT: -999, hue: 0 };
    this.ev('egg'); this.ev('sfx', { n: 'easterEgg' });
  }
  updateDvd() {
    const d = this.dvd, p = this.p;
    if (!d) return;
    if (d.wait > 0) { d.wait--; return; }
    if (--d.life <= 0) { this.dvd = null; this.text(d.x, d.y, 'DVD ESCAPED!', '#ff6600'); return; }
    d.x += d.vx; d.y += d.vy;
    const xHit = d.x <= 0 || d.x >= this.W - 58, yHit = d.y <= 0 || d.y >= this.H - 35;
    if (xHit) { d.vx *= -1; d.x = clamp(d.x, 0, this.W - 58); }
    if (yHit) { d.vy *= -1; d.y = clamp(d.y, 0, this.H - 35); }
    if (xHit || yHit) { d.hue++; if (xHit && yHit) d.cornerT = this.tick; }
    if (p.x + p.r > d.x && p.x - p.r < d.x + 58 && p.y + p.r > d.y && p.y - p.r < d.y + 35) {
      const perfect = this.tick - d.cornerT < T(0.35);
      const jackpot = Math.round((perfect ? 3000 : 1200) * this.waveMult);
      this.addScore(jackpot); this.stats.dvd++; if (perfect) this.stats.perfectDvd++;
      this.text(d.x, d.y - 16, perfect ? `PERFECT CATCH! +${jackpot}` : `DVD CAUGHT! +${jackpot}`, '#ffd700');
      const roll = this.rng();
      this.activate(roll < 0.3 ? 'shield' : roll < 0.6 ? 'multishot' : 'shoot', d.x, d.y + 18);
      this.ev('confetti'); this.ev('sfx', { n: 'powerup', x: d.x });
      this.dvd = null;
    }
  }

  // Cheap fingerprint of the run, used by tests and replay verification.
  hash() {
    const p = this.p;
    return [this.tick, this.score, this.wave, p.lives, Math.round(p.x * 100), Math.round(p.y * 100), this.enemies.length, this.bullets.length].join(':');
  }
}
