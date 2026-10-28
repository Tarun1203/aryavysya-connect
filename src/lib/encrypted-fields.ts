import type { Mode } from "./encryption-core";

/**
 * Which fields are encrypted, read from schema.prisma: a field opts in with a doc comment line
 *
 *     /// @encrypted                  (randomized – can't be searched)
 *     /// @encrypted(deterministic)   (equality lookups still work)
 *
 * Also records each model's relation fields, so nested writes and nested results can be followed.
 * `npm run encryption:fields` writes the result to encrypted-fields.generated.ts; a test checks the
 * file still matches the schema.
 */
export type FieldMap = {
  fields: Record<string, Record<string, Mode>>;
  relations: Record<string, Record<string, string>>;
};

export function parseEncryptedFields(schema: string): FieldMap {
  const fields: FieldMap["fields"] = {};
  const relations: FieldMap["relations"] = {};
  const models = [...schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)];
  const names = new Set(models.map((m) => m[1]));
  for (const [, model, body] of models) {
    let pending: Mode | null = null;
    for (const raw of body.split("\n")) {
      const line = raw.trim();
      if (line.startsWith("///")) {
        const m = line.match(/@encrypted(?:\((\w+)\))?/);
        if (m) {
          if (m[1] && m[1] !== "deterministic" && m[1] !== "randomized") throw new Error(`${model}: unknown @encrypted mode "${m[1]}"`);
          pending = (m[1] as Mode | undefined) ?? "randomized";
        }
        continue;
      }
      const f = line.match(/^(\w+)\s+(\w+)(\[\])?(\?)?/);
      if (!f || line.startsWith("@@")) {
        pending = null;
        continue;
      }
      const [, name, type] = f;
      if (names.has(type)) (relations[model] ??= {})[name] = type;
      if (pending) {
        if (type !== "String") throw new Error(`${model}.${name}: only String fields can be @encrypted`);
        (fields[model] ??= {})[name] = pending;
      }
      pending = null;
    }
  }
  return { fields, relations };
}
