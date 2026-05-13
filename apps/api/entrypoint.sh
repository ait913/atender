#!/bin/sh
set -e
cd /app/apps/api
pnpm exec prisma migrate deploy
pnpm exec prisma db seed || true
exec pnpm exec tsx src/index.ts
