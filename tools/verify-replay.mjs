// Re-simulate stored replays and confirm each one really produces the score it claims.
// This is the strong anti-cheat check: the PHP API cannot run the game, so run this
// against a copy of the server's api/data folder whenever a score looks suspicious.
//
//   node tools/verify-replay.mjs api/data            (every replay-*.json in the folder)
//   node tools/verify-replay.mjs path/to/replay.json
//
// Note: a replay recorded on a different game version reports "version mismatch".
import fs from 'node:fs';
import path from 'node:path';
import { verifyRun } from '../js/replay.js';

const target = process.argv[2];
if (!target) { console.error('usage: node tools/verify-replay.mjs <replay.json | folder>'); process.exit(2); }
const files = fs.statSync(target).isDirectory()
  ? fs.readdirSync(target).filter((f) => /^replay-.*\.json$/.test(f)).map((f) => path.join(target, f))
  : [target];

let bad = 0;
for (const file of files) {
  const run = JSON.parse(fs.readFileSync(file, 'utf8'));
  const r = verifyRun(run);
  if (!r.ok) bad++;
  console.log(`${r.ok ? 'OK      ' : 'MISMATCH'} ${path.basename(file)}  claimed ${run.score} W${run.wave}  ${r.why || `re-simulated ${r.score} W${r.wave}`}`);
}
console.log(`${files.length} checked, ${bad} failed`);
process.exit(bad ? 1 : 0);
