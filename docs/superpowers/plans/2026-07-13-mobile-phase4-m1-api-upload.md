# Mobile Phase 4 M1 API and Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bearer-authenticated mobile server-management APIs and a purpose-bound, single-use UploadThing claim flow without changing web behavior or widening authorization.

**Architecture:** Strict mobile Zod contracts feed thin dependency-injected Next route logic that delegates to the existing workspace services. UploadThing completion is verified server-side and persisted as a short-lived `MobileMediaUpload`; an atomic compare-and-set claim updates the profile avatar or server icon while existing service-layer authorization remains authoritative.

**Tech Stack:** TypeScript, Next.js 15 App Router, Zod, Prisma 5/PostgreSQL, UploadThing 7, Sharp, Redis rate limits, Socket.IO, Node test runner, pnpm.

## Global Constraints

- Work directly on `uat`; create no branch or worktree.
- The final history has exactly three Phase 4 commits. M1 amends the existing local `feat(mobile-api): add server management and upload endpoints` commit; no task-level commits are allowed.
- Authenticate and rate-limit before parsing request bodies.
- Mobile request schemas never accept `iconUrl`, `avatarUrl`, storage keys, permission bitsets, or arbitrary remote URLs.
- Mobile only assigns/removes existing roles. It does not expose role CRUD or a permission matrix.
- Existing `updateWorkspaceMemberRoles` hierarchy, owner protection, and assignability checks remain authoritative and unchanged in meaning.
- Uploads accept only JPEG, PNG, or WebP; maximum encoded size is 4 MiB, each dimension is at most 4096 px, and decoded area is at most 16,000,000 pixels.
- Upload claims expire after 15 minutes and exactly one concurrent claimant may succeed.
- Do not log bearer tokens, invite codes, presigned data, local media URIs, storage keys, or raw upstream error bodies.
- `railway.toml` remains the deployment authority: its `preDeployCommand` runs `pnpm --filter @wizards/db db:migrate:deploy` before new code receives traffic.
- Keep `graphify-out`, `artifacts`, `.env.maestro`, and `*.tsbuildinfo` outside the milestone stage.

---

### Task 1: Define strict mobile workspace and media contracts

**Files:**

- Create: `packages/types/src/mobile-workspace-management.ts`
- Create: `packages/types/src/mobile-workspace-management.test.ts`
- Modify: `packages/types/src/workspace.ts`
- Modify: `packages/types/src/workspace.test.ts`
- Modify: `packages/types/src/index.ts`

**Interfaces:**

- Consumes: existing `CreateServerSchema`, `UpdateServerSchema`, `DeleteServerSchema`, `CreateCategorySchema`, `UpdateCategorySchema`, `CreateChannelSchema`, `UpdateChannelSchema`, `CreateInviteSchema`, and `MobileWorkspaceServerDetailResponseSchema`.
- Produces: all request/response schemas used by M1 routes and the M2/M3 mobile clients.

The public capability shape is fixed:

```ts
export type MobileServerCapabilities = {
  canClearHistory: boolean;
  canDeleteServer: boolean;
  canKickMembers: boolean;
  canManageChannels: boolean;
  canManageInvites: boolean;
  canManageRoles: boolean;
  canManageServer: boolean;
  canUploadServerIcon: boolean;
};
```

The public media shapes are fixed:

```ts
export type MobileMediaUploadIntent =
  | { purpose: "profile-avatar" }
  | { purpose: "server-icon"; targetServerId: string };

export type MobileMediaUploadCompletionResponse = {
  claimId: string;
  expiresAt: string;
  purpose: "profile-avatar" | "server-icon";
  targetServerId: string | null;
};

export type MobileMediaClaimResponse =
  | {
      claimId: string;
      claimedAt: string;
      profile: {
        avatarUrl: string;
        customStatus: string | null;
        displayName: string | null;
        id: string;
        status: "ONLINE" | "IDLE" | "DND" | "OFFLINE";
        twoFactorEnabled: boolean;
        username: string;
      };
      purpose: "profile-avatar";
    }
  | {
      claimId: string;
      claimedAt: string;
      purpose: "server-icon";
      server: { iconUrl: string; id: string };
    };
```

- [ ] **Step 1: Write schema tests for accepted and rejected boundaries**

```ts
assert.equal(
  MobileServerCreateRequestSchema.safeParse({
    iconUrl: "https://attacker.example/icon.png",
    name: "Whispr Guild",
  }).success,
  false,
);
assert.equal(MobileMediaUploadIntentSchema.safeParse({ purpose: "server-icon" }).success, false);
assert.equal(
  MobileMediaClaimRequestSchema.safeParse({ claimId: "claim-1", url: "https://x.test/a" }).success,
  false,
);
assert.equal(
  MobileMemberRolesUpdateRequestSchema.safeParse({
    roleIds: Array.from({ length: 26 }, (_, i) => `r-${i}`),
  }).success,
  false,
);
```

