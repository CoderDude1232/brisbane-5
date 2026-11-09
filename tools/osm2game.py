#!/usr/bin/env python3
"""Convert OpenStreetMap extracts of inner Brisbane into the game's compact world file.

Usage: python3 -I tools/osm2game.py <tiles_dir> <water_dir> <wiki_tallest.json> <out.json>

water_dir holds full downloads (relation/<id>/full) of the river and creek multipolygons.

Coordinates are metres in a local frame centred on Brisbane City Hall:
x = east, z = south. Map data (c) OpenStreetMap contributors, ODbL 1.0.
"""
import json, math, re, sys, glob
import xml.etree.ElementTree as ET

LAT0, LON0 = -27.4689, 153.0235
KX = 111320.0 * math.cos(math.radians(LAT0))
KZ = 110574.0
BBOX = (152.995, -27.497, 153.050, -27.440)  # W S E N


def proj(lat, lon):
    return ((lon - LON0) * KX, -(lat - LAT0) * KZ)


X0, Z1 = proj(BBOX[1], BBOX[0])
X1, Z0 = proj(BBOX[3], BBOX[2])


def inside(x, z, pad=0):
    return X0 - pad <= x <= X1 + pad and Z0 - pad <= z <= Z1 + pad


nodes, ways, rels, node_tags = {}, {}, {}, {}


def load(path):
    for ev, el in ET.iterparse(path, events=('end',)):
        if el.tag == 'node':
            nid = int(el.get('id'))
            nodes[nid] = proj(float(el.get('lat')), float(el.get('lon')))
            t = {c.get('k'): c.get('v') for c in el if c.tag == 'tag'}
            if t:
                node_tags[nid] = t
            el.clear()
        elif el.tag == 'way':
            wid = int(el.get('id'))
            if wid not in ways:
                ways[wid] = ([int(c.get('ref')) for c in el if c.tag == 'nd'], {c.get('k'): c.get('v') for c in el if c.tag == 'tag'})
            el.clear()
        elif el.tag == 'relation':
            rid = int(el.get('id'))
            mem = [(c.get('type'), int(c.get('ref')), c.get('role')) for c in el if c.tag == 'member']
            t = {c.get('k'): c.get('v') for c in el if c.tag == 'tag'}
            if rid not in rels or len(mem) > len(rels[rid][0]):
                rels[rid] = (mem, t)
            el.clear()


def num(v):
    if v is None:
        return None
    m = re.match(r'\s*([-\d.]+)', v.replace(',', '.'))
    if not m:
        return None
    try:
        f = float(m.group(1))
    except ValueError:
        return None
    if 'ft' in v or "'" in v:
        f *= 0.3048
    return f


def coords(ids):
    return [nodes[i] for i in ids if i in nodes]


def dp(pts, tol):
    """Douglas-Peucker simplification of an open polyline."""
    if len(pts) < 3:
        return pts
    a, b = pts[0], pts[-1]
    dx, dz = b[0] - a[0], b[1] - a[1]
    L = math.hypot(dx, dz) or 1e-9
    best, bi = -1, 0
    for i in range(1, len(pts) - 1):
        p = pts[i]
        d = abs(dz * (p[0] - a[0]) - dx * (p[1] - a[1])) / L
        if d > best:
            best, bi = d, i
    if best > tol:
        return dp(pts[:bi + 1], tol)[:-1] + dp(pts[bi:], tol)
    return [a, b]


def ring_simplify(pts, tol):
    if len(pts) > 1 and pts[0] == pts[-1]:
        pts = pts[:-1]
    if len(pts) < 4:
        return pts
    # split at the point farthest from pts[0] so DP works on two open halves
    far = max(range(len(pts)), key=lambda i: (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2)
    a = dp(pts[:far + 1], tol)
    b = dp(pts[far:] + [pts[0]], tol)
    return a[:-1] + b[:-1]


def assemble(way_ids):
    """Join member ways into rings/chains by matching endpoints."""
    segs = [list(ways[w][0]) for w in way_ids if w in ways]
    out = []
    while segs:
        cur = segs.pop()
        changed = True
        while changed and cur[0] != cur[-1]:
            changed = False
            for i, s in enumerate(segs):
                if s[0] == cur[-1]:
                    cur += s[1:]
                elif s[-1] == cur[-1]:
                    cur += s[::-1][1:]
                elif s[-1] == cur[0]:
                    cur = s[:-1] + cur
                elif s[0] == cur[0]:
                    cur = s[::-1][:-1] + cur
                else:
                    continue
                segs.pop(i)
                changed = True
                break
        out.append(cur)
    return out


def area(pts):
    return sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts))) / 2


