import { describe, it, expect } from 'vitest';
// @ts-ignore node builtin
import { spawnSync } from 'node:child_process';

describe('filesystem case safety', () => {
  it('has no case-insensitive path/module collisions and imports match file case', () => {
    const r = spawnSync('node', ['scripts/check-case.mjs'], { encoding: 'utf8' });
    expect(r.stderr + r.stdout).toContain('check:case OK');
    expect(r.status).toBe(0);
  });
});