Cover strict unknown-key rejection, 128-character bounded ids, create/update server field limits inherited from shared workspace schemas, invite-code regex `^[A-Za-z0-9_-]{1,96}$`, member limit `1..100`, unique role ids with maximum 25, non-throwing HTTPS-only share URL validation, HTTPS-only profile-avatar/server-icon claim URLs, and media response unions that never contain a storage key. Also cover every path-parameter schema independently, reject an overlong `categoryId`, `channelId`, or individual `roleId`, and prove that mobile update schemas retain the existing non-empty-update refinements after removing disallowed media URL fields. For `MobileServerMemberSchema.roleIds`, prove duplicate and overlong ids are rejected, the array is bounded to 25, and the schema preserves every supplied current non-default id without truncation. Task 6 owns the actual raw-role-to-mobile mapping test because that is where `authorizationRoles` and `isDefault` exist.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
corepack pnpm --filter @wizards/types exec node --import tsx --test src/mobile-workspace-management.test.ts
```

Expected: FAIL because `mobile-workspace-management.ts` and its exports do not exist.

- [ ] **Step 3: Implement the exact schema surface**

Create and export these strict schemas and their inferred types:

```ts
MobileMediaUploadPurposeSchema;
MobileMediaUploadContentTypeSchema;
MobileMediaUploadIntentSchema;
MobileMediaUploadCompletionResponseSchema;
MobileMediaClaimRequestSchema;
MobileMediaClaimResponseSchema;
MobileServerCapabilitiesSchema;
MobileServerIdParamsSchema;
MobileServerCategoryParamsSchema;
MobileServerChannelParamsSchema;
MobileServerMemberParamsSchema;
MobileChannelIdParamsSchema;
MobileManagedWorkspaceServerDetailResponseSchema;
MobileServerCreateRequestSchema;
MobileServerCreateResponseSchema;
MobileServerJoinRequestSchema;
MobileServerJoinResponseSchema;
MobileServerUpdateRequestSchema;
MobileServerDeleteRequestSchema;
MobileServerInviteCreateRequestSchema;
MobileServerInviteSchema;
MobileServerInviteCreateResponseSchema;
MobileServerInvitesResponseSchema;
MobileCategoryCreateRequestSchema;
MobileCategoryCreateResponseSchema;
MobileCategoryUpdateRequestSchema;
MobileChannelCreateRequestSchema;
MobileChannelCreateResponseSchema;
MobileChannelUpdateRequestSchema;
MobileServerMembersQuerySchema;
MobileServerMemberActionsSchema;
MobileServerMemberSchema;
MobileServerMembersResponseSchema;
MobileAssignableRoleSchema;
MobileAssignableRolesResponseSchema;
MobileMemberRolesUpdateRequestSchema;
MobileMutationSuccessResponseSchema;
MobileChannelHistoryClearResponseSchema;
```

`MobileServerCreateRequestSchema` is `CreateServerSchema.omit({ iconUrl: true }).strict()`. Do not
call `.omit()` or `.strict()` on `UpdateServerSchema` or `UpdateChannelSchema`: both are
`ZodEffects` after `.refine()`. First refactor `workspace.ts` without changing public behavior:

Extract each existing `z.object` initializer verbatim into exported
`UpdateServerFieldsSchema` and `UpdateChannelFieldsSchema` constants, then define the existing
`UpdateServerSchema` and `UpdateChannelSchema` by applying their current refinement predicates and
unchanged `validation.form.atLeastOne` message to those base objects.

Add acceptance/rejection fixtures for both newly exported base schemas to `workspace.test.ts`.
Build `MobileServerUpdateRequestSchema` from
`UpdateServerFieldsSchema.omit({ iconUrl: true }).strict().refine(hasMobileServerUpdate, { message:
"validation.form.atLeastOne" })` and `MobileChannelUpdateRequestSchema` from
`UpdateChannelFieldsSchema.strict().refine(hasMobileChannelUpdate, { message:
"validation.form.atLeastOne" })`. The two local predicates explicitly test the same allowed fields
as their workspace counterparts (minus `iconUrl` for mobile server update), preserving non-empty
update behavior exactly without importing private predicates.

Define a private `MobileResourceIdSchema = z.string().trim().min(1).max(128)` and use it in all
five path-parameter schemas and to override otherwise-unbounded `categoryId`, `channelId`, and each
`roleId` inherited from workspace inputs. Category/channel/invite schemas reuse the remaining
bounded shared fields and call `.strict()` only while they are `ZodObject` instances.

Define the public member contract exactly as:

```ts
export const MobileServerMemberSchema = WorkspaceMemberSchema.extend({
  actions: MobileServerMemberActionsSchema,
  roleIds: z
    .array(MobileResourceIdSchema)
    .max(25)
    .refine((roleIds) => new Set(roleIds).size === roleIds.length, {
      message: "Role ids must be unique",
    }),
}).strict();
```

`roleIds` is the complete server-produced set of the member's current roles filtered only by
`!isDefault`; it therefore retains currently attached managed role ids. It is not the assignable
role catalog. The mobile UI may render toggles only for ids returned by
`MobileAssignableRolesResponseSchema`, but it carries the complete `member.roleIds` set through a
full-replacement update so unrelated current roles are never silently removed. If persisted data
exceeds the 25-id contract, response parsing fails with a bounded server error; never truncate the
set.

Invite responses expose `{ id, channelId, createdAt, createdByDisplayName, expiresAt, maxUses,
uses, shareUrl }` and omit `code`.

- [ ] **Step 4: Run focused and full shared-type verification**

Run:

```powershell
corepack pnpm --filter @wizards/types exec node --import tsx --test src/mobile-workspace-management.test.ts
corepack pnpm --filter @wizards/types typecheck
corepack pnpm --filter @wizards/types test
```

Expected: all commands exit 0.

### Task 2: Add the additive `MobileMediaUpload` migration contract

**Files:**

- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/20260713120000_add_mobile_media_upload_claims/migration.sql`
- Create: `apps/web/src/lib/mobile/mobile-media-migration.test.ts`

**Interfaces:**

- Produces: a durable replay/cleanup record used by UploadThing completion and claim services.
- Deliberately stores `ownerId` and `targetServerId` without foreign keys so cleanup records survive user/server deletion until external storage deletion succeeds.

The Prisma model is fixed:

```prisma
enum MobileMediaUploadPurpose {
  PROFILE_AVATAR
  SERVER_ICON
}

model MobileMediaUpload {
  id                   String                   @id @default(uuid())
  ownerId              String
  purpose              MobileMediaUploadPurpose
  targetServerId       String?
  storageKey           String                   @unique
  url                  String
  contentType          String
  sizeBytes            Int
  width                Int
  height               Int
  createdAt            DateTime                 @default(now())
  expiresAt            DateTime
  claimedAt            DateTime?
  cleanupAfter         DateTime?
  cleanupLastAttemptAt DateTime?
  cleanupAttempts      Int                      @default(0)
  storageDeletedAt     DateTime?

  @@index([ownerId, purpose, targetServerId])
  @@index([expiresAt, claimedAt])
  @@index([cleanupAfter, storageDeletedAt])
}
```

- [ ] **Step 1: Write a file-based migration RED test**

Assert that the SQL contains the enum, table, unique storage-key constraint, three indexes, and
named checks enforcing purpose/target consistency, positive sizes, `sizeBytes <= 4194304`, width
and height `<= 4096`, `width * height <= 16000000`, and `expiresAt > createdAt`.

- [ ] **Step 2: Run the migration contract and verify RED**

```powershell
corepack pnpm --filter @wizards/web exec node --import tsx --test --test-force-exit src/lib/mobile/mobile-media-migration.test.ts
```

Expected: FAIL because the migration is absent.

- [ ] **Step 3: Add the Prisma enum/model and explicit SQL migration**

Use check-constraint names:

```sql
"MobileMediaUpload_purpose_target_check"
"MobileMediaUpload_size_check"
"MobileMediaUpload_dimensions_check"
"MobileMediaUpload_expiry_check"
```

The migration is additive only; it does not alter `Attachment`, `User`, `Server`, or existing UploadThing rows.

- [ ] **Step 4: Validate schema generation and migration text**

```powershell
corepack pnpm --filter @wizards/db exec prisma validate
corepack pnpm --filter @wizards/db db:generate
corepack pnpm --filter @wizards/web exec node --import tsx --test --test-force-exit src/lib/mobile/mobile-media-migration.test.ts
```

Expected: Prisma validation/generation and the contract test pass.

### Task 3: Verify uploaded image bytes without opening SSRF

**Files:**

- Create: `apps/web/src/lib/mobile/mobile-media-verifier.ts`
- Create: `apps/web/src/lib/mobile/mobile-media-verifier.test.ts`
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Consumes: trusted UploadThing callback fields and `extractUploadThingFileKey`.
- Produces:

```ts
export type VerifiedMobileImage = {
  contentType: "image/jpeg" | "image/png" | "image/webp";
  height: number;
  sizeBytes: number;
  storageKey: string;
  url: string;
  width: number;
};

export async function verifyMobileUploadedImage(
  input: { key: string; size: number; type: string; url: string },
  dependencies?: MobileImageVerifierDependencies,
): Promise<VerifiedMobileImage>;
```

