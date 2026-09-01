# 404: Space Escape

**Version:** 1.6.0  
**Last Updated:** 2026-08-31

Space Escape is a wave-based browser shooter built as a playable 404 page. It supports single-player runs, a shared server leaderboard, and a short asynchronous Rival Contract queue.

The game has no package install or build step. Upload the game file, the `assets` folder, and the `api` folder together.

## Install

### Local game preview

Open [404.shtml](404.shtml) in a modern browser to play single-player locally. PHP-backed leaderboard and Rival Contract features need a web server, so they do not work from `file://`.

### Local PHP test server

From the project root, run:

```powershell
php -S localhost:8000
```

Then open `http://localhost:8000/404.shtml`.

PHP 8.0 or later is recommended. This enables the same relative API paths used in production.

## Website Hosting

Upload the complete project structure to the desired web directory. For example, to serve the game from `/bstudio/`, upload this exact tree:

```text
public_html/
`- bstudio/
   |- 404.shtml
   |- assets/
   |  |- player-ship-tier-1.png
   |  |- player-ship-tier-2.png
   |  |- player-ship-tier-3.png
   |  |- player-ship-tier-4.png
   |  |- player-ship-tier-5.png
   |  |- player-ship-tier-6.png
   |  |- boba-tea-boss.svg
   |  |- donut-matcha.png
   |  |- donut-cinnamon.png
   |  |- donut-vanilla.png
   |  |- donut-strawberry.png
   |  |- donut-blueberry.png
   |  |- nebula-bg.jpg
   |  `- junk-*.png
   `- api/
      |- highscore.php
      |- duel.php
      `- duel-queue.php
```

Requirements:

1. Preserve the `assets/` and `api/` directory names and contents.
2. Enable PHP for the website directory.
3. Make `api/` writable by PHP. Start with permissions `755`; use `775` only when required by the host.
4. Verify `https://your-domain.example/bstudio/api/highscore.php` returns JSON rather than a 404 or HTML error page.
5. Configure the host's custom 404 page to serve `404.shtml` when using the game as a site-wide 404 page.

The API automatically creates these runtime data files inside `api/`:

```text
leaderboard.json   # Shared top-three scores
duels.json         # Recent completed Rival Contract runs
duel-queue.json    # Pending contract request and short-lived matches
```

Do not create or edit these data files by hand. Do not upload `dist/` or `node_modules/`; neither is needed in production.

## Project File Tree

```text
Space-Escape/
|- 404.shtml                 # Full game client: HTML, CSS, JavaScript
|- README.md                  # This game bible
|- assets/                    # All browser-rendered game artwork
|  |- player-ship-tier-*.png  # Six progressive player ship appearances
|  |- boba-tea-boss.svg       # Wave 3 Boba Colossus art
|  |- donut-*.png             # Flavor-coded pickup artwork
|  `- junk-*.png              # Safe intermission debris
`- api/                       # PHP endpoints and generated JSON storage
   |- highscore.php            # Shared global leaderboard
   |- duel.php                 # Completed Rival Contract run storage
   `- duel-queue.php           # Request/accept contract matchmaking
