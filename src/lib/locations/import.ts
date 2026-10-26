// Streaming importer for the location directory (State → District → Taluk → Village / Post office → Pincode).
// Understands three CSV layouts, recognised from their headers:
//   - India Post "All India Pincode Directory" (data.gov.in): officename, pincode, officetype, district, statename …
//   - LGD sub-districts: state/district/sub-district names and codes          → taluks
//   - LGD villages:     state/district/sub-district/village names and codes   → villages
// Used by both `npm run locations:import` and the admin upload page.
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { createReadStream } from "node:fs";
import { open } from "node:fs/promises";
import { parse } from "csv-parse";
import { db } from "@/lib/db";
import { xlsxRecords } from "./xlsx";

export type ImportFormat = "indiapost" | "lgd-subdistrict" | "lgd-village";

export type ImportSummary = {
  format: ImportFormat | null;
  rows: number;
  skipped: number;
  districtsCreated: string[];
  /** "India Post name → LGD name" for districts merged by matching their places */
  districtsMerged: string[];
  taluks: number;
  localities: number;
  villagesGivenPincode: number;
  postOfficesGivenTaluk: number;
  error?: string;
};

const BATCH = 2000;

/* ---------- name helpers ---------- */

/**
 * Tidy capitalisation for ALL-CAPS / all-lower source text ("GUNTUR" → "Guntur"); mixed-case names
 * from LGD are kept as written. Vowel-less initialisms stay upper case ("NTR", "Y.S.R.", "SPSR").
 */
