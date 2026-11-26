/**
 * Live updates, the parts without I/O (unit-tested): topic names, the message format on the
 * Postgres channel, Server-Sent Events frames, and the in-process registry of listeners.
 * src/lib/realtime.ts wires these to Postgres LISTEN/NOTIFY; /api/events streams them to browsers.
 *
 * Messages carry only what happened and where ("notification" for user X, "person-changed" for
 * person Y) – never names or details. The browser fetches the page again to see what changed, with
 * the usual permission checks.
 */

export const CHANNEL = "vamsha_events";
/** Postgres refuses NOTIFY payloads of 8000 bytes or more */
const MAX_PAYLOAD = 7000;

export type LiveEvent = { type: "notification" | "person-changed"; by?: string };
const TYPES = new Set(["notification", "person-changed"]);

const TOPIC = /^(user|person):[A-Za-z0-9_-]{1,40}$/;
export const isTopic = (t: string) => TOPIC.test(t);
export const userTopic = (id: string) => `user:${id}`;
export const personTopic = (id: string) => `person:${id}`;

export function encode(topic: string, event: LiveEvent): string {
  if (!isTopic(topic)) throw new Error(`Not a topic: ${topic}`);
  const payload = JSON.stringify({ t: topic, e: event });
  if (Buffer.byteLength(payload) > MAX_PAYLOAD) throw new Error("Live event too large");
  return payload;
}

/** A message from the channel, or null if it isn't one of ours */
export function decode(payload: string | undefined): { topic: string; event: LiveEvent } | null {
  try {
    const { t, e } = JSON.parse(payload ?? "");
    if (typeof t !== "string" || !isTopic(t) || !e || !TYPES.has(e.type)) return null;
    return { topic: t, event: { type: e.type, ...(typeof e.by === "string" ? { by: e.by } : {}) } };
  } catch {
    return null;
  }
}

/** One Server-Sent Events message (the data is JSON on a single line) */
export const sseFrame = (event: string, data: object) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
/** A comment line: keeps proxies from closing a quiet connection */
export const ssePing = ": ping\n\n";

type Listener = (topic: string, event: LiveEvent) => void;

/** Who in this process wants which topics. */
export class Registry {
  private byTopic = new Map<string, Set<Listener>>();
  private count = 0;

  subscribe(topics: string[], fn: Listener): () => void {
    const mine = [...new Set(topics)];
    for (const t of mine) {
      if (!this.byTopic.has(t)) this.byTopic.set(t, new Set());
      this.byTopic.get(t)!.add(fn);
    }
    this.count++;
    let done = false;
    return () => {
      if (done) return;
      done = true;
      this.count--;
      for (const t of mine) {
        const set = this.byTopic.get(t);
        set?.delete(fn);
        if (set && !set.size) this.byTopic.delete(t);
      }
    };
  }

  dispatch(topic: string, event: LiveEvent) {
    for (const fn of this.byTopic.get(topic) ?? []) {
      try {
        fn(topic, event);
      } catch {
        // one broken stream must not stop the others
      }
    }
  }

  get size() {
    return this.count;
  }
}
