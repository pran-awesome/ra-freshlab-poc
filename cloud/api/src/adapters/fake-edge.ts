// In-memory edge for local dev and tests (EDGE_URL=mock).
import type { EdgeClient } from "../core/ports";
import type { RelayState } from "../core/types";

export class FakeEdgeClient implements EdgeClient {
  calls: { name: string; on: boolean; maxSeconds?: number }[] = [];
  soilRaw = 650;
  private state: Record<string, boolean>;
  constructor(private names = ["door", "pump", "light", "fan"]) {
    this.state = Object.fromEntries(names.map((n) => [n, false]));
  }
  async health() {
    return { ok: true, nano_connected: true, firmware: "fake" };
  }
  async sensors() {
    return { temperature_c: 27.3, humidity_pct: 64.2, soil_raw: this.soilRaw, read_at: Date.now() / 1000 };
  }
  async relays(): Promise<RelayState[]> {
    return this.names.map((name, channel) => ({ name, channel, on: this.state[name] }));
  }
  async setRelay(name: string, on: boolean, maxSeconds?: number) {
    if (!(name in this.state)) throw new Error(`unknown relay ${name}`);
    this.state[name] = on;
    this.calls.push({ name, on, maxSeconds });
  }
  async allOff() {
    for (const k of Object.keys(this.state)) this.state[k] = false;
  }
}
