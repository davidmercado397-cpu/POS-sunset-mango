#!/bin/sh
# Respaldo de PostgreSQL. Programar en el crontab del VPS, por ejemplo a las 3 a. m.:
#   0 3 * * * cd /ruta/al/proyecto && ./docker/backup.sh >> backups/backup.log 2>&1
set -e
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP=$(date +%Y%m%d-%H%M%S)
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /backups/pos-'"$STAMP"'.dump'
find ./backups -name 'pos-*.dump' -mtime +"$KEEP_DAYS" -delete
echo "Respaldo creado: backups/pos-$STAMP.dump"
