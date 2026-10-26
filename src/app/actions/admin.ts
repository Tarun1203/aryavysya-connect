"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { currentUser, type SessionUser } from "@/lib/auth";
import { adminScope, audit, claimRights, districtWhere } from "@/lib/permissions";
import { str, type FormState } from "@/lib/forms";
import { validLocality, validTaluk } from "@/lib/locations/resolve";
import type { OrgLevel, Role } from "@/generated/prisma/client";

async function admin() {
  const u = await currentUser();
  const scope = await adminScope(u);
  if (!u || !scope) throw new Error("forbidden");
  return { u: u as SessionUser, scope };
}

const done = (path = "/admin") => {
  revalidatePath(`/[locale]${path}`, "page");
  return { ok: true } as const;
};

/* ---------- Membership requests ---------- */

export async function endorseClaimAction(claimId: string) {
  const { u } = await admin();
  const claim = await db.familyClaim.findUniqueOrThrow({ where: { id: claimId } });
  if (!(await claimRights(u, claim)).endorse || claim.status !== "PENDING") return;
  await db.familyClaim.update({ where: { id: claimId }, data: { endorsedById: u.id, endorsedAt: new Date() } });
  await audit(u, "endorse", "FamilyClaim", claimId);
  done();
}

export async function approveClaimAction(claimId: string, _: FormState, fd: FormData): Promise<FormState> {
  const t = await getTranslations("admin");
  const { u } = await admin();
  const claim = await db.familyClaim.findUniqueOrThrow({ where: { id: claimId } });
  if (!(await claimRights(u, claim)).approve) return { error: t("forbidden") };
  if (claim.status !== "PENDING") return { error: t("alreadyReviewed") };

  const mode = str(fd, "mode");
  const pickedId = str(fd, "personId") ?? claim.personId;
  const parentId = str(fd, "parentId");

  let personId: string;
  if (mode === "link") {
    if (!pickedId) return { error: t("pickPerson") };
    const taken = await db.user.findFirst({ where: { personId: pickedId, id: { not: claim.userId } } });
    if (taken) return { error: t("personTaken") };
    personId = pickedId;
  } else {
    const person = await db.person.create({
      data: {
        givenName: claim.givenName,
        surname: claim.surname,
        gender: claim.gender,
        gotraId: claim.gotraId,
        birthDate: claim.birthYear ? String(claim.birthYear) : null,
        nativePlace: claim.nativePlace,
        nativeLocalityId: claim.nativeLocalityId,
        districtId: claim.districtId,
        createdById: u.id,
        updatedById: u.id,
      },
    });
    if (parentId) await db.parentChild.create({ data: { parentId, childId: person.id } });
    personId = person.id;
  }

  await db.$transaction([
    db.familyClaim.update({
      where: { id: claimId },
      data: { status: "APPROVED", personId, reviewedById: u.id, reviewedAt: new Date(), reviewNote: str(fd, "note") },
    }),
    db.user.update({
      where: { id: claim.userId },
      data: {
        status: "APPROVED",
        personId,
        districtId: claim.districtId,
        organizationId: claim.organizationId,
        approvedById: u.id,
        approvedAt: new Date(),
      },
    }),
  ]);
  await audit(u, "approve", "FamilyClaim", claimId, { personId, mode });
  return done();
}

export async function rejectClaimAction(claimId: string, fd: FormData) {
  const { u } = await admin();
  const claim = await db.familyClaim.findUniqueOrThrow({ where: { id: claimId } });
  if (!(await claimRights(u, claim)).approve || claim.status !== "PENDING") return;
  await db.$transaction([
    db.familyClaim.update({
      where: { id: claimId },
      data: { status: "REJECTED", reviewedById: u.id, reviewedAt: new Date(), reviewNote: str(fd, "note") },
    }),
    db.user.update({ where: { id: claim.userId }, data: { status: "REJECTED" } }),
  ]);
  await audit(u, "reject", "FamilyClaim", claimId);
  done();
}

/* ---------- Appointing secondary admins ---------- */

async function userByEmail(fd: FormData) {
  const email = str(fd, "email")?.toLowerCase();
  return email ? db.user.findUnique({ where: { email } }) : null;
}

/** Strip any admin role a user currently holds (keeps their membership). */
async function demote(userId: string) {
  await db.district.updateMany({ where: { inchargeId: userId }, data: { inchargeId: null } });
  await db.user.update({ where: { id: userId }, data: { role: "MEMBER", adminOrgId: null } });
}

