/** A Postgres connection string as libpq environment variables (PGHOST, PGPASSWORD…). */
export function libpqEnv(url: string): Record<string, string> {
  const u = new URL(url);
  const env: Record<string, string> = {
    PGHOST: u.hostname,
    PGPORT: u.port || "5432",
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: decodeURIComponent(u.pathname.replace(/^\//, "")),
  };
  const ssl = u.searchParams.get("sslmode");
  if (ssl) env.PGSSLMODE = ssl;
  const channel = u.searchParams.get("channel_binding");
  if (channel) env.PGCHANNELBINDING = channel;
  return env;
}
