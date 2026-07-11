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

def extract_page_grids(page_path):
    """Return list of grids on the page (doc order): each {'letters':{L:(row,col)}, 'n':N}."""
    spans = get_spans(page_path)
    # group single-letter spans by font
    byfont = {}
    for s in spans:
        t = s['text'].strip()
        if re.fullmatch(r'[A-Z]', t):
            byfont.setdefault(s['font'], []).append(s)
    grids = []
    # preserve doc order of fonts by first appearance
    seen = []
    for s in spans:
        if s['font'] in byfont and s['font'] not in seen:
            seen.append(s['font'])
    for f in seen:
        group = byfont[f]
        letters = [g['text'].strip() for g in group]
        if len(set(letters)) != len(letters):
            continue  # duplicate letters -> not a clean per-cell grid
        if 'V' not in letters or len(letters) < 4:
            continue
        lefts = [g['left'] for g in group]
        bottoms = [g['bottom'] for g in group]
        colrank = cluster_rank(lefts)
        rowrank = cluster_rank(bottoms)   # ascending: rank 0 = lowest bottom = bottom of page
        nrows = max(rowrank.values())+1
        # row 1 = top = highest bottom -> invert
        cells = {}
        for g in group:
            L = g['text'].strip()
            col = colrank[g['left']] + 1
            row = (nrows - rowrank[g['bottom']])   # top -> 1
            cells[L] = (row, col)
        # sanity: it should be a permutation (distinct rows, distinct cols)
        rows = [c[0] for c in cells.values()]; cols = [c[1] for c in cells.values()]
        perm_ok = len(set(rows))==len(rows) and len(set(cols))==len(cols)
        grids.append({'letters': cells, 'n': len(letters), 'perm': perm_ok,
                      'font': f})
    return grids

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

def _score(gr, num, sols, clue_suspects):
    """Score a (grid,puzzle) pairing: higher = more consistent."""
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
    # letter-count agreement (grid letters vs suspects+victim)
    if len(cells) == len(people):
        score += 3
    return score, (P and len(P & coords) == len(P) and len(P) > 0), (tot and ok == tot)

def build_solutions(sol_pages, titles, sols, clue_suspects):
    """Map each solution grid to its puzzle. The grids on a page form a forced
    bijection with that page's puzzles, so we pick the best full pairing.
    Returns {num: {'cells':{letter:[r,c]}, 'verified':bool}}."""
    import itertools
    out = {}
    for pp in sol_pages:
        grids = extract_page_grids(pp)
        if not grids:
            continue
        txt = fix(page_text(pp))
        nums = [num for num, title in titles.items()
                if re.search(str(num)+r'\.\s{0,3}[A-Za-zÀ-ÿ ]{0,22}?'+re.escape(_sig_word(title)[:5]), txt, re.I)]
        if not nums:
            continue
        gi_list = list(range(len(grids)))
        best_assign = None; best_total = None
        # enumerate injective maps grid->num over the smaller set
        if len(grids) <= len(nums):
            for perm in itertools.permutations(nums, len(grids)):
                total = 0
                for gi, num in zip(gi_list, perm):
                    sc, hp, hc = _score(grids[gi], num, sols, clue_suspects)
                    total += sc
                if best_total is None or total > best_total:
                    best_total = total; best_assign = list(zip(gi_list, perm))
        else:
            for perm in itertools.permutations(gi_list, len(nums)):
                total = 0
                for gi, num in zip(perm, nums):
                    sc, hp, hc = _score(grids[gi], num, sols, clue_suspects)
                    total += sc
                if best_total is None or total > best_total:
                    best_total = total; best_assign = list(zip(perm, nums))
        # a pairing is "anchored" (reliable bijection) if any member is verified,
        # or the page is a single grid<->single num.
        details = []
        for gi, num in best_assign:
            sc, hp, hc = _score(grids[gi], num, sols, clue_suspects)
            details.append((gi, num, hp, hc))
        anchored = any(hp or hc for _, _, hp, hc in details) or (len(grids) == 1 and len(nums) == 1)
        for gi, num, hp, hc in details:
            gr = grids[gi]
            cells = {k: (v[0], v[1]) for k, v in gr['letters'].items()}
            ok, tot = check_constraints(clue_constraints(clue_suspects.get(num, []), gr['n']), cells)
            if tot > 0 and ok < tot:
                continue  # solution violates a positional clue -> don't trust it
            out[num] = {'cells': {k: [v[0], v[1]] for k, v in cells.items()},
                        'verified': bool(hp or hc),
                        'trustworthy': bool(anchored)}
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