- [ ] **Step 1: Add Sharp as an explicit server dependency**

```powershell
corepack pnpm --filter @wizards/web add sharp@0.34.5
```

Expected: only `apps/web/package.json` and `pnpm-lock.yaml` change; no mobile/native package changes.

- [ ] **Step 2: Write verifier RED tests**

Cover allowed UploadThing hosts (`utfs.io`, `ufs.sh`, subdomains of `ufs.sh`, `uploadthing.com`, and subdomains of `uploadthing.com`), callback key equality, HTTPS, `redirect: "error"`, 5-second timeout, Content-Length rejection, streamed byte overflow, corrupt or truncated pixel data that still has a readable header, a corrupt later frame in an otherwise readable animated WebP, MIME/signature mismatch, absent or generic response Content-Type, conflicting specific response Content-Type, 4096-pixel edge limit, 16-MP decoded area, and a valid 1x1 PNG.

The fake fetch response must expose chunks so the overflow test proves the implementation stops after 4 MiB plus one byte rather than buffering unbounded input.

- [ ] **Step 3: Run verifier tests and verify RED**

```powershell
corepack pnpm --filter @wizards/web exec node --import tsx --test --test-force-exit src/lib/mobile/mobile-media-verifier.test.ts
```

Expected: FAIL because `verifyMobileUploadedImage` does not exist.

- [ ] **Step 4: Implement bounded fetch and Sharp metadata validation**

Use `AbortSignal.timeout(5_000)`, `redirect: "error"`, a 4-MiB chunk accumulator, and both metadata
inspection and a forced full decode:

```ts
const options = {
  failOn: "error",
  limitInputPixels: 16_000_000,
} as const;
const metadata = await sharp(buffer, options).metadata();
await sharp(buffer, options).stats();
```

`metadata()` alone is insufficient because it can accept a readable header with truncated/corrupt
pixel data; `stats()` or an equivalent bounded full-pixel decode is mandatory. Because mobile
avatars and server icons are static images, reject `metadata.pages > 1` before accepting the upload;
the default Sharp `stats()` call may decode only frame zero and must never be used to claim a
multi-frame WebP. Map Sharp formats
`jpeg`, `png`, and `webp` to the three allowed MIME values and require equality with callback MIME.
If the fetch response supplies a specific image Content-Type, require it to match too; an absent
header or `application/octet-stream` is not authoritative and must not reject an otherwise valid
decoded image. All other results throw bounded `ApiError` codes such as `UPLOAD_IMAGE_INVALID`,
`UPLOAD_TOO_LARGE`, and `UPLOAD_SOURCE_INVALID`.

- [ ] **Step 5: Run verifier and web typecheck GREEN**

```powershell
corepack pnpm --filter @wizards/web exec node --import tsx --test --test-force-exit src/lib/mobile/mobile-media-verifier.test.ts
corepack pnpm --filter @wizards/web typecheck
```

Expected: both commands exit 0.

### Task 4: Persist, atomically claim, and clean mobile media

**Files:**

- Create: `apps/web/src/lib/mobile/mobile-media-upload-service.ts`
- Create: `apps/web/src/lib/mobile/mobile-media-upload-service.test.ts`
- Modify: `apps/web/src/lib/workspace/access-context.ts`
- Create: `apps/web/src/lib/workspace/access-context.test.ts`
- Modify: `apps/web/src/lib/workspace/server-service.ts`
- Modify: `apps/web/src/lib/workspace/service.test.ts`
- Modify: `apps/web/src/lib/account/privacy-service.ts`
- Modify: `apps/web/src/lib/account/privacy-service.test.ts`
- Modify: `apps/web/src/lib/outbox/worker.ts`
- Modify: `apps/web/src/lib/outbox/worker.test.ts`

**Interfaces:**

```ts
export async function recordVerifiedMobileMediaUpload(
  input: {
    image: VerifiedMobileImage;
    ownerId: string;
    purpose: "profile-avatar" | "server-icon";
    targetServerId: string | null;
  },
  dependencies?: MobileMediaRecordDependencies,
): Promise<MobileMediaUploadCompletionResponse>;

export async function claimMobileMediaUpload(
  userId: string,
  input: { claimId: string },
  dependencies?: MobileMediaClaimDependencies,
): Promise<MobileMediaClaimResponse>;

export async function cleanupMobileMediaUploads(
  options?: { limit?: number; now?: Date },
  dependencies?: MobileMediaCleanupDependencies,
): Promise<{ deleted: number; failed: number }>;

export async function runOpportunisticMobileMediaCleanup(
  dependencies?: MobileMediaOpportunisticCleanupDependencies,
): Promise<void>;

export function getAccessContextWithClient(
  client: Pick<Prisma.TransactionClient, "serverBan" | "serverMember">,
  userId: string,
  serverId: string,
): Promise<AccessContext>;
```

- [ ] **Step 1: Add transaction-aware access lookup with its own RED/GREEN cycle**

Create `access-context.test.ts` first. Prove a transaction-compatible client is used for both
membership and ban lookup, banned/missing-member behavior is unchanged, and the existing global
`getAccessContext(userId, serverId)` remains a wrapper. Run the test and observe RED before adding
`getAccessContextWithClient`; then implement only that helper and rerun GREEN:

```powershell
corepack pnpm --filter @wizards/web exec node --import tsx --test --test-force-exit src/lib/workspace/access-context.test.ts
```

- [ ] **Step 2: Record verified callbacks with an isolated RED/GREEN cycle**

Write only the record-path tests first: 15-minute expiry, `cleanupAfter = expiresAt`, storage-key
uniqueness, provider retry returning the original claim id, and a retry whose immutable
owner/purpose/target/URL/MIME/size/dimensions differ being rejected rather than mutating or reviving
the existing record. Run and observe RED:

```powershell
corepack pnpm --filter @wizards/web exec node --import tsx --test --test-force-exit `
  --test-name-pattern "record verified mobile media" `
  src/lib/mobile/mobile-media-upload-service.test.ts
```

Implement an idempotent upsert keyed by `storageKey` with an empty update. Never extend expiry,
clear deletion state, or mint a new id on retry. Compare the returned immutable fields with the
verified callback before returning the parsed completion response. Rerun the same command GREEN.

- [ ] **Step 3: Claim with an isolated RED/GREEN transaction cycle**

Add claim tests first for wrong owner, expired/used/deleted claim, malformed purpose/target state,
revoked `MANAGE_SERVER`, CAS count zero, two concurrent claims with exactly one success, rollback
after target update failure, superseded-image scheduling, and no socket emit before commit. Observe
RED with:

```powershell
corepack pnpm --filter @wizards/web exec node --import tsx --test --test-force-exit `
  --test-name-pattern "claim mobile media" `
  src/lib/mobile/mobile-media-upload-service.test.ts
```

