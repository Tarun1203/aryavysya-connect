import { decryptValue, encryptValue, keyringFrom, lookupCandidates, type Keyring } from "./encryption-core";
import { FIELD_MAP } from "./encrypted-fields.generated";
import type { FieldMap } from "./encrypted-fields";

/**
 * A Prisma client extension that encrypts the fields marked @encrypted in schema.prisma (see
 * encryption-core.ts for the cryptography, encrypted-fields.ts for the markers):
 *  - writes (create, update, upsert, createMany, updateMany, nested writes) are encrypted;
 *  - lookups by equality on a deterministic field are rewritten to match every key version and
 *    the plain value, so rotation and the backfill need no downtime; any other filter on an
 *    encrypted field (contains, startsWith, ordering…) is refused rather than silently wrong;
 *  - results are decrypted, following included relations.
 * Raw SQL ($queryRaw) is not covered – don't touch encrypted columns with it.
 *
 * Keys: FIELD_ENCRYPTION_KEYS / FIELD_ENCRYPTION_CURRENT. Without them nothing is encrypted (a
 * warning is logged once in production), and values stay readable either way.
 */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v) && !(v instanceof Date);

export function createFieldCrypto(ring: Keyring | null, map: FieldMap = FIELD_MAP) {
  const modeOf = (model: string, field: string) => map.fields[model]?.[field];
  const relatedOf = (model: string, field: string) => map.relations[model]?.[field];
  const id = (model: string, field: string) => `${model}.${field}`;

  /** Encrypt the encrypted fields of a data object, following nested relation writes. */
  function encryptData(model: string, data: unknown): unknown {
    if (Array.isArray(data)) return data.map((d) => encryptData(model, d));
    if (!isObj(data) || !ring) return data;
    const out: Obj = {};
    for (const [k, v] of Object.entries(data)) {
      const mode = modeOf(model, k);
      const related = relatedOf(model, k);
      if (mode) {
        // A plain string, or Prisma's { set: "…" }; null stays null
        if (typeof v === "string") out[k] = encryptValue(ring, id(model, k), mode, v);
        else if (isObj(v) && typeof v.set === "string") out[k] = { ...v, set: encryptValue(ring, id(model, k), mode, v.set) };
        else out[k] = v;
      } else if (related && isObj(v)) out[k] = encryptNested(related, v);
      else out[k] = v;
    }
    return out;
  }

  /** create / createMany / update / upsert / connectOrCreate inside a relation write */
  function encryptNested(model: string, w: Obj): Obj {
    const out: Obj = { ...w };
    if ("create" in w) out.create = encryptData(model, w.create);
    if (isObj(w.createMany)) out.createMany = { ...w.createMany, data: encryptData(model, w.createMany.data) };
    if ("update" in w) out.update = Array.isArray(w.update) ? w.update.map((u) => (isObj(u) && "data" in u ? { ...u, data: encryptData(model, u.data), where: rewriteWhere(model, u.where) } : encryptData(model, u))) : isObj(w.update) && "data" in w.update ? { ...w.update, data: encryptData(model, w.update.data) } : encryptData(model, w.update);
    if ("upsert" in w) {
      const fix = (u: unknown) => (isObj(u) ? { ...u, create: encryptData(model, u.create), update: encryptData(model, u.update) } : u);
      out.upsert = Array.isArray(w.upsert) ? w.upsert.map(fix) : fix(w.upsert);
    }
    if ("connectOrCreate" in w) {
      const fix = (c: unknown) => (isObj(c) ? { ...c, create: encryptData(model, c.create), where: rewriteWhere(model, c.where) } : c);
      out.connectOrCreate = Array.isArray(w.connectOrCreate) ? w.connectOrCreate.map(fix) : fix(w.connectOrCreate);
    }
    return out;
  }

  /** Rewrite a where clause so equality on deterministic fields matches every stored form. */
  function rewriteWhere(model: string, where: unknown): unknown {
    if (Array.isArray(where)) return where.map((w) => rewriteWhere(model, w));
    if (!isObj(where) || !ring) return where;
    const out: Obj = {};
    for (const [k, v] of Object.entries(where)) {
      if (k === "AND" || k === "OR" || k === "NOT") {
        out[k] = rewriteWhere(model, v);
        continue;
      }
      const mode = modeOf(model, k);
      const related = relatedOf(model, k);
      if (mode) out[k] = rewriteFilter(model, k, mode, v);
      else if (related && isObj(v)) {
        // Relation filters: { is, isNot, some, every, none } or a direct filter on a to-one relation
        const keys = ["is", "isNot", "some", "every", "none"];
        out[k] = Object.keys(v).some((x) => keys.includes(x))
          ? Object.fromEntries(Object.entries(v).map(([x, y]) => [x, keys.includes(x) ? rewriteWhere(related, y) : y]))
          : rewriteWhere(related, v);
      } else out[k] = v;
    }
    return out;
  }

  function rewriteFilter(model: string, field: string, mode: string, v: unknown): unknown {
    const fid = id(model, field);
    if (v === null || v === undefined) return v;
    const refuse = () => {
      throw new Error(`${fid} is encrypted${mode === "randomized" ? "" : " (deterministic)"}: only ${mode === "randomized" ? "null checks" : "equality, in, not and null checks"} are possible`);
    };
    if (mode === "randomized") return isObj(v) && Object.entries(v).every(([op, x]) => (op === "equals" || op === "not") && x === null) ? v : refuse();
    const all = (s: unknown) => (typeof s === "string" ? lookupCandidates(ring!, fid, s) : refuse());
    if (typeof v === "string") return { in: all(v) };
    if (!isObj(v)) return refuse();
    const out: Obj = {};
    for (const [op, x] of Object.entries(v)) {
      if (x === null) out[op] = x;
      else if (op === "equals") out.in = all(x);
      else if (op === "in") out.in = (x as unknown[]).flatMap(all);
      else if (op === "notIn") out.notIn = (x as unknown[]).flatMap(all);
      else if (op === "not") out.notIn = typeof x === "string" ? all(x) : refuse();
      else refuse();
    }
    return out;
  }

  /** Decrypt a result, following the relations it includes. */
  function decryptResult(model: string, value: unknown): unknown {
    if (Array.isArray(value)) return value.map((v) => decryptResult(model, v));
    if (!isObj(value)) return value;
    const out: Obj = { ...value };
    for (const [k, v] of Object.entries(value)) {
      if (modeOf(model, k)) out[k] = decryptValue(ring, id(model, k), v);
      else if (relatedOf(model, k)) out[k] = decryptResult(relatedOf(model, k)!, v);
    }
    return out;
  }

  /** Transform a query's arguments before it runs. */
  function encryptArgs(model: string, operation: string, args: unknown): unknown {
    if (!isObj(args)) return args;
    const a: Obj = { ...args };
    if ("where" in a) a.where = rewriteWhere(model, a.where);
    if ("data" in a) a.data = encryptData(model, a.data);
    if (operation === "upsert") {
      a.create = encryptData(model, a.create);
      a.update = encryptData(model, a.update);
    }
    if (isObj(a.orderBy) && Object.keys(a.orderBy).some((k) => modeOf(model, k))) throw new Error(`${model}: can't order by an encrypted field`);
    return a;
  }

  return { encryptArgs, decryptResult, encryptData, rewriteWhere };
}

let warned = false;
/** The keyring from the environment (read once); warns in production when encryption is off. */
export function envKeyring(): Keyring | null {
  const ring = keyringFrom(process.env.FIELD_ENCRYPTION_KEYS, process.env.FIELD_ENCRYPTION_CURRENT);
  if (!ring && process.env.NODE_ENV === "production" && !warned) {
    warned = true;
    console.warn("FIELD_ENCRYPTION_KEYS is not set: fields marked @encrypted are stored unencrypted");
  }
  return ring;
}