const titleCase = (s: string) => {
  const clean = s.replace(/\s+/g, " ").trim();
  if (clean !== clean.toUpperCase() && clean !== clean.toLowerCase()) return clean;
  return clean
    .toLowerCase()
    .replace(/[a-z]+/g, (w) => (/[aeiouy]/.test(w) ? w : w.toUpperCase()))
    .replace(/(^|[\s(\-./])([a-z])/g, (_, p, c) => p + c.toUpperCase());
};

/**
 * Matching key that survives the spelling differences between India Post, LGD and our seed data
 * (case, spaces, punctuation, "th"/"t", "aa"/"a" …), e.g. "ANANTHAPUR" ≈ "Anantapur".
 */
export function nameKey(s: string) {
  return s
    .toLowerCase()
    .replace(/\b(district|dist|mandal|taluk|taluka|tehsil)\b/g, "")
    .replace(/[^a-z]/g, "")
    .replace(/([bcdgkpt])h/g, "$1")
    .replace(/w/g, "v")
    .replace(/(.)\1+/g, "$1");
}

/** "Akuledu B.O" → { name: "Akuledu", type: "BO" } */
function splitOffice(raw: string) {
  const m = raw.trim().match(/^(.*?)[\s.]+(B\.?\s?O|S\.?\s?O|H\.?\s?O|G\.?\s?P\.?\s?O)\.?$/i);
  return m ? { name: titleCase(m[1]), type: m[2].replace(/[\s.]/g, "").toUpperCase() } : { name: titleCase(raw), type: null };
}

/* ---------- header detection ---------- */

type Columns = Partial<
  Record<
    | "state" | "stateCode" | "district" | "districtCode" | "taluk" | "talukCode"
    | "village" | "villageLocal" | "villageCode" | "office" | "officeType" | "pincode" | "lat" | "lng",
    string
  >
>;

function detectColumns(headers: string[]): { format: ImportFormat | null; cols: Columns } {
  const cols: Columns = {};
  for (const h of headers) {
    const k = h.toLowerCase().replace(/[^a-z]/g, "");
    const local = /local/.test(k);
    const set = (key: keyof Columns) => (cols[key] ??= h);
    if (/^statecode/.test(k)) set("stateCode");
    else if (/^state(name)?(inenglish)?$/.test(k) && !local) set("state");
    else if (/^districtcode/.test(k)) set("districtCode");
    else if (/^district(name)?(inenglish)?$/.test(k) && !local) set("district");
    else if (/^subdistrictcode|^talukcode|^tehsilcode|^mandalcode/.test(k)) set("talukCode");
    else if (/^(subdistrict|taluk|taluka|tehsil|mandal)(name)?(inenglish)?$/.test(k) && !local) set("taluk");
    else if (/^villagecode/.test(k)) set("villageCode");
    else if (/^villagename/.test(k)) set(local ? "villageLocal" : "village");
    else if (/^officename/.test(k)) set("office");
    else if (/^officetype/.test(k)) set("officeType");
    else if (/^pin(code)?$/.test(k)) set("pincode");
    else if (/^lat(itude)?$/.test(k)) set("lat");
    else if (/^(long|lng|longitude)$/.test(k)) set("lng");
  }
  const format: ImportFormat | null =
    cols.office && cols.pincode && cols.district
      ? "indiapost"
      : cols.village && (cols.district || cols.districtCode)
        ? "lgd-village"
        : cols.taluk && (cols.district || cols.districtCode)
          ? "lgd-subdistrict"
          : null;
  return { format, cols };
}

/* ---------- caches ---------- */

class Directory {
  districtByName = new Map<string, string>(); // stateKey|districtKey → id
  districtByCode = new Map<number, string>();
  talukByName = new Map<string, string>(); // districtId|talukKey → id
  talukByCode = new Map<number, string>();
  created: string[] = [];

  async load() {
    for (const d of await db.district.findMany({ select: { id: true, name: true, state: true, lgdCode: true } })) {
      this.districtByName.set(`${nameKey(d.state)}|${nameKey(d.name)}`, d.id);
      if (d.lgdCode) this.districtByCode.set(d.lgdCode, d.id);
    }
    for (const t of await db.taluk.findMany({ select: { id: true, name: true, districtId: true, lgdCode: true } })) {
      this.talukByName.set(`${t.districtId}|${nameKey(t.name)}`, t.id);
      if (t.lgdCode) this.talukByCode.set(t.lgdCode, t.id);
    }
  }

  async district(state: string | undefined, name: string | undefined, code: number | null) {
    if (code && this.districtByCode.has(code)) return this.districtByCode.get(code)!;
    if (!state || !name) return null;
    const key = `${nameKey(state)}|${nameKey(name)}`;
    let id = this.districtByName.get(key) ?? this.fuzzyDistrict(state, name);
    if (id) this.districtByName.set(key, id);
    if (!id) {
      const d = await db.district.upsert({
        where: { state_name: { state: titleCase(state), name: titleCase(name) } },
        update: {},
        create: { state: titleCase(state), name: titleCase(name), lgdCode: code ?? undefined },
      });
      id = d.id;
      this.created.push(`${d.name}, ${d.state}`);
      this.districtByName.set(key, id);
    }
    if (code && !this.districtByCode.has(code)) {
      // First time we see this LGD code for a district matched by name: store the code and adopt
      // LGD's official spelling (e.g. "Anantapur" → "Ananthapuramu"). Skipped if that name is taken.
      await db.district
        .updateMany({ where: { id, lgdCode: null }, data: { lgdCode: code, name: titleCase(name) } })
        .catch(() => db.district.updateMany({ where: { id, lgdCode: null }, data: { lgdCode: code } }).catch(() => {}));
      this.districtByCode.set(code, id);
    }
    return id;
  }

  /**
   * Same state, and one name is the tail of the other ("NELLORE" ≈ "Sri Potti Sriramulu Nellore",
   * "KONASEEMA" ≈ "Dr. B.R. Ambedkar Konaseema"). Only used when exactly one district fits.
   */
  private fuzzyDistrict(state: string, name: string) {
    const s = nameKey(state);
    const n = nameKey(name);
    if (n.length < 4) return undefined;
    const hits = [...this.districtByName.entries()].filter(([k]) => {
      const [ks, kn] = k.split("|");
      if (ks !== s || kn === n) return false;
      // a different prefix ("Sri Potti Sriramulu Nellore" ≈ "Nellore") or a short extra ending ("Ananthapuramu" ≈ "Anantapur")
      const [short, long] = kn.length < n.length ? [kn, n] : [n, kn];
      return long.endsWith(short) || (long.startsWith(short) && long.length - short.length <= 3);
    });
    const ids = new Set(hits.map(([, id]) => id));
    return ids.size === 1 ? [...ids][0] : undefined;
  }

  async taluk(districtId: string, name: string | undefined, code: number | null) {
    if (code && this.talukByCode.has(code)) return this.talukByCode.get(code)!;
    if (!name) return null;
    const key = `${districtId}|${nameKey(name)}`;
    let id = this.talukByName.get(key);
    if (!id) {
      const t = await db.taluk.upsert({
        where: { districtId_name: { districtId, name: titleCase(name) } },
        update: code ? { lgdCode: code } : {},
        create: { districtId, name: titleCase(name), lgdCode: code ?? undefined },
      });
      id = t.id;
      this.talukByName.set(key, id);
    }
    if (code) this.talukByCode.set(code, id);
    return id;
  }
}

/* ---------- writing ---------- */

type LocalityRow = {
  key: string;
  name: string;
  nameLocal: string | null;
  kind: "VILLAGE" | "POST_OFFICE";
  pincode: string | null;
  officeType: string | null;
  lgdCode: number | null;
  latitude: number | null;
  longitude: number | null;
  districtId: string;
  talukId: string | null;
};

async function writeLocalities(rows: LocalityRow[]) {
  if (!rows.length) return 0;
  // de-duplicate within the batch (ON CONFLICT cannot touch the same key twice in one statement)
  const unique = [...new Map(rows.map((r) => [r.key, r])).values()];
  const col = <K extends keyof LocalityRow>(k: K) => unique.map((r) => r[k]);
  await db.$executeRaw`
    INSERT INTO "Locality" ("id","key","name","nameLocal","kind","pincode","officeType","lgdCode","latitude","longitude","districtId","talukId")
    SELECT * FROM unnest(
      ${unique.map(() => randomUUID())}::text[], ${col("key")}::text[], ${col("name")}::text[], ${col("nameLocal")}::text[],
      ${col("kind")}::"LocalityKind"[], ${col("pincode")}::text[], ${col("officeType")}::text[], ${col("lgdCode")}::int[],
      ${col("latitude")}::float8[], ${col("longitude")}::float8[], ${col("districtId")}::text[], ${col("talukId")}::text[]
    )
    ON CONFLICT ("key") DO UPDATE SET
      "name" = EXCLUDED."name",
      "nameLocal" = COALESCE(EXCLUDED."nameLocal", "Locality"."nameLocal"),
      "pincode" = COALESCE(EXCLUDED."pincode", "Locality"."pincode"),
      "officeType" = COALESCE(EXCLUDED."officeType", "Locality"."officeType"),
      "latitude" = COALESCE(EXCLUDED."latitude", "Locality"."latitude"),
      "longitude" = COALESCE(EXCLUDED."longitude", "Locality"."longitude"),
      "districtId" = EXCLUDED."districtId",
      "talukId" = COALESCE(EXCLUDED."talukId", "Locality"."talukId")`;
  return unique.length;
}

/** Edit distance between two short strings (district name keys). */
function editDistance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]++;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length];
}