def centroid(pts):
    return (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))


def pip(x, z, pts):
    c = False
    j = len(pts) - 1
    for i in range(len(pts)):
        xi, zi = pts[i]
        xj, zj = pts[j]
        if (zi > z) != (zj > z) and x < (xj - xi) * (z - zi) / (zj - zi + 1e-12) + xi:
            c = not c
        j = i
    return c


def flat(pts, scale=10):
    o = []
    for x, z in pts:
        o.append(int(round(x * scale)))
        o.append(int(round(z * scale)))
    return o


HOUSE = {'house', 'detached', 'semidetached_house', 'bungalow', 'terrace', 'semi', 'cabin', 'hut'}
APART = {'apartments', 'residential', 'dormitory', 'flats', 'hotel'}
COMM = {'commercial', 'office', 'retail', 'supermarket', 'kiosk', 'yes', 'mixed_use'}
IND = {'industrial', 'warehouse', 'factory', 'manufacture', 'storage_tank', 'service', 'transportation', 'train_station', 'hangar'}
CIVIC = {'church', 'cathedral', 'chapel', 'public', 'civic', 'government', 'school', 'university', 'college', 'hospital', 'museum', 'library', 'courthouse', 'fire_station', 'police', 'townhall', 'theatre', 'stadium', 'grandstand', 'sports_centre', 'pavilion'}
SMALL = {'garage', 'garages', 'shed', 'carport', 'roof', 'hut', 'toilets', 'container', 'kiosk', 'bunker', 'shelter'}


def classify(t, h):
    b = t.get('building') or t.get('building:part') or 'yes'
    if b in SMALL:
        return 'small'
    if h >= 45:
        return 'tower'
    if b in HOUSE:
        return 'house'
    if b in APART:
        return 'apart'
    if b in IND:
        return 'ind'
    if b in CIVIC or t.get('amenity') in ('place_of_worship', 'townhall', 'school', 'university', 'library'):
        return 'civic'
    return 'comm'


def default_height(t):
    b = t.get('building') or t.get('building:part') or 'yes'
    if b in ('garage', 'garages', 'shed', 'carport', 'toilets', 'container', 'kiosk', 'shelter'):
        return 3.0
    if b == 'roof':
        return 4.5
    if b in HOUSE:
        return 7.0
    if b in APART:
        return 10.5
    if b in IND:
        return 8.5
    if b in ('church', 'cathedral', 'chapel'):
        return 14.0
    return 8.0


