#!/usr/bin/env bash
# PRUEBA DE RESTAURACIÓN: restaura una copia en una base temporal y compara las filas de TODAS las tablas con la base original.
# Una copia que nunca se restauró no es una copia. Hazlo después de cada cambio importante y al menos una vez al mes.
#   DATABASE_URL=... RESTORE_ADMIN_URL=postgresql://usuario:clave@host:5432/postgres ./scripts/restore-check.sh [archivo.dump]
set -euo pipefail
: "${DATABASE_URL:?Falta DATABASE_URL}"; : "${RESTORE_ADMIN_URL:?Falta RESTORE_ADMIN_URL (conexión con permiso para crear bases)}"
SRC="${DATABASE_URL%%\?*}"; ADMIN="${RESTORE_ADMIN_URL%%\?*}"
DIR="${BACKUP_DIR:-./backups}"
FILE="${1:-$(ls -1t "$DIR"/zentra-*.dump | head -1)}"
[ -f "$FILE" ] || { echo "No hay copias en $DIR"; exit 2; }
( cd "$(dirname "$FILE")" && sha256sum --check --status "$(basename "$FILE").sha256" ) || { echo "✘ La suma de control NO coincide: copia dañada"; exit 1; }
TMP="zentra_restore_check_$$"; BASE="${ADMIN%/*}"
cleanup() { psql "$ADMIN" -qc "DROP DATABASE IF EXISTS $TMP" >/dev/null 2>&1 || true; }; trap cleanup EXIT
psql "$ADMIN" -qc "CREATE DATABASE $TMP"
pg_restore --no-owner --no-privileges --dbname "$BASE/$TMP" "$FILE"
BAD=0; N=0
for T in $(psql "$SRC" -Atc "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1"); do
  A=$(psql "$SRC" -Atc "SELECT count(*) FROM \"$T\""); B=$(psql "$BASE/$TMP" -Atc "SELECT count(*) FROM \"$T\"")
  N=$((N+1)); if [ "$A" != "$B" ]; then echo "✘ $T: original=$A restaurada=$B"; BAD=$((BAD+1)); fi
done
[ "$BAD" -eq 0 ] && echo "✔ Restauración verificada: $N tablas con las mismas filas ($FILE)" || { echo "✘ $BAD tabla(s) distinta(s)"; exit 1; }
