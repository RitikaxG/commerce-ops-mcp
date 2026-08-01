#!/usr/bin/env bash

set -Eeuo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${REPOSITORY_ROOT}/docker-compose.production.yml"
HTTP_PORT="${PHASE12_HTTP_PORT:-18080}"
HTTPS_PORT="${PHASE12_HTTPS_PORT:-18443}"
TEMP_DIRECTORY="$(mktemp -d "${TMPDIR:-/tmp}/commerce-ops-mcp-phase12.XXXXXX")"
ADMIN_ENV_FILE="${TEMP_DIRECTORY}/.env.admin"
RUNTIME_ENV_FILE="${TEMP_DIRECTORY}/.env.runtime"
COMPOSE_ENV_FILE="${TEMP_DIRECTORY}/.env.compose"
PROJECT_NAME="commerce-ops-mcp-phase12-local-$$"
IMAGE_TAG="phase12-local-$$"
STACK_STARTED=0

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command not found: $1" >&2
    exit 1
  fi
}

compose() {
  docker compose \
    --env-file "${COMPOSE_ENV_FILE}" \
    -f "${COMPOSE_FILE}" \
    "$@"
}

cleanup() {
  local status=$?
  trap - EXIT
  set +e

  if [[ ${status} -ne 0 && ${STACK_STARTED} -eq 1 ]]; then
    echo >&2
    echo "Phase 12 verification failed. Safe recent service logs:" >&2
    compose logs --since=15m --tail=200 api caddy postgres >&2
  fi

  if [[ ${STACK_STARTED} -eq 1 ]]; then
    compose down --volumes --remove-orphans >/dev/null 2>&1
  fi

  rm -rf "${TEMP_DIRECTORY}"
  exit "${status}"
}

trap cleanup EXIT

for command in docker openssl curl git; do
  require_command "${command}"
done

docker info >/dev/null

git -C "${REPOSITORY_ROOT}" check-ignore -q .env.local
git -C "${REPOSITORY_ROOT}" check-ignore -q .env.runtime
git -C "${REPOSITORY_ROOT}" check-ignore -q .env.admin
git -C "${REPOSITORY_ROOT}" check-ignore -q .env.compose

OWNER_PASSWORD="$(openssl rand -hex 32)"
DEMO_PASSWORD="$(openssl rand -hex 32)"
WORKFLOW_PASSWORD="$(openssl rand -hex 32)"
MCP_API_KEY="$(openssl rand -base64 48 | tr -d '\n')"

umask 077
cat > "${ADMIN_ENV_FILE}" <<EOF
POSTGRES_USER=postgres
POSTGRES_PASSWORD=${OWNER_PASSWORD}
POSTGRES_DB=commerce_ops
DATABASE_URL=postgresql://postgres:${OWNER_PASSWORD}@postgres:5432/commerce_ops
DEMO_DATABASE_URL=postgresql://commerce_demo:${DEMO_PASSWORD}@postgres:5432/commerce_ops
WORKFLOW_DATABASE_URL=postgresql://commerce_workflow:${WORKFLOW_PASSWORD}@postgres:5432/commerce_ops
EOF

cat > "${RUNTIME_ENV_FILE}" <<EOF
NODE_ENV=production
PORT=3000
MCP_ALLOWED_HOSTS=127.0.0.1,localhost,caddy
MCP_API_KEY=${MCP_API_KEY}
WORKFLOW_DATABASE_URL=postgresql://commerce_workflow:${WORKFLOW_PASSWORD}@postgres:5432/commerce_ops
EOF

cat > "${COMPOSE_ENV_FILE}" <<EOF
COMPOSE_PROJECT_NAME=${PROJECT_NAME}
ADMIN_ENV_FILE=${ADMIN_ENV_FILE}
RUNTIME_ENV_FILE=${RUNTIME_ENV_FILE}
CADDY_SITE_ADDRESS=:80
CADDY_HTTP_PORT=${HTTP_PORT}
CADDY_HTTPS_PORT=${HTTPS_PORT}
IMAGE_TAG=${IMAGE_TAG}
EOF

chmod 600 "${ADMIN_ENV_FILE}" "${RUNTIME_ENV_FILE}" "${COMPOSE_ENV_FILE}"