Inside one interactive Prisma transaction, read and validate owner, purpose, target, expiry, unused
state, and storage deletion state. For a server icon, re-run `MANAGE_SERVER` authorization through
`getAccessContextWithClient(tx, userId, upload.targetServerId)`. Then perform the compare-and-set:

```ts
const claimed = await tx.mobileMediaUpload.updateMany({
  data: { claimedAt: now, cleanupAfter: null },
  where: {
    claimedAt: null,
    expiresAt: { gt: now },
    id: input.claimId,
    ownerId: userId,
    storageDeletedAt: null,
  },
});
if (claimed.count !== 1) {
  throw new ApiError("Upload claim is invalid or expired", 409, "UPLOAD_CLAIM_UNAVAILABLE");
}
```

The same transaction updates only the authenticated user's avatar or the authorized target server,
and schedules a prior object only when a prior `MobileMediaUpload` row proves ownership and matching
purpose/target. Return the post-update, DB-authoritative profile/server DTO. Emit profile/server
socket updates only after commit and rerun the claim tests GREEN.

- [ ] **Step 4: Implement retryable cleanup with an isolated RED/GREEN cycle**

Write cleanup tests first for `cleanupAfter <= now`, a hard maximum batch of 25, no external delete
inside a DB transaction, successful deletion setting `storageDeletedAt`, failed deletion retaining
the row and incrementing `cleanupAttempts`, and redacted logging. Observe RED:

```powershell
corepack pnpm --filter @wizards/web exec node --import tsx --test --test-force-exit `
  --test-name-pattern "cleanup mobile media" `
  src/lib/mobile/mobile-media-upload-service.test.ts
```

Implement `cleanupMobileMediaUploads`. Add `runOpportunisticMobileMediaCleanup` as a best-effort,
redacted wrapper that awaits a timeout-bounded `limit: 1` cleanup call and swallows only after
logging through the existing scrubbed logger. Do not launch an unobserved promise: request/runtime
shutdown may discard it and an unhandled rejection may escape. Rerun the cleanup tests GREEN.

- [ ] **Step 5: Preserve deletion and worker lifecycle with an integration RED/GREEN cycle**

Write the server deletion, account anonymization, and worker tests before changing production code.
Before deleting a server, mark non-deleted `SERVER_ICON` rows for that `targetServerId` with
`cleanupAfter = now` in the same database transaction as the server deletion. Preserve all current
socket/cache behavior after commit. Account anonymization schedules every non-deleted
`PROFILE_AVATAR` row owned by the user plus expired unclaimed uploads, while leaving active icons
belonging to surviving servers intact; external UploadThing deletion remains outside the account
transaction.

Inject `cleanupMobileMediaUploads` into the existing hourly outbox cleanup block. Railway currently
starts the web service with `WHISPR_OUTBOX_WORKER=false`, so UAT must not rely on that process:
await `runOpportunisticMobileMediaCleanup` at both the authenticated upload boundary and after a
successful claim commit. This gives newly superseded media an immediate bounded attempt and lets a
later authenticated upload retry expired/failed cleanup. Tests must prove each opportunistic call
is awaited, bounded, best-effort, and cannot turn an otherwise authorized upload/claim into a 500.

Run the integration tests RED, make the minimum lifecycle changes, then rerun GREEN:

```powershell
corepack pnpm --filter @wizards/web exec node --import tsx --test --test-force-exit `
  src/lib/workspace/service.test.ts `
  src/lib/account/privacy-service.test.ts `
  src/lib/outbox/worker.test.ts
```

- [ ] **Step 6: Run the complete focused service group GREEN**

```powershell
corepack pnpm --filter @wizards/web exec node --import tsx --test --test-force-exit `
  src/lib/mobile/mobile-media-upload-service.test.ts `
  src/lib/workspace/access-context.test.ts `
  src/lib/workspace/service.test.ts `
  src/lib/account/privacy-service.test.ts `
  src/lib/outbox/worker.test.ts
```

Expected: all tests pass and no storage deletion occurs inside a database transaction.

### Task 5: Add the bearer-authenticated UploadThing mobile FileRoute

**Files:**

- Create: `apps/web/src/lib/mobile/mobile-media-uploadthing.ts`
- Create: `apps/web/src/lib/mobile/mobile-media-uploadthing.test.ts`
- Modify: `apps/web/src/app/api/uploadthing/core.ts`
- Modify: `apps/web/src/app/api/uploadthing/core.test.ts`

**Interfaces:**

```ts
export async function authorizeMobileMediaUpload(
  input: { intent: MobileMediaUploadIntent; request: Request },
  dependencies?: MobileMediaUploadAuthorizationDependencies,
): Promise<{
  ownerId: string;
  purpose: "profile-avatar" | "server-icon";
  targetServerId: string | null;
}>;

export async function completeMobileMediaUpload(
  input: { file: UploadThingMobileFile; metadata: MobileUploadMetadata },
  dependencies?: MobileMediaUploadCompletionDependencies,
): Promise<MobileMediaUploadCompletionResponse>;
```

- [ ] **Step 1: Write authorization/completion RED tests**

Assert bearer auth precedes rate limiting; `mobile:media:upload` is used; a profile upload needs no
server; a server icon requires `MANAGE_SERVER`; invalid bearer/authz becomes a bounded
`UploadThingError`; completion verifies bytes before persistence; verification failure calls
best-effort `UTApi.deleteFiles([file.key])`; callback retry returns the same claim id; and the
authenticated boundary awaits `runOpportunisticMobileMediaCleanup` while converting its bounded
failure to a redacted best-effort result rather than an unhandled promise or upload failure.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
corepack pnpm --filter @wizards/web exec node --import tsx --test --test-force-exit `
  src/lib/mobile/mobile-media-uploadthing.test.ts `
  src/app/api/uploadthing/core.test.ts
```

- [ ] **Step 3: Implement the `mobileMediaUploader` slug only**

Add a FileRoute with `.input(MobileMediaUploadIntentSchema)`, explicit JPEG/PNG/WebP 4-MiB config,
`authorizeMobileMediaUpload` middleware, and `completeMobileMediaUpload` completion. Existing
`profileAvatarUploader`, `serverIconUploader`, `messageImageUploader`, and
`messageAttachmentUploader` definitions remain behaviorally unchanged.

- [ ] **Step 4: Run FileRoute and full UploadThing tests GREEN**

```powershell
corepack pnpm --filter @wizards/web exec node --import tsx --test --test-force-exit `
  src/lib/mobile/mobile-media-uploadthing.test.ts `
  src/app/api/uploadthing/core.test.ts
```

Expected: both files pass without logging callback metadata.

### Task 6: Compute capabilities and target-safe assignable roles

**Files:**

- Create: `apps/web/src/lib/workspace/mobile-capabilities.ts`
- Create: `apps/web/src/lib/workspace/mobile-capabilities.test.ts`
- Modify: `apps/web/src/lib/workspace/server-service.ts`
- Modify: `apps/web/src/lib/workspace/service.test.ts`
- Modify: `apps/web/src/lib/workspace/member-service.ts`
- Modify: `apps/web/src/lib/workspace/role-service.ts`
- Create: `apps/web/src/lib/workspace/role-service.test.ts`
- Modify: `apps/web/src/lib/workspace/invite-service.ts`
- Modify: `apps/web/src/lib/workspace/channel-service.ts`
- Modify: `apps/web/src/lib/workspace/unread-service.ts`

**Interfaces:**

```ts
export function resolveMobileServerCapabilities(access: AccessContext): MobileServerCapabilities;

