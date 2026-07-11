#!/usr/bin/env python3
"""Rebuild each puzzle straight from the book pages, the way the print book
lays them out:

  * the clue page  -> one cut-out card per suspect (portrait + name + clue),
                      the puzzle's background colour, the suspect list + victim
  * the next page  -> the crime-scene map only (no answer grid / murderer box)
                      plus a detected grid box for the interactive overlay

Renders both pages with headless Chromium (exact fonts + art), then crops with
Pillow using the absolutely-positioned name coordinates. Writes assets into
assets/cards/ and assets/maps/ and merges the results into data/puzzles.json.
"""
import re, os, sys, json, subprocess, statistics, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extract_lib import get_spans
from extract import spine_pages, parse_clue_page
from extract_lib import page_text
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOOKS = {1: os.path.join(ROOT, 'Puzzles Book 1'),
         2: os.path.join(ROOT, 'Puzzle Books 2')}
CARDS = os.path.join(ROOT, 'assets', 'cards')
MAPS = os.path.join(ROOT, 'assets', 'maps')
NAME_RE = re.compile(r"^[A-ZÀ-Þ][A-Za-zà-ÿ'’\-]{1,19}$")


def norm(s):
    return re.sub(r'[^a-zà-ÿ]', '', (s or '').lower())


def geometry(page_path):
    raw = open(page_path, encoding='utf-8').read()
    sm = re.search(r'transform:\s*scale\(([\d.]+)\)', raw)
    vp = re.search(r'width=(\d+),\s*height=(\d+)', raw)
    return (float(sm.group(1)), int(vp.group(1)), int(vp.group(2))) if sm and vp else None


def cluster(vals, gap):
    s = sorted(vals)
    g = [[s[0]]]
    for v in s[1:]:
        (g.append([v]) if v - g[-1][-1] > gap else g[-1].append(v))
    return g


# ---------- enumerate (book, num) -> (clue page, puzzle page) ----------
def find_pairs():
    pairs = {}
    for book, bdir in BOOKS.items():
        opf = os.path.join(bdir, 'package.opf')
        pages = spine_pages(opf)
        for i, pp in enumerate(pages):
            t = page_text(pp)
            if re.search(r'is de moordenaar|moordenaar is[.\s…]*[A-ZÀ-Þ][a-z]', t):
                continue
            try:
                pc = parse_clue_page(pp)
            except Exception:
                pc = None
            if pc and pc.get('suspects') and any('slachto' in (s.get('clue') or '').lower()
                                                 for s in pc['suspects']):
                nxt = pages[i + 1] if i + 1 < len(pages) else None
                pairs.setdefault((book, pc['num']), (pp, nxt, pc['title']))
    return pairs


# ---------- suspects + positions from a clue page ----------
def page_people(clue_path):
    """Return (geo, title, [{'name','x','y'}...], victim_name)."""
    geo = geometry(clue_path)
    if not geo:
        return None
    scale, PW, PH = geo
    spans = get_spans(clue_path)
    from collections import Counter
    cand = Counter(s['font'] for s in spans if s['font'] and NAME_RE.match(s['text'].strip()))
    if not cand:
        return None
    namefont = cand.most_common(1)[0][0]
    sx = lambda s: s['left'] * scale
    sy = lambda s: PH - s['bottom'] * scale
    people = []
    seen = set()
    for s in spans:
        if s['font'] != namefont:
            continue
        t = s['text'].strip()
        if not NAME_RE.match(t) or norm(t) in seen:
            continue
        seen.add(norm(t))
        people.append({'name': t, 'x': sx(s), 'y': sy(s)})
    # victim = card region containing the "slachtoffer" text
    victim = None
    vs = next((s for s in spans if 'slachto' in s['text'].lower()), None)
    if vs and people:
        vx, vy = sx(vs), sy(vs)
        # nearest name above the slachtoffer text in the same column
        col_ok = [p for p in people if abs(p['x'] - vx) < PW * 0.16 and p['y'] <= vy + 4]
        victim = (max(col_ok, key=lambda p: p['y']) if col_ok
                  else min(people, key=lambda p: (p['x'] - vx) ** 2 + (p['y'] - vy) ** 2))['name']
    return geo, people, victim