/** Move everything that points at district `fromId` onto `toId`, then delete `fromId`. */
async function mergeDistrict(fromId: string, toId: string) {
  await db.$transaction(async (tx) => {
    const from = await tx.district.findUniqueOrThrow({ where: { id: fromId } });
    for (const t of await tx.taluk.findMany({ where: { districtId: fromId } })) {
      const same = await tx.taluk.findUnique({ where: { districtId_name: { districtId: toId, name: t.name } } });
      if (same) {
        await tx.locality.updateMany({ where: { talukId: t.id }, data: { talukId: same.id } });
        await tx.organization.updateMany({ where: { talukId: t.id }, data: { talukId: same.id } });
        await tx.taluk.delete({ where: { id: t.id } });
      } else await tx.taluk.update({ where: { id: t.id }, data: { districtId: toId } });
    }
    const move = { where: { districtId: fromId }, data: { districtId: toId } };
    await tx.locality.updateMany(move);
    await tx.user.updateMany(move);
    await tx.person.updateMany(move);
    await tx.familyClaim.updateMany(move);
    await tx.organization.updateMany(move);
    if (from.inchargeId) {
      await tx.district.update({ where: { id: fromId }, data: { inchargeId: null } });
      await tx.district.update({ where: { id: toId }, data: { inchargeId: from.inchargeId } });
    }
    await tx.district.delete({ where: { id: fromId } });
  });
}