export function resolveMobileServerMemberActions(
  access: AccessContext,
  target: {
    id: string;
    roles: readonly { isDefault: boolean; managed: boolean; permissions: bigint }[];
    userId: string;
  },
): { canKick: boolean; canManageRoles: boolean };

export async function listAssignableWorkspaceRoles(
  userId: string,
  serverId: string,
): Promise<Array<{ color: number; id: string; name: string; position: number }>>;

export async function listWorkspaceInvites(
  userId: string,
  serverId: string,
): Promise<WorkspaceInvite[]>;

export async function listMobileWorkspaceInvites(
  userId: string,
  serverId: string,
): Promise<WorkspaceInvite[]>;

export async function createWorkspaceInviteWithDetails(
  userId: string,
  serverId: string,
  input: CreateInviteInput,
): Promise<WorkspaceInvite>;

export function buildMobileInviteShareUrl(code: string, env?: NodeJS.ProcessEnv): string;

export async function getWorkspaceServerDetailWithAccess(
  userId: string,
  serverId: string,
): Promise<{ access: AccessContext; detail: WorkspaceServerDetail }>;

export async function getMobileWorkspaceServerDetailWithAccess(
  userId: string,
  serverId: string,
): Promise<{
  access: AccessContext;
  detail: MobileWorkspaceServerDetailProjection;
  hasMoreChannels: boolean;
}>;

export async function listWorkspaceServerMembersWithAccess(
  userId: string,
  serverId: string,
  options?: { cursor?: string; limit?: number },
): Promise<{
  access: AccessContext;
  memberPage: WorkspaceMemberPage;
  members: Array<{
    authorizationRoles: Array<{
      id: string;
      isDefault: boolean;
      managed: boolean;
      permissions: bigint;
    }>;
    member: WorkspaceMember;
  }>;
}>;

export async function listMobileWorkspaceServerMembersWithAccess(
  userId: string,
  serverId: string,
  options?: { cursor?: string; limit?: number },
): Promise<{
  access: AccessContext;
  memberPage: WorkspaceMemberPage;
  members: Array<{
    authorizationRoles: Array<{
      id: string;
      isDefault: boolean;
      managed: boolean;
      permissions: bigint;
    }>;
    member: WorkspaceMember;
  }>;
}>;
```

- [ ] **Step 1: Write capability and role-filter RED tests**

Cover owner, administrator, moderator, and member permission masks; owner-only delete; exact
permission-bit mapping; self/owner kick suppression; protected target role suppression for role
updates; default/managed role exclusion; elevated role exclusion for non-owner; elevated role
availability for owner; and no permission array in the mobile role response. Add service RED tests
proving the current public member/detail shapes remain unchanged while the new `WithAccess`
functions expose actor access and raw target-role authorization data only to internal route logic.
For member mapping, prove with raw `authorizationRoles` fixtures that `roleIds` is deduplicated,
excludes exactly `isDefault === true`, retains managed and ordinary non-default ids, and fails rather
than truncating if more than 25 current non-default ids exist. This is the authoritative mapping
test deferred from Task 1; a preconstructed schema fixture alone is not sufficient evidence.

- [ ] **Step 2: Implement pure capability mapping and service filters**

Use only `resolveServerPermissions`, `hasPermission`, `PermissionBits`, `isOwnerAccess`,
`isElevatedPermissions`, and role flags. Do not infer from role names or `accessLevel` except the
existing owner identity check. Refactor the current detail/member loaders so they obtain one
`AccessContext` and share private DB loaders. Existing `getWorkspaceServerDetail` and
`listWorkspaceServerMembers` remain wrappers that return their exact current public shapes. Mobile
routes use the `WithAccess` variants; they must not try to recover permissions from `isAdmin`,
`accessLevel`, or `WorkspaceMember.roles`, because the public member DTO deliberately drops
`permissions`, `isDefault`, and `managed`.

Keep the web detail and invite loaders byte-compatible. Mobile uses separate bounded projections:
20 categories plus one sentinel, 40 channels per category plus one sentinel, 80 ungrouped channels
plus one sentinel, 80 members plus one sentinel, and at most 25 attached roles per member plus one
sentinel. Omit role catalogs and invite codes from the mobile detail query. Any raw channel/category
sentinel sets `hasMoreChannels` conservatively even when the sentinel is not visible; the mobile DTO
returns at most 40 channels per category and 80 total. Mobile invite and assignable-role catalogs
query at most 101 raw rows and fail closed with a stable bounded error instead of silently
truncating or allowing response-schema failure.

The shared role mutation continues to own all existing permission, owner, target-protection, and
assignability checks. Refactor only its mutation-set handling so an already-attached managed role is
immutable and preserved: a requested managed id is accepted only when that exact id is already on
the target; a new managed id remains rejected; omission or inclusion of an existing managed id may
not delete or recreate it; and delete/create operations apply only to current/requested
non-default, non-managed roles. Add regression tests for all four cases and retain the existing
default-role, elevated-role, owner, and protected-target denial tests. This does not make managed
roles assignable and does not widen the role hierarchy; it prevents a full-replacement mobile or web
update from silently removing an unrelated server-managed role.

- [ ] **Step 3: Add invite listing and canonical share URL mapping**

`listWorkspaceInvites` and `createWorkspaceInviteWithDetails` require `MANAGE_INVITES`.
Factor the existing create operation through one private record-creation helper:
`createWorkspaceInvite` continues returning exactly `{ code }` for existing web callers, while
`createWorkspaceInviteWithDetails` returns the created `WorkspaceInvite` for mobile mapping. Add a
regression test proving the existing web service/route response does not gain fields.

`buildMobileInviteShareUrl` chooses the first configured value from `APP_URL`, `AUTH_URL`, and
`NEXTAUTH_URL`, validates HTTP only in development and HTTPS otherwise, then builds
`/invite/${encodeURIComponent(code)}`. Mobile mapping drops `code` before response parsing. Missing
or invalid canonical origin fails closed with a bounded configuration error. No invite response is
logged.

- [ ] **Step 4: Bind nested channel mutations and retain existing category binding**

Category update/delete already accepts `serverId` and queries by `{ id, serverId }`; do not change
those signatures. Add an optional `{ expectedServerId?: string }` final argument only to
`updateWorkspaceChannel` and `deleteWorkspaceChannel`. When present, a channel from a different
server returns the same bounded not-found error as a missing channel. Existing web callers omit the
option and keep current behavior.

- [ ] **Step 5: Run focused service suites GREEN**

```powershell
corepack pnpm --filter @wizards/web exec node --import tsx --test --test-force-exit `
  src/lib/workspace/mobile-capabilities.test.ts `
  src/lib/workspace/role-service.test.ts `
  src/lib/workspace/service.test.ts
```

