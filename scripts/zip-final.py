#!/usr/bin/env python3
"""Final delivery zips (exclude node_modules, dist, dist-e2e, .git).
  /workspace/puppet-strike-final.zip       full project + only KEY screenshots (must stay < 24 MB)
  /workspace/puppet-strike-final-full.zip  full project + ALL screenshots
"""
import zipfile, os, sys, fnmatch
root = '/workspace/puppet-strike'
EX = {'node_modules', 'dist', 'dist-e2e', '.git'}
LIMIT = 24 * 1024 * 1024
# key screenshots, in priority order (dropped from the end if the slim zip would exceed the limit)
KEY = ['polish-after-lineup-small.png', 'polish-after-lineup-tanks.png', 'polish-after-lineup-block.png', 'polish-after-king.png',
       'polish-after-colossus.png', 'polish-after-props-pickups.png', 'polish-after-props-blocks.png', 'polish-after-bcrane.png',
       'polish-after-choco.png', 'polish-after-bgolem.png', 'polish-after-windup.png', 'polish-after-clown.png']

def project_files(shots):
    for d, ds, fs in os.walk(root):
        ds[:] = [x for x in ds if x not in EX]
        for f in fs:
            p = os.path.join(d, f); rel = os.path.relpath(p, root)
            if rel.startswith('screenshots' + os.sep):
                if shots is not None and os.path.basename(rel) not in shots: continue
            yield p, rel

def build(out, shots):
    tmp = out + '.tmp'
    with zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for p, rel in project_files(shots): z.write(p, os.path.join('puppet-strike', rel))
    os.replace(tmp, out); return os.path.getsize(out)

keys = [k for k in KEY if os.path.exists(os.path.join(root, 'screenshots', k))]
while True:
    n = build('/workspace/puppet-strike-final.zip', set(keys))
    if n < LIMIT or not keys: break
    keys.pop()
print('/workspace/puppet-strike-final.zip', n, 'bytes,', len(keys), 'screenshots', 'OK' if n < LIMIT else 'TOO BIG')
m = build('/workspace/puppet-strike-final-full.zip', None)
print('/workspace/puppet-strike-final-full.zip', m, 'bytes')
