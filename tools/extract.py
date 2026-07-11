#!/usr/bin/env python3
"""Extract all Murdoku puzzles from the two EPUBs into puzzles.json + scene images."""
import re, os, json, shutil
from collections import defaultdict, Counter
from extract_lib import get_spans, page_text

LIG = {'ﬀ': 'ff', 'ﬁ': 'fi', 'ﬂ': 'fl', 'ﬃ': 'ffi', 'ﬄ': 'ffl'}
# curated repairs for subset-font ligature corruption in proper names / words
REPAIR = {
    'Charloe': 'Charlotte', 'Brigie': 'Brigitte', 'Annee': 'Annette',
    'Yvee': 'Yvette', 'Colee': 'Colette', 'mascoe': 'mascotte',
    'Juliee': 'Juliette', 'Babee': 'Babette', 'Nanee': 'Nanette',
}

def fix(t):
    for k, v in LIG.items():
        t = t.replace(k, v)
    t = re.sub(r'\s+', ' ', t).strip()
    t = re.sub(r'([.!?,;:])([A-Za-zÀ-ÿ])', r'\1 \2', t)
    t = re.sub(r'\s+([.,!?;:])', r'\1', t)
    t = re.sub(r'\.{2,}', '.', t)
    return t.strip()

def repair(t):
    for k, v in REPAIR.items():
        t = t.replace(k, v)
    return t

STOP = {'Eén','Één','Een','Twee','Drie','Vier','Vijf','Beiden','Beide',
        'Stond','Was','Bevond','Zat','Lag','Het','De','Er','Hij','Zij','En','Dat','Dus',
        'Een','In','Op','Naast','Voor','Alle','Deze','Als','Ze','We','Je','Niet','Onder',
        'Boven','Links','Rechts','Samen','Met','Tussen','Hun','Van','Zich','Om','Maar',
        'Aan','Bij','Ook','Nog','Dan','Wel','Geen','Zowel','Beide','Iemand','Precies',
        'Ergens','Naar','Terwijl','Tegen','Achter','Waar','Wie','Toen','Nadat','Omdat'}
NAME = re.compile(r"^[A-ZÀ-Þ][A-Za-zà-ÿ'’\-]*$")

def is_name(t):
    t = t.strip()
    return bool(NAME.match(t)) and 2 <= len(t) <= 20 and t not in STOP

RULE_HINTS = ('er bevond zich', 'er was geen', 'er waren', 'alle personen',
              'onthoud', 'precies', 'geen lege', 'niemand ', 'elke ', 'iedere ')

STARTERS = {'was','bevond','bevonden','zat','zaten','stond','stonden','lag','lagen',
            'het','hij','zij','ze','de','er','bleef','kon','werd','had','is','nam',
            'deze','in','op','naast','voor','achter','boven','onder','links','rechts',
            'alleen','alle','samen','stonden','waren','een','zijn','haar','die','als',
            'ergens','recht','of','geen','niet','tussen','met','bij','zowel','en'}

def starts_clue(txt):
    t = txt.strip()
    if t.lower().startswith('het slacht') or t.lower().startswith('slacht'):
        return True
    w = re.split(r'[\s.,]', t, 1)[0].lower() if t else ''
    return w in STARTERS

def detect_namefont(clue_spans):
    byf = defaultdict(list)
    for s in clue_spans:
        byf[s['font']].append(s)
    best, bs = None, (-1, -1)
    for f, ss in byf.items():
        nl = [s for s in ss if is_name(s['text'])]
        if len(nl) < 2:
            continue
        score = (round(len(nl) / len(ss), 2), len(nl))
        if score > bs:
            bs, best = score, f
    return best

def cluster_centers(vals, gap=2500):
    sl = sorted(set(vals))
    if not sl:
        return []
    groups = [[sl[0]]]
    for x in sl[1:]:
        if x - groups[-1][-1] > gap:
            groups.append([x])
        else:
            groups[-1].append(x)
    return [sum(g) / len(g) for g in groups]

