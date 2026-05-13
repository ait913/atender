# ===== builder =====
FROM node:20-alpine AS builder
RUN apk add --no-cache python3 make g++
WORKDIR /repo
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
RUN corepack enable && corepack prepare pnpm@9 --activate
RUN pnpm install --frozen-lockfile --filter "./apps/api..."
RUN pnpm -C apps/api prisma generate
RUN pnpm -C apps/api build

# ===== runner =====
FROM node:20-alpine AS runner
RUN apk add --no-cache python3 make g++ tini
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /repo/apps/api/dist ./dist
COPY --from=builder /repo/apps/api/prisma ./prisma
COPY --from=builder /repo/apps/api/node_modules ./node_modules
COPY --from=builder /repo/apps/api/package.json ./
COPY apps/api/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

RUN mkdir -p /app/data
VOLUME ["/app/data"]

EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["./entrypoint.sh"]
