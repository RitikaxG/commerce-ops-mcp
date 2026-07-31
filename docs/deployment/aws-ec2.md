# Phase 12 AWS EC2 deployment

This guide deploys the accepted commerce-operations MCP to one always-on EC2 instance. It does not create AWS resources automatically and does not require AWS credentials inside the application environment.

## Deployment target

- Region: `ap-south-1` unless the repository owner selects another region
- AMI: Ubuntu Server 24.04 LTS
- Instance: `t3.small`
- Root storage: 20 GB gp3
- Static address: Elastic IP
- Public domain: `commerce-mcp.ritikaxg.co.in`
- Public endpoints:
  - `GET https://commerce-mcp.ritikaxg.co.in/health`
  - `POST https://commerce-mcp.ritikaxg.co.in/mcp`
- Containers: PostgreSQL 16, TypeScript API, Caddy

The application port `3000` and PostgreSQL port `5432` are internal Docker-network ports only.

## 1. Local secret-file safety

Run this from the repository root before creating local configuration:

```bash
git check-ignore -v .env.local
```

The command must report the `.gitignore` rule for `.env.local`. Never print an environment file, an Authorization header, a database URL, a provider key, or an SSH private key into a screenshot or terminal transcript.

## 2. Environment-variable boundaries

### Runtime API configuration

Store these values in `/opt/commerce-ops-mcp/.env.runtime` on EC2:

- `NODE_ENV=production`: enables production validation.
- `PORT=3000`: internal API port.
- `MCP_ALLOWED_HOSTS=commerce-mcp.ritikaxg.co.in`: preserves Host-header validation.
- `MCP_API_KEY`: protects only `/mcp` with a bearer token.
- `WORKFLOW_DATABASE_URL`: restricted `commerce_workflow` role used by the API.

The API container must not receive `DATABASE_URL`, `DEMO_DATABASE_URL`, or `MODEL_API_KEY`.

### Temporary migration and seed configuration

Store these values in `/opt/commerce-ops-mcp/.env.admin`:

- `POSTGRES_USER`: PostgreSQL schema owner used by the container bootstrap.
- `POSTGRES_PASSWORD`: schema-owner password.
- `POSTGRES_DB=commerce_ops`: database name.
- `DATABASE_URL`: schema-owner connection used for Prisma migrations and grants.
- `DEMO_DATABASE_URL`: `commerce_demo` connection used only to seed the nine synthetic scenarios.
- `WORKFLOW_DATABASE_URL`: restricted runtime-role connection used while configuring and verifying grants.

The admin file is read only by the PostgreSQL service and explicit one-off admin containers. It is never loaded by the running API.

### Local hosted-verification configuration

Keep these in an ignored local `.env.local`, not on EC2:

- `MCP_SERVER_URL=https://commerce-mcp.ritikaxg.co.in/mcp`
- `MCP_AUTH_BEARER_TOKEN`: the same value as EC2 `MCP_API_KEY`.
- `MODEL_PROVIDER=gemini`
- `MODEL_NAME=gemini-3.6-flash`
- `MODEL_API_KEY`: rotated Gemini key, required only for `verify:hosted:ai`.
- Existing bounded provider and timeout variables from `.env.example`.

## 3. EC2 and network creation

Do not perform these steps until the repository owner approves AWS deployment.

1. Select `ap-south-1`.
2. Create an EC2 key pair, or configure AWS Systems Manager Session Manager.
3. Create a security group with only:
   - TCP 80 from `0.0.0.0/0`.
   - TCP 443 from `0.0.0.0/0`.
   - TCP 22 from the repository owner's current public IP only, when SSH is used.
4. Launch Ubuntu 24.04 LTS on `t3.small` with a 20 GB gp3 root volume.
5. Allocate and associate an Elastic IP.
6. In GoDaddy DNS, create an `A` record for `commerce-mcp.ritikaxg.co.in` pointing to the Elastic IP.
7. Do not add security-group rules for ports 3000 or 5432.

Wait until public DNS resolves to the Elastic IP before expecting Caddy to obtain a public certificate.

## 4. Install Docker on Ubuntu 24.04

Connect through SSH or Session Manager and run the official Docker Engine installation flow for Ubuntu. After installation, verify:

```bash
docker --version
docker compose version
```

Enable Docker at boot:

```bash
sudo systemctl enable --now docker
```

Add the deployment user to the Docker group only when that access is acceptable, then start a new login session:

```bash
sudo usermod -aG docker "$USER"
```

