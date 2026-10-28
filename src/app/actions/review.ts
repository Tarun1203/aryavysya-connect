"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { audit, canView } from "@/lib/permissions";
import { str, type FormState } from "@/lib/forms";
import { applyEdit, canReview, isReviewer, removeLink } from "@/lib/review";

const done = (): FormState => {
  revalidatePath("/", "layout");
  return { ok: true };
};

/**
 * "This is wrong": a dispute about a person's details, one of their parent links or one of their
 * marriages. Any verified member who can see the record may raise one; an administrator decides.
 * `subject` is "person", "parentChild:<id>" or "couple:<id>".
 */
export async function disputeAction(personId: string, _: FormState, fd: FormData): Promise<FormState> {
  const t = await getTranslations("review");
  const user = await currentUser();
  if (!canView(user)) return { error: t("notAllowed") };
  const reason = str(fd, "reason");
  if (!reason) return { error: t("reasonRequired") };
  const [kind, linkId] = (str(fd, "subject") ?? "person").split(":");
  // The link must really belong to this person
  if (linkId) {
    const ok =
      kind === "couple"
        ? await db.couple.count({ where: { id: linkId, OR: [{ person1Id: personId }, { person2Id: personId }] } })
        : await db.parentChild.count({ where: { id: linkId, OR: [{ parentId: personId }, { childId: personId }] } });
    if (!ok) return { error: t("notAllowed") };
  }
  const open = await db.changeRequest.count({ where: { kind: "DISPUTE", status: "PENDING", personId, linkId: linkId ?? null, proposedById: user!.id } });
  if (open) return { error: t("alreadyDisputed") };
  const req = await db.changeRequest.create({
    data: {
      kind: "DISPUTE",
      personId,
      linkId: linkId ?? null,
      linkKind: linkId ? kind : null,
      reason,
      correction: str(fd, "correction"),
      evidence: str(fd, "evidence"),
      proposedById: user!.id,
    },
  });
  await audit(user, "dispute", "Person", personId, { changeRequest: req.id, linkId });
  return done();
}

/** Approve or reject a pending request. Approving applies an edit or unlink; upholding a dispute may remove the disputed link. */
export async function reviewAction(requestId: string, _: FormState, fd: FormData): Promise<FormState> {
  const t = await getTranslations("review");
  const user = await currentUser();
  const req = await db.changeRequest.findUnique({ where: { id: requestId } });
  if (!user || !req) return { error: t("notAllowed") };
  if (req.status !== "PENDING") return { error: t("alreadyDecided") };
  if (!(await canReview(user, req))) return { error: t("notAllowed") };
  const decision = str(fd, "decision");
  const note = str(fd, "note");
  if (decision !== "approve" && decision !== "reject") return { error: t("chooseDecision") };
  if (decision === "reject" && !note) return { error: t("noteRequired") };
  // The proposer can't approve their own request
  if (req.proposedById === user.id && decision === "approve") return { error: t("notOwn") };

  if (decision === "approve") {
    if (req.kind === "EDIT") await applyEdit(req, user);
    if (req.kind === "UNLINK" || (req.kind === "DISPUTE" && fd.get("removeLink") === "on")) await removeLink(req, user);
  }
  await db.changeRequest.update({
    where: { id: req.id },
    data: { status: decision === "approve" ? "APPROVED" : "REJECTED", reviewedById: user.id, reviewedAt: new Date(), reviewNote: note },
  });
  await audit(user, `review-${decision}`, "Person", req.personId, { changeRequest: req.id, kind: req.kind });
  return done();
}

/** Take back your own pending request. */
export async function withdrawRequestAction(requestId: string) {
  const user = await currentUser();
  const req = await db.changeRequest.findUnique({ where: { id: requestId } });
  if (!user || !req || req.proposedById !== user.id || req.status !== "PENDING") return;
  await db.changeRequest.update({ where: { id: requestId }, data: { status: "WITHDRAWN", reviewedAt: new Date() } });
  await audit(user, "withdraw-request", "Person", req.personId, { changeRequest: req.id });
  revalidatePath("/", "layout");
}

/** An administrator marks a person's details as checked (or takes that back). */
export async function verifyPersonAction(personId: string, verified: boolean) {
  const user = await currentUser();
  if (!user || !(await isReviewer(user, personId))) return;
  await db.person.update({ where: { id: personId }, data: verified ? { verifiedAt: new Date(), verifiedById: user.id } : { verifiedAt: null, verifiedById: null } });
  await audit(user, verified ? "verify" : "unverify", "Person", personId);
  revalidatePath("/", "layout");
}

/** An administrator marks a parent–child link as checked (or takes that back). */
export async function verifyLinkAction(linkId: string, verified: boolean) {
  const user = await currentUser();
  const link = await db.parentChild.findUnique({ where: { id: linkId } });
  if (!user || !link || !(await isReviewer(user, link.parentId)) || !(await isReviewer(user, link.childId))) return;
  await db.parentChild.update({ where: { id: linkId }, data: verified ? { verifiedAt: new Date(), verifiedById: user.id } : { verifiedAt: null, verifiedById: null } });
  await audit(user, verified ? "verify-link" : "unverify-link", "Person", link.childId, { parentId: link.parentId });
  revalidatePath("/", "layout");
}
