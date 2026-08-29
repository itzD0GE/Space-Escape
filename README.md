# 404: Space Escape

A self-contained, single-file arcade shooter built as a custom 404 error page for [texascabinetryco.com](https://texascabinetryco.com).

## Play

Open `404.shtml` directly in a browser, or configure your server/CDN to use it as the 404 error page. No build step, dependencies, or external JavaScript files are required.

## Features

- Drag/WASD/arrow movement, click or Space to shoot
- Wave-based difficulty with a boss asteroid every 5th wave that splits into smaller rocks on death
- Perk system: pick an upgrade after every wave (Rapid Fire, Multi-Shot, Piercing Rounds, Thruster Boost, Salvage Magnet, Reinforced Hull, Combo Mastery, Score Surge) plus rare perks (Auto-Fire, Vector Thrusters, Orbital Cannon)
- Powerups: Rapid Fire (stacks the more you grab), Shield (absorbs 3 hits, no timer), 1UP (extra life), with a Salvage Magnet perk that actually pulls pickups toward you
- Local top-3 leaderboard with initials entry, stored per-browser via `localStorage`
- Attract/demo mode: self-playing AI runs when no one's playing, showing the leaderboard and top score
- Pause (P / Esc) and mute (M) controls, screen shake, haptic feedback on mobile, thruster particles, rock-fragment explosions
- Mobile-friendly: touch drag-to-move, tap-to-shoot, fullscreen on start, responsive layout
- Compiled game engine embedded directly in the self-contained `404.shtml` deployment file
- Rapid Fire overheat risk after six stacks, with heat damage if pushed too far
- Rare Chain Lightning and Homing Rounds perks
- Growing no-hit wave-clear bonus multiplier
- Best-run input replay in attract mode, stored locally per browser

## Deploy

Drop `404.shtml` in as your site's 404 page, or configure your server/CDN to serve it for 404 responses.

## Credit

Built for Texas Cabinetry Co.
