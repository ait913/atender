FROM node:20-alpine
RUN apk add --no-cache python3 make g++ tini
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json .npmrc ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
RUN corepack enable && corepack prepare pnpm@9 --activate
RUN pnpm install --frozen-lockfile

ENV NODE_ENV=production
ENV PATH=/app/apps/api/node_modules/.bin:/app/node_modules/.bin:$PATH

WORKDIR /app/apps/api
RUN prisma generate
WORKDIR /app

RUN chmod +x apps/api/entrypoint.sh
RUN mkdir -p /app/data
VOLUME ["/app/data"]

EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "apps/api/entrypoint.sh"]
