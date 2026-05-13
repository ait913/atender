#!/bin/sh
set -e
node node_modules/prisma/build/index.js migrate deploy
node node_modules/prisma/build/index.js db seed
exec node dist/index.js
