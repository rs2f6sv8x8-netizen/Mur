#!/usr/bin/env python3
"""Import hand-cut puzzle art into the app.

Drop your cut-out images into a simple folder tree and run this script; it wires
everything into data/puzzles.json and assets/. Re-run any time — it only touches
puzzles you've provided folders for, and overwrites cleanly.

Folder layout (one folder per puzzle, named by the number printed in the book):

    manual/
      book1/
        01/                         <- puzzle number as printed
          map.png                   <- the crime-scene map ONLY (see notes)
          Adam.png                  <- one image per suspect (the whole card)
          Bella.png
          Cora.png
          David.png
          Ella.png
          Vincent_victim.png        <- the victim: add "_victim" to the name
          bg.txt        (optional)  <- background colour, e.g.  #f3ded9
          grid.txt      (optional)  <- clickable grid, e.g.  6x6   (see notes)
      book2/
        04/
          ...

Cards may be transparent PNGs (cleanest) or rectangles that include the page
background. Letters (A, B, C, … and V for the victim) are assigned
automatically from the names, alphabetically, so they line up with the murderer
and solution data — use the exact spellings listed in manual/CHECKLIST.md.
"""
import os, re, sys, json, shutil
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANUAL = os.path.join(ROOT, 'manual')
CARDS = os.path.join(ROOT, 'assets', 'cards')
MAPS = os.path.join(ROOT, 'assets', 'maps')
IMG_EXT = ('.png', '.jpg', '.jpeg', '.webp')
RESERVED = {'map', 'bg', 'grid', 'title'}


