// Wires the simulation to the page: game loop, modes, menus, results.
import { Sim, HZ, F, SIM_VERSION } from './sim.js';
import { Renderer } from './render.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { botInput } from './bot.js';
import { Recorder, packRun, simFromRun } from './replay.js';
import { net } from './net.js';
import { loadProfile, saveProfile, shipUnlocked, recordRun } from './meta.js';
import { $, show, esc, fmt, toast, miniBoard, fullBoard, shareCard, shareResult } from './ui.js';
import { PERKS, SHIPS, ACHIEVEMENTS, FALLBACK_LORE, GAME_VERSION, STUDIO } from './data.js';
import { hashSeed } from './rng.js';

const STEP = 1000 / HZ;
const profile = loadProfile(), set = profile.settings;
const arena = $('gameArena');
const R = new Renderer($('gameCanvas'), set);
const A = new Audio(set);
const I = new Input(arena, set, { pause: () => togglePause(), mute: () => toggleMute(), any: (e) => onAnyInput(e),
  lockLost: () => { if (state === 'playing' && sim.phase !== 'perk') togglePause(); }, // Esc released the mouse
  arenaClick: () => { if (state === 'playing' && sim.phase !== 'perk') I.lock(); } });

let sim, rec = null, ghost = null, run = null;
let state = 'attract'; // attract | countdown | playing | paused | result
let acc = 0, last = 0, hitstop = 0, pendingPick = 0, demoPlayer = null;
let home = { all: [], weekly: [], daily: [], legacy: null, lore: FALLBACK_LORE, dailyInfo: null };
let lastEntryId = null, hudCache = '';
const DEV = /^(localhost|127.0.0.1)$/.test(location.hostname);
let autopilot = false; // local play-testing only: lets the bot fly a real run