```

## Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Move | WASD or Arrow keys | Drag in the arena |
| Fire | Space or click | Tap |
| Pause | P, Escape, or pause button | Pause button |
| Mute | M or mute button | Mute button |

A minimal cursor glint marks the mouse within the arena without a long visual trail.

## Core Game Flow

1. Choose **Single Player** or **Rival Contract**.
2. Clear the normal enemy quota for the wave.
3. Defeat the boss. A wave cannot complete while its boss lives.
4. Watch the boss defeat effects and a `3, 2, 1, GO!` transition.
5. Choose one perk.
6. Fly through a harmless debris intermission.
7. The next-wave countdown begins.

Each wave switches to the next player ship appearance tier, capped at tier 6.

## Combat, Lives, and Shields

- A run starts with 3 lives.
- Enemy contact and enemy projectiles damage the player.
- A 1UP adds one life.
- Reaching 0 lives ends the run.
- Boss projectiles are enemy-owned and cannot damage their own boss.

### Shield Protection

A shield absorbs incoming enemy contact or bullets first. Each shielded hit consumes one shield charge and preserves both lives and weapons.

### Unshielded Damage

An unshielded hit costs one life and resets weapon upgrades to the base forward shot. These reset:

- Rapid Fire and temporary Multi-Shot
- Spread Fire and Piercing Rounds
- Auto-Fire and Vector Thrusters
- Orbital Cannon and its stacks
- Chain Lightning and Homing Rounds

Mobility, pickup range, extra hull lives, combo improvements, and score bonuses remain active.

### Heat

Rapid Fire can stack into high heat. Critical heat causes damage and follows the same unshielded weapon-reset rule.

## Donut Pickups

The former gem pickups are transparent 3D donut assets. Their image files are in [assets/](assets/); their pickup mechanics are unchanged.

| Donut | Effect |
| --- | --- |
| Matcha | Salvage score collectible |
| Cinnamon | Rapid Fire stack |
| Vanilla | Shield charges |
| Strawberry | 1UP |
| Blueberry | Temporary Multi-Shot |

All donut glows use `drop-shadow`, so the glow follows the transparent donut silhouette rather than drawing a square around the item.

### Japanese Sweets Pickups (Temporary Buffs)

These pickups are drawn as inline SVG art (no separate image files) and grant a short-lived buff. Each shows a HUD buff tag for its full duration and clears itself automatically when it expires.

| Treat | Effect | Duration |
| --- | --- | --- |
| Mochi | Doubles fire rate (Mochi Overdrive) | 10 seconds |
| Dango | Doubles all points earned (Dango Frenzy) | 12 seconds |
| Sushi | Greatly increases pickup radius (Sushi Magnet) | 10 seconds |
| Taiyaki | Full damage immunity (Taiyaki Phase) | 5 seconds |

## Perks and Weapons

After each cleared wave, the player chooses a permanent perk from the available pool.

| Perk | Effect |
| --- | --- |
| Rapid Fire | Improves base fire rate |
| Spread Fire | Adds forward shots, up to four |
| Piercing Rounds | Lets shots pass through more enemies |
| Thruster Boost | Increases movement speed |
| Salvage Magnet | Increases pickup radius |
| Reinforced Hull | Adds one life |
| Combo Mastery | Raises combo cap and combo window |
| Score Surge | Increases all points earned |
| Auto-Fire | Enables trigger-controlled continuous firing |
| Vector Thrusters | Fires in the movement direction |
| Orbital Cannon | Replaces the current weapon set with rotating fire |
| Chain Lightning | A kill arcs to a nearby enemy |
| Homing Rounds | Shots lock onto the nearest enemy and pursue it until it dies or leaves range |

Orbital Cannon is a weapon swap. Its first selection clears other weapons and starts one rotating stream. Later Orbital Cannon selections add streams, up to four.

Spread Fire and temporary Multi-Shot stacks combine, but total simultaneous shots are capped at 7.

## Waves and Bosses

Enemy speed, spawn pressure, and wave quotas increase over time. Standard boss patterns include splitter, tracking, drone, gravity, meteor, and arc attacks. Later waves can spawn stronger elite versions.

### Splitting Asteroids

Single-player normal waves include standard and heavy asteroids. Standard asteroids do not split when destroyed. Heavy asteroids render at a larger size, take an additional hit, and break into two medium fragments, which themselves break into small fragments when destroyed. Fragments burst outward from the impact point for a brief moment before homing in on the player, rather than beelining immediately. Rival Contract does not use this random split variation.

### Wave 3: Boba Colossus

Wave 3 features the Boba Colossus, a fast, angry boba-tea boss with a straw. It fires three boba pearls in a fan volley. The pearls are enemy bullets and damage the player on contact.

When defeated, the Boba Colossus starts a 10-second celebration before the perk screen appears: the tea and tapioca pearls burst outward like an explosion, alongside a splash announcement banner. The ship can still move during the celebration, and collectible pearls award bonus score if caught before they drift off-screen and vanish.

### DVD Corner Easter Egg

Flying the ship into any of the four arena corners releases a bouncing DVD logo, a nod to the classic screensaver meme.

- The corner hit itself awards a small style bonus and has a 10-second cooldown, but only one DVD logo release is allowed per wave.
- The logo bounces around the arena for 15 seconds. Touching it with the ship catches it: catching it awards a jackpot bonus, scaled by the wave and combo multipliers, plus a random weapon bonus (Shield, Multi-Shot, or Rapid Fire).
- Catching it within a third of a second of it bouncing off an exact corner, the meme moment, upgrades the payout to a "PERFECT CATCH" worth roughly double.
- If the logo is not caught before its timer runs out, it escapes and the wave gets no reward from it.

### Safe Intermission

After a perk is selected, the player flies briefly without hostile spawns. Harmless local debris such as spacecraft parts, a rocket, phone, radio, robot, and satellite can float through the arena. These never cause damage.

## Audio

All sound effects and music are synthesized live with the Web Audio API. There are no external audio files to host, download, or license.

- **Sound effects** (shoot, enemy hit, damage, collectible, powerup, wave clear, easter egg) are built from layered oscillators, pitch sweeps, and filtered white-noise bursts rather than static tones, giving impacts a noise-based "crunch" and the laser shot a multi-layer zap with a sub-bass thump for weight.
- **Music** (ambient loop, per-theme boss themes) is a simple procedural note sequencer using the same oscillator engine.
- Every sound is routed through a `PannerNode` positioned from the source's on-screen X position, so effects pan left/right based on where they happen in the arena.
- The mute toggle and master gain control apply globally to both music and effects.

## Scoring

Points come from enemy kills, bosses, salvage, near misses, and wave bonuses.

- **Combo:** quick consecutive kills increase the combo multiplier.
- **Near miss:** narrowly avoiding a non-boss enemy awards a bonus.
- **No-hit clear:** a damage-free wave earns a streak-based bonus.
- **Score Surge:** increases all points earned.

Score, wave, and near-miss multipliers are bounded in the client to prevent invalid states from producing unrealistic values.

## Shared Leaderboard

The standard leaderboard is server-authoritative. It does not use browser score storage as a fallback.

1. A qualifying top-three score asks for up to three initials.
2. The client posts `initials`, `score`, and `wave` to `api/highscore.php`.
3. The endpoint stores the top three entries in `api/leaderboard.json`.
4. The page displays the shared top-three pilots with initials, score, and wave reached.

## Rival Contract

Rival Contract is a short request/accept 1v1-style challenge built for ordinary PHP website hosting. It needs no WebSockets or persistent server process.

### How Queueing Works

1. Player One chooses **Rival Contract**, enters initials, and sees **Request Contract** when no request is waiting.
2. Player One selects it. `api/duel-queue.php` creates a pending request that lives for 60 seconds.
3. Player Two opens Rival Contract during that window. The queue returns Player One's initials and shows **Accept Contract**.
4. Player Two accepts. The API creates a short-lived match record and clears the pending request.
5. Player One polls their request ID and sees **Opponent Joined**.
6. Both players see the matchup intro, for example `AAA VS BBB`, followed by the normal `3, 2, 1, GO!` countdown.
7. If no one accepts within 60 seconds, the request is cancelled and Player One sees `NO OPPONENT JOINED. TRY AGAIN.`

While the queue modal is open, the demo arena freezes and the live Wave/HUD display is hidden. Queueing does not start single-player mode.

### Contract Play and Result Storage

A Rival Contract has a Wave 3 target. During an active match, each player publishes their score and wave once per second to `api/duel-queue.php`; the compact rival HUD displays the opponent's latest shared score. The client also records a score checkpoint every second and submits the completed result to `api/duel.php` when the player loses or clears Wave 3. It then shows a dedicated versus result screen with both initials, both scores, and a win, tie, or loss outcome. That endpoint validates basic input and retains the latest 50 daily results in `api/duels.json`.

The current mode provides request/accept matchmaking, matchup presentation, live score sharing through short PHP polls, and result recording. Deterministic shared enemy spawns remain a future enhancement; the mode does not require WebSockets or a persistent server process.

## PHP API Reference

All client requests are relative to the game file. If the game is installed at `/bstudio/`, requests resolve under `/bstudio/api/`.

### `api/highscore.php`

| Method | Purpose |
| --- | --- |
| `GET` | Returns the global high score and top-three leaderboard |
| `POST` | Accepts initials, score, and wave for a leaderboard entry |

### `api/duel-queue.php`

| Method | Purpose |
| --- | --- |
| `GET` | Returns the daily contract and any pending request |
| `GET ?requestId=<id>` | Lets Player One poll for the accepted match |
| `POST request` | Creates a pending request with Player One's initials |
| `POST accept` | Lets Player Two accept the request and create a match |
| `POST progress` | Stores a player's current score and wave, then returns the updated match |
| `POST cancel` | Removes Player One's pending request |

### `api/duel.php`

| Method | Purpose |
| --- | --- |
| `GET` | Returns the latest completed result for the current daily contract |
| `POST` | Stores a completed contract's initials, score, wave, and score timeline |

All API writes use exclusive file locks to reduce JSON corruption under simultaneous requests.

## Asset Guide

Keep file names and paths stable when replacing art:

- `player-ship-tier-1.png` through `player-ship-tier-6.png`: player ship progression.
- `boba-tea-boss.svg`: Wave 3 boss art.
- `donut-*.png`: flavor-coded pickups.
- `nebula-bg.jpg`: deep-background night-sky photo darkened behind the arena and stars. Keep this file web-sized (a few hundred KB); do not swap in a multi-megabyte original, since the game has no build/compression step.
- `junk-*.png`: intermission debris.

Use transparent PNG or SVG files. Avoid opaque rectangular backgrounds to prevent square artifacts around objects and glows.

The arena background layers a dark scrim over `nebula-bg.jpg` for a mostly black, milky-way-at-night look that keeps foreground gameplay and text readable.

## License

Project code is MIT licensed. Bundled and replacement artwork remains subject to its source license; Kenney assets are CC0.