def _fallback_parse(num, tname, clue_spans):
    """Role-based / irregular layouts: collect the name list + a shared clue block."""
    names, clue_parts = [], []
    for s in clue_spans:
        t = s['text'].strip()
        if is_name(t) and (t.isupper() or len(t) >= 3):
            names.append(t)
        else:
            clue_parts.append(s['text'])
    # dedupe names preserving order
    seen = set(); ordered = []
    for nm in names:
        k = nm.lower()
        if k not in seen:
            seen.add(k); ordered.append(repair(nm.title() if nm.isupper() else nm))
    if len(ordered) < 3:
        return None
    block = repair(fix(''.join(clue_parts)))
    has_victim = 'slachto' in block.lower()
    suspects = [{'name': nm, 'clue': ''} for nm in ordered]
    if has_victim:
        suspects.append({'name': 'Slachtoffer', 'clue': 'Het slachtoffer.'})
    return {'num': num, 'title': tname, 'flavor': '', 'intro': '',
            'clueBlock': block, 'suspects': suspects}

def parse_clue_page(page_path):
    sp = get_spans(page_path)
    num = None; tname = None; ti = -1
    for i, s in enumerate(sp):
        tx = fix(s['text'])
        m = re.match(r'^\s*(\d{1,2})\.\s*(.*)$', tx)
        if not m:
            continue
        rest = m.group(2).strip()
        if rest and re.match(r'[A-ZÀ-ÿ]', rest):
            num, tname, ti = int(m.group(1)), rest, i
            break
        if not rest and i + 1 < len(sp):  # title text is in following span(s)
            parts = []
            j = i + 1
            while j < len(sp) and len(parts) < 4:
                nx = fix(sp[j]['text']).strip()
                if nx == '':
                    j += 1; continue
                if re.match(r'[A-ZÀ-ÿ]', nx) and (nx.isupper() or not parts) and len(nx) >= 1:
                    parts.append(nx); j += 1
                    if not nx.isupper():
                        break
                else:
                    break
            title_txt = ' '.join(parts).strip()
            if re.match(r'[A-ZÀ-ÿ]', title_txt) and len(title_txt) > 2:
                num, tname, ti = int(m.group(1)), title_txt, j - 1
                break
    if num is None:
        return None
    if tname.isupper():
        tname = tname.title()
    # clue block = everything after the title span, minus bare page numbers
    clue_spans = [s for s in sp[ti+1:] if not re.match(r'^\d+$', s['text'].strip())]
    nf = detect_namefont(clue_spans)
    # A suspect name = is_name token, in the name font (if a clear one exists),
    # immediately followed by a clue-starter (excludes mid-clue cross-references).
    def is_suspect(i, spans):
        s = spans[i]
        if not is_name(s['text']):
            return False
        if nf and s['font'] != nf:
            return False
        nxt = spans[i+1]['text'].strip() if i+1 < len(spans) else ''
        if starts_clue(nxt):
            return True
        # Trailing / orphan suspect (end of block, or another name follows).
        # Only trusted when a distinct name font exists, so cross-references in
        # clue text (same font, no name font) are never miscounted.
        if nf and (nxt == '' or is_name(nxt)):
            return True
        return False
    names = [s for i, s in enumerate(clue_spans) if is_suspect(i, clue_spans)]
    if len(names) < 3:
        return _fallback_parse(num, tname, clue_spans)
    centers = cluster_centers([s['left'] for s in names])
    def col_of(s):
        if len(centers) <= 1:
            return 0
        return min(range(len(centers)), key=lambda k: abs(s['left'] - centers[k]))
    # Identify suspect spans in DOCUMENT order (the clue-starter follows the name
    # in reading order); column-sorting for grouping must not change this.
    suspect_ids = {id(clue_spans[i]) for i in range(len(clue_spans))
                   if is_suspect(i, clue_spans)}
    indexed = list(enumerate(clue_spans))
    indexed.sort(key=lambda it: (col_of(it[1]), it[0]))
    order = [s for _, s in indexed]
    groups, cur, pre = [], None, []
    for s in order:
        if id(s) in suspect_ids:
            cur = {'name': repair(s['text'].strip()), 'clue': []}
            groups.append(cur)
        elif cur is not None:
            cur['clue'].append(s['text'])
        else:
            pre.append(s['text'])
    for g in groups:
        g['clue'] = repair(fix(''.join(g['clue'])))
    # split pre-name text into flavor vs intro rules
    pretext = fix(''.join(pre))
    flavor_parts, rules = [], []
    for sent in re.split(r'(?<=[.!?])\s+', pretext):
        s = sent.strip()
        if not s:
            continue
        (rules if any(h in s.lower() for h in RULE_HINTS) else flavor_parts).append(s)
    return {'num': num, 'title': tname, 'flavor': ' '.join(flavor_parts),
            'intro': ' '.join(rules), 'suspects': groups}