def card_boxes(clue_path, geo, people):
    """Compute a crop box (page pixels) for each person's card: columns first,
    then extend each card down to the bottom of its clue text."""
    scale, PW, PH = geo
    xs = [p['x'] for p in people]
    xg = cluster(xs, PW * 0.11)
    ncols = len(xg)
    colc = [statistics.mean(g) for g in xg]
    cw = PW / ncols
    xoff = PW / 2 - statistics.mean(colc)
    col_of = lambda x: min(range(ncols), key=lambda k: abs(x - colc[k]))
    PORTH = 0.150 * PH
    for p in people:
        p['col'] = col_of(p['x'])
        p['ccx'] = colc[p['col']] + xoff
        p['lastclue'] = p['y']
    # extend each card to the bottom of its clue: assign each content span to
    # the nearest name above it in the same column
    spans = get_spans(clue_path)
    from collections import Counter
    namefont = Counter(s['font'] for s in spans
                       if s['font'] and NAME_RE.match(s['text'].strip())).most_common(1)[0][0]
    sx = lambda s: s['left'] * scale
    sy = lambda s: PH - s['bottom'] * scale
    for s in spans:
        t = s['text'].strip()
        if not t or re.fullmatch(r'\d+', t) or re.match(r'^\s*\d{1,2}\.', s['text']):
            continue
        if s['font'] == namefont and NAME_RE.match(t):
            continue
        x, y = sx(s), sy(s)
        c = col_of(x)
        cand = [p for p in people if p['col'] == c and p['y'] <= y + 4]
        if cand:
            tgt = max(cand, key=lambda p: p['y'])
            tgt['lastclue'] = max(tgt['lastclue'], y)
    # boxes with vertical clamping against column neighbours
    boxes = {}
    W = cw * 0.98
    for p in people:
        same = [o for o in people if o['col'] == p['col']]
        above = [o for o in same if o['y'] < p['y']]
        below = [o for o in same if o['y'] > p['y']]
        top = p['y'] - PORTH
        if above:
            top = max(top, max(a['lastclue'] for a in above) + 0.028 * PH)
        bot = p['lastclue'] + 0.028 * PH
        if below:
            bot = min(bot, (min(b['y'] for b in below) - PORTH) - 0.008 * PH)
        left, right = p['ccx'] - W / 2, p['ccx'] + W / 2
        boxes[p['name']] = (max(0, left), max(0, top), min(PW, right), min(PH, bot))
    return boxes


# ---------- map crop + bg colour ----------
def bgcolor(im):
    W, H = im.size
    pts = [(2, 2), (W - 3, 2), (2, H - 3), (W - 3, H - 3)]
    px = [im.getpixel(p) for p in pts]
    return tuple(sorted(c)[len(c) // 2] for c in zip(*px))


def crop_map(png_path):
    im = Image.open(png_path).convert('RGB')
    W, H = im.size
    bg = bgcolor(im)
    px = im.load()
    def diff(x, y):
        r, g, b = px[x, y]
        return abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2])
    rows = [sum(1 for x in range(0, W, 3) if diff(x, y) > 60) for y in range(H)]
    thr = W / 3 * 0.03
    y = 0
    while y < H and rows[y] < thr:
        y += 1
    top = y
    gap = 0
    maxgap = int(H * 0.03)
    end = y
    while y < H:
        if rows[y] >= thr:
            end = y
            gap = 0
        else:
            gap += 1
            if gap > maxgap:
                break
        y += 1
    bot = end
    cols = [sum(1 for yy in range(top, bot, 3) if diff(x, yy) > 60) for x in range(W)]
    cthr = (bot - top) / 3 * 0.02
    x = 0
    while x < W and cols[x] < cthr:
        x += 1
    left = x
    x = W - 1
    while x > 0 and cols[x] < cthr:
        x -= 1
    right = x
    pad = int(W * 0.015)
    box = (max(0, left - pad), max(0, top - pad), min(W, right + pad), min(H, bot + pad))
    crop = im.crop(box)
    return crop, bg


def detect_grid(crop):
    """Bounding box (fractions of the crop) of the dark grid border, for the
    interactive overlay on regular maps."""
    im = crop.convert('RGB')
    W, H = im.size
    px = im.load()
    dark = lambda x, y: sum(px[x, y]) < 210
    xs, ys = [], []
    for y in range(0, H, 2):
        for x in range(0, W, 2):
            if dark(x, y):
                xs.append(x)
                ys.append(y)
    if len(xs) < 50:
        return None
    xs.sort()
    ys.sort()
    def rng(a):
        lo = a[int(len(a) * 0.01)]
        hi = a[int(len(a) * 0.99)]
        return lo, hi
    x0, x1 = rng(xs)
    y0, y1 = rng(ys)
    if x1 - x0 < W * 0.4 or y1 - y0 < H * 0.4:
        return None
    return {'left': x0 / W, 'top': y0 / H, 'width': (x1 - x0) / W, 'height': (y1 - y0) / H}


