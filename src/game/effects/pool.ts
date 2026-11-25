/** Fixed-size object pool – no allocations during play. */
export class Pool<T extends { active: boolean }> {
  readonly items: T[];
  constructor(size: number, make: (i: number) => T) { this.items = Array.from({ length: size }, (_, i) => make(i)); }
  spawn(): T | null {
    for (const it of this.items) if (!it.active) { it.active = true; return it; }
    return null;
  }
  /** like spawn but recycles the first item when full (for cosmetic fx) */
  spawnOrRecycle(): T { return this.spawn() ?? (this.items[0].active = true, this.items[0]); }
  clear() { for (const it of this.items) it.active = false; }
  countActive(pred?: (t: T) => boolean) { let n = 0; for (const it of this.items) if (it.active && (!pred || pred(it))) n++; return n; }
}
