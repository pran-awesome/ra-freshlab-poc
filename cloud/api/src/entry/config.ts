// Builds the object graph from a plain env map, shared by every runtime entry.
import { FakeEdgeClient } from "../adapters/fake-edge";
import { HttpEdgeClient } from "../adapters/http-edge";
import type { EdgeClient, Store } from "../core/ports";
import { FreshLabService } from "../core/service";
import { createApp } from "../http/app";

export type Env = Record<string, string | undefined>;

export function build(env: Env, store: Store) {
  const edge: EdgeClient =
    !env.EDGE_URL || env.EDGE_URL === "mock"
      ? new FakeEdgeClient()
      : new HttpEdgeClient({
          baseUrl: env.EDGE_URL,
          token: env.EDGE_API_TOKEN ?? "",
          accessClientId: env.CF_ACCESS_CLIENT_ID,
          accessClientSecret: env.CF_ACCESS_CLIENT_SECRET,
        });
  const service = new FreshLabService(edge, store, {
    timeZone: env.TZ_NAME ?? "Asia/Bangkok",
    doorRelay: env.DOOR_RELAY ?? "door",
    doorUnlockSeconds: Number(env.DOOR_UNLOCK_SECONDS ?? 5),
  });
  if (!env.JWT_SECRET) console.warn("JWT_SECRET not set, using an insecure dev secret");
  const app = createApp({
    service,
    edge,
    jwtSecret: env.JWT_SECRET ?? "dev-insecure-secret",
    adminPassword: env.ADMIN_PASSWORD ?? "",
  });
  return { app, service, edge };
}