# ---------- driver ----------
def main():
    os.makedirs(CARDS, exist_ok=True)
    os.makedirs(MAPS, exist_ok=True)
    puzzles = json.load(open(os.path.join(ROOT, 'data', 'puzzles.json'), encoding='utf-8'))
    by_bn = {(p['book'], p['num']): p for p in puzzles}
    pairs = find_pairs()

    # 1) render manifest (cached: only render pages we don't already have)
    tmp = os.environ.get('MUR_RENDER_DIR', os.path.join(tempfile.gettempdir(), 'mur_renders'))
    os.makedirs(tmp, exist_ok=True)
    manifest = []
    for (book, num), (clue_pp, puz_pp, title) in pairs.items():
        for pp, suf in [(clue_pp, 'c'), (puz_pp, 'p')]:
            if not pp:
                continue
            out = os.path.join(tmp, f'{book}_{num}_{suf}.png')
            if not os.path.exists(out):
                manifest.append({'page': pp, 'out': out})
    if manifest:
        mf = os.path.join(tmp, 'manifest.json')
        json.dump(manifest, open(mf, 'w'))
        print('rendering', len(manifest), 'pages...')
        env = dict(os.environ, NODE_PATH='/opt/node22/lib/node_modules')
        subprocess.run(['node', os.path.join(ROOT, 'tools', 'render_pages.cjs'), mf], check=True, env=env)
    else:
        print('using cached renders in', tmp)

    # 2) crop
    n_cards = n_maps = n_puz = 0
    for (book, num), (clue_pp, puz_pp, title) in sorted(pairs.items()):
        puz = by_bn.get((book, num))
        if not puz:
            continue  # keep ids stable with the existing dataset
        clue_png = os.path.join(tmp, f'{book}_{num}_c.png')
        if not os.path.exists(clue_png):
            continue
        info = page_people(clue_pp)
        if not info:
            continue
        geo, people, victim = info
        if len(people) < 3:
            continue
        boxes = card_boxes(clue_pp, geo, people)
        im = Image.open(clue_png).convert('RGB')
        IW, IH = im.size
        scale, PW, PH = geo
        kx, ky = IW / PW, IH / PH
        # letters: victim -> V, others alphabetical A..
        others = sorted([p for p in people if p['name'] != victim], key=lambda p: p['name'].lower())
        letters = {p['name']: chr(ord('A') + i) for i, p in enumerate(others)}
        if victim:
            letters[victim] = 'V'
        ppl_out = []
        for p in people:
            L = letters[p['name']]
            bx = boxes[p['name']]
            box = (int(bx[0] * kx), int(bx[1] * ky), int(bx[2] * kx), int(bx[3] * ky))
            if box[2] - box[0] < 30 or box[3] - box[1] < 30:
                continue
            fn = f"{puz['id']}_{L}.jpg"
            im.crop(box).save(os.path.join(CARDS, fn), quality=88)
            ppl_out.append({'name': p['name'], 'letter': L,
                            'card': f'cards/{fn}', 'isVictim': p['name'] == victim})
            n_cards += 1
        ppl_out.sort(key=lambda q: (q['letter'] == 'V', q['letter']))
        puz['people'] = ppl_out
        puz['pageTitle'] = title
        # map + bg + grid
        puz_png = os.path.join(tmp, f'{book}_{num}_p.png')
        if os.path.exists(puz_png):
            crop, bg = crop_map(puz_png)
            mfn = f"{puz['id']}.jpg"
            crop.save(os.path.join(MAPS, mfn), quality=88)
            puz['map'] = f'maps/{mfn}'
            puz['bg'] = '#%02x%02x%02x' % bg
            g = detect_grid(crop)
            puz['mapGrid'] = g
            n_maps += 1
        n_puz += 1
    json.dump(puzzles, open(os.path.join(ROOT, 'data', 'puzzles.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    print(f'done: {n_puz} puzzles, {n_cards} cards, {n_maps} maps')


if __name__ == '__main__':
    main()
