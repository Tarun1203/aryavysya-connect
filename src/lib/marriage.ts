import "server-only";
import { checkMatch } from "@/lib/family";

/**
 * The marriage check run whenever two people are joined as spouses.
 *  - blocked: one is the other's ancestor, they are siblings, or children of two brothers / two sisters
 *    (parallel cousins count as siblings by custom)
 *  - flagged (the member must confirm): sagotra, menarikam (cross cousins) and other blood relatives –
 *    customs differ between families, so these are shown, not forbidden
 */
export type MarriageCheck = { blocked: string | null; flags: string[]; relative: string | null };

export async function marriageCheck(aId: string, bId: string): Promise<MarriageCheck> {
  const m = await checkMatch(aId, bId);
  const flags: string[] = [];
  if (m.sameGotra) flags.push("sagotra");
  let blocked: string | null = null;
  if (m.common) {
    const { genA, genB } = m.common;
    if (genA === 0 || genB === 0) blocked = "lineal";
    else if (genA === 1 && genB === 1) blocked = "siblings";
    else if (genA === 2 && genB === 2 && m.cousinType === "parallel") blocked = "parallelCousins";
    else flags.push(m.cousinType === "cross" ? "menarikam" : "bloodRelative");
  }
  return { blocked, flags, relative: m.common?.name ?? null };
}
