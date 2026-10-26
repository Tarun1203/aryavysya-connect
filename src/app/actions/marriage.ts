"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { audit, canEditPerson } from "@/lib/permissions";
import { partialDate, str } from "@/lib/forms";
import { marriageCheck } from "@/lib/marriage";
import { syncAround } from "@/lib/gotra";
import type { MarriageStatus } from "@/generated/prisma/client";

/**
 * The other family's answer to a proposed marriage. Anyone who may edit the proposed spouse –
 * the person, their family within scope, or the in-charge of their district – can accept or decline.
 */
export async function respondMarriageAction(coupleId: string, accept: boolean) {
  const user = await currentUser();
  const c = await db.couple.findUnique({ where: { id: coupleId } });
  if (!c || c.status !== "PROPOSED" || !(await canEditPerson(user, c.person2Id))) return;
  // Blood relations recorded after the proposal still block it
  if (accept && (await marriageCheck(c.person1Id, c.person2Id)).blocked) return;
  if (accept) {
    await db.couple.update({ where: { id: coupleId }, data: { status: "CONFIRMED", confirmedById: user!.id, confirmedAt: new Date() } });
  } else {
    // A declined proposal never joined anything, so it is removed; the audit log keeps the record
    await db.couple.delete({ where: { id: coupleId } });
  }
  // On confirmation the wife takes her husband's gotra; her birth gotra stays
  if (accept) await Promise.all([syncAround(c.person1Id), syncAround(c.person2Id)]);
  await audit(user, accept ? "accept-marriage" : "decline-marriage", "Person", c.person2Id, { other: c.person1Id, coupleId, proposedById: c.proposedById });
  revalidatePath("/", "layout");
}

const STATUSES: MarriageStatus[] = ["CONFIRMED", "WIDOWED", "DIVORCED"];

/** Record the marriage date, or that the marriage ended (widowhood / divorce). History is kept, never rewritten into a new spouse. */
export async function updateMarriageAction(coupleId: string, fd: FormData) {
  const user = await currentUser();
  const c = await db.couple.findUnique({ where: { id: coupleId } });
  if (!c || c.status === "PROPOSED") return;
  const sides = await Promise.all([c.person1Id, c.person2Id].map((id) => canEditPerson(user, id)));
  if (!sides.some(Boolean)) return;
  const status = str(fd, "status") as MarriageStatus | null;
  const dates = { marriageDate: partialDate.safeParse(str(fd, "marriageDate")), endDate: partialDate.safeParse(str(fd, "endDate")) };
  if (!status || !STATUSES.includes(status) || !dates.marriageDate.success || !dates.endDate.success) return;
  const data = { status, marriageDate: dates.marriageDate.data, endDate: status === "CONFIRMED" ? null : dates.endDate.data };
  await db.couple.update({ where: { id: coupleId }, data });
  // Widowhood / divorce: whether her gotra stays her husband's is a per-region rule
  await Promise.all([syncAround(c.person1Id), syncAround(c.person2Id)]);
  await audit(user, "update-marriage", "Person", sides[0] ? c.person1Id : c.person2Id, { coupleId, ...data });
  revalidatePath("/", "layout");
}
