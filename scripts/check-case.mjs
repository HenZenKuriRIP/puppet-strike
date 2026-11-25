// check:case — fails on (1) case-insensitive path collisions (incl. extensionless
// module stems, e.g. arena.ts vs Arena.tsx, which collide on macOS/Windows import
// resolution) and (2) relative imports whose case differs from the real file.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['node_modules', 'dist', 'dist-e2e', '.git']);
const EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.css'];
const files = [];
const dirs = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (SKIP.has(e.name) && d === root) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) { dirs.push(p); walk(p); } else files.push(p);
  }
})(root);
const rel = (p) => path.relative(root, p).split(path.sep).join('/');
const errors = [];

function group(items, keyFn, label) {
  const m = new Map();
  for (const it of items) { const k = keyFn(it).toLowerCase(); (m.get(k) ?? m.set(k, []).get(k)).push(it); }
  for (const [, v] of m) if (new Set(v.map(rel)).size > 1) errors.push(`${label}: ${v.map(rel).join('  <->  ')}`);
}
group([...files, ...dirs], (p) => rel(p), 'path collision (case-insensitive)');
const stem = (p) => rel(p).replace(/\.d\.ts$/, '').replace(/\.[^./]+$/, '');
group(files.filter((f) => /\.(tsx?|jsx?|mjs|cjs)$/.test(f)), stem, 'module-stem collision (extensionless import ambiguity)');

// exact-case resolution of a path
function existsExact(p) {
  const parts = path.relative(root, p).split(path.sep);
  let cur = root;
  for (const part of parts) {
    if (!fs.existsSync(cur) || !fs.readdirSync(cur).includes(part)) return false;
    cur = path.join(cur, part);
  }
  return true;
}
const importRe = /(?:from\s+|import\s*\(\s*|import\s+|require\(\s*)['"](\.{1,2}\/[^'"]*)['"]/g;
for (const f of files.filter((f) => /\.(tsx?|jsx?|mjs|cjs)$/.test(f))) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(importRe)) {
    const target = path.resolve(path.dirname(f), m[1]);
    const cands = [target, ...EXTS.map((e) => target + e), ...EXTS.map((e) => path.join(target, 'index' + e))];
    if (!cands.some(existsExact)) {
      const ci = cands.some((c) => fs.existsSync(c));
      errors.push(`${rel(f)}: import '${m[1]}' ${ci ? 'matches a file only case-insensitively (wrong case)' : 'does not resolve'}`);
    }
  }
}
if (errors.length) { console.error('check:case FAILED\n' + errors.map((e) => ' - ' + e).join('\n')); process.exit(1); }
console.log(`check:case OK (${files.length} files, ${dirs.length} dirs, no case collisions, imports exact-case)`);
