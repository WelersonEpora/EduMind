#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT_DIR"

COMPOSE_FILE="docker/compose.prod.yml"
COMPOSE_PROJECT="edumind"

# Docker Compose v2 (plugin "docker compose") ou v1 ("docker-compose").
if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
else
  COMPOSE=(docker-compose)
fi
compose() {
  "${COMPOSE[@]}" -p "$COMPOSE_PROJECT" --project-directory . -f "$COMPOSE_FILE" "$@"
}

echo "========================================"
echo " EduMind - Deploy"
echo "========================================"

echo "[1/5] Baixando imagens..."
compose pull

# As migrations e o seeder rodam ANTES de subir o backend novo: ao iniciar, ele já consulta as tabelas (marca como
# erro as extrações interrompidas pelo reinício), e no primeiro deploy elas ainda não existem.
echo "[2/5] Executando migrations..."
compose run --rm --no-deps backend npm run db:migrate

echo "[3/5] Executando seeders (o administrador inicial só é criado se não existir nenhum)..."
compose run --rm --no-deps backend npm run db:seed

echo "[4/5] Atualizando containers..."
compose up -d --remove-orphans

echo "[5/5] Limpando imagens antigas..."
docker image prune -f

echo "========================================"
echo " Deploy concluído com sucesso!"
echo "========================================"