def bg_image(page_path):
    raw = open(page_path, encoding='utf-8').read()
    m = re.search(r'src="(images/[^"]+\.(?:jpg|jpeg|png))"', raw)
    return m.group(1) if m else None

def parse_grid_page(page_path):
    sp = get_spans(page_path)
    rooms, notes = [], []
    for s in sp:
        t = fix(s['text'])
        if not t or re.match(r'^\d+$', t):
            continue
        if 'moordenaar' in t.lower():
            continue
        letters = re.sub(r'[^A-Za-zÀ-ÿ]', '', t)
        if len(letters) >= 2 and letters == letters.upper():
            rooms.append(t)
        elif len(t) > 3 and s['color'] != 'c1':
            notes.append(t)
    # dedupe rooms preserving order
    seen = set(); rr = []
    for r in rooms:
        if r not in seen:
            seen.add(r); rr.append(r)
    return {'rooms': rr, 'notes': notes, 'image': bg_image(page_path)}

def spine_pages(opf_path):
    raw = open(opf_path, encoding='utf-8').read()
    ids = {}
    for m in re.finditer(r'<item\b([^>]*)>', raw):
        attrs = m.group(1)
        idm = re.search(r'\bid="([^"]+)"', attrs)
        hrefm = re.search(r'\bhref="([^"]+)"', attrs)
        if idm and hrefm:
            ids[idm.group(1)] = hrefm.group(1)
    order = re.findall(r'<itemref[^>]*\bidref="([^"]+)"', raw)
    base = os.path.dirname(opf_path)
    return [os.path.join(base, ids[i]) for i in order if i in ids and ids[i].endswith('.xhtml')]

def _sig_word(title):
    for w in re.findall(r"[A-Za-zÀ-ÿ']{4,}", title):
        return w
    return re.sub(r'[^A-Za-zÀ-ÿ]', '', title)[:6]

def _split_steps(block):
    steps = []
    for sm in re.finditer(r'(\d{1,2})\.\s+(.+?)(?=\s\d{1,2}\.\s|$)', block):
        txt = sm.group(2).strip()
        txt = re.sub(r'\s*[A-ZÀ-Þ][\wÀ-ÿ\-]+ is de moordenaar!?.*$', '', txt).strip()
        if len(txt) > 6:
            steps.append(txt)
    return steps

def parse_solutions(sol_pages, titles, suspects_by_num):
    """For each puzzle, murderer = the suspect name that appears in a
    'moordenaar' banner/inline closest to the puzzle's heading."""
    text = fix(' '.join(page_text(pp) for pp in sol_pages))
    NAME = r"([A-ZÀ-Þ][A-Za-zà-ÿ'\-]*)"
    # heading positions (best effort)
    heads = {}
    for num, title in titles.items():
        sw = _sig_word(title)[:5]
        m = re.compile(str(num) + r'\.\s{0,3}[A-Za-zÀ-ÿ ]{0,22}?' + re.escape(sw), re.I).search(text)
        if m:
            heads[num] = m.start()
    # all murderer mentions with position
    mentions = [(m.start(), m.group(1)) for m in
                re.finditer(r'moordenaar is[.\s…]*' + NAME, text) if m.group(1).lower() != 'de']
    mentions += [(m.start(), m.group(1)) for m in re.finditer(NAME + r' is de moordenaar', text)]
    def norm(s):
        return re.sub(r'[^a-z]', '', s.lower())
    out = {num: {'murderer': None, 'steps': []} for num in titles}
    for num in titles:
        S = suspects_by_num.get(num, set())
        cands = [(abs(pos - heads.get(num, 0)), pos, nm) for pos, nm in mentions if nm in S]
        if not cands:  # ligature-fuzzy fallback
            Sn = {norm(x): x for x in S}
            cands = [(abs(pos - heads.get(num, 0)), pos, Sn[norm(nm)])
                     for pos, nm in mentions if norm(nm) in Sn]
        if cands:
            out[num]['murderer'] = min(cands)[2]
    # step blocks -> assign to nearest puzzle heading whose murderer matches terminal name
    murd_pos = {num: heads.get(num) for num in titles if out[num]['murderer'] and num in heads}
    for bm in re.finditer(r'(1\.\s+.+?' + NAME + r' is de moordenaar!?)', text):
        block, murd, endpos = bm.group(1), bm.group(2), bm.end()
        # candidate puzzles whose murderer == this terminal name
        cand = [(abs(heads.get(num, 0) - endpos), num) for num in titles
                if out[num]['murderer'] == murd and num in heads]
        if cand:
            num = min(cand)[1]
            if not out[num]['steps']:
                out[num]['steps'] = _split_steps(block)
    return out

