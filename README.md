# 404: Space Escape

A self-contained arcade shooter built as a creative 404 page that evolved into a full wave-based action game. It runs in a single deployment file, uses plain HTML/CSS/JavaScript, and requires no framework or build step.

**Version:** 1.0.0

## About

This project started as a custom 404 page for a website and grew into a playable survival shooter. The game is built to be portable and easy to deploy: the gameplay logic, UI, and rendering are embedded directly in [404.shtml](404.shtml), which can be served as a static file on any web host.

## Game Overview

You pilot a small starcraft through wave after wave of hostile drones, alien craft, gravity monsters, and elite boss entities. Your goal is to survive as long as possible, clear waves, collect upgrades, build score multipliers, and overcome increasingly difficult boss encounters.

The game uses:
- keyboard or mouse movement
- click/Space to fire
- wave-based progression
- random pickups and permanent perk choices
- local leaderboard persistence
- optional server-side high score syncing when available

---

## Installation and Setup

### Option 1: Open directly in a browser

- Open [404.shtml](404.shtml) in any modern browser.
- No build step is required.
- This is the simplest setup for local testing and for deploying as a static 404 page.

### Option 2: Serve locally with a simple web server

From the project folder:

```bash
python -m http.server 8000
```

Then visit:

```text
http://localhost:8000/404.shtml
```

### Option 3: Deploy to a web server

Upload [404.shtml](404.shtml) to the host and serve it as a static page. For a 404 page, simply configure your host to serve that file for 404 responses. You do not need to upload [dist/](dist/) or [node_modules/](node_modules/) for the game itself.

If the server supports a high-score endpoint, the game can try to sync scores through `/api/highscore.json`. If that endpoint is unavailable, it falls back to browser local storage.

---

## How to Play

### Controls

- Move: WASD or Arrow Keys
- Mouse: move by aiming the cursor in the arena
- Shoot: Space bar or mouse click
- Pause: `P` or the pause button
- Mute: mute button in the HUD
- Mobile: drag to move and tap to shoot

### Goal

- survive the enemy waves
- clear enough enemies to trigger the next wave
- defeat each wave boss to progress
- keep your ship alive while building score and gathering upgrades

### Survival Basics

- Your ship has 3 lives by default.
- Enemy contact damages you.
- If a boss or enemy overloads your ship, you lose a life.
- If all lives are lost, the run ends.

### Health and damage

- Enemy collisions and projectile hits damage your ship.
- Shield pickups temporarily absorb hits.
- A 1UP pickup adds an extra life.
- Overheating from repeated rapid-fire stacking can also kill you, so there is a risk/reward system built into the weapon progression.

---

## Weapons and Weapon Mechanics

### Primary weapon

Your base weapon fires forward. It is reliable and consistent, but it becomes far more effective as you stack upgrades.

### Rapid Fire

- Collecting rapid fire boosts stacks the firing rate.
- Higher stacks increase the weapon tempo significantly.
- This is the fastest way to melt enemies, but it brings a strong risk: overheating.

### Overheat system

- Rapid fire has a heat meter.
- If you keep firing too hard, heat climbs.
- When heat reaches critical levels, the ship overheats and takes damage.
- This creates a tradeoff: more firepower is great, but sustained sprays can burn you out.

### Multi-shot / spread fire

- Multi-shot increases the number of projectiles fired per burst.
- The spread grows wider as your shot count rises.
- This is ideal for crowd control and for dealing with packs of enemies.

### Piercing rounds

- Piercing shots can pass through multiple enemies.
- Great for large formations or boss patterns.
- Best paired with dense waves where enemies are in a line or cluster.

### Auto-fire

- Auto-fire is unlocked as a perk progression option.
- Once enabled, it fires continuously until toggled off.
- Because it can trigger overheating, the player must manage it carefully.
- This weapon mode is very efficient when timed correctly but dangerous if left on too long.

### Orbital Cannon

- Adds orbiting shots that spin around the ship.
- Strong defensive value for close-range boss fights and incoming swarm patterns.
- It provides layered coverage without requiring direct aim every moment.

### Chain Lightning

- Creates a chain effect that bounces between nearby enemies.
- Good for clearing clusters and boss weak points.
- Helps when enemies are tightly packed.

### Homing Rounds

- Some shots will seek nearby enemies automatically.
- Improves accuracy during quick movement or against evasive targets.
- Especially strong against alien and drone boss patterns.

### Directional Fire

- Allows shots to align with movement direction.
- Great for strafing and staying mobile while firing.
- Encourages an aggressive but controlled movement pattern.

---

## Powerups and Pickups

### Rapid Fire boost

- Increases firing speed.
- Stacks multiple times.
- Displays as a floating text bonus.

### Multi-shot pickup

- Adds more projectiles and spread.
- The weapon becomes wider and stronger.
- Multi-shot is stackable and can be timed with rapid-fire upgrades for heavy damage output.

### Shield

