# How Brisbane was recreated

## Sources

| What | Source | Licence |
| --- | --- | --- |
| Buildings, footprints, heights, levels, roof shapes, colours, building parts | OpenStreetMap (API `map` calls over a 5×6 tile grid, about 6 km × 6.3 km) | ODbL 1.0 |
| Roads (class, lanes, one-way, bridges, names), paths, rail | OpenStreetMap | ODbL 1.0 |
| Brisbane River, Breakfast / Norman / Enoggera creeks (full multipolygons) | OpenStreetMap relations 7642164, 1627033–35, 1627026, 5325731, 20643754 | ODbL 1.0 |
| Parks, pitches, plazas, parking, trees, cliffs | OpenStreetMap | ODbL 1.0 |
| Traffic signals, crossings, bus stops, street lamps, CityCat terminals | OpenStreetMap nodes | ODbL 1.0 |
| Official heights of the 23 tallest towers (corrects OSM where it is lower) | Wikipedia, *List of tallest buildings in Brisbane* (`data/wiki_tallest.json`) | CC BY-SA |
| Look of landmarks (Skytower bands, Riparian Plaza crown, 111 Eagle diagrid, Infinity, Brisbane Square, Story Bridge, etc.) | Wikipedia / Wikimedia Commons infobox photos, used as reference only (not shipped) | — |

Street View and commercial satellite imagery (Google, Apple, Esri) aren't used. Their terms don't allow copying them into a game, and they couldn't be fetched from this environment anyway.

## Pipeline

```sh
tools/fetch_osm_tiles.sh osm/tiles                       # ~140 MB of OSM XML
# fetch each river relation: https://api.openstreetmap.org/api/0.6/relation/<id>/full -> osm/water/r<id>.osm
python3 -I tools/osm2game.py osm/tiles osm/water data/wiki_tallest.json data/brisbane.json
```

`osm2game.py` projects everything into metres around Brisbane City Hall (x east, z south) and simplifies outlines. It infers heights from `height`, `building:levels` and `min_height`, raising famous towers to their official Wikipedia height. It classifies buildings (tower / apartment / office / civic / house / industrial / small) and splits roads into a routable graph. The result is a ~4.4 MB JSON (1.4 MB gzipped).

## In the game

- **Buildings:** about 23,600, each extruded on its real footprint at its real height. OSM `building:part`s give multi-volume towers their real setbacks. Roof shapes and colours come from OSM where tagged.
- **Houses:** each one gets a Queenslander, post-war or modern treatment, with its verandah turned to the actual street.
- **Landmarks:** hand-modelled detail is matched by OSM name (`js/landmarks.js`). This covers the Skytower bands, the Riparian crown and mast, the 111 Eagle diagrid, the Infinity/Aurora lit crowns, the Customs House dome, the City Hall clock tower and colonnade, the Treasury colonnades, the St Stephen's spires, and the Story Bridge truss on the real bridge deck. It also covers the Kurilpa masts, the Goodwill arch, the Wheel of Brisbane, the XXXX sign, the Gabba light towers and the Kangaroo Point cliffs.
- **Roads:** about 19,800 real road segments. Traffic drives on the left following real one-way rules, and stops at about 600 working signalised junctions placed from OSM.
