#!/bin/sh
set -e
export PATH=/app/apps/api/node_modules/.bin:/app/node_modules/.bin:$PATH
cd /app/apps/api

# migrate の前に DB を同じ volume にコピーしておく (直近 5 世代)。
# table を作り直す migration (build 20 の author SetNull 化など) の保険。ssh 無しで取れる唯一のバックアップ。
DB_PATH="${DATABASE_URL#file:}"
DB_PATH="${DB_PATH%%\?*}"
if [ -n "$DB_PATH" ] && [ -f "$DB_PATH" ]; then
  cp "$DB_PATH" "$DB_PATH.bak-$(date +%Y%m%d-%H%M%S)"
  ls -1t "$DB_PATH".bak-* 2>/dev/null | tail -n +6 | xargs -r rm -f
  ls -1 "$DB_PATH".bak-* 2>/dev/null
fi

# 件数は Coolify のログ API から読む (migrate 前後で一致することの確認用)
node scripts/db-stats.cjs before-migrate || true
prisma migrate deploy
node scripts/db-stats.cjs after-migrate || true
prisma db seed || true
exec tsx src/index.ts