## 5. Clone the Phase 12 commit

```bash
sudo install -d -m 0755 -o "$USER" -g "$USER" /opt/commerce-ops-mcp
git clone https://github.com/RitikaxG/commerce-ops-mcp.git /opt/commerce-ops-mcp
cd /opt/commerce-ops-mcp
git fetch origin
git checkout phase/12-aws-hosted-mcp
git pull --ff-only origin phase/12-aws-hosted-mcp
git rev-parse HEAD
```

Record the exact commit SHA in the Phase 12 evaluation report before deployment.

## 6. Generate secrets on EC2

Generate values on the server. Do not paste them into chat.

```bash
cd /opt/commerce-ops-mcp
umask 077
MCP_API_KEY="$(openssl rand -base64 48 | tr -d '\n')"
OWNER_PASSWORD="$(openssl rand -hex 32)"
DEMO_PASSWORD="$(openssl rand -hex 32)"
WORKFLOW_PASSWORD="$(openssl rand -hex 32)"
```

Create the runtime file:

```bash
cat > /opt/commerce-ops-mcp/.env.runtime <<EOF
NODE_ENV=production
PORT=3000
MCP_ALLOWED_HOSTS=commerce-mcp.ritikaxg.co.in
MCP_API_KEY=${MCP_API_KEY}
WORKFLOW_DATABASE_URL=postgresql://commerce_workflow:${WORKFLOW_PASSWORD}@postgres:5432/commerce_ops
EOF
```

Create the admin file:

```bash
cat > /opt/commerce-ops-mcp/.env.admin <<EOF
POSTGRES_USER=postgres
POSTGRES_PASSWORD=${OWNER_PASSWORD}
POSTGRES_DB=commerce_ops
DATABASE_URL=postgresql://postgres:${OWNER_PASSWORD}@postgres:5432/commerce_ops
DEMO_DATABASE_URL=postgresql://commerce_demo:${DEMO_PASSWORD}@postgres:5432/commerce_ops
WORKFLOW_DATABASE_URL=postgresql://commerce_workflow:${WORKFLOW_PASSWORD}@postgres:5432/commerce_ops
EOF
```

Create a Compose interpolation file. It contains paths and deployment metadata, not secret values:

```bash
DEPLOYED_SHA="$(git rev-parse --short=12 HEAD)"
cat > /opt/commerce-ops-mcp/.env.compose <<EOF
ADMIN_ENV_FILE=/opt/commerce-ops-mcp/.env.admin
RUNTIME_ENV_FILE=/opt/commerce-ops-mcp/.env.runtime
CADDY_SITE_ADDRESS=commerce-mcp.ritikaxg.co.in
IMAGE_TAG=${DEPLOYED_SHA}
EOF
```

Protect all files:

```bash
chmod 600 /opt/commerce-ops-mcp/.env.runtime
chmod 600 /opt/commerce-ops-mcp/.env.admin
chmod 600 /opt/commerce-ops-mcp/.env.compose
unset MCP_API_KEY OWNER_PASSWORD DEMO_PASSWORD WORKFLOW_PASSWORD
```

Do not regenerate the database-role passwords while reusing the existing PostgreSQL volume. Retain `.env.admin` securely for controlled container recreation and recovery; it is not exposed to the API container.

## 7. Build and initialize PostgreSQL explicitly

Set a reusable Compose command:

```bash
cd /opt/commerce-ops-mcp
COMPOSE="docker compose --env-file /opt/commerce-ops-mcp/.env.compose -f docker-compose.production.yml"
```

Build the application image and start only PostgreSQL:

```bash
$COMPOSE build api admin
$COMPOSE up -d postgres
$COMPOSE ps
```

Run migrations once:

```bash
$COMPOSE --profile admin run --rm admin bun run db:migrate
```

Create and verify the restricted roles once:

```bash
$COMPOSE --profile admin run --rm admin bun run db:setup-access
$COMPOSE --profile admin run --rm admin bun run db:verify-access
```

Seed exactly the existing nine synthetic scenarios:

```bash
$COMPOSE --profile admin run --rm admin bun run db:seed
$COMPOSE --profile admin run --rm admin bun run db:verify-demo
```

Do not put migration, role creation, reset, or seeding commands in API startup. Do not expose reset through MCP.

## 8. Start the production services

```bash
$COMPOSE up -d api caddy
$COMPOSE ps
```

Caddy publishes only ports 80 and 443. The API and PostgreSQL services use the private `backend` Docker network.

## 9. Verify health and authenticated MCP

