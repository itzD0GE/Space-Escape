// Run with: node test/sim.test.mjs
// Checks that the simulation is deterministic, that a recorded run replays to the
// same result, and that the game actually progresses under the autopilot.
import assert from 'node:assert/strict';
import { Sim, HZ } from '../js/sim.js';
import { botInput } from '../js/bot.js';
import { Recorder, packRun, verifyRun } from '../js/replay.js';

function fly(seed, maxTicks, opts = {}) {
  const sim = new Sim({ seed, quiet: true, ...opts }), rec = new Recorder();
  let guard = 0;
  while (sim.phase !== 'over' && sim.phase !== 'done' && sim.tick < maxTicks && guard++ < maxTicks * 2) {
    const { f, dx, dy } = botInput(sim);
    if (sim.phase !== 'perk' || f >> 4) rec.push(f, dx, dy);
    sim.step(f, dx, dy);
  }
  return { sim, rec };
}

const MIN = 60 * HZ;
const a = fly(1234, 4 * MIN), b = fly(1234, 4 * MIN), c = fly(99, 4 * MIN);
assert.equal(a.sim.hash(), b.sim.hash(), 'same seed and inputs must give the same run');
assert.notEqual(a.sim.hash(), c.sim.hash(), 'different seeds must give different runs');
assert.ok(Number.isFinite(a.sim.score) && Number.isFinite(a.sim.p.x), 'no NaN in state');

const run = packRun(a.sim, a.rec);
const check = verifyRun(run);
assert.ok(check.ok, `replay must reproduce the run (got ${check.score} W${check.wave}, want ${run.score} W${run.wave})`);
assert.equal(verifyRun({ ...run, score: run.score + 1 }).ok, false, 'a tampered score must fail verification');

const duel = fly(7, 10 * MIN, { mode: 'duel', targetWave: 3 });
assert.ok(['done', 'over'].includes(duel.sim.phase) || duel.sim.tick >= 10 * MIN, 'duel ends or times out');

const rows = [];
let reached2 = 0;
for (let seed = 1; seed <= 8; seed++) {
  const r = fly(seed, 8 * MIN).sim;
  if (r.wave >= 2) reached2++;
  rows.push({ seed, wave: r.wave, score: r.score, lives: r.p.lives, secs: Math.round(r.tick / HZ), phase: r.phase, kills: r.stats.kills, grazes: r.stats.grazes, bosses: r.stats.bosses });
}
console.table(rows);
assert.ok(reached2 >= 6, `autopilot should clear wave 1 on most seeds (did on ${reached2}/8)`);
console.log(`ok - replay ${Math.round(run.log.length / 1024)} KB for ${Math.round(run.ticks / HZ)}s`);
