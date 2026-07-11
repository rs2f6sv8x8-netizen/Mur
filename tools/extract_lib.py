"""Core EPUB parsing helpers for Murdoku extraction."""
import re, os, html as htmllib
import xml.etree.ElementTree as ET

NS = '{http://www.w3.org/1999/xhtml}'

def load_page_css(css_path):
    pos = {}
    if not os.path.exists(css_path):
        return pos
    txt = open(css_path, encoding='utf-8').read()
    for name, body in re.findall(r'\.([a-zA-Z0-9_]+)\s*\{([^}]*)\}', txt):
        m = re.search(r'left:\s*([-\d.]+)px', body)
        if m: pos.setdefault(name, {})['left'] = float(m.group(1))
        m = re.search(r'bottom:\s*([-\d.]+)px', body)
        if m: pos.setdefault(name, {})['bottom'] = float(m.group(1))
        m = re.search(r'top:\s*([-\d.]+)px', body)
        if m: pos.setdefault(name, {})['top'] = float(m.group(1))
    return pos

def get_spans(page_path):
    """Top-level spans in DOCUMENT ORDER with positions.
    Each: {font,size,color,left,bottom,text}."""
    raw = open(page_path, encoding='utf-8').read()
    pgdir = os.path.dirname(page_path)
    css = {}
    for href in re.findall(r'<link[^>]+href="([^"]+\.css)"', raw):
        path = os.path.normpath(os.path.join(pgdir, href))
        for k, v in load_page_css(path).items():
            css.setdefault(k, {}).update(v)
    raw2 = re.sub(r'&#(5[0-9]{4}|6[0-3][0-9]{3});', '', raw)
    raw2 = re.sub(r'<!DOCTYPE[^>]*>', '', raw2)
    try:
        root = ET.fromstring(raw2)
    except ET.ParseError:
        root = ET.fromstring(re.sub(r'&#\d+;', '', raw2))
    spans = []
    for p in root.iter(NS + 'p'):
        for sp in list(p):
            if sp.tag != NS + 'span':
                continue
            cls = sp.get('class', '')
            text = htmllib.unescape(''.join(sp.itertext()))
            if text == '':
                continue
            classes = cls.split()
            font = next((c for c in classes if re.fullmatch(r'f\d+', c)), '')
            size = next((c for c in classes if re.fullmatch(r'fs\d+', c)), '')
            color = next((c for c in classes if re.fullmatch(r'c\d+', c)), '')
            # resolve position from ANY of the span's classes (book1: separate
            # x/b classes; book2/calibre: a single s#### class carries both)
            left = 0.0; bottom = 0.0
            for c in classes:
                info = css.get(c)
                if not info:
                    continue
                if 'left' in info and left == 0.0:
                    left = info['left']
                if ('bottom' in info or 'top' in info) and bottom == 0.0:
                    bottom = info.get('bottom', info.get('top', 0.0))
            spans.append({'font': font, 'size': size, 'color': color,
                          'left': left, 'bottom': bottom, 'text': text})
    return spans

def page_text(page_path):
    return re.sub(r'\s+', ' ', ''.join(s['text'] for s in get_spans(page_path))).strip()
