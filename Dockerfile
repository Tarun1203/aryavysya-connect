# Arya Vysya Vamsha Vruksham – production image
FROM node:24-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Install dependencies (postinstall runs `prisma generate`, so the schema must be present)
FROM base AS deps
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build && npm prune --omit=dev

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
RUN groupadd --system app && useradd --system --gid app app
COPY --from=build --chown=app:app /app/package.json /app/prisma.config.ts ./
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/.next ./.next
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/prisma ./prisma
# The seed script (run on boot) imports src/lib/db.ts via the tsconfig "@/" alias
COPY --from=build --chown=app:app /app/tsconfig.json ./
COPY --from=build --chown=app:app /app/src/generated ./src/generated
COPY --from=build --chown=app:app /app/src/lib/db.ts ./src/lib/db.ts
COPY --from=build --chown=app:app /app/scripts/start.sh ./scripts/start.sh
USER app
EXPOSE 3000
CMD ["sh", "scripts/start.sh"]
