// Run with a local server up:  php -S localhost:8000   then   node test/api.test.mjs
// Exercises the real PHP API: run tokens, score submission, anti-cheat rejections,
// boards, daily ghost replay, and the Rival Contract queue with attacks.
import assert from 'node:assert/strict';
import { Sim } from '../js/sim.js';
import { botInput } from '../js/bot.js';
import { Recorder, packRun, verifyRun } from '../js/replay.js';

const BASE = process.env.API || 'http://localhost:8000/api/';
const get = async (p) => { const r = await fetch(BASE + p); return { status: r.status, body: await r.json() }; };
const post = async (p, b) => { const r = await fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, body: await r.json() }; };

function shortRun(seed, mode) {
  const sim = new Sim({ seed, mode, quiet: true }), rec = new Recorder();
  while (sim.tick < 280 && sim.phase !== 'over') { const i = botInput(sim); rec.push(i.f, i.dx, i.dy); sim.step(i.f, i.dx, i.dy); }
  return { sim, run: packRun(sim, rec) };
}

const home = await get('game.php?a=home');
assert.equal(home.status, 200);
assert.ok(Array.isArray(home.body.all) && home.body.lore.briefing, 'home returns boards and lore');

// solo: start, play, submit
const s = await post('game.php', { a: 'start', mode: 'solo' });
assert.ok(s.body.token && Number.isInteger(s.body.seed), 'start returns a token and seed');
const { sim, run } = shortRun(s.body.seed, 'solo');
const entry = { a: 'submit', token: s.body.token, initials: 'tst', score: sim.score, wave: sim.wave, ship: 'vanguard', mode: 'solo', ticks: sim.tick, replay: run };
const ok = await post('game.php', entry);
assert.equal(ok.status, 200, JSON.stringify(ok.body));
assert.ok(ok.body.ranks.all >= 1 && ok.body.ranks.weekly >= 1, 'submission is ranked');
assert.ok(ok.body.home.all.some((e) => e.id === ok.body.id && e.initials === 'TST'), 'entry is on the board with clean initials');

assert.equal((await post('game.php', entry)).status, 409, 'a token cannot be used twice');

// anti-cheat: impossible score, forged token, too many ticks for the time elapsed
const s2 = await post('game.php', { a: 'start', mode: 'solo' });
assert.equal((await post('game.php', { ...entry, token: s2.body.token, score: 900000 })).status, 422, 'impossible score is rejected');
assert.equal((await post('game.php', { ...entry, token: s2.body.token.replace(/.$/, (c) => (c === 'a' ? 'b' : 'a')) })).status, 422, 'forged token is rejected');
const longRun = await post('game.php', { ...entry, token: s2.body.token, ticks: 60 * 600 });
assert.equal(longRun.status, 422, 'more game time than wall time is rejected');
// regression: a 10-minute run must get past field validation (it was once capped at 6 minutes)
assert.match(longRun.body.error, /anti-cheat/, 'a long run is judged by the anti-cheat check, not refused as malformed');

// daily: fixed seed, own board, ghost replay round-trips and verifies
const d = await post('game.php', { a: 'start', mode: 'daily' });
assert.equal(d.body.seed, home.body.dailyInfo.seed, 'daily seed matches the published daily seed');
const dr = shortRun(d.body.seed, 'daily');
const dOk = await post('game.php', { a: 'submit', token: d.body.token, initials: 'DAY', score: dr.sim.score, wave: dr.sim.wave, ship: 'vanguard', mode: 'daily', ticks: dr.sim.tick, replay: dr.run });
assert.equal(dOk.status, 200, JSON.stringify(dOk.body));
const ghost = await get('game.php?a=ghost&b=daily');
assert.ok(ghost.body.run && verifyRun(ghost.body.run).ok, 'stored daily replay re-simulates to the same score');
assert.equal((await get('game.php?a=board&b=daily')).body.entries.length >= 1, true);

// data files must not be downloadable (enforced by .htaccess on Apache/LiteSpeed; PHP's dev server ignores it)
// rival contract: request, accept, progress with attacks
const req = await post('duel-queue.php', { action: 'request', initials: 'one' });
assert.equal(req.status, 200, JSON.stringify(req.body));
const acc = await post('duel-queue.php', { action: 'accept', requestId: req.body.request.id, initials: 'two' });
assert.equal(acc.body.match.playerOne.initials, 'ONE');
assert.ok(!('key' in req.body.request) && !acc.body.match.keys && /^[0-9a-f]{32}$/.test(req.body.key), 'player keys are never public');
const spoof = await post('duel-queue.php', { action: 'progress', requestId: req.body.request.id, role: 'playerOne', key: acc.body.key, score: 9, wave: 2, sent: 50 });
assert.equal(spoof.status, 403, 'a player cannot post progress for the other seat');
const prog = await post('duel-queue.php', { action: 'progress', requestId: req.body.request.id, role: 'playerOne', key: req.body.key, score: 1234, wave: 2, sent: 3 });
const back = await post('duel-queue.php', { action: 'progress', requestId: req.body.request.id, role: 'playerOne', key: req.body.key, score: 1300, wave: 2, sent: 1 });
assert.equal(back.body.match.playerOne.sent, 3, 'attack count never goes down');
assert.equal(prog.body.match.playerOne.sent, 3, 'attack count is shared with the rival');
assert.ok(/^[0-9a-f]{16}$/.test(prog.body.contract.seed), 'contract carries the shared seed');

console.log('ok - api');
