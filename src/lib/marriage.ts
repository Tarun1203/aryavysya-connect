import "server-only";
import { db } from "@/lib/db";
import { checkMatch } from "@/lib/family";
import { rulesFor, type Rules } from "@/lib/gotra";
import type { RuleLevel } from "@/generated/prisma/client";

/**
 * The marriage check run whenever two people are joined as spouses.
 *  - always blocked: one is the other's ancestor, they are siblings, or children of two brothers /
 *    two sisters (parallel cousins count as siblings by custom)
 *  - per region (MarriageRule): sagotra, a gotra matching the other's mother's gotra, and menarikam
 *    (cross cousins) are allowed, flagged for confirmation, or blocked
 *  - other blood relatives are always flagged
 * When the two sides live in states with different rules, the stricter rule applies.
 */
export type MarriageCheck = { blocked: string | null; flags: string[]; relative: string | null };

const rank: Record<RuleLevel, number> = { ALLOW: 0, WARN: 1, BLOCK: 2 };
const stricter = (a: Rules, b: Rules): Rules => {
  const pick = (k: "sagotra" | "maternalGotra" | "menarikam") => (rank[a[k]] >= rank[b[k]] ? a[k] : b[k]);
  return { sagotra: pick("sagotra"), maternalGotra: pick("maternalGotra"), menarikam: pick("menarikam"), keepGotraAfterMarriageEnds: a.keepGotraAfterMarriageEnds };
};

export async function marriageRules(aId: string, bId: string) {
  const people = await db.person.findMany({ where: { id: { in: [aId, bId] } }, select: { district: { select: { state: true } } } });
  const [ra, rb] = await Promise.all(people.map((p) => rulesFor(p.district?.state)));
  return rb ? stricter(ra, rb) : ra;
}

export async function marriageCheck(aId: string, bId: string): Promise<MarriageCheck> {
  const [m, rules] = await Promise.all([checkMatch(aId, bId), marriageRules(aId, bId)]);
  const flags: string[] = [];
  let blocked: string | null = null;
  const apply = (level: RuleLevel, key: string) => {
    if (level === "BLOCK") blocked ??= key;
    else if (level === "WARN") flags.push(key);
  };
  if (m.sameGotra) apply(rules.sagotra, "sagotra");
  if (m.maternalClash) apply(rules.maternalGotra, "maternalGotra");
  if (m.common) {
    const { genA, genB } = m.common;
    if (genA === 0 || genB === 0) blocked = "lineal";
    else if (genA === 1 && genB === 1) blocked = "siblings";
    else if (genA === 2 && genB === 2 && m.cousinType === "parallel") blocked = "parallelCousins";
    else if (m.cousinType === "cross") apply(rules.menarikam, "menarikam");
    else flags.push("bloodRelative");
  }
  return { blocked, flags, relative: m.common?.name ?? null };
}