### Task 7: Add server lifecycle route logic

**Files:**

- Create: `apps/web/src/app/api/v1/mobile/servers/route-logic.ts`
- Create: `apps/web/src/app/api/v1/mobile/servers/route-logic.test.ts`
- Create: `apps/web/src/app/api/v1/mobile/servers/route.ts`
- Create: `apps/web/src/app/api/v1/mobile/servers/join/route-logic.ts`
- Create: `apps/web/src/app/api/v1/mobile/servers/join/route-logic.test.ts`
- Create: `apps/web/src/app/api/v1/mobile/servers/join/route.ts`
- Create: `apps/web/src/app/api/v1/mobile/servers/[serverId]/route-logic.ts`
- Create: `apps/web/src/app/api/v1/mobile/servers/[serverId]/route-logic.test.ts`
- Modify: `apps/web/src/app/api/v1/mobile/servers/[serverId]/route.ts`

**Interfaces:**

- Produces `POST /mobile/servers`, `POST /mobile/servers/join`, and `GET|PATCH|DELETE /mobile/servers/[serverId]`.
- Reuses `createWorkspaceServer`, `joinWorkspaceServerByInvite`,
  `getWorkspaceServerDetailWithAccess`, `updateWorkspaceServer`, `deleteWorkspaceServer`, and
  capability mapping. The GET route resolves capabilities from the returned `AccessContext`; it
  never derives them from `detail.server.isAdmin`.

- [ ] **Step 1: Write route-logic RED tests**

For every method assert call order `auth -> rate-limit -> parse -> service`, exact mobile action,
strict input rejection, Zod validation of every context param before service delegation, status 201
for create, response schema parsing, and bounded error mapping. Create/update tests prove `iconUrl`
is rejected before the service runs. GET tests prove capabilities receive the exact returned
`AccessContext` and never `isAdmin` or another public DTO approximation.

- [ ] **Step 2: Run focused lifecycle route tests and verify RED**

```powershell
corepack pnpm --filter @wizards/web exec node --import tsx --test --test-force-exit `
  src/app/api/v1/mobile/servers/route-logic.test.ts `
  src/app/api/v1/mobile/servers/join/route-logic.test.ts `
  'src/app/api/v1/mobile/servers/[serverId]/route-logic.test.ts'
```

- [ ] **Step 3: Implement dependency-injected route logic and thin Next handlers**

Next route exports keep only `(request, context)`:

```ts
export function PATCH(request: Request, context: RouteContext) {
  return mobileServerUpdateRoute(request, context);
}
```

Dependencies are accepted only by `mobileServerUpdateRoute`, never by the exported `PATCH`; this
prevents the invalid Next route signature that previously broke Railway builds.

- [ ] **Step 4: Run lifecycle route tests GREEN**

Run the Step 2 command and expect all tests to pass.

### Task 8: Add invite, category, and channel route logic

**Files:**

- Create: `apps/web/src/app/api/v1/mobile/servers/[serverId]/invites/route-logic.ts`
- Create: `apps/web/src/app/api/v1/mobile/servers/[serverId]/invites/route-logic.test.ts`
- Create: `apps/web/src/app/api/v1/mobile/servers/[serverId]/invites/route.ts`
- Create: `apps/web/src/app/api/v1/mobile/servers/[serverId]/categories/route-logic.ts`
- Create: `apps/web/src/app/api/v1/mobile/servers/[serverId]/categories/route-logic.test.ts`
- Create: `apps/web/src/app/api/v1/mobile/servers/[serverId]/categories/route.ts`
- Create: `apps/web/src/app/api/v1/mobile/servers/[serverId]/categories/[categoryId]/route-logic.ts`
- Create: `apps/web/src/app/api/v1/mobile/servers/[serverId]/categories/[categoryId]/route-logic.test.ts`
- Create: `apps/web/src/app/api/v1/mobile/servers/[serverId]/categories/[categoryId]/route.ts`
- Create: `apps/web/src/app/api/v1/mobile/servers/[serverId]/channels/route-logic.ts`
- Create: `apps/web/src/app/api/v1/mobile/servers/[serverId]/channels/route-logic.test.ts`
- Create: `apps/web/src/app/api/v1/mobile/servers/[serverId]/channels/route.ts`
- Create: `apps/web/src/app/api/v1/mobile/servers/[serverId]/channels/[channelId]/route-logic.ts`
- Create: `apps/web/src/app/api/v1/mobile/servers/[serverId]/channels/[channelId]/route-logic.test.ts`
- Create: `apps/web/src/app/api/v1/mobile/servers/[serverId]/channels/[channelId]/route.ts`

**Interfaces:**

- GET/POST invites; POST category/channel collections; PATCH/DELETE category/channel entities.
- Category mutations pass their existing required `serverId`. Only channel entity mutations pass
  `{ expectedServerId: serverId }` to prevent cross-server path confusion.
- Invite POST delegates to `createWorkspaceInviteWithDetails`, maps the returned code to a canonical
  share URL, and parses a full mobile invite DTO while existing web create behavior remains `{code}`.

- [ ] **Step 1: Write grouped route-logic RED tests**

Cover all methods, input schemas, exact rate-limit actions, canonical invite URL output without
`code`, wrong-server rejection, success response parsing, and delete success bodies.

- [ ] **Step 2: Run the four focused test files and verify RED**

```powershell
corepack pnpm --filter @wizards/web exec node --import tsx --test --test-force-exit `
  'src/app/api/v1/mobile/servers/[serverId]/invites/route-logic.test.ts' `
  'src/app/api/v1/mobile/servers/[serverId]/categories/route-logic.test.ts' `
  'src/app/api/v1/mobile/servers/[serverId]/categories/[categoryId]/route-logic.test.ts' `
  'src/app/api/v1/mobile/servers/[serverId]/channels/route-logic.test.ts' `
  'src/app/api/v1/mobile/servers/[serverId]/channels/[channelId]/route-logic.test.ts'
```

- [ ] **Step 3: Implement thin route logic over existing services**

Return schema-validated category/channel DTOs for create/update and `{ success: true }` for delete.
Invite GET/POST returns only mobile invite DTOs with canonical HTTPS share URLs.

- [ ] **Step 4: Run grouped routes GREEN**

Run the Step 2 command and expect all tests to pass.

### Task 9: Add members, assignable roles, kick, history, and claim routes

**Files:**

