#!/usr/bin/env python3
"""Detect each puzzle's interactive grid box in its crime-scene illustration.

Approach: find the grid's outer black border (dark-pixel row/column projections,
restricted to the box's own span so title/notes text doesn't interfere), then
divide evenly into n x n cells. Validated against 48 independently-recovered
solution grids: max(row)==max(col)==n always holds, and evenly dividing the
outer box matches precisely-detected interior lines to within ~5px on a
~535px box. Only near-square boxes (aspect ratio 0.85-1.18) are kept, which
naturally excludes irregular/rectangular layouts this method can't handle.
"""
import json, os
import numpy as np
from PIL import Image

def find_lines(a, axis, other_lo, other_hi, min_val_frac=0.6, merge_dist=12):
    if axis == 0:
        sub = a[:, other_lo:other_hi]
    else:
        sub = a[other_lo:other_hi, :].T
    dark = (sub < 120)
    frac = dark.mean(axis=1)
    idx = np.where(frac >= min_val_frac)[0]
    if len(idx) == 0:
        return []
    groups = [[idx[0]]]
    for i in idx[1:]:
        if i - groups[-1][-1] <= 3:
            groups[-1].append(i)
        else:
            groups.append([i])
    lines = [int(round(np.mean(g))) for g in groups]
    merged = [lines[0]]
    for L in lines[1:]:
        if L - merged[-1] < merge_dist:
            merged[-1] = (merged[-1] + L) // 2
        else:
            merged.append(L)
    return merged

def detect_box(a):
    H, W = a.shape
    rows = find_lines(a, 0, 0, W)
    if len(rows) < 2:
        return None
    top, bot = rows[0], rows[-1]
    cols = find_lines(a, 1, top, bot)
    if len(cols) < 2:
        return None
    left, right = cols[0], cols[-1]
    return top, bot, left, right

def corner_score(a, top, bot, left, right, rad=10):
    """Minimum dark-pixel density in a radius around each of the box's 4
    corners. A true rectangular grid box has solid corners; an irregular /
    non-rectangular room outline (which can still pass the aspect-ratio and
    line-projection checks) typically leaves at least one corner mostly
    empty. This is the deciding filter for e.g. rotated/L-shaped layouts."""
    dark = (a < 130)
    H, W = a.shape
    scores = []
    for y, x in [(top, left), (top, right), (bot, left), (bot, right)]:
        y0, y1 = max(0, y - rad), min(H, y + rad + 1)
        x0, x1 = max(0, x - rad), min(W, x + rad + 1)
        scores.append(dark[y0:y1, x0:x1].mean())
    return min(scores)

def detect_grid(image_path, n):
    a = np.array(Image.open(image_path).convert('L'))
    H, W = a.shape
    box = detect_box(a)
    if not box:
        return None
    top, bot, left, right = box
    w, h = right - left, bot - top
    if w < 100 or h < 100:
        return None
    ar = w / h
    if not (0.85 < ar < 1.18):
        return None
    if corner_score(a, top, bot, left, right) < 0.2:
        return None
    return {
        'left': left / W, 'top': top / H,
        'width': w / W, 'height': h / H,
        'rows': n, 'cols': n,
    }

if __name__ == '__main__':
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    puzzles = json.load(open(os.path.join(root, 'data/puzzles.json')))
    ok = 0
    for p in puzzles:
        p.pop('grid', None)
        if not p.get('scene'):
            continue
        g = detect_grid(os.path.join(root, 'assets/scenes', p['scene']), p['n'])
        if g:
            p['grid'] = g
            ok += 1
    json.dump(puzzles, open(os.path.join(root, 'data/puzzles.json'), 'w'),
               ensure_ascii=False, indent=1)
    print(f'grid boxes detected: {ok}/{len(puzzles)}')
    by_book = {}
    for p in puzzles:
        if p.get('grid'):
            by_book[p['book']] = by_book.get(p['book'], 0) + 1
    print('by book:', by_book)