cd "${REPOSITORY_ROOT}"

echo "[1/8] Validating the production Compose configuration"
compose config --quiet

echo "[2/8] Building the production API image"
compose build api admin

echo "[3/8] Starting PostgreSQL"
STACK_STARTED=1
compose up -d postgres

echo "[4/8] Applying migrations, roles, and approved synthetic data"
compose --profile admin run --rm admin bun run db:migrate
compose --profile admin run --rm admin bun run db:setup-access
compose --profile admin run --rm admin bun run db:seed
compose --profile admin run --rm admin bun run db:verify-access
compose --profile admin run --rm admin bun run db:verify-demo

echo "[5/8] Starting the authenticated API and Caddy edge"
compose up -d api caddy

HEALTH_URL="http://127.0.0.1:${HTTP_PORT}/health"
MCP_URL="http://127.0.0.1:${HTTP_PORT}/mcp"
HEALTH_BODY=""
for _attempt in $(seq 1 45); do
  HEALTH_BODY="$(curl --silent --show-error "${HEALTH_URL}" 2>/dev/null || true)"
  if [[ "${HEALTH_BODY}" == '{"status":"ok"}' ]]; then
    break
  fi
  sleep 2
done

if [[ "${HEALTH_BODY}" != '{"status":"ok"}' ]]; then
  echo "Health endpoint did not become ready: ${HEALTH_URL}" >&2
  exit 1
fi

echo "[6/8] Verifying public health and full /mcp bearer authentication"
INITIALIZE_BODY='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"phase12-local-verifier","version":"1.0.0"}}}'

MISSING_STATUS="$(curl --silent --output "${TEMP_DIRECTORY}/missing-token.json" --write-out '%{http_code}' \
  --request POST "${MCP_URL}" \
  --header 'Accept: application/json, text/event-stream' \
  --header 'Content-Type: application/json' \
  --data "${INITIALIZE_BODY}")"

if [[ "${MISSING_STATUS}" != "401" ]] || ! grep -q '"MCP_AUTH_REQUIRED"' "${TEMP_DIRECTORY}/missing-token.json"; then
  echo "Missing-token request did not return MCP_AUTH_REQUIRED" >&2
  exit 1
fi

INVALID_STATUS="$(curl --silent --output "${TEMP_DIRECTORY}/invalid-token.json" --write-out '%{http_code}' \
  --request POST "${MCP_URL}" \
  --header 'Accept: application/json, text/event-stream' \
  --header 'Authorization: Bearer incorrect-token' \
  --header 'Content-Type: application/json' \
  --data "${INITIALIZE_BODY}")"

if [[ "${INVALID_STATUS}" != "401" ]] || ! grep -q '"MCP_AUTH_INVALID"' "${TEMP_DIRECTORY}/invalid-token.json"; then
  echo "Invalid-token request did not return MCP_AUTH_INVALID" >&2
  exit 1
fi

echo "[7/8] Verifying runtime credential isolation and private service ports"
compose exec -T api sh -lc \
  'test -n "$WORKFLOW_DATABASE_URL" && test -n "$MCP_API_KEY" && test -z "$DATABASE_URL" && test -z "$DEMO_DATABASE_URL" && test -z "$MODEL_API_KEY"'

test -z "$(compose port api 3000 2>/dev/null || true)"
test -z "$(compose port postgres 5432 2>/dev/null || true)"

echo "[8/8] Running the provider-independent verifier through Caddy"
compose --profile admin run --rm \
  -e MCP_SERVER_URL=http://caddy/mcp \
  -e MCP_AUTH_BEARER_TOKEN="${MCP_API_KEY}" \
  admin bun run verify:hosted:mcp

cat <<EOF

Phase 12 local production verification: PASS

Verified:
- public GET /health
- bearer token required for every /mcp request
- invalid bearer token rejected
- authenticated connection and tool discovery
- all five approved tools
- all nine approved synthetic scenarios
- investigation, escalation, review-case read, and trace read
- commerceStateChanged=false
- API runtime receives no owner, demo, or model-provider credential
- API port 3000 and PostgreSQL port 5432 are not published
- no MODEL_API_KEY was required

The temporary stack, volumes, and generated credentials will now be removed.
EOF
