// The autopilot: flies the attract-mode demo and the "ACE" rival when nobody is in the queue.
// It only reads sim state and returns the same input a human would send.
import { F } from './sim.js';

const PICK_ORDER = ['spreadfire', 'rapidfire', 'homing', 'chain', 'pierce', 'hull', 'autofire', 'scoresurge', 'combo', 'thruster', 'afterburner', 'grazer', 'magnet', 'directional', 'orbital'];
const hyp = (x, y) => Math.sqrt(x * x + y * y);

export function botInput(sim) {
  const p = sim.p;
  if (sim.phase === 'perk') {
    let best = 0, rank = 99;
    sim.choices.forEach((id, i) => { const r = PICK_ORDER.indexOf(id); if (r >= 0 && r < rank) { rank = r; best = i; } });
    return { f: (best + 1) << 4, dx: 0, dy: 0 };
  }
  let ax = 0, ay = 0, nearest = 1e9, danger = 0;
  for (const e of sim.enemies) {
    const dx = p.x - e.x, dy = p.y - e.y, dist = hyp(dx, dy) || 1, d = dist - e.size / 2 - p.r;
    if (d < nearest) nearest = d;
    const reach = e.boss ? 190 : 130;
    if (d < reach) { const w = ((reach - d) / reach) ** 2 * (e.boss ? 5 : 3.2); ax += (dx / dist) * w; ay += (dy / dist) * w; danger += w; }
  }
  for (const b of sim.bullets) {
    // steer away from where the bullet will be shortly, not where it is
    const fx = b.x + b.vx * 7, fy = b.y + b.vy * 7;
    const dx = p.x - fx, dy = p.y - fy, d = hyp(dx, dy) || 1;
    const dn = hyp(p.x - b.x, p.y - b.y) - b.r - p.r;
    if (dn < nearest) nearest = dn;
    if (d < 80) { const w = ((80 - d) / 80) ** 2 * 4; ax += (dx / d) * w; ay += (dy / d) * w; danger += w; }
  }
  // stay off the walls so there is always somewhere to dodge to
  const m = 70;
  if (p.x < m) ax += (m - p.x) / m; if (p.x > sim.W - m) ax -= (p.x - (sim.W - m)) / m;
  if (p.y < m) ay += (m - p.y) / m; if (p.y > sim.H - m) ay -= (p.y - (sim.H - m)) / m;
  if (danger < 1.2) {
    // line up under the nearest enemy above us; shots travel upward
    let tgt = null, best = 1e9;
    for (const e of sim.enemies) { const d = hyp(e.x - p.x, e.y - p.y); if (e.y < p.y - 20 && d < best) { best = d; tgt = e; } }
    if (tgt) ax += Math.max(-1, Math.min(1, (tgt.x - p.x) / 40)) * 1.1;
    ay += ((sim.H * 0.74 - p.y) / sim.H) * 2;
    let item = null; best = 260;
    for (const it of sim.items) { const d = hyp(it.x - p.x, it.y - p.y); if (d < best) { best = d; item = it; } }
    if (item && danger < 0.5) { ax += ((item.x - p.x) / best) * 1.4; ay += ((item.y - p.y) / best) * 1.4; }
    if (sim.dvd && !sim.dvd.wait && danger < 0.3) { const d = hyp(sim.dvd.x + 29 - p.x, sim.dvd.y + 17 - p.y) || 1; ax += ((sim.dvd.x + 29 - p.x) / d) * 1.2; ay += ((sim.dvd.y + 17 - p.y) / d) * 1.2; }
  }
  const mag = hyp(ax, ay);
  if (mag > 1) { ax /= mag; ay /= mag; }
  let f = F.FIRE;
  if (nearest < 14 && p.dashCd <= 0 && !(sim.pf & F.DASH)) f |= F.DASH;
  if (sim.bomb >= 100 && !(sim.pf & F.BOMB) && (sim.bullets.length > 16 || nearest < 10 || (p.lives === 1 && danger > 2))) f |= F.BOMB;
  return { f, dx: Math.round(ax * 127), dy: Math.round(ay * 127) };
}