/**
 * India Post (and older seed lists) sometimes name a district differently from LGD: Odia spellings
 * ("Kataka" = Cuttack), renames (Tuticorin → Thoothukkudi), typos (Jagtial / Jagitial), or an old
 * district since split in three (Visakhapatnam). For every district without an LGD code:
 *  1. each post office moves to the one LGD district in the state that has a village of its name;
 *  2. the district then merges into the LGD district its post offices clearly point to
 *     (≥ 10 shared names and at least twice the runner-up), or failing that
 *  3. into the one LGD district in the state whose name is within 2 letters of its own.
 * Members, people, sanghas, taluks and the in-charge move along. Anything ambiguous is left as is.
 */
export async function mergeUnmatchedDistricts(): Promise<string[]> {
  const norm = (col: string) => `lower(regexp_replace(${col}, '[^A-Za-z]', '', 'g'))`;
  const votes = await db.$queryRawUnsafe<{ src: string; tgt: string; votes: number }[]>(`
    WITH po AS (
      SELECT DISTINCT l."districtId" AS src, d."state", ${norm('l."name"')} AS k
      FROM "Locality" l JOIN "District" d ON d."id" = l."districtId"
      WHERE l."kind" = 'POST_OFFICE' AND d."lgdCode" IS NULL
    ), v AS (
      SELECT DISTINCT l."districtId" AS tgt, d."state", ${norm('l."name"')} AS k
      FROM "Locality" l JOIN "District" d ON d."id" = l."districtId"
      WHERE l."kind" = 'VILLAGE' AND d."lgdCode" IS NOT NULL
    )
    SELECT po.src, v.tgt, count(*)::int AS votes
    FROM po JOIN v ON v."state" = po."state" AND v.k = po.k
    GROUP BY 1, 2`);

  // 1. post offices whose name is a village in exactly one LGD district of the state
  await db.$executeRawUnsafe(`
    WITH v AS (
      SELECT d."state", ${norm('l."name"')} AS k, min(l."districtId") AS tgt
      FROM "Locality" l JOIN "District" d ON d."id" = l."districtId"
      WHERE l."kind" = 'VILLAGE' AND d."lgdCode" IS NOT NULL
      GROUP BY 1, 2 HAVING count(DISTINCT l."districtId") = 1
    ), po AS (
      SELECT l."id", d."state", ${norm('l."name"')} AS k
      FROM "Locality" l JOIN "District" d ON d."id" = l."districtId"
      WHERE l."kind" = 'POST_OFFICE' AND d."lgdCode" IS NULL
    )
    UPDATE "Locality" p SET "districtId" = v.tgt, "talukId" = NULL
    FROM po JOIN v ON v."state" = po."state" AND v.k = po.k
    WHERE p."id" = po."id"`);

  const bySrc = new Map<string, { tgt: string; votes: number }[]>();
  for (const v of votes) bySrc.set(v.src, [...(bySrc.get(v.src) ?? []), v]);
  const official = await db.district.findMany({ where: { lgdCode: { not: null } }, select: { id: true, name: true, state: true, inchargeId: true } });
  const merged: string[] = [];

  for (const from of await db.district.findMany({ where: { lgdCode: null } })) {
    // 2. a clear winner among the post offices' votes
    const cands = (bySrc.get(from.id) ?? []).sort((a, b) => b.votes - a.votes);
    let targetId = cands[0] && cands[0].votes >= 10 && cands[0].votes >= 2 * (cands[1]?.votes ?? 0) ? cands[0].tgt : undefined;
    // 3. otherwise a near-identical name in the same state
    if (!targetId) {
      const k = nameKey(from.name);
      const close = official.filter((d) => d.state === from.state && editDistance(nameKey(d.name), k) <= 2);
      if (close.length === 1) targetId = close[0].id;
    }
    const to = official.find((d) => d.id === targetId);
    if (!to || (from.inchargeId && to.inchargeId)) continue; // never drop an appointed in-charge
    await mergeDistrict(from.id, to.id);
    if (from.inchargeId) to.inchargeId = from.inchargeId;
    merged.push(`${from.name} → ${to.name} (${to.state})`);
  }
  return merged;
}

