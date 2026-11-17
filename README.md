# BREAKLINE — a three.js tactical FPS

[![make.fun threejs-fps-01](https://make.fun/badge/threejs-fps-01.svg)](https://make.fun/bounty/threejs-fps-01)
[![rank](https://make.fun/badge/threejs-fps-01/Anonymus22/threejs-fps-01/rank.svg)](https://make.fun/bounty/threejs-fps-01)
[![reward](https://make.fun/badge/threejs-fps-01/Anonymus22/threejs-fps-01/reward.svg)](https://make.fun/bounty/threejs-fps-01)

**BREAKLINE** is an original round-based tactical first-person shooter that runs
in the browser on three.js 0.187.0 — static files, no build step, no network.
You lead the **Vanguard** (four bot teammates beside you) against the
**Wardens**, five defender bots holding the Sable Yard: a container depot with
two charge sites, a mid lane and two flanking routes.

Win a round by eliminating the Wardens or by planting **the Charge** at site
A or B and letting it detonate. The Wardens win by eliminating your team,
running out the clock, or defusing a planted Charge. First team to 7 rounds
takes the match.

## Play

Serve the game folder with any static server (or `node serve.ts` here) and
open `game/index.html` in desktop Chrome. Click to lock the mouse and play.

| Key | Action |
| --- | --- |
| `W A S D` | Move (acceleration-based; stop to shoot straight) |
| `Mouse` | Look |
| `Click` | Fire |
| `Right click` | Aim the Ibis SR-1 scope |
| `R` | Reload |
| `1` `2` `3` `4` | Pistol / primary / sniper / grenade slot |
| `G` | Throw grenade |
| `E` (hold) | Plant the Charge inside a site |
| `B` | Buy menu (buy phase, or first seconds of a round) |
| `Shift` | Walk (quiet, accurate) |
| `Ctrl` / `C` | Crouch |
| `Space` | Jump |
| `Esc` | Pause |

## The game

- **Gunplay that rewards stopping**: hitscan with separate head and body
  hitboxes (headshots multiply damage), recoil kick, and spread that grows
  while moving or spraying — the first accurate shot counts most.
- **Four weapons plus two grenades**: Kestrel P9 pistol, Raptor SMG, Harrier
  AR-12 rifle, Ibis SR-1 scoped sniper; Frag and Smoke grenades.
- **Bots with jobs**: teammates and Wardens follow waypoint routes, hold
  angles, react to gunfire they hear and enemies they see, push sites to
  plant, rotate to defuse, and shoot back with human-like inaccuracy.
- **A real economy**: kills, plants and round results pay out; the buy menu
  sells primaries, the sniper, armor and grenades between rounds.
- **One map, three lanes**: the Sable Yard — west lane, mid and east lane
  feeding two marked sites, built from crates, containers and depot walls in
  a dusk palette with long shadows.
- **Sound from code**: every gunshot, reload, footstep, beep and stinger is
  synthesized with WebAudio. No audio files, no textures, no network.

## Layout

- `game/` — the game itself: `index.html`, modules under `game/src/`
  (input, physics, map, weapons, bots, rounds, effects, audio, hud, main),
  and the vendored three.js 0.187.0 under `game/vendor/three/`.
- `main.ts` — the hand-in program: copies `game/` and `screenshots/` to the
  output directory and writes `dossier.json` with `vendor/makefun-threejs.ts`.
- `screenshots/` — four real renders of this game in a browser; the first is
  the cover.
- `serve.ts` — a tiny local static server for playing the game.
