FROM node:20-alpine
RUN apk add --no-cache python3 make g++ tini
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json .npmrc ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
RUN corepack enable && corepack prepare pnpm@9 --activate

# better-sqlite3 は musl 向けの prebuilt が無く、必ず node-gyp でソースからビルドされる。
# その際 node-gyp は Node ヘッダを process.release.headersUrl (= alpine イメージなので
# unofficial-builds.nodejs.org) から取りに行くが、このホストは dual-stack で AAAA を先に掴み、
# ビルドコンテナから IPv6 経路が通らず 0.5 秒で ETIMEDOUT になる (フォールバックしない)。
# ヘッダは musl でも同一なので、IPv4 で安定して通る本家に向ける。
# 2026-07-29 build 12 のデプロイが2回連続でこれで落ちた。消すと再発する。
ENV npm_config_disturl=https://nodejs.org/download/release
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
