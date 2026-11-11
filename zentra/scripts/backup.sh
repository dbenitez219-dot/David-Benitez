#!/usr/bin/env bash
# Copia de seguridad de PostgreSQL (formato comprimido de pg_dump), con verificación de lectura y suma de control.
#   DATABASE_URL=postgresql://... [BACKUP_DIR=./backups] [BACKUP_KEEP_DAYS=14] ./scripts/backup.sh
# Programa esto con el cron del servidor (al menos a diario) y COPIA los archivos fuera del servidor (almacenamiento cifrado).
set -euo pipefail
: "${DATABASE_URL:?Falta DATABASE_URL}"
DIR="${BACKUP_DIR:-./backups}"; KEEP="${BACKUP_KEEP_DAYS:-14}"
URL="${DATABASE_URL%%\?*}"   # pg_dump no acepta parámetros de Prisma como ?schema=public
mkdir -p "$DIR"; umask 077
FILE="$DIR/zentra-$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_dump --format=custom --no-owner --no-privileges "$URL" --file "$FILE"
pg_restore --list "$FILE" > /dev/null          # comprueba que el archivo se puede leer
( cd "$DIR" && sha256sum "$(basename "$FILE")" > "$(basename "$FILE").sha256" )
find "$DIR" -name 'zentra-*.dump*' -mtime +"$KEEP" -delete
echo "$FILE ($(du -h "$FILE" | cut -f1))"