export async function assignInchargeAction(districtId: string, _: FormState, fd: FormData): Promise<FormState> {
  const t = await getTranslations("admin");
  const { u, scope } = await admin();
  const district = await db.district.findUniqueOrThrow({ where: { id: districtId } });
  const allowed = scope.kind === "all" || (scope.kind === "state" && scope.state === district.state);
  if (!allowed) return { error: t("forbidden") };
  const target = await userByEmail(fd);
  if (!target || target.status !== "APPROVED") return { error: t("userNotFound") };
  if (target.role === "SUPER_ADMIN") return { error: t("forbidden") };

  if (district.inchargeId && district.inchargeId !== target.id) await demote(district.inchargeId);
  await demote(target.id);
  await db.district.update({ where: { id: districtId }, data: { inchargeId: target.id } });
  await db.user.update({ where: { id: target.id }, data: { role: "DISTRICT_INCHARGE", districtId } });
  await audit(u, "assign-incharge", "District", districtId, { userId: target.id });
  return done("/admin/incharges");
}

export async function assignOrgAdminAction(orgId: string, _: FormState, fd: FormData): Promise<FormState> {
  const t = await getTranslations("admin");
  const { u, scope } = await admin();
  const org = await db.organization.findUniqueOrThrow({ where: { id: orgId } });
  const role: Role | null = org.level === "LOCAL" ? "LOCAL_ADMIN" : org.level === "STATE" || org.level === "NATIONAL" ? "STATE_ADMIN" : null;
  if (!role) return { error: t("forbidden") };
  const allowed =
    scope.kind === "all" ||
    (role === "LOCAL_ADMIN" &&
      ((scope.kind === "state" && scope.state === org.state) || (scope.kind === "district" && scope.districtId === org.districtId)));
  if (!allowed) return { error: t("forbidden") };
  if (role === "STATE_ADMIN" && !org.state) return { error: t("stateRequired") };

  const target = await userByEmail(fd);
  if (!target || target.status !== "APPROVED") return { error: t("userNotFound") };
  if (target.role === "SUPER_ADMIN") return { error: t("forbidden") };
  await demote(target.id);
  await db.user.update({ where: { id: target.id }, data: { role, adminOrgId: org.id } });
  await audit(u, "assign-admin", "Organization", orgId, { userId: target.id, role });
  return done("/admin/organizations");
}

export async function revokeAdminAction(userId: string) {
  const { u, scope } = await admin();
  const target = await db.user.findUniqueOrThrow({ where: { id: userId }, include: { adminOrg: true, inchargeOf: true } });
  if (target.role === "SUPER_ADMIN" || target.role === "MEMBER") return;
  const state = target.adminOrg?.state ?? target.inchargeOf?.state;
  const allowed =
    scope.kind === "all" ||
    (scope.kind === "state" && target.role !== "STATE_ADMIN" && state === scope.state) ||
    (scope.kind === "district" && target.role === "LOCAL_ADMIN" && target.adminOrg?.districtId === scope.districtId);
  if (!allowed) return;
  await demote(userId);
  await audit(u, "revoke-admin", "User", userId);
  done("/admin/organizations");
}

export async function setUserStatusAction(userId: string, status: "APPROVED" | "SUSPENDED") {
  const { u, scope } = await admin();
  const target = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (target.role === "SUPER_ADMIN" || target.id === u.id) return;
  const where = districtWhere(scope);
  if (!where || scope.kind === "local") return;
  if (scope.kind !== "all") {
    const inScope = target.districtId && (await db.district.findFirst({ where: { id: target.districtId, ...where } }));
    if (!inScope) return;
  }
  await db.user.update({ where: { id: userId }, data: { status } });
  await audit(u, status === "SUSPENDED" ? "suspend" : "reactivate", "User", userId);
  done("/admin/users");
}

/* ---------- Community bodies ---------- */

