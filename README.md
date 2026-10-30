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
- **Real landmarks** (about 40, placed roughly where they stand):
  - **CBD:** Brisbane Skytower (with its sky pool), 1 William St, Infinity Tower (lit crown), Soleil, Aurora, Riparian Plaza, Waterfront Place, 480 Queen St (diagrid), Brisbane Square (coloured boxes), and Queen's Wharf with the Sky Deck and the Neville Bonner Bridge.
  - **Heritage:** the Treasury Building, Customs House (copper dome), City Hall and King George Square, Anzac Square and the Shrine of Remembrance, Central and Roma St stations, St Stephen's Cathedral, Parliament House and the City Botanic Gardens, and the Old Windmill.
  - **South Bank:** GOMA, the State Library, the Queensland Museum, QPAC, the Wheel of Brisbane, Streets Beach, the BRISBANE sign, the Nepal Peace Pagoda, the Arbour and the Convention Centre.
  - **Around town:** the Story Bridge Hotel, Kangaroo Point Cliffs, Howard Smith Wharves, Chinatown Mall, Brisbane Powerhouse, the Teneriffe woolstores, the Newstead gasworks, the Ekka, the Breakfast Creek Hotel, Eat Street, the Regatta Hotel, UQ's Great Court, Indro, Lone Pine, Mt Coot-tha Botanic Gardens, Suncorp Stadium, the Gabba and the XXXX Brewery.
  - **Bridges:** the Kurilpa masts, the Kangaroo Point green bridge, the art-deco pylons on William Jolly / Victoria / Go Between, and the Story Bridge's steel truss.
- **Street level:** real CBD street names (the ladies' and gents' grid of Queen, Adelaide, Ann, George, Albert, Edward, Eagle and more) shown in the HUD. Street lights, traffic signals, zebra crossings, footpath awnings, TransBlink bus stops, power poles and wires in the suburbs, wheelie bins, Hills Hoists, rainwater tanks and fences. Queenslanders, post-war brick homes and new builds. Mangroves along the river, the Riverwalk, and CityCat terminals.
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
| `js/worldBuild.js` | Merges the city into chunked meshes: roads, generic buildings, houses, colliders, minimap image |
| `js/landmarks.js` | Real Brisbane buildings |
| `js/detail.js` | Close-up architectural detail streamed in around the camera |
| `js/render.js` | Renderer, physical sky, reflections, bloom, day/night |
| `js/textures.js` | Procedural PBR textures (facades, asphalt, water, foliage) |
| `js/props.js` | Street furniture, riverbanks, CityCat terminals |
| `js/models.js` | Low-poly people, cars, birds and the helicopter |
| `js/vehicles.js` | Car physics, traffic AI, police pursuit AI, collisions |
| `js/peds.js` | Pedestrians, ibis, magpies |
| `js/player.js` | Player movement, weapons, carjacking |
| `js/police.js` | Wanted level, dispatch, PolAir |
| `js/missions.js` | Story missions |
| `js/hud.js` | HUD, minimap, big map |
| `js/audio.js` | Synthesized engine, guns, sirens, radio |
| `js/main.js` | Boot, input, camera, day/night, spawning, main loop |

Three.js r128 and its post-processing/sky example modules are vendored in `lib/` (MIT license); `lib/examples/Sky.js` adds a gain, night tint and stars.
