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

- **The Brown Snake.** The Brisbane River winds past Toowong, around the CBD peninsula, Kangaroo Point and New Farm, then out past Hamilton. CityCat ferries run along it. If you drive into it you sink.
- **26 river crossings**, including the **Story Bridge** with its steel cantilever truss (lit up at night), Captain Cook, Victoria, Go Between, Kurilpa and Walter Taylor bridges.
- **Suburbs:** CBD towers, Fortitude Valley neon, South Bank, West End, Woolloongabba, Paddington, New Farm, Milton, Toowong and more. Each suburb has a mix of buildings: glass towers, Queenslanders on stilts with tin roofs and verandahs, Hills Hoists, backyard pools and jacarandas in bloom.
- **Landmarks:** the Wheel of Brisbane, Streets Beach and the BRISBANE sign at South Bank; Queen Street Mall; City Hall and King George Square; Suncorp Stadium (in maroon); the Gabba; the XXXX Brewery in Milton; the Kangaroo Point Cliffs; the RBWH; Roma St police HQ. **Mt Coot-tha**, with its TV towers and lookout, is drivable.
- **Wildlife:** bin chickens (ibis) wander the parks. It's spring, so magpies swoop you in the suburbs.
- **Day/night cycle** (one game day is 16 minutes): office windows and Valley neon light up after dark.

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
| `js/world.js` | River, road grid, bridges, suburbs, path-finding (pure data) |
| `js/worldBuild.js` | Merges the city into chunked meshes, plus colliders, landmarks and the minimap image |
| `js/models.js` | Low-poly people, cars, birds and the helicopter |
| `js/vehicles.js` | Car physics, traffic AI, police pursuit AI, collisions |
| `js/peds.js` | Pedestrians, ibis, magpies |
| `js/player.js` | Player movement, weapons, carjacking |
| `js/police.js` | Wanted level, dispatch, PolAir |
| `js/missions.js` | Story missions |
| `js/hud.js` | HUD, minimap, big map |
| `js/audio.js` | Synthesized engine, guns, sirens, radio |
| `js/main.js` | Boot, input, camera, day/night, spawning, main loop |

Three.js r128 is vendored in `lib/` (MIT license).
