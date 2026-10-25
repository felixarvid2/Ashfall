/** In-memory Storage for save and account tests; `failWith` makes every setItem throw that error name. */
export class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  failWith: string | null = null;
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null;
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  setItem(key: string, value: string) {
    if (this.failWith) {
      const err = new Error('write failed');
      err.name = this.failWith;
      throw err;
    }
    this.data.set(key, value);
  }
  keys(): string[] {
    return [...this.data.keys()];
  }
}
