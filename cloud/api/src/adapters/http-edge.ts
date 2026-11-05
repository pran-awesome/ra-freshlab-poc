// EdgeClient over HTTPS (Cloudflare Tunnel hostname or LAN URL). Uses global
// fetch, so it runs on Node 18+, Cloudflare Workers, Deno, Lambda...
import type { EdgeClient, EdgeSensors } from "../core/ports";
import type { RelayState } from "../core/types";

export interface HttpEdgeOptions {
  baseUrl: string;
  token: string;
  /** Optional Cloudflare Access service-token headers. */
  accessClientId?: string;
  accessClientSecret?: string;
  timeoutMs?: number;
}

export class HttpEdgeClient implements EdgeClient {
  constructor(private o: HttpEdgeOptions) {}

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.o.token}`,
      "content-type": "application/json",
    };
    if (this.o.accessClientId) {
      headers["CF-Access-Client-Id"] = this.o.accessClientId;
      headers["CF-Access-Client-Secret"] = this.o.accessClientSecret ?? "";
    }
    const res = await fetch(this.o.baseUrl.replace(/\/$/, "") + path, {
      ...init,
      headers,
      signal: AbortSignal.timeout(this.o.timeoutMs ?? 8000),
    });
    if (!res.ok) throw new Error(`edge ${path} -> ${res.status} ${await res.text()}`);
    return (await res.json()) as T;
  }

  health() {
    return this.call<{ ok: boolean; nano_connected: boolean; firmware: string | null }>("/health");
  }
  sensors(fresh = false) {
    return this.call<EdgeSensors>(`/v1/sensors${fresh ? "?fresh=true" : ""}`);
  }
  async relays() {
    return (await this.call<{ relays: RelayState[] }>("/v1/relays")).relays;
  }
  async setRelay(name: string, on: boolean, maxSeconds?: number) {
    await this.call(`/v1/relays/${encodeURIComponent(name)}`, {
      method: "POST",
      body: JSON.stringify({ on, max_seconds: maxSeconds ?? null }),
    });
  }
  async allOff() {
    await this.call("/v1/relays/all-off", { method: "POST" });
  }
}
