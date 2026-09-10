type Entry<T> = { value: T; expiresAt: number };

// A plain in-memory cache. The dashboard polls every 15s and each poll would
// otherwise hit Yahoo and Google 26 times each, which gets the server blocked
// very quickly. Anything already fetched inside the TTL is reused.
//
// This lives in the Node process, so it resets on restart and is not shared
// between server instances. That is fine for this assignment; in production
// it would be Redis.
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

// Runs the same async function for a list of keys, but only `size` at a time.
// Firing 26 parallel requests at a scraped endpoint is the fastest way to get
// rate limited, so requests go out in small batches instead.
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
