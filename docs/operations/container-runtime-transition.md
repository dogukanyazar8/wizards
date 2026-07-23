# Container runtime transition

## Scope

Compose runtime images are fixed to an explicit release tag and immutable registry digest. Dependabot monitors the Compose file; a version update still requires this validation before production use.

| Service    | Runtime image                                                                                            |
| ---------- | -------------------------------------------------------------------------------------------------------- |
| PostgreSQL | `postgres:18.4-alpine@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15`           |
| Redis      | `redis:8.8.0-alpine@sha256:9d317178eceac8454a2284a9e6df2466b93c745529947f0cd42a0fa9609d7005`             |
| ClamAV     | `clamav/clamav:1.5.2@sha256:1b6443c4a7b456baa1abfaf9796815f8d21e2fb558dbaed5b682fd4552d8b0c3`            |
| LiveKit    | `livekit/livekit-server:v1.13.4@sha256:189f7c81b704a36642bc5c7e2d3e1ae83744627c11978a23a251bf19fbec64e0` |

The digests are multi-platform manifest-list digests, verified with `docker buildx imagetools inspect`.

## Upgrade constraints

- PostgreSQL 18.4 is the current supported PostgreSQL 18 minor. A major PostgreSQL upgrade requires a logical dump/reload or `pg_upgrade`; never mount a PostgreSQL 16 data directory under PostgreSQL 18. Compose uses a new `postgres18_data` volume for that reason.
- Redis 8.8 is a supported GA line. Redis 8 changed its license model to RSALv2, SSPLv1, or AGPLv3. Legal approval is a production gate; this local verification does not grant that approval.
- ClamAV 1.5.2 contains the fix for CVE-2026-20031. Its release notes require no Compose flag change for this service.
- LiveKit v1.13.4 is the current release. The Compose service remains `--dev`; production TURN configuration must continue to use the LiveKit-supported credential lifecycle and is not enabled here.

Sources: [PostgreSQL versioning](https://www.postgresql.org/support/versioning/), [Redis version management](https://redis.io/docs/latest/operate/oss_and_stack/install/version-mgmt/), [Redis licensing](https://redis.io/legal/licenses/), [ClamAV 1.5.2](https://github.com/Cisco-Talos/clamav/releases/tag/clamav-1.5.2), and [LiveKit v1.13.4](https://github.com/livekit/livekit/releases/tag/v1.13.4).

## Disposable local verification

Run only from a clean local checkout. This uses distinct containers, ports, and volumes; it does not read or write a production database.

```powershell
$compose = @("-p", "wizards-runtime-smoke", "-f", "docker-compose.yml", "-f", "docker-compose.runtime-smoke.yml")
docker compose @compose config
docker compose @compose up -d postgres redis
docker compose @compose exec -T postgres pg_isready -U wizards -d wizards
docker compose @compose exec -T redis redis-cli ping
docker compose @compose exec -T redis redis-cli SET runtime-smoke ok
docker compose @compose exec -T redis redis-cli GET runtime-smoke

$env:DATABASE_URL = "postgresql://wizards:wizards@127.0.0.1:55432/wizards"
pnpm.cmd --filter @wizards/db db:migrate:deploy
pnpm.cmd --filter @wizards/db exec prisma migrate status --schema prisma/schema.prisma
pnpm.cmd --filter @wizards/db db:seed

$dump = Join-Path $env:TEMP "wizards-runtime-smoke.dump"
docker compose @compose exec -T postgres sh -c "pg_dump -U wizards -Fc -f /tmp/wizards-runtime-smoke.dump wizards"
docker cp wizards-runtime-smoke-postgres:/tmp/wizards-runtime-smoke.dump $dump

$env:E2E_TEST_MODE = "true"
$env:E2E_DATABASE_URL = "postgresql://wizards:wizards@127.0.0.1:55432/whispr_e2e"
$env:DATABASE_URL = $env:E2E_DATABASE_URL
$env:REDIS_URL = "redis://127.0.0.1:56379"
$env:E2E_BASE_URL = "http://127.0.0.1:3000"
$env:APP_URL = $env:E2E_BASE_URL
$env:AUTH_URL = $env:E2E_BASE_URL
$env:NEXTAUTH_URL = $env:E2E_BASE_URL
$env:AUTH_SECRET = "e2e-$([guid]::NewGuid().ToString('N'))$([guid]::NewGuid().ToString('N'))"
$env:NEXTAUTH_SECRET = $env:AUTH_SECRET
$env:E2E_TEST_PASSWORD = "E2e!A1$([guid]::NewGuid().ToString('N'))"
pnpm.cmd --filter @wizards/web e2e:api
```

## Production transition and rollback

Do not point these commands at production. Before a planned production change, take and independently verify a logical PostgreSQL 16 dump. Provision PostgreSQL 18 with a new empty volume, restore that dump, run Prisma migration status, application smoke, and the approved production health checks.

### Existing migration gate

On a fresh disposable database, the current migration chain fails at `20260422000000_add_fulltext_search_indexes` with `P3018` / `42P01` because `Message` is not created by any earlier checked-in migration. The same failure reproduces on PostgreSQL 16.14 and 18.4, so it is not a PostgreSQL 18 regression. Repair the missing baseline in a separate migration-history checkpoint before a production transition. `prisma db push` was used only to test the current schema against disposable runtimes; never use it as a production migration workaround.

Rollback is a configuration revert plus restore of the pre-upgrade logical dump into a new PostgreSQL 16.14 volume using `postgres:16.14-alpine@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777`. Never attach a PostgreSQL 18 data directory to PostgreSQL 16. Redis rollback requires preserving the pre-change Redis volume or snapshot and returning to the previous pinned Redis image.

After an approved disposable test, remove only its explicit resources:

```powershell
docker compose -p wizards-runtime-smoke -f docker-compose.yml -f docker-compose.runtime-smoke.yml down -v
```
