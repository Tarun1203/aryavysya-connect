import { test } from "node:test";
import assert from "node:assert/strict";
import { Registry, decode, encode, isTopic, personTopic, sseFrame, userTopic, type LiveEvent } from "./realtime-core";

test("topics", () => {
  assert.ok(isTopic(userTopic("cmabc123")));
  assert.ok(isTopic(personTopic("cmvnytfys004pxk28pq3bslpw")));
  for (const bad of ["user:", "admin:x", "user:a b", "user:x'; DROP", "person:" + "x".repeat(41)]) assert.ok(!isTopic(bad), bad);
  assert.throws(() => encode("nope", { type: "notification" }));
});

test("messages on the channel round-trip, and anything else is ignored", () => {
  const p = encode("user:u1", { type: "notification" });
  assert.deepEqual(decode(p), { topic: "user:u1", event: { type: "notification" } });
  assert.deepEqual(decode(encode("person:p1", { type: "person-changed", by: "u2" })), { topic: "person:p1", event: { type: "person-changed", by: "u2" } });
  for (const junk of [undefined, "", "not json", '{"t":"user:u1","e":{"type":"drop-tables"}}', '{"t":"bad topic","e":{"type":"notification"}}']) assert.equal(decode(junk), null, String(junk));
});

test("SSE frames are single-line JSON", () => {
  assert.equal(sseFrame("notification", { topic: "user:u1" }), 'event: notification\ndata: {"topic":"user:u1"}\n\n');
  assert.ok(!sseFrame("x", { a: "line1\nline2" }).slice(0, -2).includes("\n\n"), "a newline in data stays escaped");
});

test("the registry delivers to the right listeners and cleans up", () => {
  const r = new Registry();
  const got: string[] = [];
  const offA = r.subscribe(["user:a", "person:p"], (t, e: LiveEvent) => got.push(`A ${t} ${e.type}`));
  const offB = r.subscribe(["user:b", "person:p"], (t) => got.push(`B ${t}`));
  r.subscribe(["user:c"], () => {
    throw new Error("broken stream");
  });
  r.dispatch("person:p", { type: "person-changed" });
  r.dispatch("user:a", { type: "notification" });
  r.dispatch("user:c", { type: "notification" });
  r.dispatch("user:z", { type: "notification" });
  assert.deepEqual(got, ["A person:p person-changed", "B person:p", "A user:a notification"]);
  assert.equal(r.size, 3);
  offA();
  offA();
  assert.equal(r.size, 2, "unsubscribing twice counts once");
  offB();
  r.dispatch("person:p", { type: "person-changed" });
  assert.equal(got.length, 3);
});