Health is public and model-independent:

```bash
curl --fail --silent --show-error \
  https://commerce-mcp.ritikaxg.co.in/health
```

Expected response:

```json
{"status":"ok"}
```

Verify the protected MCP from a trusted local machine, using an ignored `.env.local`:

```bash
bun --env-file=.env.local run verify:hosted:mcp
```

This command performs no Gemini request and does not start a local API. It verifies health, MCP initialization, exactly five tool contracts, the nine-case catalog, the accepted `ORD-1042` result, escalation, review read, trace read, unknown-order safety, mutation-tool absence, and `commerceStateChanged=false`.

## 10. MCP Inspector demonstration

Use the current MCP Inspector v2 release from a trusted local machine:

```bash
npx @modelcontextprotocol/inspector@latest
```

In the Inspector:

1. Select Streamable HTTP.
2. Enter `https://commerce-mcp.ritikaxg.co.in/mcp`.
3. Add the bearer token through the Inspector token/header control. Never include it in a screenshot.
4. Connect and confirm exactly five tools.
5. Call `list_demo_cases`.
6. Call `investigate_order_exception` for `ORD-1042` with unique `clientRequestId` and `idempotencyKey` values.
7. Call `create_human_review_escalation` with the returned investigation ID and a unique idempotency key.
8. Call `get_review_case` with the returned review-case ID.
9. Call `get_investigation_trace` with the investigation ID.
10. Record only redacted evidence showing `commerceStateChanged=false`.

A CLI catalog check is also possible without exposing the token in shell history by reading it from a protected local environment variable:

```bash
npx @modelcontextprotocol/inspector@latest --cli \
  https://commerce-mcp.ritikaxg.co.in/mcp \
  --transport http \
  --method tools/list \
  --header "Authorization: Bearer ${MCP_AUTH_BEARER_TOKEN}"
```

## 11. MCP-compatible AI-client demonstration

Keep the Gemini key on the trusted local client only. Configure `.env.local` with the hosted MCP URL, bearer token, provider settings, and rotated Gemini key, then run:

```bash
bun --env-file=.env.local run verify:hosted:ai
```

The command runs only the existing nine approved natural-language investigations. Provider requests remain sequential with bounded retry behavior. A `RATE_LIMITED` or `QUOTA_EXHAUSTED` result is reported as a model-provider failure and does not classify the already-verified MCP as unavailable.

For a representative interactive demonstration:

```bash
bun --env-file=.env.local run agent:ask -- \
  "Investigate ORD-1042 and explain the grounded next step."
```

Confirm that the final result includes `commerceStateChanged=false`.

## 12. Seven-day availability and operations

Do not schedule an automatic shutdown during the client review window. Record these fields in `docs/evaluations/phase-12-hosted-mcp.md`:

- deployment date and time;
- intended shutdown date and time, at least seven complete days later;
- AWS region;
- deployed commit SHA;
- health URL;
- MCP URL;
- last successful verification timestamp.

Container restart policies are `unless-stopped`. PostgreSQL and Caddy state use named volumes.

Health command:

```bash
curl --fail --silent --show-error \
  https://commerce-mcp.ritikaxg.co.in/health
```

Service status:

```bash
$COMPOSE ps
```

Safe recent logs, without printing environment files:

```bash
$COMPOSE logs --since=30m --tail=200 api caddy postgres
```

Manual recovery after an EC2 or Docker restart:

```bash
sudo systemctl start docker
cd /opt/commerce-ops-mcp
COMPOSE="docker compose --env-file /opt/commerce-ops-mcp/.env.compose -f docker-compose.production.yml"
$COMPOSE up -d postgres api caddy
$COMPOSE ps
```

Enable EC2 status-check monitoring in AWS and investigate any failed instance or system status check. The README and report document a planned review window, not an SLA.

## 13. Updating the deployment

Only deploy a reviewed commit:

```bash
cd /opt/commerce-ops-mcp
git fetch origin
git checkout phase/12-aws-hosted-mcp
git pull --ff-only origin phase/12-aws-hosted-mcp
git rev-parse HEAD
COMPOSE="docker compose --env-file /opt/commerce-ops-mcp/.env.compose -f docker-compose.production.yml"
$COMPOSE build api admin
$COMPOSE --profile admin run --rm admin bun run db:migrate
$COMPOSE up -d api caddy
$COMPOSE ps
```

Do not run demo reset during the seven-day review window unless the repository owner explicitly decides to clear the synthetic workflow evidence.
