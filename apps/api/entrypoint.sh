#!/bin/sh
set -e
export PATH=/app/apps/api/node_modules/.bin:/app/node_modules/.bin:$PATH
cd /app/apps/api
prisma migrate deploy
prisma db seed || true
exec tsx src/index.ts
