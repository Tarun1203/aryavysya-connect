#!/bin/sh
# Container entrypoint: apply pending migrations, load reference data (idempotent), start the server.
set -e
npx prisma migrate deploy
npx prisma db seed
exec npx next start -p "${PORT:-3000}"
