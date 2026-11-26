# Live updates

Pages update without a reload when something changes:

- **The bell.** A new notification updates the count on every open page, and shows a short
  "You have a new notification" message. Reading notifications on one device updates the others.
- **A person's page.** If someone else changes the record you have open (an edit, an approved
  proposal, a new relative, a link added or removed, a marriage answered), a banner offers to show
  the changes. It doesn't reload by itself, so nothing you are typing is lost.

## How it works

No extra server: Postgres itself carries the messages.

```
an action (edit, notify…) ──pg_notify('vamsha_events', …)──▶ Postgres
                                                               │ LISTEN (one connection per server instance)
                                                               ▼
                                     src/lib/realtime.ts hub ──▶ /api/events (Server-Sent Events) ──▶ browsers
```

- `publish()` in `src/lib/realtime.ts` sends `pg_notify` through the normal (pooled) connection. It is
  delivered when the change commits. A failed publish never fails the action.
- Each server instance holds **one** listening connection, whatever the number of viewers, and hands
  messages to the open streams it serves (`/api/events`). With several instances, each listens for itself.
- A message says only *what* happened and *where*: `notification` for a member, `person-changed` for a
  record. No names or details. The browser fetches the page again, with the usual permission checks.
- A member's stream carries their own notifications. A person's page adds that record, only if the
  member may see it (private records are refused).
- Streams send a keep-alive every 25 seconds and close after 15 minutes. The browser reconnects at once,
  which re-checks the session, so a signed-out or suspended member stops receiving updates.
- Limits per server instance: 500 open streams, 5 per member.

## Neon and Render

- **Listening needs the direct connection.** Neon's pooler (PgBouncer, transaction mode) can't `LISTEN`,
  so the hub uses `DATABASE_URL_UNPOOLED`. It is already set on Render for migrations.
- **Compute stays awake while someone is watching.** An open connection stops Neon from scaling to zero.
  So the hub connects only while at least one page is open on that instance, and disconnects 30 seconds
  after the last one closes. When nobody is on the site, the database can still sleep.
- **Waking up.** If the database is asleep or restarting, the hub retries with growing waits (up to a
  minute) while anyone is waiting. Pages carry on normally meanwhile; only the live part waits.
- **Render** passes Server-Sent Events through. The route sets `X-Accel-Buffering: no` and
  `Cache-Control: no-transform` so no proxy buffers it. On the free plan the service sleeps when idle,
  which closes all streams; browsers reconnect when it wakes.

## When to move to a dedicated server (Centrifugo)

This design suits the community's size: hundreds of people online at once, a handful of events a
minute. Consider [Centrifugo](https://centrifugal.dev) (self-hosted, open source) when:

- many more people are online at once than one instance's 500 streams, across several instances;
- you want presence ("who else is looking at this tree"), message history after a reconnect, or
  messages between members;
- keeping one database connection per instance becomes a cost or connection-limit problem.

The move keeps the same shape, because only `src/lib/realtime.ts` and `/api/events` change:

1. Run Centrifugo next to the app, in India, on our own hosting, so member data still stays with us.
2. `publish()` calls Centrifugo's server API instead of `pg_notify`, with the same topic names
   (`user:<id>`, `person:<id>`).
3. The page asks the app for a short-lived Centrifugo token. The app keeps deciding who may subscribe
   to which topic, with the same checks as `/api/events` today. The browser then connects to
   Centrifugo with its small client.
4. `useLive` in `src/components/Live.tsx` keeps its API, so the bell and the record banner don't change.
