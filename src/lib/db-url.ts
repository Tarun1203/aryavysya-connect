/**
 * Read a Postgres connection string from the environment, forgiving common copy-paste mistakes
 * in hosting dashboards: surrounding quotes, whitespace, or a pasted `NAME=` prefix.
 * Returns undefined when the variable is unset or empty.
 */
export function dbUrlFromEnv(name: string): string | undefined {
  let v = process.env[name]?.trim();
  if (!v) return undefined;
  v = v.replace(new RegExp(`^${name}\\s*=\\s*`), "").trim();
  v = v.replace(/^(['"])(.*)\1$/, "$2").trim();
  return v || undefined;
}
