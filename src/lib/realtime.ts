import "server-only";
import pg from "pg";
import { db } from "@/lib/db";
import { dbUrlFromEnv } from "@/lib/db-url";
import { CHANNEL, Registry, decode, encode, personTopic, userTopic, type LiveEvent } from "@/lib/realtime-core";

/**
 * Live updates over Postgres LISTEN/NOTIFY – no extra server, nothing outside our database.
 *
 * Publishing is a `pg_notify` through the normal (pooled) connection; it is delivered when the
 * transaction commits. Listening needs a session of its own, so it uses the direct connection
 * (DATABASE_URL_UNPOOLED on Neon – the pooler can't LISTEN). That connection is opened only while
 * someone in this process has a live page open, and closed 30 seconds after the last one leaves:
 * an open connection keeps Neon's compute awake, and we want it to sleep when nobody is looking.
 * Each server instance listens for itself, so this works with one instance or many.
 * See docs/realtime.md for the limits and the path to a dedicated server when they are reached.
 */

const IDLE_CLOSE_MS = 30_000;
const MAX_STREAMS = 500;
const MAX_STREAMS_PER_USER = 5;

class Hub {
  private registry = new Registry();
  private client: pg.Client | null = null;
  private connecting: Promise<void> | null = null;
  private idle: ReturnType<typeof setTimeout> | null = null;
  private retry = 1000;
  private perUser = new Map<string, number>();

  /** Room for one more stream for this member? */
  canOpen(userId: string) {
    return this.registry.size < MAX_STREAMS && (this.perUser.get(userId) ?? 0) < MAX_STREAMS_PER_USER;
  }

  subscribe(userId: string, topics: string[], fn: (topic: string, event: LiveEvent) => void): () => void {
    const off = this.registry.subscribe(topics, fn);
    this.perUser.set(userId, (this.perUser.get(userId) ?? 0) + 1);
    if (this.idle) clearTimeout(this.idle);
    this.idle = null;
    void this.connect();
    let done = false;
    return () => {
      if (done) return;
      done = true;
      off();
      const n = (this.perUser.get(userId) ?? 1) - 1;
      if (n) this.perUser.set(userId, n);
      else this.perUser.delete(userId);
      if (!this.registry.size) this.idle = setTimeout(() => void this.close(), IDLE_CLOSE_MS);
    };
  }

  private connect(): Promise<void> {
    if (this.client || this.connecting) return this.connecting ?? Promise.resolve();
    const url = dbUrlFromEnv("DATABASE_URL_UNPOOLED") ?? dbUrlFromEnv("DATABASE_URL");
    if (!url) return Promise.resolve();
    const client = new pg.Client({ connectionString: url, application_name: "vamsha-live" });
    client.on("notification", (msg) => {
      const m = msg.channel === CHANNEL ? decode(msg.payload) : null;
      if (m) this.registry.dispatch(m.topic, m.event);
    });
    client.on("error", () => this.lost(client));
    client.on("end", () => this.lost(client));
    this.connecting = client
      .connect()
      .then(() => client.query(`LISTEN ${CHANNEL}`))
      .then(() => {
        this.client = client;
        this.retry = 1000;
      })
      .catch(() => {
        // The database may be waking up: try again, a little later each time, while anyone is waiting
        client.end().catch(() => undefined);
        if (this.registry.size) setTimeout(() => void this.connect(), (this.retry = Math.min(this.retry * 2, 60_000)));
      })
      .finally(() => {
        this.connecting = null;
      });
    return this.connecting;
  }

  private lost(client: pg.Client) {
    if (this.client !== client) return;
    this.client = null;
    if (this.registry.size) setTimeout(() => void this.connect(), this.retry);
  }

  private async close() {
    this.idle = null;
    if (this.registry.size || !this.client) return;
    const c = this.client;
    this.client = null;
    await c.end().catch(() => undefined);
  }
}

// One hub per server process (kept across hot reloads in development)
const g = globalThis as unknown as { vamshaHub?: Hub };
export const hub = g.vamshaHub ?? (g.vamshaHub = new Hub());

/** These people's records changed (an edit, a new relative, a link added or removed). */
export async function peopleChanged(ids: (string | null | undefined)[], by: string | null | undefined) {
  for (const id of new Set(ids.filter((x): x is string => !!x))) await publish(personTopic(id), { type: "person-changed", ...(by ? { by } : {}) });
}

/** A member's notifications changed: a new one (by someone else), or read by them on another device. */
export const notificationsChanged = (userIds: string[], by: string | null | undefined) =>
  Promise.all([...new Set(userIds)].map((id) => publish(userTopic(id), { type: "notification", ...(by ? { by } : {}) })));

/** Tell everyone watching a topic that something happened. Never fails the action that called it. */
export async function publish(topic: string, event: LiveEvent) {
  try {
    await db.$executeRaw`SELECT pg_notify(${CHANNEL}, ${encode(topic, event)})`;
  } catch (e) {
    console.error("live update not sent:", e instanceof Error ? e.message : e);
  }
}
