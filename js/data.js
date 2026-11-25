// Game content and tuning. Pure data: safe to import from the sim, the UI and Node tools.

export const GAME_VERSION = '2.1.0';
export const STUDIO = 'Nicholas Tech LLC';

// Tuning knobs. Speeds are pixels per tick at 60 ticks per second.
export const TUNE = {
  pace: 1.5,            // global spawn pace multiplier over the v1 timings
  ptrSpeedMul: 2.4,     // pointer/touch follow speed relative to keyboard speed
  dashTicks: 9, dashSpeedMul: 3.2, dashCooldown: 1.2,
  grazeBand: 22, bulletGrazeBand: 16,
  bombEnemyDmg: 3, bombBossDmg: 6,
  eliteFromWave: 4, mutatorFromWave: 4, mutatorChance: 0.4,
  attackEveryKills: 12,
  bossHpBase: 1.5, bossHpWave: 0.6,    // boss health = base * (bossHpBase + bossHpWave * wave)
  rapidCap: 8, livesCap: 5, streakCap: 4
};

export const WEAPON_PERKS = ['rapidfire', 'spreadfire', 'pierce', 'autofire', 'directional', 'orbital', 'chain', 'homing'];

export const PERKS = [
  { id: 'rapidfire', name: 'Rapid Fire', icon: '⚡', desc: 'Fire faster.' },
  { id: 'spreadfire', name: 'Spread Fire', icon: '🔱', desc: 'Adds a forward shot, up to four.', max: 3 },
  { id: 'pierce', name: 'Piercing Rounds', icon: '➰', desc: 'Shots punch through an extra enemy.', max: 3 },
  { id: 'thruster', name: 'Thruster Boost', icon: '🚀', desc: 'Move faster with every control scheme.', max: 4 },
  { id: 'magnet', name: 'Salvage Magnet', icon: '🧲', desc: 'Pull in and collect items from farther away.', max: 4 },
  { id: 'hull', name: 'Reinforced Hull', icon: '❤️', desc: 'Gain an extra life now (5 lives at most).', max: 2 },
  { id: 'combo', name: 'Combo Mastery', icon: '🔥', desc: 'Raise the combo cap and combo window.', max: 4 },
  { id: 'scoresurge', name: 'Score Surge', icon: '💎', desc: 'Permanently boost all points earned.', max: 5 },
  { id: 'afterburner', name: 'Afterburner', icon: '💨', desc: 'Dash recharges 20% faster.', max: 2 },
  { id: 'grazer', name: 'Graze Engine', icon: '✨', desc: 'Grazes charge the bomb 40% faster.', max: 2 },
  { id: 'autofire', name: 'Auto-Fire', icon: '🔫', desc: 'Fires without holding the trigger. Tap fire to toggle.', once: true },
  { id: 'directional', name: 'Vector Thrusters', icon: '🎯', desc: 'RARE: shots fire in the direction you move.', rare: true, once: true },
  { id: 'orbital', name: 'Orbital Cannon', icon: '🌀', desc: 'RARE: replaces your weapons with a rotating cannon. Stack for more streams.', rare: true, max: 4 },
  { id: 'chain', name: 'Chain Lightning', icon: '🌩️', desc: 'RARE: a kill arcs to a nearby enemy.', rare: true, once: true },
  { id: 'homing', name: 'Homing Rounds', icon: '🧭', desc: 'RARE: shots lock on and pursue the nearest enemy.', rare: true, once: true }
];

// Evolutions switch on automatically while their requirements are met.
export const EVOLUTIONS = [
  { id: 'storm', name: 'Storm Lance', req: { chain: 1, pierce: 2 }, desc: 'Chain Lightning jumps to three targets.' },
  { id: 'swarm', name: 'Swarm Missiles', req: { homing: 1, spreadfire: 2 }, desc: 'Homing shots turn harder and burst on impact.' },
  { id: 'coolant', name: 'Coolant Loop', req: { rapidfire: 3, thruster: 2 }, desc: 'Weapons never overheat.' },
  { id: 'jackpot', name: 'Jackpot Protocol', req: { combo: 2, scoresurge: 2 }, desc: 'Longer combos and triple graze score.' }
];