/**
 * Cross-link the two sources inside each district: a post office whose name matches an LGD village
 * gives that village its pincode, and the village gives the post office its taluk. Names are only
 * linked when they are unique in the district, so two same-named villages never get the wrong pincode.
 * Grouped before joining so it stays fast at national scale (~6.8 lakh villages, ~1.6 lakh offices).
 */
export async function linkPostOfficesToVillages() {
  const norm = (col: string) => `lower(regexp_replace(${col}, '[^A-Za-z]', '', 'g'))`;
  const villages = await db.$executeRawUnsafe(`
    WITH po AS (
      SELECT "districtId" AS d, ${norm('"name"')} AS k, min("pincode") AS pin
      FROM "Locality" WHERE "kind" = 'POST_OFFICE'
      GROUP BY 1, 2 HAVING count(DISTINCT "pincode") = 1
    ), vk AS (
      SELECT "id", "districtId" AS d, ${norm('"name"')} AS k, "pincode",
             count(*) OVER (PARTITION BY "districtId", ${norm('"name"')}) AS n
      FROM "Locality" WHERE "kind" = 'VILLAGE'
    )
    UPDATE "Locality" v SET "pincode" = po.pin
    FROM vk JOIN po ON po.d = vk.d AND po.k = vk.k
    WHERE v."id" = vk."id" AND vk.n = 1 AND vk."pincode" IS NULL`);
  const offices = await db.$executeRawUnsafe(`
    WITH vk AS (
      SELECT "districtId" AS d, ${norm('"name"')} AS k, min("talukId") AS t
      FROM "Locality" WHERE "kind" = 'VILLAGE' AND "talukId" IS NOT NULL
      GROUP BY 1, 2 HAVING count(*) = 1
    ), pk AS (
      SELECT "id", "districtId" AS d, ${norm('"name"')} AS k FROM "Locality"
      WHERE "kind" = 'POST_OFFICE' AND "talukId" IS NULL
    )
    UPDATE "Locality" p SET "talukId" = vk.t
    FROM pk JOIN vk ON vk.d = pk.d AND vk.k = pk.k
    WHERE p."id" = pk."id"`);
  // Town post offices (e.g. "Tenali H.O") are named after the taluk headquarters, not an LGD village
  const towns = await db.$executeRawUnsafe(`
    WITH tk AS (
      SELECT "districtId" AS d, ${norm('"name"')} AS k, min("id") AS t
      FROM "Taluk" GROUP BY 1, 2 HAVING count(*) = 1
    ), pk AS (
      SELECT "id", "districtId" AS d, ${norm('"name"')} AS k FROM "Locality"
      WHERE "kind" = 'POST_OFFICE' AND "talukId" IS NULL
    )
    UPDATE "Locality" p SET "talukId" = tk.t
    FROM pk JOIN tk ON tk.d = pk.d AND tk.k = pk.k
    WHERE p."id" = pk."id"`);
  return { villages, offices: offices + towns };
}

/* ---------- main ---------- */

const int = (v: unknown) => {
  const n = Number(String(v ?? "").trim());
  return Number.isInteger(n) && n > 0 ? n : null;
};
const float = (v: unknown) => {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) && n !== 0 ? n : null;
};
const text = (v: unknown) => {
  const s = String(v ?? "").trim();
  return s && s.toUpperCase() !== "NA" ? s : undefined;
};

const csvRecords = (input: Readable) =>
  input.pipe(
    parse({ columns: true, bom: true, skip_empty_lines: true, relax_column_count: true, trim: true })
  ) as AsyncIterable<Record<string, string>>;

