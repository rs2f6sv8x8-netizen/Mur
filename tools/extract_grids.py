#!/usr/bin/env python3
"""Extract solution grids: each suspect letter is positioned at its cell centre in
the Oplossingen pages. Since every case is a permutation (one person per row and
column), row/col fall out of ranking the letter coordinates."""
import re, json, os
from extract_lib import get_spans, page_text
from extract import spine_pages, fix

def cluster_rank(vals, gap_frac=0.5):
    """Return {value: rank} where near-equal values share a rank. rank ascending."""
    uv = sorted(set(vals))
    if not uv:
        return {}
    # typical spacing
    if len(uv) > 1:
        diffs = [uv[i+1]-uv[i] for i in range(len(uv)-1)]
        med = sorted(diffs)[len(diffs)//2]
        gap = max(1.0, med*gap_frac)
    else:
        gap = 1.0
    ranks = {}; r = 0; prev = None
    for v in uv:
        if prev is not None and v-prev > gap:
            r += 1
        ranks[v] = r; prev = v
    return ranks

def _band_split(pts):
    """Split points [(L,left,bottom)] into vertical bands (separate grids)."""
    if not pts:
        return []
    bys = sorted(pts, key=lambda p: -p[2])
    bottoms = [p[2] for p in bys]
    diffs = [bottoms[i]-bottoms[i+1] for i in range(len(bottoms)-1)]
    if not diffs:
        return [bys]
    med = sorted(diffs)[len(diffs)//2] or 1
    bands = [[bys[0]]]
    for i in range(1, len(bys)):
        if bottoms[i-1]-bottoms[i] > max(med*3, 4000):
            bands.append([])
        bands[-1].append(bys[i])
    return bands

def _resolve_band(band):
    """Drop axis labels / far-left legend duplicates; return {letter:(left,bottom)}."""
    import statistics
    band = [p for p in band if p[0] not in ('K', 'R')]
    if not band:
        return {}
    med_left = statistics.median([p[1] for p in band])
    chosen = {}
    for L, left, bottom in band:
        if L not in chosen:
            chosen[L] = (left, bottom)
        else:
            # keep the occurrence nearest the grid's left-centroid (drops legend outlier)
            if abs(left-med_left) < abs(chosen[L][0]-med_left):
                chosen[L] = (left, bottom)
    return chosen

def extract_page_grids(page_path):
    """Return the solution grids on a page: each {'letters':{L:(row,col)}, 'n', 'perm'}.
    Letters are positioned at their cells; ranking coordinates yields row/col."""
    spans = get_spans(page_path)
    # "letter fonts" are used only for single capital letters (grid cells / axis),
    # never for words -> this excludes room-label fragments like the L of LOGEERKAMER.
    from collections import defaultdict
    font_texts = defaultdict(list)
    for s in spans:
        font_texts[s['font']].append(s['text'].strip())
    letter_fonts = {f for f, ts in font_texts.items()
                    if not any(re.search(r'[A-Za-z]{2,}', t) for t in ts)   # no words
                    and any(re.fullmatch(r'[A-Z]', t) for t in ts)}          # has a lone letter
    pts = [(s['text'].strip(), s['left'], s['bottom']) for s in spans
           if re.fullmatch(r'[A-Z]', s['text'].strip()) and (s['left'] or s['bottom'])
           and s['font'] in letter_fonts]
    grids = []
    for band in _band_split(pts):
        chosen = _resolve_band(band)
        if 'V' not in chosen or len(chosen) < 4:
            continue
        lefts = [v[0] for v in chosen.values()]
        bottoms = [v[1] for v in chosen.values()]
        colrank = cluster_rank(lefts)
        rowrank = cluster_rank(bottoms)
        nrows = max(rowrank.values())+1
        cells = {}
        for L, (left, bottom) in chosen.items():
            cells[L] = (nrows - rowrank[bottom], colrank[left] + 1)
        rows = [c[0] for c in cells.values()]; cols = [c[1] for c in cells.values()]
        perm_ok = len(set(rows)) == len(rows) and len(set(cols)) == len(cols)
        ymean = sum(bottoms) / len(bottoms)
        grids.append({'letters': cells, 'n': len(cells), 'perm': perm_ok, 'y': ymean})
    return grids

def title_spans(page_path, known=None):
    """Return [(num, y)] for puzzle title headings on a solution page. Accepts
    'N. Title' and bare 'N.' (split titles). Gated to `known` puzzle numbers."""
    out = []
    for s in get_spans(page_path):
        t = fix(s['text'])
        m = re.match(r'^(\d{1,2})\.\s+[A-ZÀ-Þ][a-zà-ÿ]', t)
        if m and (s['left'] or s['bottom']) and len(t) < 60:
            num = int(m.group(1))
            if known is None or num in known:
                out.append((num, s['bottom']))
    # de-duplicate by num, keeping the first occurrence's position
    seen = {}
    for num, y in out:
        seen.setdefault(num, y)
    return list(seen.items())

def murderer_spans(page_path):
    """Return [(name, y)] for murderer-name spans (colour c3) on a solution page."""
    out = []
    for s in get_spans(page_path):
        t = s['text'].strip()
        if s['color'] == 'c3' and re.fullmatch(r"[A-ZÀ-Þ][A-Za-zà-ÿ'\-]{2,}", t) \
                and t.lower() != 'de' and (s['left'] or s['bottom']):
            out.append((t, s['bottom']))
    return out

if __name__ == '__main__':
    S = os.path.dirname(os.path.abspath(__file__))
    for pg in ['178','179','180']:
        pp = f'{S}/epub1/OEBPS/page{pg}.xhtml'
        grids = extract_page_grids(pp)
        print(f'=== page {pg}: {len(grids)} grids ===')
        for gr in grids:
            print(f"  n={gr['n']} perm={gr['perm']} {gr['letters']}")

# ---- full solution mapping ----
def _sig_word(title):
    for w in re.findall(r"[A-Za-zÀ-ÿ']{4,}", title): return w
    return re.sub(r'[^A-Za-zÀ-ÿ]','',title)[:6]

def step_pairs(steps):
    P=set()
    for st in steps:
        for m in re.finditer(r'rij\s*(\d+)[^.]{0,14}?kolom\s*(\d+)',st): P.add((int(m.group(1)),int(m.group(2))))
        for m in re.finditer(r'kolom\s*(\d+)[^.]{0,14}?rij\s*(\d+)',st): P.add((int(m.group(2)),int(m.group(1))))
    return P

def _score(gr, num, sols, clue_suspects, mspans, other_ys):
    """Score a (grid,puzzle) pairing: higher = more consistent.
    Returns (score, hard_pair, hard_clue, murd_near)."""
    cells = gr['letters']; coords = set(cells.values())
    people = clue_suspects.get(num, [])
    score = 0.0
    # exact step coordinate pairs landing in the grid = very strong signal
    P = step_pairs(sols.get(num, {}).get('steps', []))
    if P:
        hit = len(P & coords)
        score += 50*hit - 30*(len(P)-hit)
    # positional clue constraints
    ok, tot = check_constraints(clue_constraints(people, gr['n']), cells)
    if tot:
        score += 6*ok - 8*(tot-ok)
    # a murderer-name span (colour c3) that is a suspect of THIS puzzle and sits
    # nearest this grid is a strong anchor (works even when the murderer text
    # wasn't parsed, e.g. book 2's "moorddenaar" spelling).
    names_here = {s['name'] for s in people}
    murd_near = False
    my = [y for nm, y in mspans if nm in names_here]
    if my:
        dmine = min(abs(y-gr['y']) for y in my)
        closest = all(dmine <= min(abs(y-oy) for y in my) for oy in other_ys) if other_ys else True
        if closest:
            score += 40; murd_near = True
        else:
            score -= 10
    # letter-count agreement (grid letters vs suspects+victim)
    if len(cells) == len(people):
        score += 3
    return score, (P and len(P & coords) == len(P) and len(P) > 0), (tot and ok == tot), murd_near

def build_solutions(sol_pages, titles, sols, clue_suspects):
    """Map each solution grid to its puzzle by pairing grids to the murderer-name
    span nearest them (murderer -> puzzle number), then validate against clues.
    Returns {num: {'cells':{letter:[r,c]}, 'verified':bool, 'trustworthy':bool}}."""
    import itertools
    out = {}
    for pp in sol_pages:
        grids = extract_page_grids(pp)
        if not grids:
            continue
        tspans = title_spans(pp, known=set(clue_suspects))   # reliable anchor
        if not tspans:
            continue
        # assign grids -> titles by minimising total vertical distance (bijection)
        nums = [num for num, y in tspans]
        tys = {num: y for num, y in tspans}
        gi_list = list(range(len(grids)))
        best_assign, best_cost = None, None
        if len(grids) <= len(nums):
            for perm in itertools.permutations(nums, len(grids)):
                cost = sum(abs(grids[gi]['y'] - tys[num]) for gi, num in zip(gi_list, perm))
                if best_cost is None or cost < best_cost:
                    best_cost, best_assign = cost, list(zip(gi_list, perm))
        else:
            for perm in itertools.permutations(gi_list, len(nums)):
                cost = sum(abs(grids[gi]['y'] - tys[num]) for gi, num in zip(perm, nums))
                if best_cost is None or cost < best_cost:
                    best_cost, best_assign = cost, list(zip(perm, nums))
        for gi, num in best_assign:
            gr = grids[gi]
            cells = {k: (v[0], v[1]) for k, v in gr['letters'].items()}
            # validate against positional clues; drop if it violates one
            ok, tot = check_constraints(clue_constraints(clue_suspects.get(num, []), gr['n']), cells)
            if tot > 0 and ok < tot:
                continue
            out[num] = {'cells': {k: [v[0], v[1]] for k, v in cells.items()},
                        'verified': bool(tot > 0 and ok == tot), 'trustworthy': True}
    return out

# ---- positional-clue constraint matching (robust grid->puzzle mapping) ----
ORD = {'eerste':1,'tweede':2,'derde':3,'vierde':4,'vijfde':5,'zesde':6,'zevende':7,
       'achtste':8,'negende':9,'tiende':10,'elfde':11,'twaalfde':12,'dertiende':13,'veertiende':14}

def _ord(word, N):
    w=word.lower()
    if w in ORD: return ORD[w]
    if w=='laatste': return N
    if w=='voorlaatste': return N-1
    return None

def clue_constraints(suspects, N):
    """Return list of constraint fns grid->bool, built from positional clue text.
    suspects: list of {name,letter,clue}. Names map to letters for relative clues."""
    name2let = {s['name'].lower(): s['letter'] for s in suspects}
    cons=[]
    for s in suspects:
        L=s['letter']; cl=s.get('clue','') or ''
        low=cl.lower()
        if 'niet' in low:   # skip negated statements (harder to verify cheaply)
            pass
        for m in re.finditer(r'in de (\w+) kolom', low):
            k=_ord(m.group(1),N)
            if k and 'niet' not in low[max(0,m.start()-8):m.start()]: cons.append(('col',L,k))
        for m in re.finditer(r'in kolom (\d+)', low):
            cons.append(('col',L,int(m.group(1))))
        for m in re.finditer(r'in de (\w+) rij', low):
            k=_ord(m.group(1),N)
            if k and 'niet' not in low[max(0,m.start()-8):m.start()]: cons.append(('row',L,k))
        for m in re.finditer(r'in rij (\d+)', low):
            cons.append(('row',L,int(m.group(1))))
        for m in re.finditer(r'(boven|onder|links van|rechts van)\s+([a-zà-ÿ]+)', low):
            rel=m.group(1); other=name2let.get(m.group(2))
            if other and other!=L: cons.append((rel.replace(' van',''),L,other))
    return cons

def check_constraints(cons, cells):
    ok=0; tot=0
    for c in cons:
        kind=c[0]; L=c[1]
        if L not in cells: continue
        r,col=cells[L]
        if kind=='col': tot+=1; ok+= (col==c[2])
        elif kind=='row': tot+=1; ok+= (r==c[2])
        elif kind in ('boven','onder','links','rechts'):
            o=c[2]
            if o not in cells: continue
            orr,occ=cells[o]; tot+=1
            if kind=='boven': ok+= (r<orr)
            elif kind=='onder': ok+= (r>orr)
            elif kind=='links': ok+= (col<occ)
            elif kind=='rechts': ok+= (col>occ)
    return ok,tot
