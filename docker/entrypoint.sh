#!/bin/sh
set -e

echo "[entrypoint] Aplicando migraciones de base de datos..."
npx prisma migrate deploy

echo "[entrypoint] Verificando Super Admin..."
node dist/prisma/seed.js

exec "$@"
