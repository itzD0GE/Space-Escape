# 404: Space Escape

An arcade shooter game that evolved from a custom 404 error page into a full-featured interactive experience.

**Version:** 1.0.0

## About

This project started as a creative 404 error page for [texascabinetryco.com](https://texascabinetryco.com) and has since grown into a complete, self-contained arcade shooter. Built with vanilla HTML/CSS/JavaScript — no build step, no dependencies needed.

## Features

- **Controls:** Drag/WASD/arrow movement, click or Space to shoot
- **Gameplay:** Wave-based difficulty with a boss asteroid every 5th wave that splits into smaller rocks on death
- **Perk System:** Pick an upgrade after every wave including Rapid Fire, Multi-Shot, Piercing Rounds, Thruster Boost, Salvage Magnet, Reinforced Hull, Combo Mastery, Score Surge, plus rare perks like Auto-Fire
- **Powerups:** Rapid Fire (stacks with repeats), Shield (absorbs 3 hits), 1UP (extra life), Salvage Magnet (pulls pickups toward you)
- **Leaderboard:** Local top-3 leaderboard with initials entry, stored per-browser via `localStorage`
- **Attract Mode:** Self-playing AI runs when idle, showcasing the leaderboard and top score
- **Polish:** Pause (P / Esc), mute (M), screen shake, haptic feedback on mobile, thruster particles, rock-fragment explosions
- **Mobile-Friendly:** Touch drag-to-move, tap-to-shoot, fullscreen on start, responsive layout

## Play

Open `index.html` in any browser:
```bash
# Option 1: Direct file
open index.html

# Option 2: Local server (if needed)
python -m http.server 8000
# Visit http://localhost:8000
```

## Deploy

Drop `index.html` in as your site's 404 page:
- Rename to `404.shtml` or similar
- Configure your server/CDN to serve it for 404 responses
- Works anywhere that serves static HTML

## Versioning

This project follows [Semantic Versioning](https://semver.org/):

- **MAJOR:** Significant gameplay changes or feature overhauls
- **MINOR:** New features or enhancements (new perks, powerups, game modes)
- **PATCH:** Bug fixes and minor improvements

### Release History

- **v1.0.0** — Initial release: Full arcade shooter with waves, perks, leaderboard, and attract mode

## Tech Stack

- **HTML5** Canvas for rendering
- **CSS3** for responsive styling and UI
- **Vanilla JavaScript** (no frameworks or dependencies)
- **LocalStorage** for persistent leaderboard data

## Credits

Built by @itzD0GE for Texas Cabinetry Co.

## License

MIT

---

**Last Updated:** 2026-08-28