/** Import a .csv or .xlsx file from disk (Excel is recognised by its zip signature, not the extension). */
export async function importLocationFile(path: string, onProgress?: (rows: number) => void) {
  const head = Buffer.alloc(4);
  const fd = await open(path, "r");
  try {
    await fd.read(head, 0, 4, 0);
  } finally {
    await fd.close();
  }
  const isXlsx = head[0] === 0x50 && head[1] === 0x4b; // "PK"
  return importLocations(isXlsx ? xlsxRecords(path) : createReadStream(path), onProgress);
}

export async function importLocations(
  input: Readable | AsyncIterable<Record<string, string>>,
  onProgress?: (rows: number) => void
): Promise<ImportSummary> {
  const summary: ImportSummary = {
    format: null, rows: 0, skipped: 0, districtsCreated: [], districtsMerged: [], taluks: 0, localities: 0, villagesGivenPincode: 0, postOfficesGivenTaluk: 0,
  };
  const dir = new Directory();
  await dir.load();
  const taluksBefore = await db.taluk.count();

  const records = input instanceof Readable ? csvRecords(input) : input;
  let cols: Columns = {};
  let batch: LocalityRow[] = [];

  for await (const record of records) {
    if (!summary.format) {
      const detected = detectColumns(Object.keys(record));
      if (!detected.format) {
        summary.error = `Unrecognised columns: ${Object.keys(record).join(", ")}`;
        return summary;
      }
      summary.format = detected.format;
      cols = detected.cols;
    }
    summary.rows++;
    const get = (c: keyof Columns) => (cols[c] ? text(record[cols[c]!]) : undefined);

    const districtId = await dir.district(get("state"), get("district"), int(get("districtCode")));
    if (!districtId) {
      summary.skipped++;
      continue;
    }
    const talukId = await dir.taluk(districtId, get("taluk"), int(get("talukCode")));

    if (summary.format === "indiapost") {
      const pin = get("pincode")?.replace(/\D/g, "");
      const office = get("office");
      if (!office || !pin || pin.length !== 6) {
        summary.skipped++;
        continue;
      }
      const { name, type } = splitOffice(office);
      batch.push({
        key: `po:${pin}:${nameKey(name)}`, name, nameLocal: null, kind: "POST_OFFICE", pincode: pin,
        officeType: get("officeType")?.toUpperCase() ?? type, lgdCode: null,
        latitude: float(get("lat")), longitude: float(get("lng")), districtId, talukId,
      });
    } else if (summary.format === "lgd-village") {
      const name = get("village");
      if (!name) {
        summary.skipped++;
        continue;
      }
      const code = int(get("villageCode"));
      const pin = get("pincode")?.replace(/\D/g, "");
      batch.push({
        key: code ? `v:${code}` : `v:${districtId}:${talukId ?? "-"}:${nameKey(name)}`,
        name: titleCase(name), nameLocal: get("villageLocal") ?? null, kind: "VILLAGE",
        pincode: pin && pin.length === 6 ? pin : null, officeType: null, lgdCode: code,
        latitude: float(get("lat")), longitude: float(get("lng")), districtId, talukId,
      });
    }
    // lgd-subdistrict rows only create taluks (done above)

    if (batch.length >= BATCH) {
      summary.localities += await writeLocalities(batch);
      batch = [];
      onProgress?.(summary.rows);
    }
  }
  summary.localities += await writeLocalities(batch);
  onProgress?.(summary.rows);

  if (summary.format === "indiapost" || summary.format === "lgd-village") {
    summary.districtsMerged = await mergeUnmatchedDistricts();
    const linked = await linkPostOfficesToVillages();
    summary.villagesGivenPincode = linked.villages;
    summary.postOfficesGivenTaluk = linked.offices;
  }
  summary.taluks = (await db.taluk.count()) - taluksBefore;
  // districts that were created and then merged into their LGD twin are no longer "new"
  const mergedFrom = new Set(summary.districtsMerged.map((m) => m.split(" → ")[0]));
  summary.districtsCreated = dir.created.filter((c) => !mergedFrom.has(c.split(", ")[0]));
  return summary;
}