export async function createOrganizationAction(_: FormState, fd: FormData): Promise<FormState> {
  const t = await getTranslations();
  const { u, scope } = await admin();
  const level = str(fd, "level") as OrgLevel | null;
  const name = str(fd, "name");
  const kind = str(fd, "kind");
  if (!level || !name || !kind) return { error: t("errors.required") };

  let state = str(fd, "state") ?? str(fd, "placeState");
  // State and national bodies are not tied to one district
  let districtId = level === "STATE" || level === "NATIONAL" ? null : (str(fd, "placeDistrictId") ?? str(fd, "districtId"));
  if (districtId) {
    const d = await db.district.findUniqueOrThrow({ where: { id: districtId } });
    state = d.state;
  }
  if ((level === "LOCAL" || level === "DISTRICT") && !districtId) return { error: t("admin.districtRequired") };
  if (level === "STATE" && !state) return { error: t("admin.stateRequired") };

  const allowed =
    scope.kind === "all" ||
    (scope.kind === "state" && (level === "DISTRICT" || level === "LOCAL") && state === scope.state) ||
    (scope.kind === "district" && level === "LOCAL" && districtId === scope.districtId);
  if (!allowed) return { error: t("admin.forbidden") };
  if (level === "NATIONAL") {
    state = null;
    districtId = null;
  }

  // Attach to the nearest parent body automatically
  const parent =
    level === "STATE"
      ? await db.organization.findFirst({ where: { level: "NATIONAL" } })
      : level === "NATIONAL"
        ? null
        : ((await db.organization.findFirst({ where: { level: "DISTRICT", districtId } })) ??
          (await db.organization.findFirst({ where: { level: "STATE", state } })));

  const talukId = await validTaluk(str(fd, "placeTalukId"), districtId);
  const localityId = await validLocality(str(fd, "placeLocalityId"), districtId);
  const locality = localityId ? await db.locality.findUnique({ where: { id: localityId } }) : null;

  const org = await db.organization.create({
    data: {
      name,
      kind,
      level,
      state,
      districtId,
      talukId: districtId ? talukId : null,
      localityId: districtId ? localityId : null,
      nameLocal: str(fd, "nameLocal"),
      town: str(fd, "town") ?? locality?.name ?? null,
      phone: str(fd, "phone"),
      address: str(fd, "address"),
      parentId: level === "DISTRICT" && parent?.level === "DISTRICT" ? null : parent?.id ?? null,
    },
  });
  await audit(u, "create", "Organization", org.id, { level, name });
  return done("/admin/organizations");
}

/* ---------- Platform settings (super admin only) ---------- */

/** Kula names arrive comma- or dash-separated, as in the community lists. */
const splitKulas = (text: string) => [...new Set(text.split(/[,\n]|-/).map((k) => k.trim().replace(/\s+/g, " ")).filter(Boolean))];

export async function addGotrasAction(_: FormState, fd: FormData): Promise<FormState> {
  const t = await getTranslations("admin");
  const { u, scope } = await admin();
  if (scope.kind !== "all") return { error: t("forbidden") };
  // One gotra per line, optionally followed by its kula names: "Agasthyasa: Anubha Gula, Anubala"
  const rows = (str(fd, "gotras") ?? "").split(/\r?\n/).map((line) => {
    const [name, kulas = ""] = line.split(":");
    return { name: name.trim(), kulas: splitKulas(kulas) };
  });
  const added = rows.filter((r) => r.name);
  for (const { name, kulas } of added) {
    await db.gotra.upsert({ where: { name }, update: kulas.length ? { kulas } : {}, create: { name, kulas } });
  }
  await audit(u, "add-gotras", "Gotra", "-", { names: added.map((r) => r.name) });
  return done("/admin/gotras");
}

export async function updateGotraAction(gotraId: string, fd: FormData) {
  const { u, scope } = await admin();
  if (scope.kind !== "all") return;
  await db.gotra.update({
    where: { id: gotraId },
    data: { nameTe: str(fd, "nameTe"), nameKn: str(fd, "nameKn"), nameTa: str(fd, "nameTa"), kulas: splitKulas(str(fd, "kulas") ?? "") },
  });
  await audit(u, "update", "Gotra", gotraId);
  done("/admin/gotras");
}

export async function addDistrictAction(_: FormState, fd: FormData): Promise<FormState> {
  const t = await getTranslations();
  const { u, scope } = await admin();
  if (scope.kind !== "all") return { error: t("admin.forbidden") };
  const name = str(fd, "name");
  const state = str(fd, "state");
  if (!name || !state) return { error: t("errors.required") };
  const d = await db.district.upsert({ where: { state_name: { state, name } }, update: {}, create: { state, name } });
  await audit(u, "create", "District", d.id);
  return done("/admin/districts");
}