export const SHIPS = {
  vanguard: { name: 'Vanguard', desc: 'Balanced. 3 lives.', speed: 5, lives: 3, radius: 11, fireMul: 1, dashMul: 1, bombMul: 1, glow: '#00f5ff' },
  dart: { name: 'Dart', desc: 'Fast and fragile. 2 lives, quicker guns and dash.', speed: 6.2, lives: 2, radius: 9, fireMul: 0.85, dashMul: 0.7, bombMul: 1, glow: '#39ff14', unlock: { stat: 'bestWave', n: 5, text: 'Reach wave 5' } },
  bastion: { name: 'Bastion', desc: 'Slow tank. 4 lives and a starting shield.', speed: 4.2, lives: 4, radius: 13, fireMul: 1, dashMul: 1.15, bombMul: 1, startShield: true, glow: '#ffd700', unlock: { stat: 'bestScore', n: 250000, text: 'Score 250,000' } },
  wraith: { name: 'Wraith', desc: 'Glass cannon. 2 lives, homing rounds, bomb charges 50% faster.', speed: 5.2, lives: 2, radius: 10, fireMul: 1, dashMul: 1, bombMul: 1.5, startPerk: 'homing', glow: '#b06bff', unlock: { stat: 'totalGrazes', n: 150, text: 'Graze 150 times in total' } }
};

export const MUTATORS = [
  { id: 'blitz', name: 'BLITZ', desc: 'Enemies 30% faster, +30% points', speed: 1.3, pts: 1.3 },
  { id: 'swarm', name: 'SWARM', desc: 'More enemies, +25% points', spawn: 1.6, pts: 1.25 },
  { id: 'armored', name: 'ARMORED', desc: 'Enemies take one more hit, +40% points', hp: 1, pts: 1.4 },
  { id: 'goldrush', name: 'GOLD RUSH', desc: 'Donuts everywhere', donuts: 3, pts: 1 },
  { id: 'solar', name: 'SOLAR STORM', desc: 'Stray plasma crosses the arena, +40% points', hazard: true, pts: 1.4 }
];

export const ELITE_AFFIXES = ['shielded', 'swift', 'volatile', 'shooter'];
export const AFFIX_COLOR = { shielded: '#ffd700', swift: '#39ff14', volatile: '#ff6600', shooter: '#ff2d95' };

export const ACHIEVEMENTS = [
  { id: 'firstboss', name: 'First Blood', desc: 'Defeat a boss.' },
  { id: 'boba', name: 'Tea Time', desc: 'Splash the Boba Colossus.' },
  { id: 'dvd', name: 'Screensaver', desc: 'Catch the DVD logo.' },
  { id: 'perfectdvd', name: 'The Corner', desc: 'Land a perfect DVD corner catch.' },
  { id: 'nohit3', name: 'Untouchable', desc: 'Clear three waves in a row without damage.' },
  { id: 'wave10', name: 'Deep Space', desc: 'Reach wave 10.' },
  { id: 'score100k', name: 'Six Figures', desc: 'Score 100,000.' },
  { id: 'score500k', name: 'Half a Million', desc: 'Score 500,000.' },
  { id: 'score1m', name: 'Legend', desc: 'Score 1,000,000.' },
  { id: 'evolve', name: 'Evolution', desc: 'Unlock a weapon evolution.' },
  { id: 'graze50', name: 'Thread the Needle', desc: 'Graze 50 times in one run.' },
  { id: 'bomb', name: 'Clean Slate', desc: 'Detonate a bomb.' },
  { id: 'contract', name: 'Contract Killer', desc: 'Win a Rival Contract.' },
  { id: 'daily', name: 'Daily Driver', desc: 'Finish a Daily Challenge run.' },
  { id: 'cow', name: 'Udder Chaos', desc: 'Defeat Moolissa the Mad Cow.' },
  { id: 'lilo', name: 'Good Girl', desc: 'Win a game of fetch against Lilo.' }
];

// Used when the server has no AI key configured, or is unreachable.
export const FALLBACK_LORE = {
  briefing: 'Signal lost. The page you wanted drifted past the last beacon. Bring it home, pilot.',
  taunts: ['You are 404 too.', 'Nothing here but me.', 'Turn back, little link.', 'This sector is not indexed.', 'I ate your page.']
};
