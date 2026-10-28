import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { audit } from "@/lib/permissions";
import { descendants, lineageRoot, type DescendantNode } from "@/lib/tree";
import { maskTree } from "@/lib/consent";
import { syncGotras } from "@/lib/gotra";
import { findDuplicates } from "@/lib/dedup";
import { fullName } from "@/lib/reference";
import { GedcomError, familiesFrom, generations, planImport, readGedcom, writeGedcom, type GedPerson } from "@/lib/gedcom";

/* ---------------------------------------------------------------- export */

/**
 * The lineage shown on a person's tree page, as GEDCOM: the same people the viewer sees there, with
 * the same "Private" placeholders. Living people leave with their names, sex and birth year only;
 * full dates, places and occupation go with those who have passed. Phone numbers, notes, photos and
 * member codes never do.
 */
export async function exportLineage(user: SessionUser, personId: string, privateLabel: string) {
  const { rootId, path } = await lineageRoot(personId, 8);
  const found = await descendants(rootId, Math.min(10, path.length + 2));
  if (!found) return null;
  const root = await maskTree(found, user, privateLabel);

  const nodes = new Map<string, { private: boolean }>();
  const childLinks: { parent: string; child: string }[] = [];
  const walk = (n: DescendantNode) => {
    nodes.set(n.id, { private: !!n.private });
    n.spouses.forEach((s) => nodes.set(s.id, { private: !!s.private }));
    for (const c of n.children) {
      childLinks.push({ parent: n.id, child: c.id });
      walk(c);
    }
  };
  walk(root);
  const ids = [...nodes.keys()];

  const [rows, couples, links] = await Promise.all([
    db.person.findMany({
      where: { id: { in: ids } },
      select: {
        id: true, givenName: true, surname: true, givenNameLocal: true, surnameLocal: true, gender: true, isLiving: true,
        birthDate: true, birthPlace: true, deathDate: true, occupation: true, nakshatra: true, rasi: true, kuladevata: true,
        gotra: { select: { name: true } }, birthGotra: { select: { name: true } }, maternalGotra: { select: { name: true } },
      },
    }),
    db.couple.findMany({ where: { status: { not: "PROPOSED" }, person1Id: { in: ids }, person2Id: { in: ids } } }),
    // Both parents of each child in the lineage (the walk gives only the line it followed)
    db.parentChild.findMany({ where: { parentId: { in: ids }, childId: { in: ids } }, select: { parentId: true, childId: true } }),
  ]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ref = new Map(ids.map((id, i) => [id, `@I${i + 1}@`]));

  const people: GedPerson[] = ids.map((id) => {
    const p = byId.get(id)!;
    if (nodes.get(id)!.private) return { ref: ref.get(id)!, givenName: privateLabel, surname: "", gender: "OTHER", isLiving: true, private: true };
    const passed = !p.isLiving;
    return {
      ref: ref.get(id)!,
      givenName: p.givenName,
      surname: p.surname,
      givenNameLocal: p.givenNameLocal,
      surnameLocal: p.surnameLocal,
      gender: p.gender,
      isLiving: p.isLiving,
      birthDate: passed ? p.birthDate : p.birthDate?.slice(0, 4) ?? null,
      birthPlace: passed ? p.birthPlace : null,
      deathDate: p.deathDate,
      occupation: passed ? p.occupation : null,
      // Gotras and the family deity are community identity, shown to every member; the birth star
      // and sign are personal, so they leave only for those who have passed
      gotra: p.gotra?.name ?? null,
      birthGotra: p.birthGotra?.name ?? null,
      maternalGotra: p.maternalGotra?.name ?? null,
      kuladevata: p.kuladevata,
      nakshatra: passed ? p.nakshatra : null,
      rasi: passed ? p.rasi : null,
    };
  });
  const parentLinks = [...links.map((l) => ({ parent: l.parentId, child: l.childId })), ...childLinks]
    .filter((l, i, all) => all.findIndex((x) => x.parent === l.parent && x.child === l.child) === i)
    .map((l) => ({ parent: ref.get(l.parent)!, child: ref.get(l.child)! }));
  const families = familiesFrom(
    people,
    couples.map((c) => ({ a: ref.get(c.person1Id)!, b: ref.get(c.person2Id)!, marriageDate: c.marriageDate, endDate: c.endDate, divorced: c.status === "DIVORCED" })),
    parentLinks,
  );

  const focus = byId.get(personId);
  const text = writeGedcom({ people, families }, { source: "VAMSHA_VRUKSHAM", version: "1.0", note: "Exported from Arya Vysya Vamsha Vruksham. Living people: names and birth year only." });
  await audit(user, "gedcom-export", "Person", personId, { people: people.length, families: families.length });
  return { text, fileName: `${(focus ? fullName(focus) : "family").replace(/[^\p{L}\p{N}]+/gu, "-")}-family.ged` };
}

/* ---------------------------------------------------------------- import */

export const MAX_GEDCOM_BYTES = 900 * 1024;

export type ImportPreview = {
  people: number;
  living: number;
  families: number;
  parentLinks: number;
  couples: number;
  gotrasMatched: number;
  gotrasUnknown: string[];
  skipped: Record<string, number>;
  warnings: string[];
  /** People in the file who may already be in the tree (checked for the first 200) */
  possibleDuplicates: { name: string; matches: string[] }[];
  sample: { name: string; years: string }[];
};

async function gotraIndex() {
  const gotras = await db.gotra.findMany({ select: { id: true, name: true, nameTe: true, nameKn: true, nameTa: true } });
  const index = new Map<string, string>();
  for (const g of gotras) for (const n of [g.name, g.nameTe, g.nameKn, g.nameTa]) if (n) index.set(n.trim().toLowerCase(), g.id);
  return index;
}

function prepare(text: string) {
  const read = readGedcom(text);
  const plan = planImport(read);
  return { read, plan: { ...plan, warnings: [...read.warnings, ...plan.warnings] } };
}

/** Read and check a file without saving anything. Throws with a readable message on a bad file. */
export async function previewImport(text: string, districtId: string | null): Promise<ImportPreview> {
  const { read, plan } = prepare(text);
  if (!plan.people.length) throw new GedcomError("The file has no people in it");
  const gotras = await gotraIndex();
  const unknown = new Set<string>();
  let matched = 0;
  for (const p of plan.people) {
    for (const g of [p.gotra, p.birthGotra, p.maternalGotra]) if (g && !gotras.has(g.trim().toLowerCase())) unknown.add(g);
    if (gotraOf(gotras, p.birthGotra)) matched++;
  }
  const possibleDuplicates: ImportPreview["possibleDuplicates"] = [];
  for (const p of plan.people.slice(0, 200)) {
    if (p.givenName === "?") continue;
    const found = await findDuplicates(
      {
        givenName: p.givenName,
        surname: p.surname,
        gender: p.gender,
        birthGotraId: gotraOf(gotras, p.birthGotra),
        districtId,
        nativeLocalityId: null,
        birthYear: p.birthDate ? Number(p.birthDate.slice(0, 4)) : null,
      },
      3,
    );
    const strong = found.filter((d) => d.score >= 50);
    if (strong.length) possibleDuplicates.push({ name: `${p.givenName} ${p.surname}`.trim(), matches: strong.map((d) => `${d.name} (${d.code})`) });
  }
  return {
    people: plan.people.length,
    living: plan.people.filter((p) => p.isLiving).length,
    families: read.families.length,
    parentLinks: plan.parentLinks.length,
    couples: plan.couples.length,
    gotrasMatched: matched,
    gotrasUnknown: [...unknown].slice(0, 30),
    skipped: read.skipped,
    warnings: plan.warnings,
    possibleDuplicates,
    sample: plan.people.slice(0, 12).map((p) => ({
      name: `${p.givenName} ${p.surname}`.trim(),
      years: [p.birthDate?.slice(0, 4), p.isLiving ? "" : p.deathDate?.slice(0, 4) ?? "†"].filter((x) => x !== undefined).join("–"),
    })),
  };
}

/**
 * Save a checked file: everyone as a new, unclaimed and unverified record, then the parent links
 * and marriages, all in one transaction, then the gotras derived as for any other change. The
 * batch is recorded in the audit log, so it can be undone while nothing else depends on it.
 */
export async function runImport(user: SessionUser, text: string, districtId: string | null, fileName: string) {
  const { plan } = prepare(text);
  if (!plan.people.length) throw new GedcomError("The file has no people in it");
  const gotras = await gotraIndex();
  const batch = randomUUID();
  const ids = new Map(plan.people.map((p) => [p.ref, randomUUID()]));

  await db.$transaction(
    async (tx) => {
      await tx.person.createMany({ data: plan.people.map((p) => personRow(p, ids.get(p.ref)!, gotras, districtId, user.id)) });
      await tx.parentChild.createMany({ data: plan.parentLinks.map((l) => ({ parentId: ids.get(l.parent)!, childId: ids.get(l.child)! })) });
      for (const c of plan.couples) {
        await tx.couple.create({
          data: {
            person1Id: ids.get(c.a)!,
            person2Id: ids.get(c.b)!,
            status: c.status,
            marriageDate: c.marriageDate,
            endDate: c.endDate,
            confirmedById: user.id,
            confirmedAt: new Date(),
          },
        });
      }
    },
    { timeout: 120_000 },
  );
  // Gotras: generation by generation, so each inherits from the one above; then once more for
  // the wives, whose own gotra follows a husband who may sit in a later generation
  for (const layer of generations(plan)) await syncGotras(layer.map((r) => ids.get(r)!));
  await syncGotras(plan.couples.flatMap((c) => [ids.get(c.a)!, ids.get(c.b)!]));
  const created = [...ids.values()];
  await audit(user, "gedcom-import", "GedcomImport", batch, {
    fileName,
    districtId,
    people: created.length,
    parentLinks: plan.parentLinks.length,
    couples: plan.couples.length,
    warnings: plan.warnings.length,
    ids: created,
  });
  return { batch, people: created.length, firstId: created[0] };
}

const gotraOf = (gotras: Map<string, string>, name: string | null | undefined) => (name && gotras.get(name.trim().toLowerCase())) || null;

function personRow(p: GedPerson, id: string, gotras: Map<string, string>, districtId: string | null, by: string) {
  // The own gotra is derived (from the father, and for a married woman the husband); the file's
  // value is used only until then
  const birthGotraId = gotraOf(gotras, p.birthGotra);
  const gotraId = gotraOf(gotras, p.gotra) ?? birthGotraId;
  const maternalGotraId = gotraOf(gotras, p.maternalGotra);
  const unknown = [p.gotra, p.birthGotra, p.maternalGotra].filter((g) => g && !gotraOf(gotras, g));
  const notes = [unknown.length ? `Gotra in the imported file: ${[...new Set(unknown)].join(", ")}` : null, p.deathPlace ? `Place of death: ${p.deathPlace}` : null]
    .filter(Boolean)
    .join("\n");
  return {
    id,
    givenName: p.givenName.slice(0, 120),
    surname: p.surname.slice(0, 120),
    givenNameLocal: p.givenNameLocal?.slice(0, 120) ?? null,
    surnameLocal: p.surnameLocal?.slice(0, 120) ?? null,
    gender: p.gender,
    isLiving: p.isLiving,
    birthDate: p.birthDate ?? null,
    birthPlace: p.birthPlace?.slice(0, 200) ?? null,
    deathDate: p.isLiving ? null : (p.deathDate ?? null),
    occupation: p.occupation?.slice(0, 200) ?? null,
    birthGotraId,
    gotraId,
    maternalGotraId,
    nakshatra: p.nakshatra ?? null,
    rasi: p.rasi ?? null,
    ...(p.kuladevata ? { kuladevata: p.kuladevata.slice(0, 120) } : {}),
    districtId,
    notes: notes || null,
    createdById: by,
    updatedById: by,
  };
}

/** Earlier imports, newest first, with how many of their records are still there. */
export async function recentImports() {
  const logs = await db.auditLog.findMany({ where: { action: "gedcom-import" }, orderBy: { createdAt: "desc" }, take: 20, include: { user: { select: { name: true } } } });
  const undone = new Set(
    (await db.auditLog.findMany({ where: { action: "gedcom-undo", entityId: { in: logs.map((l) => l.entityId) } }, select: { entityId: true } })).map((l) => l.entityId),
  );
  return logs.map((l) => {
    const d = l.details as { fileName?: string; people?: number; ids?: string[] } | null;
    return { batch: l.entityId, at: l.createdAt, by: l.user?.name ?? "", fileName: d?.fileName ?? "", people: d?.people ?? 0, firstId: d?.ids?.[0], undone: undone.has(l.entityId) };
  });
}

/**
 * Undo an import: delete its records that nobody has claimed, linked to a record outside the batch,
 * or changed since. Those are kept (and counted), so undoing never takes away someone's work.
 */
export async function undoImport(user: SessionUser, batch: string) {
  const log = await db.auditLog.findFirst({ where: { action: "gedcom-import", entityId: batch } });
  const ids = ((log?.details as { ids?: string[] } | null)?.ids ?? []).filter(Boolean);
  if (!log || !ids.length) throw new Error("No such import");
  const inBatch = new Set(ids);
  const people = await db.person.findMany({
    where: { id: { in: ids } },
    select: {
      id: true, status: true, updatedAt: true, user: { select: { id: true } }, claims: { select: { id: true }, take: 1 },
      asParent: { select: { childId: true } }, asChild: { select: { parentId: true } },
      couples1: { select: { person2Id: true } }, couples2: { select: { person1Id: true } },
    },
  });
  const keep = people.filter(
    (p) =>
      p.user ||
      p.claims.length ||
      p.status !== "UNCLAIMED" ||
      // Edited after the import (the gotra pass ran before the import was logged)
      p.updatedAt > log.createdAt ||
      [...p.asParent.map((l) => l.childId), ...p.asChild.map((l) => l.parentId), ...p.couples1.map((c) => c.person2Id), ...p.couples2.map((c) => c.person1Id)].some((x) => !inBatch.has(x)),
  );
  const keepIds = new Set(keep.map((p) => p.id));
  const remove = people.filter((p) => !keepIds.has(p.id)).map((p) => p.id);
  // Links and marriages go with the records (onDelete: Cascade)
  await db.person.deleteMany({ where: { id: { in: remove } } });
  await audit(user, "gedcom-undo", "GedcomImport", batch, { removed: remove.length, kept: keep.map((p) => p.id) });
  return { removed: remove.length, kept: keep.length };
}
