import type { Store } from "../core/ports";

export class MemoryStore implements Store {
  private m = new Map<string, string>();
  async get<T>(k: string) {
    const v = this.m.get(k);
    return v == null ? null : (JSON.parse(v) as T);
  }
  async set<T>(k: string, v: T) {
    this.m.set(k, JSON.stringify(v));
  }
}

/** Anything shaped like Cloudflare KV (or a thin Redis/Upstash wrapper). */
export interface KVLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}
export class KVStore implements Store {
  constructor(private kv: KVLike, private prefix = "freshlab:") {}
  async get<T>(k: string) {
    const v = await this.kv.get(this.prefix + k);
    return v == null ? null : (JSON.parse(v) as T);
  }
  async set<T>(k: string, v: T) {
    await this.kv.put(this.prefix + k, JSON.stringify(v));
  }
}