const initialsOf = (v) => (v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
const randomSeed = () => (Math.random() * 4294967296) >>> 0;

function arenaSize() {
  const portrait = window.innerWidth <= 768 && window.innerHeight > window.innerWidth;
  arena.classList.toggle('portrait', portrait);
  return portrait ? { W: 450, H: 700 } : { W: 800, H: 600 };
}
function fit() { R.resize(sim.W, sim.H); I.scale = R.scale; }

// ---------- attract mode ----------
function startAttract() {
  I.unlock();
  state = 'attract'; run = null; ghost = null; rec = null; demoPlayer = null;
  const size = arenaSize();
  let best = null;
  try { best = JSON.parse(localStorage.getItem('spaceEscapeBestRun')); } catch (e) { /* no saved run */ }
  const replay = best && best.W === size.W && best.H === size.H ? simFromRun(best, false) : null;
  if (replay) { sim = replay.sim; demoPlayer = replay.player; } else sim = new Sim({ seed: randomSeed(), ...size, mode: 'demo' });
  sim.events.length = 0; R.banner = null; R.parts.length = 0;
  fit();
  A.music(false);
  $('startScreen').classList.remove('hide');
  show('rivalHud', false);
  refreshHome();
}

// ---------- starting a run ----------
function begin(cfg) {
  run = { attackIn: 0, seenSent: 0, lastSync: 0, timeline: [], ...cfg };
  const size = arenaSize();
  sim = new Sim({ seed: cfg.seed, ...size, mode: cfg.mode, ship: profile.ship, targetWave: cfg.targetWave || 0 });
  rec = new Recorder(); ghost = cfg.ghost ? cfg.ghost(size) : null;
  acc = 0; hitstop = 0; pendingPick = 0; lastEntryId = null;
  R.parts.length = 0; R.junk.length = 0;
  fit(); I.reset();
  $('startScreen').classList.add('hide');
  for (const id of ['gameOver', 'duelResult', 'perkModal', 'pauseOverlay', 'duelModal', 'hangarModal', 'recordsModal', 'settingsModal', 'aboutModal']) show(id, false);
  $('touchControls').classList.toggle('show', I.isTouch);
  if (I.isTouch && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
  I.lock();
  state = 'countdown';
  const go = () => countdown(() => { state = 'playing'; last = performance.now(); A.music(true); });
  if (cfg.intro) duelIntro(cfg.intro, go); else go();
}

function countdown(done) {
  const steps = ['3', '2', '1', 'GO!'];
  let i = 0;
  const tick = () => {
    if (state !== 'countdown') { show('countdownOverlay', false); return; }
    if (i >= steps.length) { show('countdownOverlay', false); done(); return; }
    showCount(steps[i++]);
    setTimeout(tick, 700);
  };
  tick();
}
function showCount(s) {
  const el = $('countdownOverlay');
  el.textContent = s; el.classList.add('show'); el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse');
  A.sfx(s === 'GO!' ? 'go' : 'count');
  clearTimeout(showCount.t); showCount.t = setTimeout(() => el.classList.remove('show'), 650);
}

async function startSolo() {
  I.lock();
  const s = await net.start('solo');
  begin({ mode: 'solo', seed: s ? s.seed : randomSeed(), token: s ? s.token : null });
}

async function startDaily() {
  I.lock();
  const [s, g] = await Promise.all([net.start('daily'), net.ghost('daily')]);
  const day = new Date().toISOString().slice(0, 10);
  begin({
    mode: 'daily', seed: s ? s.seed : hashSeed('space-escape-daily-' + day), token: s ? s.token : null,
    ghost: (size) => { // race the best recorded run of the day, if it was flown on the same arena shape
      const r = g && g.run && g.run.W === size.W && g.run.H === size.H ? simFromRun(g.run) : null;
      return r ? { sim: r.sim, label: g.initials || 'BEST', drive: () => r.player.next(r.sim) } : null;
    }
  });
  if (!s) toast('OFFLINE', 'Playing the daily seed locally. The score will not be posted.');
}

function botGhost(size, seed, targetWave) {
  const gs = new Sim({ seed, ...size, mode: 'duel', targetWave, quiet: true });
  return { sim: gs, label: 'ACE', bot: true, drive: () => { const b = botInput(gs); gs.step(b.f, b.dx, b.dy); } };
}

// ---------- the loop ----------
function tick() {
  let inp;
  if (state === 'attract') {
    if (demoPlayer) { if (!demoPlayer.next(sim)) { startAttract(); return; } inp = null; } else inp = botInput(sim);
  } else {
    inp = I.poll(sim);
    if (autopilot) { inp = botInput(sim); if (inp.f >> 4) show('perkModal', false); } else if (sim.phase === 'perk') { inp = { f: pendingPick << 4, dx: 0, dy: 0 }; pendingPick = 0; } else if (run.attackIn > 0) { inp.f |= F.ATTACK; run.attackIn--; }
    if (sim.phase !== 'perk' || inp.f >> 4) rec.push(inp.f, inp.dx, inp.dy);
  }
  if (inp) sim.step(inp.f, inp.dx, inp.dy);
  if (ghost && ghost.sim.phase !== 'over' && ghost.sim.phase !== 'done') ghost.drive();
  if (state === 'playing' && run.mode === 'duel' && sim.tick - run.lastSync >= HZ) { run.lastSync = sim.tick; syncDuel(); }
  const evs = sim.events.splice(0);
  for (const e of evs) handle(e);
  if (state === 'attract' && sim.phase === 'over') startAttract();
}

function handle(e) {
  const live = state !== 'attract';
  R.fx(e);
  switch (e.k) {
    case 'sfx': if (live) A.sfx(e.n, e.x === undefined ? 0 : (e.x / sim.W) * 2 - 1); break;
    case 'hitstop': if (live && !set.reducedMotion) hitstop = e.ms; break;
    case 'vibe': if (live && I.isTouch && navigator.vibrate) { try { navigator.vibrate(e.ms); } catch (err) { /* not allowed: ignore */ } } break;
    case 'count': if (live) showCount(e.s); break;
    case 'perk': if (live) showPerks(); break;
    case 'music': if (live) A.music(true, e.theme); break;
    case 'banner':
      if (e.boss && live) { const t = home.lore.taunts; if (t && t.length) setTimeout(() => R.text(sim.W / 2, sim.H * 0.2, `"${t[sim.bossCycle % t.length]}"`, '#ffd166', true), 900); }
      break;
    case 'evo': if (live) toast('EVOLUTION', e.name); break;
    case 'over': if (live) endRun(false); break;
    case 'done': if (live) endRun(true); break;
  }
}

function frame(t) {
  requestAnimationFrame(frame);
  const dt = Math.min(100, t - last); last = t;
  const running = state === 'playing' || state === 'attract';
  if (running) {
    if (hitstop > 0) hitstop -= dt; else acc += dt;
    let n = 0;
    while (acc >= STEP && n++ < 5) { acc -= STEP; tick(); if (state !== 'playing' && state !== 'attract') break; }
    if (n >= 5) acc = 0; // tab was hidden or the device is too slow: drop the backlog rather than fast-forward
  }
  R.cursor = I.locked && state === 'playing' ? I.target : null;
  R.draw(sim, running ? acc / STEP : 1, state === 'attract' ? null : ghost, t);
  hud();
}

function hud() {
  const p = sim.p, t = sim.tick, b = sim.buffs, buffs = [];
  if (p.shield > 0) buffs.push(`<span class="buff-shield">🛡 SHIELD x${p.shield}</span>`);
  if (sim.rapid > 0) buffs.push(`<span class="buff-rapid">⚡ RAPID FIRE x${sim.rapid}${p.heat > 1 ? ` | HEAT ${Math.round(p.heat)}%` : ''}</span>`);
  if (sim.multi > 0) buffs.push(`<span class="buff-multishot">🔱 MULTI-SHOT x${sim.shotCount + sim.multi}</span>`); else if (sim.shotCount > 1) buffs.push(`<span class="buff-multishot">🔱 SPREAD FIRE x${sim.shotCount}</span>`);
  if (sim.autoUnlocked) buffs.push(`<span class="buff-rapid">AUTO FIRE ${p.autoFire ? 'ON' : 'OFF'}</span>`);
  if (sim.streak) buffs.push(`<span class="buff-shield">NO-HIT STREAK x${sim.streak}</span>`);
  for (const id in sim.evo) if (sim.evo[id]) buffs.push(`<span class="buff-multishot">★ ${id.toUpperCase()}</span>`);
  if (b.mochi > t) buffs.push('<span class="buff-rapid">⚪ MOCHI OVERDRIVE</span>');
  if (b.dango > t) buffs.push('<span class="buff-multishot">🍡 DANGO FRENZY x2</span>');
  if (b.sushi > t) buffs.push('<span class="buff-shield">🍣 SUSHI MAGNET</span>');
  if (b.taiyaki > t) buffs.push('<span class="buff-shield">🐟 TAIYAKI PHASE</span>');
  if (sim.mutator) buffs.push(`<span class="buff-rapid">☄ ${sim.mutator.name}</span>`);
  const perkTotal = Object.values(sim.perks).reduce((a, v) => a + v, 0), bomb = Math.floor(sim.bomb);
  const threat = sim.pressure < 0.9 ? 'EASING' : sim.pressure < 1.15 ? 'CALM' : sim.pressure < 1.4 ? 'RISING' : 'HIGH';
  const key = [sim.score, p.lives, sim.wave, sim.combo, perkTotal, bomb, threat, buffs.join('')].join('|');
  if (key === hudCache) return;
  hudCache = key;
  $('score').textContent = fmt(sim.score); $('lives').textContent = p.lives; $('wave').textContent = sim.wave;
  $('combo').textContent = `${sim.combo}x`; $('perkCount').textContent = perkTotal; $('threat').textContent = threat;
  $('activeBuffs').innerHTML = buffs.join('');
  $('bombFill').style.width = `${bomb}%`;
  $('bombMeter').classList.toggle('ready', bomb >= 100); $('btnBomb').classList.toggle('ready', bomb >= 100);
  $('bombLabel').textContent = bomb >= 100 ? 'NOVA BOMB READY' : 'NOVA BOMB';
  A.setIntensity(Math.min(3, Math.floor((sim.wave - 1) / 2) + (sim.combo >= sim.comboCap ? 1 : 0)));
  if (run && run.mode === 'duel') rivalHud();
}

// ---------- perks ----------
function showPerks() {
  const box = $('perkOptions');
  box.innerHTML = '';
  sim.choices.forEach((id, i) => {
    const k = PERKS.find((x) => x.id === id), lvl = sim.L(id), card = document.createElement('button');
    card.type = 'button'; card.className = 'perk-card' + (k.rare ? ' perk-card-rare' : '');
    card.innerHTML = `<div class="perk-icon">${k.icon}</div><div class="perk-name">${esc(k.name)}${lvl ? ` <span class="perk-level">Lv${lvl}</span>` : ''}</div><div class="perk-desc">${esc(k.desc)}</div><div class="perk-level">[${i + 1}]</div>`;
    card.addEventListener('click', () => pick(i + 1));
    box.appendChild(card);
  });
  I.unlock(); // free the mouse to click a perk
  show('perkModal');
}
function pick(n) { if (state === 'playing' && sim.phase === 'perk' && n <= sim.choices.length) { pendingPick = n; show('perkModal', false); I.lock(); } }

// ---------- pause / mute ----------
function togglePause() {
  if (state !== 'playing' && state !== 'paused') return;
  state = state === 'playing' ? 'paused' : 'playing';
  const paused = state === 'paused';
  $('pauseBtn').textContent = paused ? '▶' : '⏸';
  show('pauseOverlay', paused); A.setPaused(paused);
  if (paused) I.unlock(); else I.lock();
  if (!paused) last = performance.now();
}
function toggleMute() {
  set.muted = !set.muted; A.setMuted(set.muted); saveProfile(profile);
  $('muteBtn').textContent = set.muted ? '🔇' : '🔊';
}
function onAnyInput(e) {
  A.unlock(); A.setMuted(set.muted);
  if (e.type !== 'keydown') return;
  if (state === 'playing' && sim.phase === 'perk' && /^(Digit|Numpad)[123]$/.test(e.code)) pick(Number(e.code.slice(-1)));
  if (state === 'attract' && e.code === 'Enter' && !document.querySelector('.about-modal.show, .duel-modal.show')) startSolo();
}

// ---------- end of run ----------
function endRun(completed) {
  state = 'result'; I.unlock();
  A.music(false); A.sfx(completed ? 'easterEgg' : 'damage');
  show('perkModal', false); show('rivalHud', false); $('touchControls').classList.remove('show');
  const duel = run.mode === 'duel';
  let rivalScore = 0;
  if (duel) {
    if (ghost && ghost.bot) { let guard = 0; while (ghost.sim.phase !== 'over' && ghost.sim.phase !== 'done' && guard++ < 40000) ghost.drive(); run.rival.score = ghost.sim.score; }
    rivalScore = Math.max(0, Number(run.rival.score) || 0);
  }
  const won = duel && completed && sim.score > rivalScore;
  const news = recordRun(profile, sim, { wonContract: won });
  for (const a of news.newAch) toast('ACHIEVEMENT UNLOCKED', a.name);
  for (const id of news.newShips) toast('NEW SHIP UNLOCKED', SHIPS[id].name);
  if (news.newAch.length || news.newShips.length) A.sfx('achievement');
  const packed = packRun(sim, rec);
  if (!duel && sim.score >= profile.stats.bestScore && packed.log.length < 400000) { try { localStorage.setItem('spaceEscapeBestRun', JSON.stringify(packed)); } catch (e) { /* storage full: skip the demo replay */ } }
  if (duel) { finishDuel(completed, won, rivalScore); return; }
  const submit = () => submitScore(packed);
  if (!run.token) showResult(null); else if (!profile.initials) {
    $('initialsScore').textContent = `${fmt(sim.score)} • W${sim.wave}`; $('initialsInput').value = '';
    show('initialsModal'); setTimeout(() => $('initialsInput').focus(), 50);
    run.afterInitials = submit;
  } else submit();
}

async function submitScore(packed) {
  const s = sim.stats;
  const payload = {
    token: run.token, initials: profile.initials, score: sim.score, wave: sim.wave, ship: sim.shipId, mode: run.mode, ticks: sim.tick,
    stats: { kills: s.kills, grazes: s.grazes, bosses: s.bosses, bombs: s.bombs }, version: GAME_VERSION,
    replay: packed.log.length < 400000 ? packed : null
  };
  const res = await net.submit(payload);
  // unreachable, rate limited or a server fault: park the run and try again on the next visit
  if (!res || res.status === 429 || res.status >= 500) { try { localStorage.setItem(PENDING, JSON.stringify({ at: Date.now(), payload })); } catch (e) { /* too big to store */ } }
  if (res && res.home) { applyHome(res.home); lastEntryId = res.id; }
  showResult(res);
}

function showResult(res) {
  const best = sim.score >= profile.stats.bestScore && sim.score > 0;
  $('resultTitle').textContent = best ? 'NEW PERSONAL BEST!' : 'MISSION FAILED';
  $('resultLine').textContent = best ? 'Incredible performance in the void!' : 'The page remains lost in space...';
  $('finalScore').textContent = `${fmt(sim.score)} • W${sim.wave}`;
  const r = res && res.ranks;
  $('rankLine').textContent = !run.token ? 'OFFLINE: SCORE NOT POSTED' : !res ? 'LEADERBOARD UNREACHABLE. SCORE SAVED, WILL RETRY.' : res.error ? `NOT POSTED: ${String(res.error).toUpperCase()}` : run.mode === 'daily' ? `DAILY RANK #${r.daily}` : `ALL-TIME #${r.all} • THIS WEEK #${r.weekly}`;
  const s = sim.stats;
  $('runStats').innerHTML = [['KILLS', s.kills], ['GRAZES', s.grazes], ['BOSSES', s.bosses], ['MAX COMBO', `${s.maxCombo}x`], ['BOMBS', s.bombs], ['DASHES', s.dashes]].map(([k, v]) => `<div><b>${v}</b>${k}</div>`).join('');
  $('gameOverBoardTitle').textContent = run.mode === 'daily' ? "TODAY'S DAILY" : 'TOP PILOTS';
  miniBoard($('gameOverLeaderboardList'), run.mode === 'daily' ? home.daily : home.all, lastEntryId, 5);
  show('gameOver');
}

async function share(title) {
  const lines = [`${SHIPS[sim.shipId].name} • ${sim.stats.kills} kills • ${sim.stats.grazes} grazes`, location.host || ''];
  const blob = await shareCard({ title, score: sim.score, wave: sim.wave, lines, shipImg: R.sp.ships[Math.min(6, sim.wave) - 1] });
  if (blob) shareResult(blob, `I scored ${fmt(sim.score)} on wave ${sim.wave} in 404: Space Escape by ${STUDIO}.`);
}

// ---------- home data: boards, lore ----------
function applyHome(h) {
  home = { ...home, ...h, lore: h.lore && h.lore.briefing ? h.lore : home.lore };
  const top = home.all[0];
  $('topScoreValue').textContent = top ? `${fmt(top.score)} • W${top.wave}` : fmt(profile.stats.bestScore);
  miniBoard($('startLeaderboardList'), home.all, lastEntryId, 3);
  $('legacyLine').textContent = home.legacy ? `SEASON 1 LEGEND: ${home.legacy.initials} ${fmt(home.legacy.score)}` : '';
  $('briefing').textContent = home.lore.briefing || '';
}
const PENDING = 'spaceEscapePending';
async function retryPending() {
  let p = null;
  try { p = JSON.parse(localStorage.getItem(PENDING)); } catch (e) { /* nothing parked */ }
  if (!p) return;
  const stale = Date.now() - p.at > 5.5 * 3600 * 1000; // run tokens last 6 hours
  const res = stale ? { error: 'expired' } : await net.submit(p.payload);
  if (!res || res.status === 429 || res.status >= 500) return; // still unreachable: keep it for next time
  localStorage.removeItem(PENDING);
  if (res.home) { applyHome(res.home); toast('SAVED SCORE POSTED', `${fmt(p.payload.score)} is on the board`); }
}

async function refreshHome() {
  const h = await net.home();
  if (h) applyHome(h); else applyHome({});
  retryPending();
  const q = await net.queue();
  $('rivalQueueCount').textContent = `RIVAL QUEUE: ${q && q.request ? 1 : 0}`;
}

// ---------- rival contract ----------
const duelUi = { mode: 'request', requestId: null, key: null, waiting: false };

async function openDuel() {
  $('duelInitialsInput').value = profile.initials; $('duelStatus').textContent = 'CHECKING CONTRACT QUEUE...';
  show('duelModal'); setTimeout(() => $('duelInitialsInput').focus(), 50);
  const q = await net.queue();
  duelUi.contract = q ? q.contract : null;
  if (q && q.request) { duelUi.mode = 'accept'; duelUi.requestId = q.request.id; $('duelAcceptButton').textContent = 'ACCEPT CONTRACT'; $('duelStatus').textContent = `${q.request.initials} REQUESTED A CONTRACT`; } else {
    duelUi.mode = 'request'; duelUi.requestId = null; $('duelAcceptButton').textContent = 'REQUEST CONTRACT';
    $('duelStatus').textContent = q ? 'NO OPEN CONTRACT. REQUEST A RIVAL OR FLY THE BOT.' : 'OFFLINE. YOU CAN STILL FLY THE BOT.';
  }
}
function duelInitials() { const v = initialsOf($('duelInitialsInput').value) || 'AAA'; profile.initials = v; saveProfile(profile); return v; }

async function duelGo() {
  const initials = duelInitials();
  if (duelUi.mode === 'accept' && duelUi.requestId) {
    const r = await net.queuePost({ action: 'accept', requestId: duelUi.requestId, initials });
    if (r && r.match) launchDuel(initials, r.match, 'playerTwo', r.key); else openDuel();
    return;
  }
  const r = await net.queuePost({ action: 'request', initials });
  if (!r || !r.request) { $('duelStatus').textContent = 'CONTRACT REQUEST FAILED. TRY THE BOT.'; return; }
  duelUi.requestId = r.request.id; duelUi.key = r.key; duelUi.waiting = true;
  $('duelAcceptButton').disabled = true;
  const t0 = Date.now();
  while (duelUi.waiting && Date.now() - t0 < 60000) {
    $('duelStatus').textContent = `REQUEST SENT. WAITING FOR OPPONENT... ${Math.ceil((60000 - (Date.now() - t0)) / 1000)}`;
    const q = await net.queue(duelUi.requestId);
    if (q && q.match) { duelUi.waiting = false; $('duelAcceptButton').disabled = false; launchDuel(initials, q.match, 'playerOne', duelUi.key); return; }
    await new Promise((res) => setTimeout(res, 3000));
  }
  $('duelAcceptButton').disabled = false;
  if (!duelUi.waiting) return;
  duelUi.waiting = false;
  $('duelStatus').textContent = 'NO OPPONENT JOINED. TRY AGAIN OR FLY THE BOT.';
  net.queuePost({ action: 'cancel', requestId: duelUi.requestId, key: duelUi.key }); duelUi.requestId = null;
}
function closeDuel() {
  if (duelUi.waiting && duelUi.requestId) net.queuePost({ action: 'cancel', requestId: duelUi.requestId, key: duelUi.key });
  duelUi.waiting = false; duelUi.requestId = null; $('duelAcceptButton').disabled = false;
  show('duelModal', false);
}
function launchDuel(initials, match, role, key) {
  const rival = role === 'playerOne' ? match.playerTwo : match.playerOne;
  show('duelModal', false);
  begin({ mode: 'duel', seed: hashSeed(match.contract.seed), targetWave: match.contract.targetWave, initials, role, key, matchId: match.requestId, contractId: match.contract.id, rival: { initials: rival.initials, score: 0 }, intro: [initials, rival.initials] });
}
function duelBot() {
  I.lock();
  closeDuel();
  const initials = duelInitials(), day = new Date().toISOString().slice(0, 10);
  const seed = hashSeed(duelUi.contract ? duelUi.contract.seed : 'space-escape-rival-' + day) ^ randomSeed();
  begin({ mode: 'duel', seed, targetWave: 3, initials, rival: { initials: 'ACE', score: 0 }, intro: [initials, 'ACE'], ghost: (size) => botGhost(size, seed, 3) });
}
function duelIntro([you, rival], done) {
  $('duelPlayerInitials').textContent = you; $('duelRivalInitials').textContent = rival;
  $('rivalName').textContent = `RIVAL: ${rival}`; show('rivalHud'); show('duelIntro');
  setTimeout(() => { show('duelIntro', false); done(); }, 1600);
}
function rivalHud() {
  const rs = ghost && ghost.bot ? ghost.sim.score : Number(run.rival.score) || 0, d = sim.score - rs;
  $('rivalScore').textContent = `${fmt(rs)} PTS`;
  $('rivalDelta').textContent = d === 0 ? 'TIED' : d > 0 ? `AHEAD +${fmt(d)}` : `BEHIND ${fmt(-d)}`;
}
async function syncDuel() {
  run.timeline.push({ t: Math.floor(sim.tick / HZ), score: sim.score });
  if (!run.matchId) return;
  const r = await net.queuePost({ action: 'progress', requestId: run.matchId, role: run.role, key: run.key, score: sim.score, wave: sim.wave, sent: sim.attacksOut });
  if (!r || !r.match || !run || !run.matchId) return;
  const rival = run.role === 'playerOne' ? r.match.playerTwo : r.match.playerOne;
  if (!rival) return;
  run.rival.score = rival.score;
  const sent = Number(rival.sent) || 0;
  if (sent > run.seenSent) { run.attackIn += Math.min(3, sent - run.seenSent); run.seenSent = sent; } // their kills become our problem
}
function finishDuel(completed, won, rivalScore) {
  if (run.matchId) {
    net.queuePost({ action: 'progress', requestId: run.matchId, role: run.role, key: run.key, score: sim.score, wave: Math.min(4, sim.wave), sent: sim.attacksOut });
    net.duelResult({ contractId: run.contractId, initials: run.initials, score: sim.score, wave: Math.min(4, sim.wave), timeline: run.timeline.slice(0, 600) });
  }
  const tied = completed && sim.score === rivalScore;
  $('duelResultTitle').textContent = won ? 'CONTRACT WON' : tied ? 'CONTRACT TIED' : 'CONTRACT COMPLETE';
  $('duelResultStatus').textContent = completed ? (won ? 'YOU BEAT YOUR RIVAL' : tied ? 'SCORES ARE EVEN' : 'RIVAL TAKES THE CONTRACT') : 'CONTRACT LOST';
  $('duelResultPlayer').textContent = run.initials; $('duelResultPlayerScore').textContent = fmt(sim.score);
  $('duelResultRival').textContent = run.rival.initials; $('duelResultRivalScore').textContent = fmt(rivalScore);
  show('duelResult');
}

// ---------- menus ----------
function openHangar() {
  const grid = $('shipGrid');
  grid.innerHTML = '';
  Object.entries(SHIPS).forEach(([id, s], i) => {
    const open = shipUnlocked(profile, id), b = document.createElement('button');
    b.type = 'button'; b.className = `ship-card${profile.ship === id ? ' on' : ''}${open ? '' : ' locked'}`;
    b.innerHTML = `<img src="assets/player-ship-tier-${[1, 2, 5, 6][i] || 1}.png" alt=""><b>${esc(s.name)}</b><small>${esc(open ? s.desc : '🔒 ' + s.unlock.text)}</small>`;
    b.addEventListener('click', () => { if (!open) return; profile.ship = id; saveProfile(profile); openHangar(); });
    grid.appendChild(b);
  });
  show('hangarModal');
}

async function openRecords(tab = 'all') {
  show('recordsModal');
  document.querySelectorAll('#boardTabs button').forEach((b) => b.classList.toggle('on', b.dataset.board === tab));
  const body = $('recordsBody');
  if (tab === 'ach') {
    const got = Object.keys(profile.ach).length, st = profile.stats;
    body.innerHTML = `<p>${got} / ${ACHIEVEMENTS.length} unlocked • Best ${fmt(st.bestScore)} • Best wave ${st.bestWave} • ${st.runs} runs</p>` + ACHIEVEMENTS.map((a) => `<div class="ach${profile.ach[a.id] ? ' got' : ''}"><span>${profile.ach[a.id] ? '★' : '☆'}</span><span>${esc(a.name)}<small>${esc(a.desc)}</small></span></div>`).join('');
    return;
  }
  body.innerHTML = '<p>Loading...</p>';
  const r = await net.board(tab);
  if (r) fullBoard(body, r.entries, lastEntryId); else body.innerHTML = '<p>Leaderboard unavailable offline.</p>';
}

function openSettings() {
  $('setMusic').value = set.music; $('setSfx').value = set.sfx; $('setMotion').checked = set.reducedMotion; $('setShake').checked = set.shake;
  $('setColorblind').checked = set.colorblind; $('setLock').checked = set.lockMouse; $('setTouch').value = set.touchScheme;
  const grid = $('keyGrid');
  grid.innerHTML = '';
  for (const action of ['fire', 'dash', 'bomb', 'pause']) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = `${action.toUpperCase()}: ${set.keys[action].replace(/^Key|^Digit/, '')}`;
    b.addEventListener('click', () => { b.classList.add('wait'); b.textContent = `${action.toUpperCase()}: PRESS A KEY`; I.capture = (code) => { if (code !== 'Escape') set.keys[action] = code; saveProfile(profile); openSettings(); }; });
    grid.appendChild(b);
  }
  show('settingsModal');
}
function bindSettings() {
  const save = () => { saveProfile(profile); A.applyVolume(); };
  $('setMusic').addEventListener('input', (e) => { set.music = Number(e.target.value); save(); });
  $('setSfx').addEventListener('input', (e) => { set.sfx = Number(e.target.value); save(); });
  $('setMotion').addEventListener('change', (e) => { set.reducedMotion = e.target.checked; save(); });
  $('setShake').addEventListener('change', (e) => { set.shake = e.target.checked; save(); });
  $('setColorblind').addEventListener('change', (e) => { set.colorblind = e.target.checked; save(); });
  $('setLock').addEventListener('change', (e) => { set.lockMouse = e.target.checked; save(); });
  $('setTouch').addEventListener('change', (e) => { set.touchScheme = e.target.value; save(); });
}

function modalOpen(open) { // pause a live run while a menu covers it
  if (state === 'playing') togglePause();
  open();
}

function init() {
  const on = (id, fn) => $(id).addEventListener('click', (e) => { e.stopPropagation(); A.unlock(); A.setMuted(set.muted); fn(e); });
  on('startButton', startSolo); on('dailyButton', startDaily); on('duelButton', openDuel);
  on('hangarButton', openHangar); on('recordsButton', () => openRecords('all'));
  on('aboutBtn', () => modalOpen(() => show('aboutModal'))); on('settingsBtn', () => modalOpen(openSettings));
  on('pauseBtn', togglePause); on('resumeBtn', togglePause); on('muteBtn', toggleMute);
  on('quitBtn', () => { show('pauseOverlay', false); A.setPaused(false); $('pauseBtn').textContent = '⏸'; startAttract(); });
  on('duelAcceptButton', duelGo); on('duelBotButton', duelBot); on('duelCancelButton', closeDuel);
  on('retryBtn', () => (run.mode === 'daily' ? startDaily() : startSolo())); on('homeBtn', () => { show('gameOver', false); startAttract(); });
  on('shareBtn', () => share(run.mode === 'daily' ? 'DAILY CHALLENGE' : 'SINGLE PLAYER'));
  on('duelAgainBtn', () => { show('duelResult', false); startAttract(); }); on('duelShareBtn', () => share('RIVAL CONTRACT'));
  $('btnDash').addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); I.dashQ = true; });
  $('btnBomb').addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); I.bombQ = true; });
  on('initialsSave', saveInitials);
  $('initialsInput').addEventListener('keydown', (e) => { if (e.code === 'Enter') saveInitials(); });
  $('duelInitialsInput').addEventListener('keydown', (e) => { if (e.code === 'Enter') duelGo(); });
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('.about-modal').classList.remove('show')));
  document.querySelectorAll('#boardTabs button').forEach((b) => b.addEventListener('click', () => openRecords(b.dataset.board)));
  bindSettings();
  $('muteBtn').textContent = set.muted ? '🔇' : '🔊';
  $('versionLine').textContent = `v${GAME_VERSION} • The first game by ${STUDIO}`;
  if (I.isTouch) $('controlsText').textContent = 'Drag to fly and fire | DASH and BOMB buttons | Graze to charge the bomb';
  window.addEventListener('resize', () => { if (state === 'attract') startAttract(); else fit(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'playing') togglePause(); });
  let installEvt = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; $('installBtn').hidden = false; });
  $('installBtn').addEventListener('click', () => { if (installEvt) { installEvt.prompt(); installEvt = null; $('installBtn').hidden = true; } });
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !DEV) navigator.serviceWorker.register('sw.js').catch(() => {});
  startAttract();
  requestAnimationFrame((t) => { last = t; frame(t); });
}

function saveInitials() {
  profile.initials = initialsOf($('initialsInput').value) || 'AAA'; saveProfile(profile);
  show('initialsModal', false);
  if (run && run.afterInitials) { const f = run.afterInitials; run.afterInitials = null; f(); }
}

init();
if (DEV) window.__game = { get sim() { return sim; }, state: () => state, version: SIM_VERSION, auto: (on) => { autopilot = !!on; } };