- Grants a protective shield for several hits.
- Useful for boss phases and sudden enemy bursts.
- Makes the ship more forgiving in high-pressure moments.

### 1UP

- Gives an extra life.
- Essential after difficult waves or boss fights.

### Salvage Magnet

- Pulls nearby collectibles and powerups toward your ship.
- Helps preserve position and smooths survival during intense pressure.

### Collectibles

- Picking up floating salvage gives score and supports the support loop of the run.
- You can often keep the ship alive longer by tracking nearby pickups.

---

## Waves and Boss Mechanics

### Wave progression

- The game advances through waves.
- The player must clear a set number of enemies before the next wave begins.
- Each wave gets harder with faster movement, stronger enemy behavior, and higher pressure.

### Boss wave behavior

- A major boss appears when the wave clears its normal enemy threshold.
- The boss remains active until defeated.
- Defeating the boss completes the wave transition.

### Boss variety

The game includes a roster of multiple unique bosses, each with different styles and attack patterns. They range from asteroid commanders, alien motherships, drone swarms, and black-hole entities to elite late-game monsters.

Boss types include:
- asteroid-based splitters
- alien tracking craft
- drone swarm controllers
- gravity black hole enemies
- meteor storm bosses
- arc and spread projectile bosses
- elite late-game monsters with higher speed, health, and damage

### Boss archetypes

- Splitter bosses: create wide radial shots and break apart into a hazard pattern.
- Tracking bosses: fire targeted shots at the player.
- Drone bosses: spawn additional smaller enemies.
- Gravity bosses: pull the player inward and control space around them.
- Meteor bosses: launch high-pressure attacks from above or across the arena.
- Elite bosses: appear in later waves and are much more punishing, with stronger stats and more dangerous patterns.

### Wave announcements

At the beginning of each wave, the game announces the wave number and, in boss phases, the boss name. This helps the player recognize the increasing threat level and prepare for the upcoming fight.

---

## Perks and Upgrades

After each cleared wave, players choose from a perk pool. These are permanent upgrades that shape the rest of the run.

### Common perk categories

- Rapid fire improvements
- Spread fire improvements
- More projectile damage or piercing
- Speed or mobility boosts
- Pickup magnet improvements
- Shield durability and defense improvements
- Score and combo multipliers
- Auto-fire unlocks and weapon bonuses
- Chain lightning and homing rounds

### Why perks matter

Perks are what turn a good survival run into a strong score run. The right combination lets the player sustain a longer wave progression and take on later bosses more confidently.

---

## Combos and Scoring

### Combo system

The combo counter increases when you chain kills quickly. It is an important scoring mechanic because it multiplies points earned during a run.

To build combos:
- eliminate enemies rapidly
- keep your timing tight
- avoid large gaps between kills
- use spread or piercing weapons to take down clustered enemies quickly

### Near-miss bonus

If you narrowly avoid an enemy or pass close to it, you can get a near-miss bonus. This helps players who are dodging aggressively instead of simply hiding behind a corner.

### No-hit clear bonus

If you finish a wave without taking damage, you earn a clean-wave bonus. This reward can be significant, especially on tougher waves.

### Score tips

- prioritize clearing enemies in groups and maintaining your combo
- take a wave bonus by staying clean
- use shield and mobility perks for mid-wave survival
- late boss kills provide the highest payout

---

## Boss Names and Elite Tiers

The game now includes a dramatic boss roster with memorable names and a late-game elite tier.

Examples of boss naming style:
- The Obsidian Maw
- The Pale Choir
- The Dread Hive
- The Black Singularity
- Rift Titan Ascendant
- Specter Prime
- Arcanum Wraith

Late-game elite enemies get stronger versions with:
- larger body size
- more health
- faster movement
- harsher projectile patterns
- bigger score rewards
- brighter glow and stronger visual identity

These elite bosses are intended to feel like “apex threat” encounters near the end of a run.

---

## Tips for Better Runs

- Save your shield for boss phases or dense enemy clusters.
- Don’t spam rapid fire endlessly; overheating can end a run.
- Use multi-shot and spread for crowd control.
- Build combo chains by killing quickly without hesitation.
- Keep moving; stationary play becomes vulnerable to bosses and swarm patterns.
- Prioritize wave-clear bonuses and wave bonuses when possible.
- At the start of later waves, expect the enemy patterns to intensify quickly.

---

## Leaderboard and Persistence

- High scores are stored locally in the browser via `localStorage`.
- If a server endpoint is available, the game can also sync global score data.
- The leaderboards display score plus the wave reached.

---

## File Structure

- [404.shtml](404.shtml) — full game and deployment file
- [README.md](README.md) — project documentation
- [dist/](dist/) — generated build artifact if present
- [node_modules/](node_modules/) — development dependencies only

---

## Credits

Built as a custom game experience for a website’s 404 page and expanded into a full arcade shooter.

---

## License

MIT

**Last Updated:** 2026-08-28