def sample_bg(img_path):
    im = Image.open(img_path).convert('RGB')
    W, H = im.size
    pts = [(1, 1), (W - 2, 1), (1, H - 2), (W - 2, H - 2)]
    px = [im.getpixel(p) for p in pts]
    return '#%02x%02x%02x' % tuple(sorted(c)[len(c) // 2] for c in zip(*px))


def detect_grid_box(img_path):
    """Bounding box (fractions) of the dark grid border, for the overlay."""
    im = Image.open(img_path).convert('RGB')
    W, H = im.size
    px = im.load()
    xs, ys = [], []
    step = max(1, min(W, H) // 300)
    for y in range(0, H, step):
        for x in range(0, W, step):
            if sum(px[x, y]) < 210:
                xs.append(x); ys.append(y)
    if len(xs) < 50:
        return {'left': 0.02, 'top': 0.02, 'width': 0.96, 'height': 0.96}
    xs.sort(); ys.sort()
    x0, x1 = xs[len(xs) // 100], xs[-len(xs) // 100 - 1]
    y0, y1 = ys[len(ys) // 100], ys[-len(ys) // 100 - 1]
    return {'left': x0 / W, 'top': y0 / H, 'width': (x1 - x0) / W, 'height': (y1 - y0) / H}


def read_grid_txt(path, n):
    """Parse grid.txt -> (cols, rows, blocked[list of 'r,c']). Format:
        6x6
        blocked:
        1,1
        1,7
    """
    cols = rows = n
    blocked = []
    section = None
    for line in open(path, encoding='utf-8'):
        s = line.strip().lower()
        if not s:
            continue
        m = re.match(r'(\d+)\s*[x×]\s*(\d+)', s)
        if m:
            cols, rows = int(m.group(1)), int(m.group(2))
        elif s.startswith('blocked'):
            section = 'blocked'
        elif section == 'blocked':
            mm = re.match(r'(\d+)\s*,\s*(\d+)', s)
            if mm:
                blocked.append(f'{int(mm.group(1))},{int(mm.group(2))}')
    return cols, rows, blocked


def load_puzzles():
    return json.load(open(os.path.join(ROOT, 'data', 'puzzles.json'), encoding='utf-8'))


def main():
    if not os.path.isdir(MANUAL):
        print('no manual/ folder yet — see tools/import_manual.py docstring'); return
    os.makedirs(CARDS, exist_ok=True)
    os.makedirs(MAPS, exist_ok=True)
    puzzles = load_puzzles()
    by_bn = {(p['book'], p['num']): p for p in puzzles}
    next_id = max(p['id'] for p in puzzles) + 1
    n_puz = n_cards = 0

    for book_dir in sorted(os.listdir(MANUAL)):
        m = re.fullmatch(r'book(\d+)', book_dir)
        if not m:
            continue
        book = int(m.group(1))
        bpath = os.path.join(MANUAL, book_dir)
        for num_dir in sorted(os.listdir(bpath)):
            if not re.fullmatch(r'\d+', num_dir):
                continue
            num = int(num_dir)
            folder = os.path.join(bpath, num_dir)
            files = [f for f in os.listdir(folder) if f.lower().endswith(IMG_EXT)]
            cards = [f for f in files if os.path.splitext(f)[0].lower() not in RESERVED]
            mapf = next((f for f in files if os.path.splitext(f)[0].lower() == 'map'), None)
            if not cards:
                continue

            puz = by_bn.get((book, num))
            if not puz:
                # a puzzle not in the extracted set — create a fresh record
                title = num_dir
                tp = os.path.join(folder, 'title.txt')
                if os.path.exists(tp):
                    title = open(tp, encoding='utf-8').read().strip()
                puz = {'book': book, 'num': num, 'id': next_id, 'title': title,
                       'difficulty': 3, 'suspects': [], 'victim': None, 'rooms': [],
                       'rules': [], 'hintSteps': [], 'murderer': None}
                puzzles.append(puz); by_bn[(book, num)] = puz; next_id += 1

            # name -> (filename, is_victim)
            def clean_name(f):
                base = os.path.splitext(f)[0]
                vic = base.lower().endswith('_victim')
                if vic:
                    base = base[:-len('_victim')]
                return base.strip(), vic
            entries = [(clean_name(f)[0], clean_name(f)[1], f) for f in cards]
            victims = [e for e in entries if e[1]]
            others = sorted([e for e in entries if not e[1]], key=lambda e: e[0].lower())
            letters = {}
            for i, (name, _, _) in enumerate(others):
                letters[name] = chr(ord('A') + i)
            for name, _, _ in victims:
                letters[name] = 'V'

            people = []
            for name, is_victim, fn in entries:
                L = letters[name]
                ext = os.path.splitext(fn)[1].lower()
                out = f"{puz['id']}_{L}{ext}"
                shutil.copy(os.path.join(folder, fn), os.path.join(CARDS, out))
                people.append({'name': name, 'letter': L,
                               'card': f'cards/{out}', 'isVictim': is_victim})
                n_cards += 1
            people.sort(key=lambda q: (q['letter'] == 'V', q['letter']))
            puz['people'] = people
            puz['manual'] = True

            n = len(people)
            # map + background + grid
            if mapf:
                ext = os.path.splitext(mapf)[1].lower()
                out = f"{puz['id']}{ext}"
                shutil.copy(os.path.join(folder, mapf), os.path.join(MAPS, out))
                puz['map'] = f'maps/{out}'
                bgtxt = os.path.join(folder, 'bg.txt')
                puz['bg'] = (open(bgtxt).read().strip() if os.path.exists(bgtxt)
                             else sample_bg(os.path.join(folder, mapf)))
                box = detect_grid_box(os.path.join(folder, mapf))
                gridtxt = os.path.join(folder, 'grid.txt')
                if os.path.exists(gridtxt):
                    cols, rows, blocked = read_grid_txt(gridtxt, n)
                    box.update({'cols': cols, 'rows': rows})
                    if blocked:
                        box['blocked'] = blocked
                else:
                    box.update({'cols': n, 'rows': n})
                puz['mapGrid'] = box
            n_puz += 1

    json.dump(puzzles, open(os.path.join(ROOT, 'data', 'puzzles.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    print(f'imported {n_puz} puzzles, {n_cards} cards')


if __name__ == '__main__':
    main()
