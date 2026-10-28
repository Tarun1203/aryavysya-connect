/**
 * GEDCOM, the family-tree exchange format (no database here, so it can be unit-tested).
 *
 * Reading accepts GEDCOM 5.5.1 and 7.0 in UTF-8 (or plain ASCII): individuals (INDI) with their
 * names, sex, birth, death and occupation, and families (FAM) with the couple, the marriage and its
 * end, and the children. Everything else is skipped and counted, never guessed at. Writing produces
 * GEDCOM 5.5.1 in UTF-8, which every genealogy program reads.
 *
 * Our own facts travel in underscore tags, as the standard allows: _GOTRA (own, swa gotra),
 * _BIRTH_GOTRA (puttinti), _MATERNAL_GOTRA, _NAKSHATRA, _RASI and _KULADEVATA. The family name
 * (intiperu) is the GEDCOM surname; the sankethanama comes with the gotra. A name in Telugu, Kannada or Tamil script is a second NAME, so other programs show it as an
 * alternate name and our import puts it back in the local-script fields.
 */

import { NAKSHATRAS, RASIS } from "./constants";

/** A problem with the file itself, worded for the person importing it. */
export class GedcomError extends Error {}

export type Sex = "MALE" | "FEMALE" | "OTHER";

export type GedPerson = {
  ref: string;
  givenName: string;
  surname: string;
  givenNameLocal?: string | null;
  surnameLocal?: string | null;
  gender: Sex;
  /** Our free-form dates: "1952", "1952-03" or "1952-03-14" */
  birthDate?: string | null;
  birthPlace?: string | null;
  deathDate?: string | null;
  deathPlace?: string | null;
  isLiving: boolean;
  /** Own (swa) gotra: a married woman's is her husband's */
  gotra?: string | null;
  /** Birth (puttinti) gotra, the father's; never changes with marriage */
  birthGotra?: string | null;
  maternalGotra?: string | null;
  nakshatra?: string | null;
  rasi?: string | null;
  kuladevata?: string | null;
  occupation?: string | null;
  /** Written as a placeholder: no name, dates or facts (src/lib/consent.ts) */
  private?: boolean;
};

export type GedFamily = {
  ref: string;
  husband?: string;
  wife?: string;
  children: string[];
  /** The two are a married couple (not just a child's two recorded parents) */
  married?: boolean;
  marriageDate?: string | null;
  /** The marriage ended (DIV in GEDCOM) */
  divorced?: boolean;
  endDate?: string | null;
};

export type GedData = { people: GedPerson[]; families: GedFamily[] };

/* ---------------------------------------------------------------- lines */

export type GedNode = { tag: string; xref?: string; value: string; children: GedNode[]; line: number };

const LINE = /^\s*(\d{1,2})\s+(?:(@[^@\s]+@)\s+)?([A-Za-z0-9_]+)(?:\s(.*))?$/;

/** Lines into a tree of records. CONC and CONT are joined into their parent's value. */
export function parseNodes(text: string): { roots: GedNode[]; problems: string[] } {
  const roots: GedNode[] = [];
  const problems: string[] = [];
  const stack: GedNode[] = [];
  const lines = text.replace(/^﻿/, "").split(/\r\n|\r|\n/);
  lines.forEach((raw, i) => {
    if (!raw.trim()) return;
    const m = LINE.exec(raw);
    if (!m) {
      if (problems.length < 50) problems.push(`Line ${i + 1}: not a GEDCOM line`);
      return;
    }
    const level = Number(m[1]);
    const node: GedNode = { tag: m[3].toUpperCase(), xref: m[2], value: (m[4] ?? "").replace(/@@/g, "@"), children: [], line: i + 1 };
    if (level > stack.length) {
      if (problems.length < 50) problems.push(`Line ${i + 1}: level ${level} skips a level`);
      return;
    }
    stack.length = level;
    if (level === 0) roots.push(node);
    else {
      const parent = stack[level - 1];
      if (node.tag === "CONC") {
        parent.value += node.value;
        return;
      }
      if (node.tag === "CONT") {
        parent.value += "\n" + node.value;
        return;
      }
      parent.children.push(node);
    }
    stack.push(node);
  });
  return { roots, problems };
}

