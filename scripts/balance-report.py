#!/usr/bin/env python3
"""Regenerate the tables in docs/BALANCE_REPORT.md from docs/balance-data.json (written by `BALANCE=1 vitest run src/tests/balance.report.test.ts`).
Keeps the hand-written header (everything before the first '## novice') and the conclusions section."""
import json
from pathlib import Path
root = Path(__file__).resolve().parent.parent
data = json.loads((root / 'docs/balance-data.json').read_text())
doc = (root / 'docs/BALANCE_REPORT.md').read_text()
head = doc.split('## novice')[0]
concl = doc[doc.index('## 结论'):] if '## 结论' in doc else '## 结论\n\n(待补充)\n'
skills = ['novice', 'average', 'good']
chars = list(dict.fromkeys(r['ch'] for r in data))
mean = lambda xs: sum(xs) / len(xs) if xs else 0
out = [head.rstrip() + '\n']
summ = {}
for sk in skills:
    out.append(f'\n## {sk}\n\n| 角色 | 关卡 | 通关率 | 平均用时(s) | 平均承伤 | 平均技能次数 | Boss 剩余血量(失败局) |\n|---|---|---|---|---|---|---|')
    for ch in chars:
        for st in (1, 2, 3):
            rs = [r for r in data if r['skill'] == sk and r['ch'] == ch and r['st'] == st]
            if not rs: continue
            win = [r for r in rs if r['cleared']]
            summ.setdefault((sk, st), []).extend(r['cleared'] for r in rs)
            fails = ', '.join(f"{round(r.get('bossHpFrac', 0) * 100)}%" for r in rs if st == 3 and not r['cleared']) or '-'
            t = f"{mean([r['time'] for r in win]):.0f}" if win else '-'
            out.append(f"| {ch.upper()} | {'Boss' if st == 3 else st} | {len(win)}/{len(rs)} | {t} | {mean([r['damageTaken'] for r in rs]):.0f} | {mean([r['skillUses'] for r in rs]):.1f} | {fails} |")
out.append('\n## 汇总\n\n| 档位 | 第1关 | 第2关 | Boss |\n|---|---|---|---|')
for sk in skills:
    out.append(f'| {sk} | ' + ' | '.join(f"{round(100 * mean(summ.get((sk, st), [0])))}%" for st in (1, 2, 3)) + ' |')
(root / 'docs/BALANCE_REPORT.md').write_text('\n'.join(out) + '\n\n' + concl)
print('\n'.join(out[-5:]))