- Create: `apps/web/src/app/api/v1/mobile/servers/[serverId]/members/route-logic.ts`
- Create: `apps/web/src/app/api/v1/mobile/servers/[serverId]/members/route-logic.test.ts`
- Create: `apps/web/src/app/api/v1/mobile/servers/[serverId]/members/route.ts`
- Create: `apps/web/src/app/api/v1/mobile/servers/[serverId]/roles/route-logic.ts`
- Create: `apps/web/src/app/api/v1/mobile/servers/[serverId]/roles/route-logic.test.ts`
- Create: `apps/web/src/app/api/v1/mobile/servers/[serverId]/roles/route.ts`
- Create: `apps/web/src/app/api/v1/mobile/servers/[serverId]/members/[memberId]/roles/route-logic.ts`
- Create: `apps/web/src/app/api/v1/mobile/servers/[serverId]/members/[memberId]/roles/route-logic.test.ts`
- Create: `apps/web/src/app/api/v1/mobile/servers/[serverId]/members/[memberId]/roles/route.ts`
- Create: `apps/web/src/app/api/v1/mobile/servers/[serverId]/members/[memberId]/route-logic.ts`
- Create: `apps/web/src/app/api/v1/mobile/servers/[serverId]/members/[memberId]/route-logic.test.ts`
- Create: `apps/web/src/app/api/v1/mobile/servers/[serverId]/members/[memberId]/route.ts`
- Create: `apps/web/src/app/api/v1/mobile/channels/[channelId]/history/route-logic.ts`
- Create: `apps/web/src/app/api/v1/mobile/channels/[channelId]/history/route-logic.test.ts`
- Create: `apps/web/src/app/api/v1/mobile/channels/[channelId]/history/route.ts`
- Create: `apps/web/src/app/api/v1/mobile/uploads/route-logic.ts`
- Create: `apps/web/src/app/api/v1/mobile/uploads/route-logic.test.ts`
- Create: `apps/web/src/app/api/v1/mobile/uploads/route.ts`

**Interfaces:**

- Member GET delegates to `listWorkspaceServerMembersWithAccess`, computes actions from the returned
  actor access plus each target's private authorization-role projection, strips that projection,
  and returns `{ members, memberPage }`; each public member includes only server-computed
  `{ canKick, canManageRoles }` and the deduplicated complete current `roleIds` filtered by
  `!isDefault` in addition to the existing member DTO. Managed current ids remain in `roleIds` but
  are not added to the assignable role catalog.
- Role GET returns only assignable `{ id, name, color, position }` rows.
- Role PATCH sends the complete intended set derived from the server-produced `member.roleIds` to
  `updateWorkspaceMemberRoles`. Existing authz/hierarchy checks remain authoritative. Existing
  managed ids are accepted only as immutable carry-through values and are preserved server-side;
  clients still cannot add or remove managed roles.
- History DELETE preserves `emitServerUnreadUpdatesForServer` and `message:history_cleared`.
- Claim POST accepts only `{ claimId }`.

- [ ] **Step 1: Write route RED tests for every security boundary**

Cover cursor/limit bounds, all path-parameter schema bounds, member action mapping from private raw
role authorization data, and stripping that private data and the permission matrix from responses.
For every member row, assert that response `roleIds` excludes the default role, deduplicates ids,
retains every ordinary and managed current non-default id, and is the exact base set passed through
when one assignable role is toggled. Also cover rejection of a newly requested managed role,
server-side preservation of a current managed role, role full-replacement delegation, kick
self/owner errors, history unread/socket side effects, claim auth-before-parse, claim replay error
mapping, and claim response parsing without URL/key input.

- [ ] **Step 2: Run the focused route tests and verify RED**

```powershell
corepack pnpm --filter @wizards/web exec node --import tsx --test --test-force-exit `
  'src/app/api/v1/mobile/servers/[serverId]/members/route-logic.test.ts' `
  'src/app/api/v1/mobile/servers/[serverId]/roles/route-logic.test.ts' `
  'src/app/api/v1/mobile/servers/[serverId]/members/[memberId]/roles/route-logic.test.ts' `
  'src/app/api/v1/mobile/servers/[serverId]/members/[memberId]/route-logic.test.ts' `
  'src/app/api/v1/mobile/channels/[channelId]/history/route-logic.test.ts' `
  src/app/api/v1/mobile/uploads/route-logic.test.ts
```

- [ ] **Step 3: Implement and response-validate the six route groups**

History logic owns the existing route-level unread/socket side effects after the shared service
returns. All other logic delegates business behavior and maps only DTOs/capabilities.

- [ ] **Step 4: Run focused route tests GREEN**

Run the Step 2 command and expect all tests to pass.

### Task 10: Lock rate limits, Next route signatures, migration deployment, and M1 delivery

**Files:**

- Modify: `apps/web/src/lib/api-rate-limit.ts`
- Modify: `apps/web/src/lib/api-rate-limit.test.ts`
- Modify: `apps/web/src/app/api/v1/route-contract.test.ts`
- Create: `apps/web/src/lib/deployment/railway-contract.test.ts`
- Modify: `docs/superpowers/plans/2026-07-13-mobile-phase4-m1-api-upload.md`

**Interfaces:**

- Adds explicit actions for every M1 route and static tests that bind method/path to action.

Use these limits:

```text
mobile:media:upload                 10 / 300s
mobile:media:claim                  20 / 300s
mobile:server:create                10 / 3600s
mobile:server:join                  20 / 600s
mobile:server:detail               120 / 60s
mobile:server:update                30 / 60s
mobile:server:delete                 5 / 3600s
mobile:server:invites:list          60 / 60s
mobile:server:invites:create        20 / 600s
mobile:server:categories:create     30 / 60s
mobile:server:categories:update     30 / 60s
mobile:server:categories:delete     30 / 60s
mobile:server:channels:create       30 / 60s
mobile:server:channels:update       30 / 60s
mobile:server:channels:delete       30 / 60s
mobile:server:members:list          60 / 60s
mobile:server:roles:list            60 / 60s
mobile:server:member-roles:update   40 / 600s
mobile:server:member:kick           30 / 600s
mobile:channel:history:clear        10 / 60s
```

- [x] **Step 1: Extend RED rate-limit and route-contract assertions**

Add every mutating/read route to an explicit method/action table. Add bodyless member-kick,
category/channel delete, and history delete paths to the central bodyless mutation allowlist. Assert
all exported Next handlers have only `(request)` or `(request, context)` and never a dependency
union as the second argument. Implement the signature assertion with the TypeScript AST rather than
a parameter-count regex: inspect exported mobile route functions, require one or two parameters,
and reject any second-parameter type that references a dependency type. Do not impose this arity on
unrelated existing bodyless handlers such as `GET()` or `DELETE()`. `next build` remains the
authoritative Next route-signature gate.

Add a file-based Railway contract test that parses `railway.toml` and locks
`preDeployCommand = "pnpm --filter @wizards/db db:migrate:deploy"`, the current start command, and
`healthcheckPath = "/ready"`; this prevents a future config edit from silently bypassing the
migration ordering assumed by M1.

The AST trace must follow only invoked wrappers backed by the real central parser/limiter imports
and only definitely executed expression paths. Ambient/local name spoofs, same-name helpers in a
different source file, uninvoked nested functions, `if (false)`, short-circuit right-hand sides, and
statements after an unconditional return must not satisfy either contract. Mutable aliases and
dependency-object properties that may be reassigned in a branch or catch path must also fail closed.

- [x] **Step 2: Run rate-limit and global route contracts GREEN**

