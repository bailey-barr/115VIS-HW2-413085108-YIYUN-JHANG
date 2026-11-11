"""Rebuild the website data from the attached report (pypdf required only for extraction)."""
from pathlib import Path
from pypdf import PdfReader
import re, json

root = Path(__file__).resolve().parents[1]
pdf = PdfReader(root / 'data/source-report.pdf')
keys = ['總計', '中國大陸(含港澳)', '東南亞', '美國', '日本、南韓', '其他']
rows = []
for line in pdf.pages[10].extract_text().splitlines():
    m = re.match(r'^\s*(\d{2,3})\s*年\s+(.+)', line)
    if not m:
        continue
    values = m[2].split()
    if len(values) != 7:
        raise ValueError(f'Unexpected table 6 row: {line}')
    values = [int(v) if v.isdigit() else None for v in values]
    # Table 6 also contains a China + Southeast Asia subtotal; do not count it twice.
    selected = [values[i] for i in [0, 2, 3, 4, 5, 6]]
    rows.append({'year': int(m[1]), **dict(zip(keys, selected)), 'officialGrowth': None, 'shares': {k: None for k in keys[1:]}})
assert len(rows) == 26 and rows[0]['year'] == 88 and rows[-1]['year'] == 113

text = pdf.pages[7].extract_text().split('表 3', 1)[1]
lines = [re.sub(r'\s+', '', line) for line in text.splitlines()]
originals = text.splitlines()
def numbers(line):
    return [None if n == '-' else float(n) for n in re.findall(r'(?<![\d.])-?\d+(?:\.\d+)?|(?<!\S)-(?!\S)', line)]
current = None
for compact, original in zip(lines, originals):
    if compact.startswith('赴海外工作人數'):
        current = '總計'
    elif compact.startswith('中國大陸'):
        current = keys[1]
    elif compact.startswith('東南亞'):
        current = '東南亞'
    elif compact.startswith('美國'):
        current = '美國'
    elif compact.startswith('其他國家'):
        current = None # Parent category includes Japan/Korea; do not duplicate it.
    elif compact.startswith('日本、南韓'):
        current = '日本、南韓'
    elif re.match(r'^其他[\d\-]', compact):
        current = '其他'
    elif compact.startswith('年增率') and current == '總計':
        vals = numbers(original)
        assert len(vals) == 16, vals
        for row, value in zip(rows[10:], vals): row['officialGrowth'] = value
    elif compact.startswith('占比') and current in keys[1:]:
        vals = numbers(original)
        assert len(vals) == 16, (current, vals)
        for row, value in zip(rows[10:], vals): row['shares'][current] = value

assert rows[-1]['officialGrowth'] == 7.4
assert rows[-1]['shares']['美國'] == 20.5
assert rows[-1]['shares']['其他'] == 18.2
payload = {
    'source': {'title': '113年國人赴海外工作人數統計新聞稿', 'publisher': '行政院主計總處', 'published': '2025-11-19', 'file': 'source-report.pdf', 'counts': '第11頁表6', 'rates': '第8頁表3', 'unit': '千人'},
    'notes': ['88至97年為先期研究階段統計結果，各年涵蓋國家與編製方法略有差異。', '110年起由其他國家（地區）析出日本、南韓。', '年增率與占比採新聞稿表3公布值，不以表列千人數重新計算。'],
    'rows': rows
}
(root / 'data/overseas-work.json').write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
print('Extracted 26 yearly count rows from table 6 and published growth/shares from table 3.')