def difficulty(num, n, has_special):
    # The books progress from easy to expert; blend book position with grid size.
    tier = min(5, (num - 1) // 16 + 1)          # 1..5 across the 80 puzzles
    if n >= 9:
        tier = min(5, tier + 1)
    if n <= 4:
        tier = max(1, tier - 1)
    if has_special:
        tier = min(5, tier + 1) if tier < 5 else 5
    return max(1, min(5, tier))

def process_book(oebps, opf, book_id, img_out, prefix):
    pages = spine_pages(opf)
    # Solution pages carry a filled-in murderer phrase; clue pages never do.
    ptext = [page_text(pp) for pp in pages]
    def is_solution_page(t):
        return bool(re.search(r'is de moordenaar|moordenaar is[.\s…]*[A-ZÀ-Þ][a-zà-ÿ]', t))
    clue = {}
    last_clue_idx = 0
    for idx, pp in enumerate(pages):
        if is_solution_page(ptext[idx]):
            continue
        try:
            pc = parse_clue_page(pp)
        except Exception:
            pc = None
        if pc and pc['suspects'] and any('slachto' in s['clue'].lower() for s in pc['suspects']):
            if pc['num'] not in clue:
                clue[pc['num']] = (pp, pc)
            last_clue_idx = idx
    sol_start = last_clue_idx + 1
    titles = {num: pc['title'] for num, (pp, pc) in clue.items()}
    suspects_by_num = {num: set(s['name'] for s in pc['suspects']
                               if 'slachto' not in s['clue'].lower())
                       for num, (pp, pc) in clue.items()}
    sols = parse_solutions(pages[sol_start:], titles, suspects_by_num)
    # build letter-assigned suspect lists (incl. victim as V) for grid matching
    clue_suspects = {}
    for num, (pp, pc) in clue.items():
        vic = next((s for s in pc['suspects'] if 'slachto' in s['clue'].lower()), None)
        susp = sorted([s for s in pc['suspects'] if s is not vic], key=lambda s: s['name'].lower())
        lst = [{'name': s['name'], 'letter': chr(ord('A')+i), 'clue': s['clue']} for i, s in enumerate(susp)]
        if vic:
            lst.append({'name': vic['name'], 'letter': 'V', 'clue': vic['clue']})
        clue_suspects[num] = lst
    from extract_grids import build_solutions
    solmap = build_solutions(pages[sol_start:], titles, sols, clue_suspects)
    puzzles = []
    for num in sorted(clue.keys()):
        cp, pc = clue[num]
        gi = pages.index(cp)
        grid = None
        for j in range(gi+1, min(gi+3, len(pages))):
            g = parse_grid_page(pages[j])
            if g['image'] and 'De moordenaar' in page_text(pages[j]):
                grid = g; break
        if grid is None and gi+1 < len(pages):
            grid = parse_grid_page(pages[gi+1])
        n = len(pc['suspects'])
        victim = next((s for s in pc['suspects'] if 'slachto' in s['clue'].lower()), None)
        suspects = [s for s in pc['suspects'] if s is not victim]
        suspects.sort(key=lambda s: s['name'].lower())
        for i, s in enumerate(suspects):
            s['letter'] = chr(ord('A') + i)
        scene_name = None
        if grid and grid['image']:
            src = os.path.join(oebps, grid['image'])
            if os.path.exists(src):
                scene_name = f'{prefix}{num:03d}.jpg'
                shutil.copy(src, os.path.join(img_out, scene_name))
        sol = sols.get(num, {})
        has_special = bool((grid and grid['notes']) or pc.get('intro'))
        rules = []
        if pc.get('intro'):
            rules.append(pc['intro'])
        if grid:
            rules += grid['notes']
        rules = [r for r in rules if r and 'hoofdinspecteur' not in r.lower()
                 and not r.lower().startswith('detective')]
        # a solution is only playable if every solution letter maps to a suspect
        sol_cells = solmap[num]['cells'] if solmap.get(num, {}).get('trustworthy') else None
        if sol_cells is not None:
            want = set(s['letter'] for s in suspects) | ({'V'} if victim else set())
            if set(sol_cells) != want:
                sol_cells = None
        puzzles.append({
            'book': book_id, 'num': num, 'title': pc['title'], 'flavor': pc['flavor'],
            'n': n,
            'suspects': [{'name': s['name'], 'letter': s['letter'], 'clue': s['clue']} for s in suspects],
            'victim': {'name': victim['name'], 'letter': 'V', 'clue': victim['clue']} if victim else None,
            'rooms': grid['rooms'] if grid else [],
            'rules': rules,
            'clueBlock': pc.get('clueBlock'),
            'scene': scene_name,
            'murderer': sol.get('murderer'),
            'hintSteps': sol.get('steps', []),
            'solution': sol_cells,
            'solutionVerified': solmap.get(num, {}).get('verified', False) if sol_cells else False,
            'difficulty': difficulty(num, n, has_special),
        })
    return puzzles

if __name__ == '__main__':
    S = os.path.dirname(os.path.abspath(__file__))
    OUT = os.path.join(S, 'out'); IMG = os.path.join(OUT, 'scenes')
    os.makedirs(IMG, exist_ok=True)
    b1 = process_book(os.path.join(S, 'epub1/OEBPS'), os.path.join(S, 'epub1/OEBPS/package.opf'), 1, IMG, 'b1_')
    b2 = process_book(os.path.join(S, 'epub2orig/OEBPS'), os.path.join(S, 'epub2orig/OEBPS/package.opf'), 2, IMG, 'b2_')
    print('Book1:', len(b1), 'Book2:', len(b2))
    allp = b1 + b2
    for i, p in enumerate(allp):
        p['id'] = i + 1
    json.dump(allp, open(os.path.join(OUT, 'puzzles.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    print('TOTAL:', len(allp))
    print('missing murderer:', [p['id'] for p in allp if not p['murderer']])
    print('missing scene:', [p['id'] for p in allp if not p['scene']])
    print('missing hints:', len([p for p in allp if not p['hintSteps']]))
    print('grid sizes:', dict(Counter(p['n'] for p in allp)))
    # validation: the solution grid must satisfy the puzzle's positional clues
    from extract_grids import clue_constraints, check_constraints
    withsol = [p for p in allp if p.get('solution')]
    print('with solution grid:', len(withsol))
    perfect = 0; anyviol = 0; nocheck = 0
    for p in withsol:
        cells = {k: tuple(v) for k, v in p['solution'].items()}
        people = p['suspects'] + ([p['victim']] if p['victim'] else [])
        ok, tot = check_constraints(clue_constraints(people, p['n']), cells)
        if tot == 0:
            nocheck += 1
        elif ok == tot:
            perfect += 1
        else:
            anyviol += 1
    print(f'solution vs positional clues: {perfect} consistent, {anyviol} violate, {nocheck} unverifiable')
    print('murderer-in-suspects mismatch:', [p['id'] for p in allp if p['murderer'] and p['murderer'] not in [s['name'] for s in p['suspects']]][:40])
