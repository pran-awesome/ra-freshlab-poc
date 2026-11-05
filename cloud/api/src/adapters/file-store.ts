// Node-only: persists the whole store to one JSON file (VPS volume).
// Good enough for a PoC; swap for Postgres/SQLite behind the same Store port.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Store } from "../core/ports";

export class JsonFileStore implements Store {
  private data: Record<string, unknown> = {};
  constructor(private path: string) {
    try {
      this.data = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      this.data = {};
    }
  }
  async get<T>(k: string) {
    return (this.data[k] as T) ?? null;
  }
  async set<T>(k: string, v: T) {
    this.data[k] = v;
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    renameSync(tmp, this.path);
  }
}
