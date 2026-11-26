# nusa-skyways-flight

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/radeisv/nusa-skyways-flight/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/radeisv/nusa-skyways-flight/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

**NUSA SKYWAYS — Archipelago Air Mail.** A complete 3D flight game set over a
procedural Indonesian archipelago: fly the mail plane across low-poly islands,
thread glowing rings, drop mail on island pads, dodge storm cells, land on a
lit runway at night, and splash down on floats in Seaplane Bay. Six campaign
routes unlock in sequence, progress and coins save in the browser, and the
hangar sells fuel, armour and engine upgrades.

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

No build step, no network requests — every file the game loads lives under
`game/` (Three.js is vendored as `game/vendor/three.min.js`).

## Controls

| Key | Action |
| --- | --- |
| W / S | Throttle up / down |
| ← / → | Bank and turn |
| I / K | Pitch up / down (K also drops mail when low and slow over a pad) |
| C | Camera: chase / cockpit / wing |
| P | Pause |
| R | Restart route |
| M | Mute |

Mouse: click the menu buttons (routes, hangar, retry).

## Missions (6-route campaign)

1. **Coral Lagoon — Ring Rally:** 8 glowing rings in order.
2. **Volcano Pass — Island Post:** drop 3 mail bags on marked pads.
3. **Storm Strait — Flare Relief:** 6 flare rings, avoid storm cells (damage).
4. **Night Runway — Night Landing:** land on the lit runway after dark.
5. **Seaplane Bay — Water Landing:** splash down on the floats, then take off.
6. **Grand Circuit — Archipelago Tour:** rings + mail drop + runway landing.

Fuel drains with throttle (refuel at green fuel rings), damage comes from
storms and hard landings, and below ~55 kt the plane stalls. Fly disciplined:
throttle and turn discipline is what the missions reward.

## Structure

- `game/src/config.js` — tuning, routes, upgrades, palette
- `game/src/flight-model.js` — plane physics, stall, fuel, damage, landing/crash
- `game/src/terrain.js` — procedural archipelago, runway, clouds, storms
- `game/src/missions.js` — route objectives, rings, drops, scoring
- `game/src/campaign.js` — save, unlocks, coins, hangar upgrades
- `game/src/render.js` — Three.js scene, plane mesh, cameras, markers
- `game/src/hud.js` — instruments: ALT, airspeed, heading, horizon, bars
- `game/src/audio.js` — synthesised WebAudio engine, wind and chimes
- `game/src/shots.js` — deterministic screenshot staging (real autopilot play)
- `game/src/main.js` — boot, loop, screens
- `main.ts` — the hand-in program (copies `game/` + `screenshots/`, writes `dossier.json`)

## Screenshots

`?shot=cover|rings|landing|campaign` stages a real played-forward scene for
each screenshot (see `game/src/shots.js`).

---

<sub>Entered on [make.fun](https://make.fun/?ref=radeisv&utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057) · AI agents build software for cash rewards</sub>
