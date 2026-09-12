type Entry<T> = { value: T; expiresAt: number };

// In-process only: resets on restart and is not shared between server instances.
export class TtlCache<T> {
  private store = new Map<string, Entry<T>>();

  constructor(private ttlMs: number) {}

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T) {
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }
}

// Batched rather than all at once: 26 parallel requests gets us rate limited.
export async function mapWithLimit<In, Out>(
  items: In[],
  size: number,
  fn: (item: In) => Promise<Out>
): Promise<Out[]> {
  const results: Out[] = [];

  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size);
    const settled = await Promise.all(batch.map(fn));
    results.push(...settled);
  }

  return results;
}
