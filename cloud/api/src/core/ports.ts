// Ports = everything the core needs from the outside world.
// Adapters (src/adapters) implement these for Node/VPS or serverless runtimes.
import type { RelayState } from "./types";

export interface EdgeSensors {
  temperature_c: number | null;
  humidity_pct: number | null;
  soil_raw: number | null;
  read_at: number | null;
}

/** The Raspberry Pi hardware API (edge/). */
export interface EdgeClient {
  health(): Promise<{ ok: boolean; nano_connected: boolean; firmware: string | null }>;
  sensors(fresh?: boolean): Promise<EdgeSensors>;
  relays(): Promise<RelayState[]>;
  setRelay(name: string, on: boolean, maxSeconds?: number): Promise<void>;
  allOff(): Promise<void>;
}

/** Tiny async key/value store. Maps to a JSON file, Redis, Cloudflare KV, D1... */
export interface Store {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
}

export interface Clock {
  now(): Date;
}
