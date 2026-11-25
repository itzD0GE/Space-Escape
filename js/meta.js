// The pilot's local profile: settings, lifetime stats, unlocks and achievements.
import { SHIPS, ACHIEVEMENTS } from './data.js';

const KEY = 'spaceEscapeProfile';
const DEFAULTS = {
  settings: { reducedMotion: false, colorblind: false, shake: true, lockMouse: true, touchScheme: 'direct', music: 0.7, sfx: 1, muted: false, keys: { fire: 'Space', dash: 'ShiftLeft', bomb: 'KeyE', pause: 'KeyP' } },
  stats: { bestScore: 0, bestWave: 1, totalGrazes: 0, totalKills: 0, runs: 0 },
  ach: {}, ship: 'vanguard', initials: ''
};

export function loadProfile() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { /* private mode or corrupt: start fresh */ }
  const p = { ...DEFAULTS, ...saved };
  p.settings = { ...DEFAULTS.settings, ...saved.settings, keys: { ...DEFAULTS.settings.keys, ...(saved.settings && saved.settings.keys) } };
  p.stats = { ...DEFAULTS.stats, ...saved.stats };
  p.ach = { ...saved.ach };
  if (saved.settings === undefined && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) p.settings.reducedMotion = true;
  if (!shipUnlocked(p, p.ship)) p.ship = 'vanguard';
  return p;
}

export function saveProfile(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* storage full or blocked: play on without saving */ }
}

export function shipUnlocked(p, id) {
  const u = SHIPS[id] && SHIPS[id].unlock;
  return !!SHIPS[id] && (!u || p.stats[u.stat] >= u.n);
}

// Fold a finished run into the profile. Returns what is new, for toasts.
export function recordRun(p, sim, extra = {}) {
  const before = Object.keys(SHIPS).filter((id) => shipUnlocked(p, id));
  const s = p.stats, st = sim.stats;
  s.runs++; s.totalGrazes += st.grazes; s.totalKills += st.kills;
  s.bestScore = Math.max(s.bestScore, sim.score); s.bestWave = Math.max(s.bestWave, sim.wave);
  const earned = {
    firstboss: st.bosses > 0, boba: st.boba > 0, dvd: st.dvd > 0, perfectdvd: st.perfectDvd > 0, nohit3: st.maxStreak >= 3,
    wave10: sim.wave >= 10, score100k: sim.score >= 1e5, score500k: sim.score >= 5e5, score1m: sim.score >= 1e6,
    evolve: st.evos > 0, graze50: st.grazes >= 50, bomb: st.bombs > 0, contract: !!extra.wonContract, daily: sim.mode === 'daily', cow: st.cow > 0, lilo: st.lilo > 0
  };
  const newAch = ACHIEVEMENTS.filter((a) => earned[a.id] && !p.ach[a.id]);
  for (const a of newAch) p.ach[a.id] = Date.now();
  const newShips = Object.keys(SHIPS).filter((id) => shipUnlocked(p, id) && !before.includes(id));
  saveProfile(p);
  return { newAch, newShips };
}
