#!/bin/sh
# Container entrypoint: check config, apply pending migrations, load reference data (idempotent), start the server.
set -e

# Fail early with a readable message (the value itself is never printed: it contains the password)
check_url() {
  value=$(printenv "$1" || true)
  [ -z "$value" ] && return 0
  stripped=$(printf '%s' "$value" | sed -e "s/^$1[[:space:]]*=[[:space:]]*//" -e 's/^["'"'"']//' -e 's/["'"'"']$//')
  case "$stripped" in
    postgres://*|postgresql://*) ;;
    *) echo "ERROR: $1 must start with postgresql:// (check for a typo or a missing value in your host's environment settings)" >&2; exit 1 ;;
  esac
}
[ -z "$DATABASE_URL" ] && { echo "ERROR: DATABASE_URL is not set" >&2; exit 1; }
check_url DATABASE_URL
check_url DATABASE_URL_UNPOOLED

npx prisma migrate deploy
npx prisma db seed
exec npx next start -p "${PORT:-3000}"