def main():
    tiles_dir, water_dir, wiki_path, out_path = sys.argv[1:5]
    for f in sorted(glob.glob(tiles_dir + '/*.osm')):
        load(f)
    river_ids = []
    for f in sorted(glob.glob(water_dir + '/*.osm')):
        before = set(rels)
        load(f)
        river_ids += [r for r in rels if r not in before or ('r%d.osm' % r) in f]
    river_ids = sorted(set(r for r in river_ids if rels[r][1].get('water') in ('river', 'stream', 'canal') or rels[r][1].get('waterway') == 'riverbank'))
    print('nodes', len(nodes), 'ways', len(ways), 'rels', len(rels), file=sys.stderr)

    wiki = {}
    try:
        for r in json.load(open(wiki_path)):
            wiki[re.sub(r'[^a-z0-9]', '', r['name'].lower())] = r['h']
    except Exception:
        pass

    # ---- Buildings ----
    blds = []
    def add_building(pts, t, rel=False):
        if len(pts) < 3:
            return
        cx, cz = centroid(pts)
        if not inside(cx, cz):
            return
        pts = ring_simplify(pts, 0.25)
        if len(pts) < 3 or abs(area(pts)) < 4:
            return
        is_part = 'building:part' in t and 'building' not in t
        h = num(t.get('height'))
        lv = num(t.get('building:levels'))
        mh = num(t.get('min_height'))
        if mh is None and t.get('building:min_level'):
            mh = (num(t.get('building:min_level')) or 0) * 3.2
        roof_h = num(t.get('roof:height')) or 0
        if h is None and lv:
            h = lv * 3.2 + roof_h + (0.8 if lv > 4 else 0)
        if h is None:
            h = default_height(t)
        name = t.get('name')
        if name and not is_part:
            key = re.sub(r'[^a-z0-9]', '', name.lower())
            for wk, wh in wiki.items():
                if wk and (wk == key or (len(wk) > 6 and wk in key) or (len(key) > 6 and key in wk)):
                    if wh > h * 1.03:
                        h = wh
                    break
        rec = {'p': flat(pts), 'h': round(h, 1)}
        if mh:
            rec['mh'] = round(mh, 1)
        if lv:
            rec['lv'] = int(lv)
        rec['k'] = classify(t, h)
        for src, dst in (('roof:shape', 'rs'), ('roof:colour', 'rc'), ('building:colour', 'bc'), ('building:material', 'bm'), ('name', 'n')):
            if t.get(src):
                rec[dst] = t[src]
        if roof_h:
            rec['rh'] = round(roof_h, 1)
        if is_part:
            rec['part'] = 1
        b = t.get('building') or t.get('building:part')
        if b and b not in ('yes',):
            rec['b'] = b
        blds.append((rec, pts))

    for wid, (nd, t) in ways.items():
        if ('building' in t or 'building:part' in t) and nd and nd[0] == nd[-1]:
            if t.get('building') in ('no', 'construction') or t.get('building:part') == 'no':
                continue
            add_building(coords(nd), t)
    for rid, (mem, t) in rels.items():
        if t.get('type') == 'multipolygon' and ('building' in t or 'building:part' in t):
            outers = [m[1] for m in mem if m[0] == 'way' and m[2] in ('outer', '')]
            for ring in assemble(outers):
                if ring[0] == ring[-1]:
                    add_building(coords(ring), t, True)
        elif t.get('type') == 'building':
            pass

    # Outlines that contain parts are not drawn (the parts are), but still collide.
    parts = [(centroid(p), r) for r, p in blds if r.get('part')]
    for r, p in blds:
        if r.get('part'):
            continue
        x0 = min(q[0] for q in p); x1 = max(q[0] for q in p); z0 = min(q[1] for q in p); z1 = max(q[1] for q in p)
        for (cx, cz), pr in parts:
            if x0 <= cx <= x1 and z0 <= cz <= z1 and pip(cx, cz, p):
                r['hide'] = 1
                break
    buildings = [r for r, _ in blds]
    print('buildings', len(buildings), 'parts', len(parts), file=sys.stderr)

    # ---- Roads ----
    CAR = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street',
           'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link', 'service', 'busway']
    WALK = ['pedestrian', 'footway', 'path', 'cycleway', 'steps']
    CLASSES = CAR + WALK
    LANES = {'motorway': 3, 'trunk': 4, 'primary': 4, 'secondary': 2, 'tertiary': 2, 'unclassified': 2, 'residential': 2,
             'living_street': 2, 'motorway_link': 1, 'trunk_link': 1, 'primary_link': 1, 'secondary_link': 1,
             'tertiary_link': 1, 'service': 1, 'busway': 2}
    names, name_idx = [], {}
    def nidx(n):
        if not n:
            return -1
        if n not in name_idx:
            name_idx[n] = len(names)
            names.append(n)
        return name_idx[n]

    road_ways = []
    for wid, (nd, t) in ways.items():
        hw = t.get('highway')
        if hw not in CLASSES:
            continue
        if t.get('tunnel') in ('yes', 'building_passage', 'culvert') or t.get('area') == 'yes':
            continue
        if num(t.get('layer')) is not None and num(t.get('layer')) < 0:
            continue
        if hw == 'service' and t.get('service') in ('parking_aisle', 'drive-through'):
            continue
        if hw in ('footway', 'path') and t.get('footway') in ('sidewalk', 'crossing'):
            continue  # sidewalks are drawn alongside the road already
        pts = [n for n in nd if n in nodes]
        if len(pts) < 2:
            continue
        if not any(inside(*nodes[n], 50) for n in pts):
            continue
        road_ways.append((wid, pts, t))
    use = {}
    for wid, pts, t in road_ways:
        for i, n in enumerate(pts):
            use[n] = use.get(n, 0) + (2 if i in (0, len(pts) - 1) else 1)
    node_id, node_list = {}, []
    def gid(n):
        if n not in node_id:
            node_id[n] = len(node_list)
            node_list.append(nodes[n])
        return node_id[n]
    edges = []
    for wid, pts, t in road_ways:
        hw = t['highway']
        ow = t.get('oneway')
        oneway = 1 if ow in ('yes', 'true', '1') or (hw in ('motorway', 'motorway_link') and ow != 'no') or t.get('junction') == 'roundabout' else (-1 if ow == '-1' else 0)
        lanes = int(num(t.get('lanes')) or LANES.get(hw, 1))
        bridge = 1 if t.get('bridge') and t.get('bridge') != 'no' else 0
        nm = nidx(t.get('name') or t.get('ref'))
        bnm = nidx(t.get('bridge:name')) if bridge and t.get('bridge:name') else -1
        cls = CLASSES.index(hw)
        start = 0
        for i in range(1, len(pts)):
            if use.get(pts[i], 0) >= 2 or i == len(pts) - 1:
                seg = pts[start:i + 1]
                if oneway == -1:
                    seg = seg[::-1]
                poly = dp([nodes[n] for n in seg], 0.4)
                a, b = gid(seg[0]), gid(seg[-1])
                if a != b:
                    edges.append([a, b, cls, nm, 1 if oneway else 0, lanes, bridge, flat(poly[1:-1])] + ([bnm] if bnm >= 0 else []))
                start = i
    print('road nodes', len(node_list), 'edges', len(edges), file=sys.stderr)

    # ---- Water ----
    water = []
    for rid in river_ids:
        mem = rels[rid][0]
        outers = [m[1] for m in mem if m[0] == 'way' and m[2] == 'outer']
        inners = [m[1] for m in mem if m[0] == 'way' and m[2] == 'inner']
        for ring in assemble(outers):
            pts = coords(ring)
            if len(pts) > 3 and ring[0] == ring[-1] and any(inside(x, z, 2000) for x, z in pts):
                water.append({'t': 'river', 'p': flat(ring_simplify(pts, 0.8))})
        for ring in assemble(inners):
            pts = coords(ring)
            if len(pts) > 3 and ring[0] == ring[-1] and any(inside(x, z, 500) for x, z in pts):
                water.append({'t': 'island', 'p': flat(ring_simplify(pts, 0.8))})
    print('river relations', river_ids, file=sys.stderr)
    for wid, (nd, t) in ways.items():
        if (t.get('natural') == 'water' or t.get('leisure') == 'swimming_pool' or t.get('water')) and nd and nd[0] == nd[-1] and t.get('water') not in ('river', 'stream', 'canal'):
            pts = coords(nd)
            if len(pts) > 3 and inside(*centroid(pts)):
                water.append({'t': 'pool' if t.get('leisure') == 'swimming_pool' else 'pond', 'p': flat(ring_simplify(pts, 0.3))})

    # ---- Ground cover ----
    GREEN = {('leisure', 'park'): 'park', ('leisure', 'garden'): 'park', ('leisure', 'pitch'): 'pitch',
             ('leisure', 'playground'): 'play', ('leisure', 'golf_course'): 'park', ('leisure', 'dog_park'): 'park',
             ('leisure', 'stadium'): 'stadium', ('landuse', 'grass'): 'grass', ('landuse', 'recreation_ground'): 'park',
             ('landuse', 'cemetery'): 'park', ('landuse', 'forest'): 'wood', ('landuse', 'meadow'): 'grass',
             ('landuse', 'village_green'): 'grass', ('natural', 'wood'): 'wood', ('natural', 'scrub'): 'wood',
             ('natural', 'grassland'): 'grass', ('amenity', 'parking'): 'parking', ('natural', 'beach'): 'sand',
             ('natural', 'sand'): 'sand', ('natural', 'bare_rock'): 'rock', ('natural', 'cliff'): 'rock',
             ('highway', 'pedestrian'): 'plaza', ('place', 'square'): 'plaza', ('amenity', 'school'): 'school',
             ('landuse', 'railway'): 'rail'}
    areas = []
    def add_area(pts, typ):
        if len(pts) > 3 and inside(*centroid(pts), 100) and abs(area(pts)) > 20:
            areas.append({'t': typ, 'p': flat(ring_simplify(pts, 0.6))})
    for wid, (nd, t) in ways.items():
        if not nd or nd[0] != nd[-1]:
            continue
        for (k, v), typ in GREEN.items():
            if t.get(k) == v and (k != 'highway' or t.get('area') == 'yes'):
                add_area(coords(nd), typ)
                break
    for rid, (mem, t) in rels.items():
        if t.get('type') != 'multipolygon':
            continue
        for (k, v), typ in GREEN.items():
            if t.get(k) == v:
                for ring in assemble([m[1] for m in mem if m[0] == 'way' and m[2] in ('outer', '')]):
                    if ring[0] == ring[-1]:
                        add_area(coords(ring), typ)
                break

    # ---- Trees, rail, cliffs ----
    trees = []
    for nid, t in node_tags.items():
        if t.get('natural') == 'tree' and nid in nodes and inside(*nodes[nid]):
            trees += [int(round(nodes[nid][0])), int(round(nodes[nid][1]))]
    for wid, (nd, t) in ways.items():
        if t.get('natural') == 'tree_row':
            pts = coords(nd)
            for i in range(len(pts) - 1):
                a, b = pts[i], pts[i + 1]
                L = math.hypot(b[0] - a[0], b[1] - a[1])
                for s in range(0, int(L), 9):
                    x, z = a[0] + (b[0] - a[0]) * s / L, a[1] + (b[1] - a[1]) * s / L
                    if inside(x, z):
                        trees += [int(round(x)), int(round(z))]
    rail = []
    for wid, (nd, t) in ways.items():
        if t.get('railway') in ('rail', 'light_rail') and t.get('tunnel') != 'yes':
            pts = coords(nd)
            if len(pts) > 1 and any(inside(x, z) for x, z in pts):
                rail.append({'b': 1 if t.get('bridge') == 'yes' else 0, 'p': flat(dp(pts, 0.5))})
    cliffs = []
    for wid, (nd, t) in ways.items():
        if t.get('natural') == 'cliff':
            pts = coords(nd)
            if len(pts) > 1 and any(inside(x, z) for x, z in pts):
                cliffs.append(flat(dp(pts, 0.5)))

    # ---- Street furniture and river line ----
    pois = {'signals': [], 'crossing': [], 'bus': [], 'ferry': [], 'lamp': []}
    for nid, t in node_tags.items():
        if nid not in nodes or not inside(*nodes[nid]):
            continue
        x, z = nodes[nid]
        hw = t.get('highway')
        if hw == 'traffic_signals':
            pois['signals'] += [int(round(x)), int(round(z))]
        elif hw == 'crossing' or t.get('crossing') in ('zebra', 'marked', 'traffic_signals'):
            pois['crossing'] += [int(round(x)), int(round(z))]
        elif hw == 'bus_stop':
            pois['bus'] += [int(round(x)), int(round(z))]
        elif hw == 'street_lamp':
            pois['lamp'] += [int(round(x)), int(round(z))]
        elif t.get('amenity') == 'ferry_terminal':
            pois['ferry'].append([int(round(x)), int(round(z)), t.get('name', '')])
    riverline = []
    for wid, (nd, t) in ways.items():
        if t.get('waterway') == 'river' and t.get('name') == 'Brisbane River':
            pts = coords(nd)
            if len(pts) > 1 and any(inside(x, z, 300) for x, z in pts):
                riverline.append(flat(dp(pts, 1.0)))

    out = {
        'attribution': 'Map data (c) OpenStreetMap contributors, ODbL 1.0. https://www.openstreetmap.org/copyright',
        'origin': [LAT0, LON0], 'bounds': [round(X0), round(Z0), round(X1), round(Z1)], 'scale': 10,
        'classes': CLASSES, 'names': names,
        'nodes': flat(node_list), 'edges': edges,
        'buildings': buildings, 'water': water, 'areas': areas, 'trees': trees, 'rail': rail, 'cliffs': cliffs,
        'pois': pois, 'riverline': riverline,
    }
    with open(out_path, 'w') as f:
        json.dump(out, f, separators=(',', ':'))
    print('areas', len(areas), 'water', len(water), 'trees', len(trees) // 2, 'rail', len(rail), 'cliffs', len(cliffs), file=sys.stderr)


if __name__ == '__main__':
    main()
