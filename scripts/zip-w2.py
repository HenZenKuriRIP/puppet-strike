#!/usr/bin/env python3
"""Zip the project to /workspace/puppet-strike-w2.zip (excludes node_modules, dist, dist-e2e, .git)."""
import zipfile, os
root='/workspace/puppet-strike'; out='/workspace/puppet-strike-w2.zip'
ex={'node_modules','dist','dist-e2e','.git'}
tmp=out+'.tmp'
with zipfile.ZipFile(tmp,'w',zipfile.ZIP_DEFLATED) as z:
    for d,ds,fs in os.walk(root):
        ds[:]=[x for x in ds if x not in ex]
        for f in fs:
            p=os.path.join(d,f); z.write(p,os.path.join('puppet-strike',os.path.relpath(p,root)))
os.replace(tmp,out); print(out, os.path.getsize(out))
