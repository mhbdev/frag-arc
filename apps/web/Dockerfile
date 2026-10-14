FROM node:24-slim AS builder
COPY --from=oven/bun:1 /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app

COPY . .
RUN --mount=type=secret,id=web_env,target=/app/apps/web/.env.local --mount=type=cache,target=/root/.bun/install/cache bun install

ENV NODE_ENV=production

# Build-time dummy environment variables to satisfy Varlock during static compilation
# when BuildKit secrets are not passed by Dokploy/CI.
# Real credentials are provided at runtime in the runner stage.
ENV BETTER_AUTH_SECRET="build_placeholder_secret_min_32_characters_long"
ENV BETTER_AUTH_URL="http://localhost:3001"
ENV DATABASE_URL="postgresql://postgres:password@localhost:5432/frag-arc"

# Bundle migrate.mjs into a single standalone, self-contained file with pg included
RUN bun build packages/db/src/migrate.mjs --outfile apps/web/migrate.mjs --target node --format esm

RUN --mount=type=secret,id=web_env,target=/app/apps/web/.env.local cd apps/web && bun run build && rm -f .next/standalone/.env* .next/standalone/apps/web/.env*
# standalone output excludes public/; ensure it exists so the runner copy never fails
RUN mkdir -p apps/web/public

FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
# auto-load needs the Varlock CLI and its installed dependencies.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/web/.env.schema ./apps/web/.env.schema

# Copy standalone migration runner (bundled with pg), migration SQL files, and entrypoint
COPY --from=builder /app/apps/web/migrate.mjs ./apps/web/migrate.mjs
COPY --from=builder /app/apps/web/migrate.mjs ./migrate.mjs
COPY --from=builder /app/packages/db/src/migrations ./apps/web/migrations
COPY --from=builder /app/packages/db/src/migrations ./packages/db/src/migrations
COPY --from=builder /app/packages/db/src/migrations ./migrations
COPY --from=builder /app/apps/web/entrypoint.sh ./apps/web/entrypoint.sh
RUN chmod +x ./apps/web/entrypoint.sh

ENV HOSTNAME=0.0.0.0
ENV PORT=3001
EXPOSE 3001

WORKDIR /app/apps/web
ENTRYPOINT ["./entrypoint.sh"]
