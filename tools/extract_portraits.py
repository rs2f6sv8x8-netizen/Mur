#!/usr/bin/env python3
"""Crop each suspect's portrait illustration from the book's clue-page artwork.

The clue page (the one before each puzzle's crime-scene page) shows every
suspect as a framed portrait in a regular grid, with a blank name banner
underneath. The suspect's *name* is printed on that banner via absolutely
positioned text, so the name span's pixel position tells us exactly which
grid cell (and therefore which portrait) belongs to which suspect. We use the
already-extracted suspect names in puzzles.json as ground truth, locate each
one on the page, then crop the portrait sitting directly above its banner.

Output: assets/portraits/<id>_<letter>.jpg  and a `portrait` field per suspect
in data/puzzles.json.
"""
import re, os, sys, json, statistics
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extract_lib import get_spans
from extract import parse_clue_page
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOOKS = {1: os.path.join(ROOT, 'Puzzles Book 1'),
         2: os.path.join(ROOT, 'Puzzle Books 2')}
OUT_DIR = os.path.join(ROOT, 'assets', 'portraits')
NAME_RE = re.compile(r"^[A-ZÀ-Þ][A-Za-zà-ÿ'’\-]{1,19}$")


def page_geometry(page_path):
    raw = open(page_path, encoding='utf-8').read()
    sm = re.search(r'transform:\s*scale\(([\d.]+)\)', raw)
    vp = re.search(r'width=(\d+),\s*height=(\d+)', raw)
    if not sm or not vp:
        return None
    return float(sm.group(1)), int(vp.group(1)), int(vp.group(2))


def bg_image(page_path):
    raw = open(page_path, encoding='utf-8').read()
    m = re.search(r'src="(images/[^"]+\.(?:jpg|jpeg|png))"', raw)
    return m.group(1) if m else None


def cluster(vals, gap):
    s = sorted(vals)
    groups = [[s[0]]]
    for v in s[1:]:
        if v - groups[-1][-1] > gap:
            groups.append([v])
        else:
            groups[-1].append(v)
    return groups


def norm(s):
    return re.sub(r'[^a-zà-ÿ]', '', s.lower())


def find_clue_pages(book_dir):
    """page path -> (num, parsed) for every clue page in the book."""
    out = {}
    pages = sorted(f for f in os.listdir(book_dir) if re.fullmatch(r'page\d+\.xhtml', f))
    for f in pages:
        pp = os.path.join(book_dir, f)
        try:
            pc = parse_clue_page(pp)
        except Exception:
            pc = None
        if pc and pc.get('suspects') and any('slachto' in (s.get('clue') or '').lower()
                                              for s in pc['suspects']):
            out.setdefault(pc['num'], pp)
    return out


def locate_names(page_path, wanted):
    """Return {name: (x_px, y_top_px)} for each wanted name found in the page's
    name font. Positions are in page-viewport pixels."""
    geo = page_geometry(page_path)
    if not geo:
        return {}, None
    scale, PW, PH = geo
    spans = get_spans(page_path)
    # the name font = the one carrying the most standalone capitalised name tokens
    from collections import Counter
    cand = Counter(s['font'] for s in spans
                   if s['font'] and NAME_RE.match(s['text'].strip()))
    if not cand:
        return {}, geo
    namefont = cand.most_common(1)[0][0]
    wnorm = {norm(w): w for w in wanted}
    found = {}
    for s in spans:
        if s['font'] != namefont:
            continue
        key = norm(s['text'])
        if key in wnorm and wnorm[key] not in found:
            x = s['left'] * scale
            y = PH - s['bottom'] * scale
            found[wnorm[key]] = (x, y)
    return found, geo


def crop_portraits(page_path, positions, geo):
    """Given located name positions, crop each portrait. Returns {name: PIL.Image}."""
    scale, PW, PH = geo
    img_rel = bg_image(page_path)
    if not img_rel:
        return {}
    img_path = os.path.join(os.path.dirname(page_path), img_rel)
    if not os.path.exists(img_path):
        return {}
    im = Image.open(img_path).convert('RGB')
    IW, IH = im.size
    sx, sy = IW / PW, IH / PH

    xs = [p[0] for p in positions.values()]
    ys = [p[1] for p in positions.values()]
    xg = cluster(xs, PW * 0.11)
    yg = cluster(ys, PH * 0.09)
    ncols, nrows = len(xg), len(yg)
    colc = [statistics.mean(g) for g in xg]
    rowc = [statistics.mean(g) for g in yg]
    cw = PW / ncols
    rowspace = (max(rowc) - min(rowc)) / (nrows - 1) if nrows > 1 else PH * 0.42
    # the portrait grid is centred on the page → align crop columns to it
    xoff = PW / 2 - statistics.mean(colc)

    crops = {}
    for name, (nx, ny) in positions.items():
        col = min(range(ncols), key=lambda k: abs(nx - colc[k]))
        ccx = colc[col] + xoff
        W = cw * 0.9
        left = ccx - W / 2
        right = ccx + W / 2
        top = ny - 0.80 * rowspace
        bot = ny + 0.08 * rowspace
        box = (int(max(0, left) * sx), int(max(0, top) * sy),
               int(min(PW, right) * sx), int(min(PH, bot) * sy))
        if box[2] - box[0] < 20 or box[3] - box[1] < 20:
            continue
        crops[name] = im.crop(box)
    return crops


def main():
    puzzles = json.load(open(os.path.join(ROOT, 'data', 'puzzles.json'), encoding='utf-8'))
    by_bn = {(p['book'], p['num']): p for p in puzzles}
    os.makedirs(OUT_DIR, exist_ok=True)
    done = 0
    people_done = 0
    skipped = []
    for book, book_dir in BOOKS.items():
        clue_pages = find_clue_pages(book_dir)
        for num, pp in clue_pages.items():
            puz = by_bn.get((book, num))
            if not puz:
                continue
            people = list(puz['suspects']) + ([puz['victim']] if puz.get('victim') else [])
            wanted = {pe['name'] for pe in people}
            positions, geo = locate_names(pp, wanted)
            # need most suspects located and a sane grid to trust the mapping
            if not geo or len(positions) < max(3, len(wanted) - 1):
                skipped.append(puz['id'])
                continue
            crops = crop_portraits(pp, positions, geo)
            if not crops:
                skipped.append(puz['id'])
                continue
            name2letter = {pe['name']: pe['letter'] for pe in people}
            for pe in people:
                img = crops.get(pe['name'])
                if img is None:
                    continue
                letter = name2letter[pe['name']]
                fn = f"{puz['id']}_{letter}.jpg"
                img.save(os.path.join(OUT_DIR, fn), quality=86)
                pe['portrait'] = f"portraits/{fn}"
                people_done += 1
            done += 1
    json.dump(puzzles, open(os.path.join(ROOT, 'data', 'puzzles.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    print(f'portraits: {done} puzzles, {people_done} people')
    print(f'skipped puzzles (no reliable grid): {len(skipped)} -> {skipped[:30]}')


if __name__ == '__main__':
    main()
