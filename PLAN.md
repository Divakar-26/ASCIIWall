# ASCIIWall — plan

## 1. The art style (read from `inspo/`)

| Trait | Seen in | How we reproduce it |
|---|---|---|
| A hidden colour scene, shown only as a grid of glyphs | every piece ("a 3D sea rendered in a shader you never see") | Pass 1 renders the scene at **one texel per character cell**; pass 2 draws glyphs |
| Every cell has its own colour (not monochrome terminal) | koi, flowers, paintings, lighthouse | Glyph colour = scene colour, normalised to full hue |
| Dense glyph ramps: `. : - = + ( ) % & # @`, binary `0 1 :` | koi, flower field | Ramps chosen per scene from a glyph atlas |
| **Tile** look: coloured square behind each glyph, glyph sunk in darker | koi pond | `tile` render style |
| **Flow** look: dashes rotated along the surface, foam as growing dots | ASCII waves | `flow` render style (procedural dashes/dots) |
| Soft bloom / haze around bright subjects | butterfly, koi, black hole, flowers | Mip-mapped scene texture sampled blurry and added |
| Dark, muted, warm-or-deep-blue backgrounds, vignette, a little film grain | all | Composite pass |
| Slow, organic motion; things react to the cursor | koi following the cursor, wake in water | Per-scene JS sims + a shared GPU ripple/trail simulation |

Mood: **cozy, quiet, nocturnal, a little nostalgic.** Nothing loud or glitchy.

## 2. Architecture

```
web/                 ← the whole renderer + app (plain JS, no build step, WebGL2)
  js/engine.js       3-pass renderer: ripple sim → scene → ASCII composite (+bloom, grain, vignette)
  js/glyphs.js       glyph-atlas builder (canvas → texture), ramps
  js/scenes/*.js     the library; each scene = GLSL + optional JS simulation
  js/app.js          library UI, settings, keyboard, clock, wallpaper mode
  js/element.js      <ascii-wall scene="koi"> web component (embed anywhere)
  index.html         app;  wallpaper.html = UI-less wallpaper mode
desktop/             Electron shell: tray, real desktop-layer wallpaper windows (per monitor), autostart
github/              Contribution-garden SVG generator (animated, README-safe) + Actions workflows
tools/bundle.mjs     builds web/dist/asciiwall.js (single-file embed bundle)
```

### Render pipeline (per frame)
1. **Sim** (cols×rows, RGBA16F ping-pong): R/G = wave-equation ripple height, B = slow-fading cursor trail.
2. **Scene** (cols×rows, RGBA8 + mipmaps): scene shader outputs `rgb` + `a` (glyph density, or flow angle).
3. **Composite** (full res): per cell → choose glyph by density from the atlas, colour it, style (`glyph`/`tile`/`flow`), add bloom from scene mips, vignette, grain, gentle glyph shimmer, optional tint (amber / phosphor / …).

## 3. Library (v1)
1. **Koi Pond** (tile style): koi swim on their own, come to look at your cursor, and scatter when you click. Includes lily pads, lotus, and ripples.
2. **Moonlit Tide** (flow style): the swell follows the dash glyphs, and sweeping the cursor leaves a foamy wake.
3. **Firefly Meadow**: night flowers in binary glyphs, with fireflies that gather around the cursor.
4. **Rainy Window**: a city in bokeh behind fogged glass. Wipe the fog with the cursor and it slowly fogs over again. There's a mug with steam on the sill.
5. **Hearth**: a campfire with embers. The cursor acts as wind and a click throws sparks.
6. **Jellyfish Drift**: bioluminescent jellies under light rays, with marine snow.
7. **Aurora Cabin**: aurora over mountains, a cabin window lit up, and a lake whose surface ripples when you touch it.
8. **Contribution Garden**: your GitHub contributions grown as flowers, with hover tooltips.
9. **Living Image**: drop in any picture and it becomes ASCII, breathing light, with a lantern that follows the cursor.

## 4. Platforms
| Platform | How |
|---|---|
| Browser / any OS | `web/index.html` (fullscreen) |
| Linux (X11) & macOS | Electron app, `type:'desktop'` windows on every monitor, tray menu, global cursor feed so it reacts even behind icons |
| Windows | Electron window mode + `web/` is a drop-in **Lively Wallpaper** / **Wallpaper Engine** web wallpaper (manifests included) |
| Android / iOS | Installable PWA (fullscreen, touch interaction, offline) |
| Any website / GitHub Pages | `<ascii-wall>` web component, one `<script>` |
| GitHub README | Animated ASCII **contribution garden SVG** (READMEs can't run JS) that links to the live interactive page on GitHub Pages; daily refresh via GitHub Action |

## 5. Settings
Density (cell size), glow, grain, motion speed, FPS cap (battery), interactions on/off, glyph set override, colour tint, clock overlay. Your choices are saved.

## 6. Verification
Render every scene headless (Chrome + SwiftShader), take screenshots, and compare them against the inspo. Smoke-test the SVG generator and the Electron boot.
