# Grand Theft Ute: Brisvegas

A GTA-style open-world browser game set in Brisbane, Queensland. It runs on plain JavaScript and Three.js, with no build step.

## Play

Serve the folder with any static web server and open `index.html`:

```sh
npx http-server -p 8080 .
# then open http://localhost:8080
```

You can't open the file directly from disk because browsers block the scripts it loads over `file://`.

## The city

Real inner Brisbane, about 6 km × 6.3 km from Toowong to Bulimba and Herston to Dutton Park, built from OpenStreetMap data:

- **About 23,600 buildings** on their real footprints and heights, including the full CBD skyline: Skytower, The One, 1 William St, Infinity, Soleil, Aurora, Riparian Plaza, 111 Eagle, Waterfront Place, Brisbane Square and more. Famous towers get hand-modelled detail based on reference photos.
- **The real street network:** about 19,800 road segments with real names, lanes, one-way streets and bridges. There are about 600 working traffic lights at their real junctions, plus real crossings, bus stops and street lamps.
- **The Brisbane River and its creeks**, traced from OSM polygons, with CityCats running between real terminals. If you drive in, you sink.
- **Landmarks:** Story Bridge truss, Kurilpa masts, Goodwill arch, Wheel of Brisbane, Streets Beach, Customs House, City Hall clock tower, Treasury, St Stephen's, Parliament House, the XXXX sign in Milton, Suncorp Stadium, the Gabba and the Kangaroo Point Cliffs.
- **Suburbs:** Queenslanders on stumps with verandahs, post-war brick homes, Hills Hoists, real parks and trees (jacarandas in bloom).
- **Wildlife:** bin chickens in the parks, and swooping magpies in spring.
- **Day/night cycle** with lit windows, street lights, a physical sky and reflections.

## Gameplay

- Steal anything: utes, HiLaxes, Commodorks, Prahdos, Black & White cabs, TransBlink buses and QPS Interceptors. Traffic drives on the left.
- **Weapons:** fists, a cricket bat, a pistol and a micro SMG.
- **Wanted levels (1–5 stars).** Queensland Police chase you in checkered patrol cars and get out to arrest or shoot you. From three stars, the PolAir chopper joins in. Get out of sight to lose them.
- **Wasted / Busted:** you respawn at the RBWH or Roma St.
- **Six story missions:** *G'day Brisvegas*, *A Slab for the Boys*, *Bin Chicken Bandit*, *Valley Bikies*, *Story Bridge Sprint* and *Sunset at Coot-tha*.
- **HUD:** a rotating minimap with GPS route, a full map (M) and three synthesized radio stations (Q).

## Controls

| Key | Action |
| --- | --- |
| WASD | Move / drive |
| Mouse | Look (click to lock; drag if it can't lock). ← → also turn the camera |
| Left / right click | Shoot or punch / aim |
| F | Enter, exit or carjack |
| Space | Jump / handbrake |
| Shift | Sprint |
| 1–4, mouse wheel | Weapons |
| Q | Radio station |
| H / E | Horn / siren (in a cop car) |
| M / P | Map / pause |

## Code layout

| File | What it does |
| --- | --- |
| `js/world.js` | Loads `data/brisbane.json`: road graph, water mask, path-finding, street names |
| `js/cityBuild.js` | Builds the real city: ground cover, river, roads, every building, trees |
| `tools/osm2game.py` | Converts OpenStreetMap downloads into `data/brisbane.json` |
| `js/worldBuild.js` | Geometry merger, footprint helpers, colliders, textures |
| `js/landmarks.js` | Hand-modelled landmark detail matched to OSM buildings by name |
| `js/detail.js` | Close-up architectural detail streamed in around the camera |
| `js/render.js` | Renderer, physical sky, reflections, bloom, day/night |
| `js/textures.js` | Procedural PBR textures (facades, asphalt, water, foliage) |
| `js/props.js` | Working traffic lights, street furniture, riverbanks, CityCat terminals |
| `js/models.js` | Low-poly people, cars, birds and the helicopter |
| `js/vehicles.js` | Car physics, traffic AI, police pursuit AI, collisions |
| `js/peds.js` | Pedestrians, ibis, magpies |
| `js/player.js` | Player movement, weapons, carjacking |
| `js/police.js` | Wanted level, dispatch, PolAir |
| `js/missions.js` | Story missions |
| `js/hud.js` | HUD, minimap, big map |
| `js/audio.js` | Synthesized engine, guns, sirens, radio |
| `js/main.js` | Boot, input, camera, day/night, spawning, main loop |

Three.js r128 and its post-processing/sky/SSAO example modules are vendored in `lib/` (MIT license). Local tweaks are marked "Brisvegas": `Sky.js` adds a gain, night tint and stars; `SSAOShader.js` fades AO with distance; `SSAOPass.js` can apply AO more than once for strength.

## Real map data

The city is built from OpenStreetMap: every building footprint, road, bridge, park and the river itself (see `docs/RESEARCH.md`). Map data © OpenStreetMap contributors, ODbL 1.0.
