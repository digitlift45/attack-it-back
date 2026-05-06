# ATTACK IT BACK — a tiny first‑person shooter

Pick a map. Find chests. Stay alive.

A browser‑based FPS built on [Three.js](https://threejs.org/), with no build
step. Just run a tiny static server and open it in a browser.

## Visuals

- **Physically‑based sky** (`Sky` shader) per map with a sun direction that drives
  both the sky, the directional shadow light, and god‑rays sampling
- **Animated cloud system** (procedurally‑baked sprites that drift across the sky)
- **Volumetric god‑rays** sampled from the sun position — they punch through
  trees, mountains and buildings
- **GTAO ambient occlusion** for depth/contact shadows
- **Bloom** on bright pixels (lamps, sun‑lit metal, muzzle flashes)
- **ACES filmic tone mapping**, **chromatic aberration**, **film grain**, and
  vignette in a single grade pass — then **SMAA** antialiasing
- **PMREM environment reflections** so all `MeshStandardMaterial`s pick up the
  sky as a subtle reflection
- **Wind‑swayed foliage** (vertex shader patched onto every leaf material)
- **Custom animated water shader** (Gerstner‑style waves, Fresnel deep/shallow
  blend, foam at crests, sun glint)
- **Per‑map atmospheric particles**: dust, falling leaves, drifting snow, embers
- **Cinematic 3D menu background** (sky + clouds + dust + slow camera dolly)

## Gameplay

- **Home screen** with 4 maps: City, Forest, Archipelago, Mountain
- **First‑person controls** with pointer lock (WASD + mouse + space/jump)
- **4 weapons** with hand viewmodels (fists, pistol, shotgun, rifle), recoil
  kick, FOV punch, and reload timing
- **Chests** scattered across each map — HP or new guns
- **Wave‑based survival** with grunts, runners, and brutes
- **Hit markers + kill markers** on the crosshair, **blood particles** on hits,
  and **death fall + fade** for downed enemies
- **Bullet impact decals + smoke puffs** that stick to walls
- **Dynamic crosshair** that opens up while moving / firing / mid‑air
- **Hill terrain** in Forest and Mountain (player + enemies + chests follow it)
- **Minimap** in the top‑left + **controls panel** on the right side
- **Player home base** — every map drops you inside a log cabin you can
  walk into, with a pitched roof, chimney, lit windows, a bed, and a table
  with a lantern. Around it: a small camp of campfires (with flickering
  light), tents, log seats, supply crates, lantern posts, and log piles.
- **Consistent spawn** — you always start at the same spot on each map,
  facing out through the open doorway. The spawn is run through a
  collision check so you never end up clipped into a wall.

## How to run

It uses ES modules + an import map, so you need to serve the folder over HTTP
(opening `index.html` directly with `file://` won't work).

The easiest options:

```bash
cd shooter-game
python3 -m http.server 8000
```

Or with Node:

```bash
cd shooter-game
npx --yes serve .
```

Then open <http://localhost:8000> in Chrome / Edge / Firefox / Safari.

Click a map card to start. Your mouse will be captured. Press **ESC** to pause.

## Deploy

The project is 100% static — no build step, no bundler, no server‑side code.
Any static host works: GitHub Pages, Netlify, Cloudflare Pages, S3, etc.

For GitHub Pages, just push the repo and enable Pages on the `main` branch
from the root (`/`). All paths in the project are relative, all module imports
use the `.js` extension, and no filenames start with `_`, so the site works
under any subpath (like `/your-repo/`) with no special configuration.

## Controls

| Key            | Action                |
| -------------- | --------------------- |
| `W A S D`      | Move                  |
| `Mouse`        | Look                  |
| `Left click`   | Shoot                 |
| `Space`        | Jump                  |
| `R`            | Reload                |
| `E`            | Open nearby chest     |
| `1` `2` `3` `4`| Switch weapon         |
| `ESC`          | Pause                 |

Chests glow on the ground — walk up and press **E**. Headshots do bonus damage.
Enemies sometimes drop ammo crates; just walk over them.

## Project layout

```
shooter-game/
├─ index.html
├─ styles.css
├─ README.md
└─ src/
   ├─ main.js          # entry point, scene setup, game loop
   ├─ player.js        # HP, inventory, weapon swap, reload
   ├─ weapons.js       # gun stats + viewmodels (with hand fingers)
   ├─ character.js     # the player's body model
   ├─ enemies.js       # enemy AI (grunt / runner / brute)
   ├─ chests.js        # chest mesh + loot tables
   ├─ util.js          # math + AABB collision helpers
   ├─ menuScene.js     # animated 3D background for the home screen
   ├─ postfx.js        # composer: GTAO + god rays + bloom + grade + SMAA
   ├─ sky.js           # physically-based sky + sun + clouds + env reflections
   ├─ effects/
   │  ├─ clouds.js     # billboard cloud system + sun disc
   │  ├─ water.js      # animated water shader
   │  ├─ wind.js       # wind sway helper (patches MeshStandardMaterial)
   │  └─ particles.js  # dust / snow / leaves / embers
   └─ maps/
      ├─ index.js      # routes mapId -> builder
      ├─ shared.js     # ground/terrain/atmosphere helpers + cabin + camp props
      ├─ city.js
      ├─ forest.js
      ├─ archipelago.js
      └─ mountain.js
```

Every map builder returns the same shape (obstacles, colliders, spawn points,
chest spots, player start, bounds, sky color), so the rest of the game doesn't
need to know which map you picked.

## Tweaking

- **Make it easier / harder** — `tickWaves()` in `src/main.js` controls how many
  enemies spawn per wave and how fast.
- **Change weapon stats** — `src/weapons.js`.
- **Add a new map** — copy `src/maps/forest.js`, register it in
  `src/maps/index.js`, and add a card in `index.html` + `styles.css`.

Have fun. Don't die.