```powershell
corepack pnpm --filter @wizards/web exec node --import tsx --test --test-force-exit `
  src/lib/api-rate-limit.test.ts `
  src/app/api/v1/route-contract.test.ts `
  src/lib/deployment/railway-contract.test.ts
```

- [x] **Step 3: Run the complete M1 non-device gate**

```powershell
corepack pnpm --filter @wizards/db exec prisma validate
corepack pnpm --filter @wizards/db db:generate
corepack pnpm --filter @wizards/db typecheck
corepack pnpm --filter @wizards/types typecheck
corepack pnpm --filter @wizards/types test
corepack pnpm --filter @wizards/web typecheck
corepack pnpm --filter @wizards/web lint
corepack pnpm --filter @wizards/web test
corepack pnpm --filter @wizards/web build
corepack pnpm --filter @wizards/mobile typecheck
corepack pnpm --filter @wizards/mobile test
corepack pnpm --filter @wizards/mobile exec jest --runInBand
corepack pnpm --filter @wizards/mobile quality:check
corepack pnpm --filter @wizards/mobile exec expo install --check
git diff --check
```

Expected: every command exits 0; no native Android build runs.

- [x] **Step 4: Preflight the production build and migration SQL before push**

The Task 2 migration contract, Prisma validation, and the exact Railway web build command must pass
before touching UAT. Never point this preflight at UAT or production.

Repository-history constraint discovered during the 2026-07-13 preflight: this repository began
with a populated Prisma schema but no initial migration, and later historical schema changes are
also absent from the migration directory. A raw empty-database replay therefore fails before M1
(`Message` is missing in the first migration, and a historical `hiddenAt` index later has no column
migration). Do not invent or deploy a retroactive baseline migration in M1; that would be unsafe for
the already-populated UAT database. The separate migration-replay debt remains in the technology
modernization plan.

Instead, reproduce the actual UAT pre-deploy state in a disposable database: extract the Prisma
schema from the verified parent of the local M1 commit, `db push` that baseline into a disposable
local PostgreSQL instance, enumerate and mark only that same parent's 28 migrations as applied,
then run the exact Railway `db:migrate:deploy` command from the current tree. Require that it applies
only `20260713120000_add_mobile_media_upload_claims` and that `prisma migrate status` reports all 29
migrations current. Fail closed if the parent changed, the baseline count is not 28, the disposable
URL is absent, or it equals any active database URL. Destroy the container and temporary schema in
`finally`.

```powershell
corepack pnpm --filter @wizards/web exec node --import tsx --test --test-force-exit `
  src/lib/mobile/mobile-media-migration.test.ts `
  src/lib/deployment/railway-contract.test.ts
corepack pnpm --filter @wizards/web build

# The operator script creates a disposable local PostgreSQL container, pushes the
# verified origin/uat parent schema, resolves exactly its 28 migration names, and then runs:
$previousDatabaseUrl = $env:DATABASE_URL
try {
  $env:DATABASE_URL = $env:PHASE4_MIGRATION_PREFLIGHT_DATABASE_URL
  corepack pnpm --filter @wizards/db db:migrate:deploy
  corepack pnpm --filter @wizards/db exec prisma migrate status
} finally {
  $env:DATABASE_URL = $previousDatabaseUrl
  # Always remove the disposable container and extracted baseline schema.
}
```

- [x] **Step 5: Update the graph and isolate generated output**

```powershell
graphify update .
git status --short
```

Review the graph update, then preserve only `graphify-out` generated changes in a named Phase 4
graph stash. Do not mix them with the pre-Phase-4 unrelated-state stash and do not stage them:

```powershell
git stash push -m "phase4-m1-graphify-generated" -- graphify-out
git status --short
```

- [ ] **Step 6: Amend the sole M1 commit and push safely**

The authoritative M1 implementation manifest is the union of every exact `Create:` and `Modify:`
path in the ten `Files` blocks above, plus these documentation files:

```text
docs/superpowers/specs/2026-07-13-mobile-phase4-server-management-media-upload-design.md
docs/superpowers/plans/2026-07-13-mobile-phase4-m1-api-upload.md
docs/superpowers/plans/2026-07-13-mobile-phase4-m2-client-realtime.md
docs/superpowers/plans/2026-07-13-mobile-phase4-m3-management-closure.md
```

Derive the manifest from this plan rather than using a wildcard, fetch `origin/uat`, and require it
still equals the parent of local HEAD. Stage only the manifest. Reject `graphify-out`, artifacts,
`.env.maestro`, and tsbuildinfo from the index, review every staged name, then amend without changing
the message:

```powershell
$planPath = "docs/superpowers/plans/2026-07-13-mobile-phase4-m1-api-upload.md"
$m1Manifest = Select-String -Path $planPath -Pattern '^- (?:Create|Modify): `([^`]+)`$' |
  ForEach-Object { $_.Matches[0].Groups[1].Value }
$m1Manifest += @(
  "docs/superpowers/specs/2026-07-13-mobile-phase4-server-management-media-upload-design.md",
  "docs/superpowers/plans/2026-07-13-mobile-phase4-m1-api-upload.md",
  "docs/superpowers/plans/2026-07-13-mobile-phase4-m2-client-realtime.md",
  "docs/superpowers/plans/2026-07-13-mobile-phase4-m3-management-closure.md"
)
$m1Manifest = $m1Manifest | Sort-Object -Unique

git fetch origin uat
if ((git rev-parse origin/uat) -ne (git rev-parse HEAD^)) {
  throw "origin/uat moved; stop and reconcile before amending M1."
}
git add -- $m1Manifest
$staged = git diff --cached --name-only
$forbidden = $staged | Where-Object {
  $_ -match '^(graphify-out/|artifacts/|\.env\.maestro$)' -or $_ -match '\.tsbuildinfo$'
}
if ($forbidden) { throw "Forbidden M1 staged files: $($forbidden -join ', ')" }
git diff --cached --stat
git diff --cached --check
git commit --amend --no-edit
git push origin uat
```

Expected final M1 message:

```text
feat(mobile-api): add server management and upload endpoints
```

- [ ] **Step 7: Verify Railway pre-deploy migration and M1 health**

Confirm the Railway deployment log runs the existing `preDeployCommand` successfully before start,
the build completes, `/ready` returns 200, `/api/health` returns 200, and an anonymous request to
`/api/v1/mobile/servers` returns 401 rather than 404.

If migration, build, or health fails after push, stop M2 and M3 immediately. First determine whether
the failure is transient/configuration-only and redeploy the same commit without changing history.
If repository code must change, do not amend the pushed M1 commit and do not force-push `uat`.
Create one narrowly scoped corrective commit such as `fix(mobile-api): repair M1 UAT deployment`,
run the full M1 gate again, and push normally. This deployment-recovery exception knowingly exceeds
the preferred exact three-commit Phase 4 history; it is permitted only for a confirmed post-push UAT
failure and must be recorded in the Phase 4 migration/devir notes. The preferred path remains the
pre-push production build plus disposable-database migration preflight above, preserving exactly
three Phase 4 commits.
