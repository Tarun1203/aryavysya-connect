/**
 * The pure part of rate limiting (no database), so it can be unit-tested: what a rule allows, and
 * how long a key is blocked after it goes over. src/lib/ratelimit.ts stores the counters.
 */

export type Rule = {
  /** Stable name, part of the key: changing it starts the counts afresh */
  name: string;
  /** Requests allowed per window */
  limit: number;
  windowSec: number;
  /**
   * Progressive blocking once the limit is exceeded: the first block lasts baseSec, each further
   * one within decaySec of the last doubles it, up to maxSec. Without it, a key just waits for
   * its window to end.
   */
  backoff?: { baseSec: number; maxSec: number; decaySec: number };
};

/** A key's stored state, as read back after counting this request. */
export type State = { points: number; windowEndsAt: Date; strikes: number; blockedUntil: Date | null };

export type Decision =
  | { ok: true }
  | { ok: false; retryAfterSec: number; /** set when this request started (or extended) a block */ block?: { strikes: number; until: Date } };

/** How long the nth block lasts: base, 2×base, 4×base… capped at max. */
export function blockSeconds(strikes: number, backoff: NonNullable<Rule["backoff"]>) {
  return Math.min(backoff.baseSec * 2 ** Math.max(0, strikes - 1), backoff.maxSec);
}

const secondsUntil = (d: Date, now: Date) => Math.max(1, Math.ceil((d.getTime() - now.getTime()) / 1000));

/** Decide on a request, given the state after it was counted. */
export function decide(rule: Rule, s: State, now: Date): Decision {
  // Still blocked from an earlier violation
  if (s.blockedUntil && s.blockedUntil > now) return { ok: false, retryAfterSec: secondsUntil(s.blockedUntil, now) };
  if (s.points <= rule.limit) return { ok: true };
  if (!rule.backoff) return { ok: false, retryAfterSec: secondsUntil(s.windowEndsAt, now) };
  // Over the limit: a new block, longer if the last one was recent
  const recent = s.blockedUntil && now.getTime() - s.blockedUntil.getTime() < rule.backoff.decaySec * 1000;
  const strikes = recent ? s.strikes + 1 : 1;
  const until = new Date(now.getTime() + blockSeconds(strikes, rule.backoff) * 1000);
  return { ok: false, retryAfterSec: secondsUntil(until, now), block: { strikes, until } };
}

/** Of several decisions (phone, IP, overall…), the one that applies: any refusal, the longest wait. */
export function worst(decisions: Decision[]): Decision {
  const refused = decisions.filter((d): d is Extract<Decision, { ok: false }> => !d.ok);
  if (!refused.length) return { ok: true };
  return refused.reduce((a, b) => (b.retryAfterSec > a.retryAfterSec ? b : a));
}
