#!/bin/sh
set -e
pnpm --filter @atender/api exec prisma migrate deploy
pnpm --filter @atender/api exec prisma db seed || true
exec pnpm --filter @atender/api exec tsx src/index.ts
