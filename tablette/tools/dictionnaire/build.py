"""Construit public/dictionnaire.json depuis les fichiers *.txt et vérifie les références.
Format : @Mot|cat|réf; réf; …|alias1, alias2  puis les paragraphes, une ligne vide entre articles."""
import json, re, sys, glob, unicodedata, os

BIBLE = json.load(open(sys.argv[1]))
OUT = sys.argv[2]
CATS = {'p': 'Personnage', 'l': 'Lieu', 'u': 'Peuple', 'f': 'Mot de la foi', 'o': 'Objet, coutume', 't': 'Fête, temps, mesure', 'b': 'Livre de la Bible'}

def norm(s):
    s = unicodedata.normalize('NFD', s.lower())
    return ''.join(c for c in s if unicodedata.category(c) != 'Mn')

REF = re.compile(r'^(.+?) (\d+)(?::(\d+)(?:-(\d+))?)?$')
def check_ref(r):
    m = REF.match(r.strip())
    if not m: return f'format: {r}'
    b, c, v1, v2 = m.groups()
    if b not in BIBLE: return f'livre inconnu: {r}'
    ch = BIBLE[b].get(c)
    if not ch: return f'chapitre absent: {r}'
    if v1:
        for v in range(int(v1), int(v2 or v1) + 1):
            if str(v) not in ch: return f'verset absent: {r}'
    return None

def ref_text(r):
    b, c, v1, v2 = REF.match(r.strip()).groups()
    ch = BIBLE[b][c]
    if not v1: return ' '.join(ch.values())
    return ' '.join(ch[str(v)] for v in range(int(v1), int(v2 or v1) + 1))

entries, errors, weak = [], [], []
seen = set()
for f in sorted(glob.glob(os.path.join(os.path.dirname(os.path.abspath(__file__)), '[0-9]*.txt'))):
    blocks = re.split(r'\n\s*\n', open(f, encoding='utf-8').read().strip())
    for blk in blocks:
        lines = [l.rstrip() for l in blk.strip().split('\n') if l.strip()]
        if not lines or not lines[0].startswith('@'):
            errors.append(f'{os.path.basename(f)}: bloc sans en-tête: {lines[:1]}'); continue
        head = lines[0][1:].split('|')
        word, cat = head[0].strip(), head[1].strip()
        refs = [r.strip() for r in head[2].split(';') if r.strip()] if len(head) > 2 else []
        alias = [a.strip() for a in head[3].split(',') if a.strip()] if len(head) > 3 else []
        if cat not in CATS: errors.append(f'{word}: catégorie {cat}')
        key = norm(word)
        if key in seen: errors.append(f'doublon: {word}')
        seen.add(key)
        for r in refs:
            e = check_ref(r)
            if e: errors.append(f'{word}: {e}')
        # Le mot (ou un alias) apparaît-il dans au moins une référence ? (repère les erreurs de référence)
        if refs and cat != 'b':
            stems = [norm(re.sub(r'\s*\(.*\)', '', x))[:5] for x in [word] + alias]
            ok_refs = [r for r in refs if not check_ref(r) and any(s and s in norm(ref_text(r)) for s in stems)]
            if not ok_refs: weak.append(f'{word} [{cat}]: {"; ".join(refs)}')
        text = '\n'.join(lines[1:])
        # Espaces insécables : pas de « ou de : seul en bout de ligne sur la TV
        text = re.sub(r'« ', '«\u00a0', text); text = re.sub(r' »', '\u00a0»', text); text = re.sub(r' ([:;!?])', '\u00a0\\1', text)
        entries.append({'m': word, 'c': cat, 'd': text, 'r': refs, **({'a': alias} if alias else {})})

entries.sort(key=lambda e: norm(e['m']))
data = {'version': 1, 'sources': [{'id': 'biblecast', 'label': 'Lexique BibleCast', 'note': 'Rédigé pour BibleCast, libre de droits. Références : Louis Segond 1910.'}],
        'categories': CATS, 'entries': entries}
json.dump(data, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(f'{len(entries)} articles, {os.path.getsize(OUT)//1024} Ko')
from collections import Counter
print(Counter(e['c'] for e in entries))
print('ERREURS:', len(errors)); [print(' ', e) for e in errors]
print('À VÉRIFIER (mot absent des versets cités):', len(weak)); [print(' ', w) for w in weak]
