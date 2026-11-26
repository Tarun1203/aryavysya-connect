import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { canView } from "@/lib/permissions";
import { isPrivateFor } from "@/lib/consent";
import { hub } from "@/lib/realtime";
import { personTopic, sseFrame, ssePing, userTopic } from "@/lib/realtime-core";

export const dynamic = "force-dynamic";

/** Streams are closed after this long, so the browser reconnects and is checked again (sign-out, suspension) */
const MAX_AGE_MS = 15 * 60_000;

/**
 * Live updates for the signed-in member as Server-Sent Events: their own notifications, and – with
 * ?person=<id> – changes to a record they are looking at (if they may see it).
 */
export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return new NextResponse("Sign in first", { status: 401 });
  const topics = [userTopic(user.id)];
  const person = req.nextUrl.searchParams.get("person");
  if (person && /^[A-Za-z0-9_-]{1,40}$/.test(person) && canView(user) && !(await isPrivateFor(user, person))) topics.push(personTopic(person));
  if (!hub.canOpen(user.id)) return new NextResponse("Too many live connections", { status: 429 });

  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (s: string) => {
        try {
          controller.enqueue(encoder.encode(s));
        } catch {
          cleanup();
        }
      };
      // Reconnect after 10 seconds if the line drops
      send("retry: 10000\n\n");
      send(sseFrame("ready", { topics: topics.length }));
      const off = hub.subscribe(user.id, topics, (topic, event) => send(sseFrame(event.type, { topic, ...event })));
      const ping = setInterval(() => send(ssePing), 25_000);
      const expire = setTimeout(() => cleanup(), MAX_AGE_MS);
      let closed = false;
      cleanup = () => {
        if (closed) return;
        closed = true;
        off();
        clearInterval(ping);
        clearTimeout(expire);
        try {
          controller.close();
        } catch {
          // already closed by the browser
        }
      };
      req.signal.addEventListener("abort", () => cleanup());
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Proxies (nginx, Render) must not buffer the stream
      "X-Accel-Buffering": "no",
    },
  });
}
