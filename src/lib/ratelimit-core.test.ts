import { test } from "node:test";
import assert from "node:assert/strict";
import { blockSeconds, decide, worst, type Rule } from "./ratelimit-core";

const now = new Date("2026-10-29T10:00:00Z");
const at = (sec: number) => new Date(now.getTime() + sec * 1000);
const plain: Rule = { name: "t", limit: 3, windowSec: 60 };
const backed: Rule = { name: "t", limit: 3, windowSec: 60, backoff: { baseSec: 900, maxSec: 86400, decaySec: 86400 } };

test("allows up to the limit in a window", () => {
  for (const points of [1, 2, 3]) assert.deepEqual(decide(plain, { points, windowEndsAt: at(30), strikes: 0, blockedUntil: null }, now), { ok: true });
});

test("without backoff, over the limit waits for the window to end", () => {
  assert.deepEqual(decide(plain, { points: 4, windowEndsAt: at(30), strikes: 0, blockedUntil: null }, now), { ok: false, retryAfterSec: 30 });
});

test("with backoff, the first violation blocks for the base time", () => {
  const d = decide(backed, { points: 4, windowEndsAt: at(30), strikes: 0, blockedUntil: null }, now);
  assert.equal(d.ok, false);
  assert.ok(!d.ok && d.block);
  assert.equal(!d.ok && d.retryAfterSec, 900);
  assert.equal(!d.ok && d.block?.strikes, 1);
});

test("a violation soon after a block doubles it", () => {
  // The previous block ended an hour ago (within the 24 h decay) with 2 strikes
  const d = decide(backed, { points: 4, windowEndsAt: at(30), strikes: 2, blockedUntil: at(-3600) }, now);
  assert.equal(!d.ok && d.block?.strikes, 3);
  assert.equal(!d.ok && d.retryAfterSec, 3600); // 900 × 2²
});

test("strikes are forgotten after a quiet decay period", () => {
  const d = decide(backed, { points: 4, windowEndsAt: at(30), strikes: 5, blockedUntil: at(-2 * 86400) }, now);
  assert.equal(!d.ok && d.block?.strikes, 1);
  assert.equal(!d.ok && d.retryAfterSec, 900);
});

test("while blocked, every request is refused until the block ends, even under the limit", () => {
  assert.deepEqual(decide(backed, { points: 1, windowEndsAt: at(30), strikes: 1, blockedUntil: at(120) }, now), { ok: false, retryAfterSec: 120 });
});

test("blocks double up to the maximum", () => {
  const b = backed.backoff!;
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8].map((s) => blockSeconds(s, b)), [900, 1800, 3600, 7200, 14400, 28800, 57600, 86400]);
  assert.equal(blockSeconds(50, b), 86400);
});

test("the worst of several decisions applies", () => {
  assert.deepEqual(worst([{ ok: true }, { ok: true }]), { ok: true });
  assert.deepEqual(worst([{ ok: true }, { ok: false, retryAfterSec: 10 }, { ok: false, retryAfterSec: 90 }]), { ok: false, retryAfterSec: 90 });
});
