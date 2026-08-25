// Web stand-in for `expo-sqlite/kv-store` (Plan 4 Task 8), wired by
// metro.config.js for platform 'web' only. The real kv-store needs the
// wa-sqlite wasm setup on web (see the Task 3 note in DEVIATIONS.md); small
// key-value state (active business, walk theme, pending invite) is backed by
// localStorage instead, with an in-memory map under static rendering (Node)
// where localStorage does not exist.

const memory = new Map<string, string>();

function localStore(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

const kv = {
  async getItem(key: string): Promise<string | null> {
    const ls = localStore();
    return ls ? ls.getItem(key) : (memory.get(key) ?? null);
  },
  async setItem(key: string, value: string): Promise<void> {
    const ls = localStore();
    if (ls) ls.setItem(key, value);
    else memory.set(key, value);
  },
  async removeItem(key: string): Promise<void> {
    const ls = localStore();
    if (ls) ls.removeItem(key);
    else memory.delete(key);
  },
};

export default kv;
