# Backups

Two layers, because they fail differently:

1. **Neon's restore history** (built in). Neon keeps a change history for the project (how many days
   depends on the plan) and can restore a branch to any moment in it. This is the fast fix for "someone
   deleted a family by mistake an hour ago". It lives in the same Neon account, though, so it does not
   protect against losing the account or the project.
2. **Encrypted dumps** (`npm run backup`). A full `pg_dump`, sealed with `BACKUP_KEY` while it streams
   (XChaCha20-Poly1305 in chunks; see `src/lib/backup-crypto.ts`), so the plain dump never touches disk.
   Copy the `.vvbk` files wherever you like (an external drive, any cloud storage in India): without the
   key they are unreadable, and any tampering or truncation is detected when they are opened.

## Make a backup

Needs `pg_dump` from PostgreSQL 17 or newer (`PG_DUMP=/path/to/pg_dump` to choose one) and, in `.env`:
the Neon **direct** connection string as `DATABASE_URL_UNPOOLED`, and `BACKUP_KEY`.

```bash
npm run backup
```

This writes `backups/vamsha-<date>.dump.vvbk` (ignored by git). Suggested routine: weekly, and before any
large import or migration; keep the last 8 weekly and 12 monthly copies.

## Restore

Restore into a **new, empty** database (a new Neon branch), never over the live one:

```bash
npm run backup:open -- backups/vamsha-<date>.dump.vvbk restore.dump
pg_restore --no-owner --no-privileges --dbname "<direct connection string of the new branch>" restore.dump
```

Then delete `restore.dump`: it holds personal data in the clear. Point the app at the new branch only
after checking it. Values under field encryption (phone numbers, grievances) stay encrypted in the dump,
so the restored site needs the same `FIELD_ENCRYPTION_KEYS`.

## Keys

`BACKUP_KEY` and `FIELD_ENCRYPTION_KEYS` must be stored apart from the backups and from each other's
only copy, for example two sealed envelopes held by two office bearers, or a password manager with
emergency access. A lost key means unreadable backups; there is no recovery.

Test a restore at least once a quarter: a backup nobody has restored is only a hope.