const child = (n: GedNode, tag: string) => n.children.find((c) => c.tag === tag);
const childValue = (n: GedNode | undefined, tag: string) => (n ? child(n, tag)?.value.trim() || undefined : undefined);

/* ---------------------------------------------------------------- dates */

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** "1952-03-14" → "14 MAR 1952"; "1952-03" → "MAR 1952"; "1952" → "1952". Anything else: null. */
export function toGedDate(d: string | null | undefined): string | null {
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(d?.trim() ?? "");
  if (!m) return null;
  const [, y, mo, da] = m;
  if (!mo) return y;
  const month = MONTHS[Number(mo) - 1];
  if (!month) return y;
  return da ? `${Number(da)} ${month} ${y}` : `${month} ${y}`;
}

/**
 * A GEDCOM date as ours. Qualified dates (ABT, BEF, AFT, EST, CAL, BET … AND …, FROM … TO …) keep
 * their first date and are marked approximate; other calendars and unreadable text give null.
 */
export function fromGedDate(g: string | null | undefined): { date: string | null; approx: boolean } {
  let s = (g ?? "").trim().toUpperCase();
  if (!s) return { date: null, approx: false };
  if (s.startsWith("@#D") && !s.startsWith("@#DGREGORIAN@")) return { date: null, approx: true };
  s = s.replace(/^@#DGREGORIAN@\s*/, "").replace(/^GREGORIAN\s+/, "");
  let approx = false;
  const q = /^(ABT|ABOUT|BEF|BEFORE|AFT|AFTER|EST|CAL|BET|FROM|TO|INT)\s+(.*)$/.exec(s);
  if (q) {
    approx = true;
    s = q[2].split(/\s+(?:AND|TO)\s+/)[0].replace(/^\((.*)\)$/, "$1");
  }
  s = s.replace(/\s*\(.*\)$/, "").replace(/\s+B\.C\.$/, "");
  const parts = s.split(/\s+/);
  const year = parts.at(-1)?.replace(/\/\d+$/, "");
  if (!year || !/^\d{3,4}$/.test(year)) return { date: null, approx: true };
  const y = year.padStart(4, "0");
  const month = parts.length >= 2 ? MONTHS.indexOf(parts.at(-2)!) + 1 : 0;
  if (parts.length >= 2 && !month) return { date: y, approx: true };
  const day = parts.length >= 3 ? Number(parts.at(-3)) : 0;
  const mm = String(month).padStart(2, "0");
  if (!month) return { date: y, approx };
  if (!day || day > 31) return { date: `${y}-${mm}`, approx: approx || parts.length >= 3 };
  return { date: `${y}-${mm}-${String(day).padStart(2, "0")}`, approx };
}

/* ---------------------------------------------------------------- names */

/** Letters outside Latin (Telugu, Kannada, Tamil… ): the name belongs in the local-script fields */
const isLocalScript = (s: string) => /[^\u0000-ɏ\s/.'-]/.test(s);

function splitName(n: GedNode) {
  const m = /^([^/]*)(?:\/([^/]*)\/?)?(.*)$/.exec(n.value.trim())!;
  const given = childValue(n, "GIVN") ?? [m[1], m[3]].map((s) => s.trim()).filter(Boolean).join(" ");
  const surname = childValue(n, "SURN") ?? m[2]?.trim() ?? "";
  return { given: given.replace(/\s+/g, " ").trim(), surname: surname.replace(/\s+/g, " ").trim() };
}

/* ---------------------------------------------------------------- read */

export type ReadResult = GedData & {
  /** Things skipped or approximated, for the person importing to read before confirming */
  warnings: string[];
  skipped: Record<string, number>;
};

/** Years after birth beyond which someone with no death recorded is taken to have passed. */
const PRESUMED_DEAD_AFTER = 110;

export function readGedcom(text: string, now = new Date()): ReadResult {
  const { roots, problems } = parseNodes(text);
  const warnings = [...problems];
  const skipped: Record<string, number> = {};
  const head = roots.find((r) => r.tag === "HEAD");
  if (!head) throw new GedcomError("This is not a GEDCOM file (it has no HEAD record)");
  const charset = childValue(head, "CHAR")?.toUpperCase();
  if (charset && !["UTF-8", "UTF8", "ASCII", "UNICODE"].includes(charset)) {
    throw new GedcomError(`The file is in ${charset}; save it as UTF-8 GEDCOM and upload it again`);
  }

  const people: GedPerson[] = [];
  const families: GedFamily[] = [];
  const warn = (msg: string) => {
    if (warnings.length < 200) warnings.push(msg);
  };
  // Wives in the file: a married woman's own gotra is her husband's, so without _BIRTH_GOTRA it
  // can't stand in for her birth gotra
  const wives = new Set(roots.filter((r) => r.tag === "FAM").flatMap((r) => r.children.filter((c) => c.tag === "WIFE").map((c) => c.value.trim())));
  /** A value from a fixed list (nakshatras, rasis), matched without case; anything else is reported */
  const fromList = (label: string, tag: string, value: string | undefined, list: readonly string[]) => {
    if (!value) return null;
    const hit = list.find((x) => x.toLowerCase() === value.toLowerCase().replace(/\s+/g, " "));
    if (!hit) warn(`${label}: ${tag.slice(1).toLowerCase()} "${value}" is not in our list – left out`);
    return hit ?? null;
  };

  for (const r of roots) {
    if (r.tag === "INDI" && r.xref) {
      const names = r.children.filter((c) => c.tag === "NAME").map(splitName);
      const latin = names.find((n) => !isLocalScript(n.given + n.surname));
      const local = names.find((n) => isLocalScript(n.given + n.surname));
      const main = latin ?? local;
      const sex = childValue(r, "SEX")?.toUpperCase();
      const birth = child(r, "BIRT");
      const death = child(r, "DEAT") ?? child(r, "BURI") ?? child(r, "CREM");
      const b = fromGedDate(childValue(birth, "DATE"));
      const d = fromGedDate(childValue(death, "DATE"));
      const label = `${main?.given ?? "?"} ${main?.surname ?? ""}`.trim() + ` (${r.xref})`;
      if (!main?.given) warn(`${r.xref}: no given name – imported as "?"`);
      if (b.approx) warn(`${label}: birth date "${childValue(birth, "DATE")}" kept as ${b.date ?? "unknown"}`);
      if (d.approx) warn(`${label}: death date "${childValue(death, "DATE")}" kept as ${d.date ?? "unknown"}`);
      // A death event (even "1 DEAT Y" with no date) means the person has passed
      let isLiving = !death;
      if (isLiving && b.date && now.getFullYear() - Number(b.date.slice(0, 4)) > PRESUMED_DEAD_AFTER) {
        isLiving = false;
        warn(`${label}: born ${b.date} with no death recorded – imported as passed away`);
      }
      people.push({
        ref: r.xref,
        givenName: main?.given || "?",
        surname: main?.surname ?? "",
        givenNameLocal: latin && local ? local.given || null : null,
        surnameLocal: latin && local ? local.surname || null : null,
        gender: sex === "M" ? "MALE" : sex === "F" ? "FEMALE" : "OTHER",
        birthDate: b.date,
        birthPlace: childValue(birth, "PLAC") ?? null,
        deathDate: d.date,
        deathPlace: childValue(death, "PLAC") ?? null,
        isLiving,
        gotra: childValue(r, "_GOTRA") ?? null,
        birthGotra: childValue(r, "_BIRTH_GOTRA") ?? (wives.has(r.xref) ? null : (childValue(r, "_GOTRA") ?? null)),
        maternalGotra: childValue(r, "_MATERNAL_GOTRA") ?? null,
        nakshatra: fromList(label, "_NAKSHATRA", childValue(r, "_NAKSHATRA"), NAKSHATRAS),
        rasi: fromList(label, "_RASI", childValue(r, "_RASI"), RASIS),
        kuladevata: childValue(r, "_KULADEVATA") ?? null,
        occupation: childValue(r, "OCCU") ?? null,
      });
    } else if (r.tag === "FAM" && r.xref) {
      const marr = child(r, "MARR");
      const div = child(r, "DIV");
      const m = fromGedDate(childValue(marr, "DATE"));
      const e = fromGedDate(childValue(div, "DATE"));
      families.push({
        ref: r.xref,
        husband: childValue(r, "HUSB"),
        wife: childValue(r, "WIFE"),
        children: r.children.filter((c) => c.tag === "CHIL").map((c) => c.value.trim()),
        married: !!(childValue(r, "HUSB") && childValue(r, "WIFE")),
        marriageDate: m.date,
        divorced: !!div,
        endDate: e.date,
      });
    } else if (!["HEAD", "TRLR"].includes(r.tag)) {
      skipped[r.tag] = (skipped[r.tag] ?? 0) + 1;
    }
  }
  return { people, families, warnings, skipped };
}

/* ---------------------------------------------------------------- plan */

export type ImportPlan = {
  people: GedPerson[];
  /** Parent → child, by GEDCOM ref */
  parentLinks: { parent: string; child: string }[];
  couples: { a: string; b: string; marriageDate: string | null; endDate: string | null; status: "CONFIRMED" | "DIVORCED" }[];
  warnings: string[];
};

/**
 * Turn what was read into links we can store, dropping (with a warning) what our tree can't hold:
 * references to people not in the file, more than two parents, a person their own ancestor, or a
 * parent married to their child.
 */
export function planImport(data: GedData): ImportPlan {
  const warnings: string[] = [];
  const warn = (msg: string) => {
    if (warnings.length < 200) warnings.push(msg);
  };
  const byRef = new Map(data.people.map((p) => [p.ref, p]));
  const name = (ref: string) => {
    const p = byRef.get(ref);
    return p ? `${p.givenName} ${p.surname}`.trim() + ` (${ref})` : ref;
  };

  const couples: ImportPlan["couples"] = [];
  const coupleKey = new Set<string>();
  const parentsOf = new Map<string, string[]>();
  const links: ImportPlan["parentLinks"] = [];

  for (const f of data.families) {
    const spouses = [f.husband, f.wife].filter((r): r is string => !!r);
    for (const r of [...spouses, ...f.children]) if (!byRef.has(r)) warn(`${f.ref}: refers to ${r}, who is not in the file – left out`);
    const parents = spouses.filter((r) => byRef.has(r));
    if (parents.length === 2 && parents[0] !== parents[1]) {
      const key = [...parents].sort().join("|");
      if (!coupleKey.has(key)) {
        coupleKey.add(key);
        couples.push({ a: parents[0], b: parents[1], marriageDate: f.marriageDate ?? null, endDate: f.endDate ?? null, status: f.divorced ? "DIVORCED" : "CONFIRMED" });
      }
    }
    for (const c of f.children.filter((r) => byRef.has(r))) {
      const have = parentsOf.get(c) ?? [];
      for (const p of parents) {
        if (p === c) {
          warn(`${name(c)}: listed as their own parent – left out`);
          continue;
        }
        if (have.includes(p)) continue;
        if (have.length >= 2) {
          warn(`${name(c)}: more than two parents in the file – ${name(p)} left out`);
          continue;
        }
        have.push(p);
        links.push({ parent: p, child: c });
      }
      parentsOf.set(c, have);
    }
  }

  // A parent can't be married to their child
  const spouseKeys = coupleKey;
  const kept = links.filter((l) => {
    if (spouseKeys.has([l.parent, l.child].sort().join("|"))) {
      warn(`${name(l.child)}: also recorded as the spouse of their parent ${name(l.parent)} – the parent link is left out`);
      return false;
    }
    return true;
  });

  // No one can be their own ancestor: add links one by one, refusing any that closes a loop
  const up = new Map<string, string[]>();
  const isAncestor = (a: string, of: string) => {
    const seen = new Set<string>();
    const stack = [of];
    while (stack.length) {
      const x = stack.pop()!;
      if (x === a) return true;
      if (seen.has(x)) continue;
      seen.add(x);
      stack.push(...(up.get(x) ?? []));
    }
    return false;
  };
  const parentLinks = kept.filter((l) => {
    if (isAncestor(l.child, l.parent)) {
      warn(`${name(l.child)} would be their own ancestor through ${name(l.parent)} – that link is left out`);
      return false;
    }
    up.set(l.child, [...(up.get(l.child) ?? []), l.parent]);
    return true;
  });

  return { people: data.people, parentLinks, couples, warnings };
}

/** People by generation: those with no parents in the plan first, then their children, and so on. */
export function generations(plan: Pick<ImportPlan, "people" | "parentLinks">): string[][] {
  const parents = new Map<string, string[]>();
  for (const l of plan.parentLinks) parents.set(l.child, [...(parents.get(l.child) ?? []), l.parent]);
  const depth = new Map<string, number>();
  // planImport has removed loops, so this ends
  const of = (ref: string): number => {
    if (!depth.has(ref)) depth.set(ref, Math.max(-1, ...(parents.get(ref) ?? []).map(of)) + 1);
    return depth.get(ref)!;
  };
  const layers: string[][] = [];
  for (const p of plan.people) (layers[of(p.ref)] ??= []).push(p.ref);
  return layers.filter(Boolean);
}

/* ---------------------------------------------------------------- write */

const MAX_LINE = 240;

/** One fact as GEDCOM lines; long or multi-line values are split with CONT and CONC. */
function line(level: number, tag: string, value?: string | null, xref?: string): string[] {
  const head = `${level}${xref ? ` ${xref}` : ""} ${tag}`;
  if (value === undefined || value === null || value === "") return [head];
  const out: string[] = [];
  value
    .replace(/@/g, "@@")
    .split(/\r\n|\r|\n/)
    .forEach((text, i) => {
      // Split on characters, never inside a surrogate pair
      const chars = [...text];
      const pieces: string[] = [];
      for (let at = 0; at < chars.length || at === 0; at += MAX_LINE) pieces.push(chars.slice(at, at + MAX_LINE).join(""));
      pieces.forEach((p, j) => {
        if (i === 0 && j === 0) out.push(`${head} ${p}`.trimEnd());
        else out.push(`${level + 1} ${j === 0 ? "CONT" : "CONC"}${p ? ` ${p}` : ""}`);
      });
    });
  return out;
}

/** A pointer to another record (@F1@): written as it is, never escaped like text. */
const pointer = (level: number, tag: string, ref: string) => [`${level} ${tag} ${ref}`];

const nameValue = (given: string, surname: string) => `${given.replace(/\//g, " ").trim()} /${surname.replace(/\//g, " ").trim()}/`;

export function writeGedcom(data: GedData, meta: { source: string; version: string; date?: Date; note?: string }): string {
  const date = meta.date ?? new Date();
  const out: string[] = [
    ...line(0, "HEAD"),
    ...line(1, "SOUR", meta.source),
    ...line(2, "VERS", meta.version),
    ...line(2, "NAME", "Arya Vysya Vamsha Vruksham"),
    ...line(1, "DATE", `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`),
    ...line(1, "GEDC"),
    ...line(2, "VERS", "5.5.1"),
    ...line(2, "FORM", "LINEAGE-LINKED"),
    ...line(1, "CHAR", "UTF-8"),
    ...(meta.note ? line(1, "NOTE", meta.note) : []),
  ];

  const famsOf = new Map<string, string[]>();
  const famcOf = new Map<string, string[]>();
  for (const f of data.families) {
    for (const s of [f.husband, f.wife]) if (s) famsOf.set(s, [...(famsOf.get(s) ?? []), f.ref]);
    for (const c of f.children) famcOf.set(c, [...(famcOf.get(c) ?? []), f.ref]);
  }

  for (const p of data.people) {
    out.push(...line(0, "INDI", null, p.ref));
    if (p.private) {
      out.push(...line(1, "NAME", "Private //"));
      out.push(...line(1, "SEX", "U"));
    } else {
      out.push(...line(1, "NAME", nameValue(p.givenName, p.surname)));
      out.push(...line(2, "GIVN", p.givenName), ...(p.surname ? line(2, "SURN", p.surname) : []));
      if (p.givenNameLocal || p.surnameLocal) out.push(...line(1, "NAME", nameValue(p.givenNameLocal ?? "", p.surnameLocal ?? "")));
      out.push(...line(1, "SEX", p.gender === "MALE" ? "M" : p.gender === "FEMALE" ? "F" : "U"));
      const birth = toGedDate(p.birthDate);
      if (birth || p.birthPlace) out.push(...line(1, "BIRT"), ...(birth ? line(2, "DATE", birth) : []), ...(p.birthPlace ? line(2, "PLAC", p.birthPlace) : []));
      if (!p.isLiving) {
        const death = toGedDate(p.deathDate);
        // "1 DEAT Y": passed away, date not known
        out.push(...line(1, "DEAT", death || p.deathPlace ? null : "Y"), ...(death ? line(2, "DATE", death) : []), ...(p.deathPlace ? line(2, "PLAC", p.deathPlace) : []));
      }
      if (p.occupation) out.push(...line(1, "OCCU", p.occupation));
      const facts = [["_GOTRA", p.gotra], ["_BIRTH_GOTRA", p.birthGotra], ["_MATERNAL_GOTRA", p.maternalGotra], ["_NAKSHATRA", p.nakshatra], ["_RASI", p.rasi], ["_KULADEVATA", p.kuladevata]] as const;
      for (const [tag, value] of facts) if (value) out.push(...line(1, tag, value));
    }
    for (const f of famcOf.get(p.ref) ?? []) out.push(...pointer(1, "FAMC", f));
    for (const f of famsOf.get(p.ref) ?? []) out.push(...pointer(1, "FAMS", f));
  }

  for (const f of data.families) {
    out.push(...line(0, "FAM", null, f.ref));
    if (f.husband) out.push(...pointer(1, "HUSB", f.husband));
    if (f.wife) out.push(...pointer(1, "WIFE", f.wife));
    const married = toGedDate(f.marriageDate);
    if (f.married && f.husband && f.wife) out.push(...line(1, "MARR", married ? null : "Y"), ...(married ? line(2, "DATE", married) : []));
    if (f.divorced) {
      const ended = toGedDate(f.endDate);
      out.push(...line(1, "DIV", ended ? null : "Y"), ...(ended ? line(2, "DATE", ended) : []));
    }
    for (const c of f.children) out.push(...pointer(1, "CHIL", c));
  }
  out.push("0 TRLR");
  return out.join("\r\n") + "\r\n";
}

/**
 * Families for the writer from people, couples and parent links (by ref). Each child goes in the
 * family of their two parents when those are a couple, otherwise in a family of their parents alone.
 */
export function familiesFrom(
  people: Pick<GedPerson, "ref" | "gender">[],
  couples: { a: string; b: string; marriageDate?: string | null; endDate?: string | null; divorced?: boolean }[],
  parentLinks: { parent: string; child: string }[],
): GedFamily[] {
  const sex = new Map(people.map((p) => [p.ref, p.gender]));
  const families: GedFamily[] = [];
  const byKey = new Map<string, GedFamily>();
  const add = (refs: string[], extra: Partial<GedFamily> = {}) => {
    const key = [...refs].sort().join("|");
    let f = byKey.get(key);
    if (!f) {
      // The husband slot for the man (or the first listed), the wife slot for the other
      const [x, y] = refs.length === 2 && sex.get(refs[1]) === "MALE" && sex.get(refs[0]) !== "MALE" ? [refs[1], refs[0]] : refs;
      const xIsWife = refs.length === 1 && sex.get(x) === "FEMALE";
      f = { ref: `@F${families.length + 1}@`, husband: xIsWife ? undefined : x, wife: xIsWife ? x : y, children: [], ...extra };
      byKey.set(key, f);
      families.push(f);
    }
    return f;
  };
  for (const c of couples) add([c.a, c.b], { married: true, marriageDate: c.marriageDate ?? null, endDate: c.endDate ?? null, divorced: c.divorced });
  const parents = new Map<string, string[]>();
  for (const l of parentLinks) parents.set(l.child, [...(parents.get(l.child) ?? []), l.parent]);
  for (const [child, ps] of parents) add(ps.slice(0, 2)).children.push(child);
  return families;
}
