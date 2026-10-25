// Streaming importer for the location directory (State → District → Taluk → Village / Post office → Pincode).
// Understands three CSV layouts, recognised from their headers:
//   - India Post "All India Pincode Directory" (data.gov.in): officename, pincode, officetype, district, statename …
//   - LGD sub-districts: state/district/sub-district names and codes          → taluks
//   - LGD villages:     state/district/sub-district/village names and codes   → villages
// Used by both `npm run locations:import` and the admin upload page.
import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import { parse } from "csv-parse";
import { db } from "@/lib/db";

export type ImportFormat = "indiapost" | "lgd-subdistrict" | "lgd-village";

export type ImportSummary = {
  format: ImportFormat | null;
  rows: number;
  skipped: number;
  districtsCreated: string[];
  taluks: number;
  localities: number;
  villagesGivenPincode: number;
  postOfficesGivenTaluk: number;
  error?: string;
};

const BATCH = 2000;

/* ---------- name helpers ---------- */

const titleCase = (s: string) =>
  s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(^|[\s(\-./])([a-z])/g, (_, p, c) => p + c.toUpperCase());

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
      // first time we see this LGD code for a district matched by name: remember it
      await db.district.updateMany({ where: { id, lgdCode: null }, data: { lgdCode: code } }).catch(() => {});
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
      return ks === s && kn !== n && (kn.endsWith(n) || n.endsWith(kn));
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

/**
 * Cross-link the two sources inside each district: a post office whose name matches an LGD village
 * gives that village its pincode, and the village gives the post office its taluk.
 */
async function linkPostOfficesToVillages() {
  const norm = (col: string) => `lower(regexp_replace(${col}, '[^A-Za-z]', '', 'g'))`;
  const villages = await db.$executeRawUnsafe(`
    UPDATE "Locality" v SET "pincode" = p."pincode"
    FROM "Locality" p
    WHERE v."kind" = 'VILLAGE' AND v."pincode" IS NULL
      AND p."kind" = 'POST_OFFICE' AND p."districtId" = v."districtId"
      AND ${norm('p."name"')} = ${norm('v."name"')}`);
  const offices = await db.$executeRawUnsafe(`
    UPDATE "Locality" p SET "talukId" = v."talukId"
    FROM "Locality" v
    WHERE p."kind" = 'POST_OFFICE' AND p."talukId" IS NULL
      AND v."kind" = 'VILLAGE' AND v."talukId" IS NOT NULL AND v."districtId" = p."districtId"
      AND ${norm('p."name"')} = ${norm('v."name"')}`);
  // Town post offices (e.g. "Tenali H.O") are named after the taluk headquarters, not an LGD village
  const towns = await db.$executeRawUnsafe(`
    UPDATE "Locality" p SET "talukId" = t."id"
    FROM "Taluk" t
    WHERE p."kind" = 'POST_OFFICE' AND p."talukId" IS NULL AND t."districtId" = p."districtId"
      AND ${norm('p."name"')} = ${norm('t."name"')}`);
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

export async function importLocations(input: Readable, onProgress?: (rows: number) => void): Promise<ImportSummary> {
  const summary: ImportSummary = {
    format: null, rows: 0, skipped: 0, districtsCreated: [], taluks: 0, localities: 0, villagesGivenPincode: 0, postOfficesGivenTaluk: 0,
  };
  const dir = new Directory();
  await dir.load();
  const taluksBefore = await db.taluk.count();

  const parser = input.pipe(parse({ columns: true, bom: true, skip_empty_lines: true, relax_column_count: true, trim: true }));
  let cols: Columns = {};
  let batch: LocalityRow[] = [];

  for await (const record of parser as AsyncIterable<Record<string, string>>) {
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
    const linked = await linkPostOfficesToVillages();
    summary.villagesGivenPincode = linked.villages;
    summary.postOfficesGivenTaluk = linked.offices;
  }
  summary.taluks = (await db.taluk.count()) - taluksBefore;
  summary.districtsCreated = dir.created;
  return summary;
}
