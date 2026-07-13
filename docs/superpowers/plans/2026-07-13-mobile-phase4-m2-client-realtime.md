# Mobile Phase 4 M2 Client and Realtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans task-by-task. Use superpowers:test-driven-development for behavior changes and superpowers:verification-before-completion before the milestone commit.

**Goal:** Deliver native mobile server create/join, canonical invite sharing, profile-avatar and server-icon upload/claim flows, resilient server selection, and verified narrow realtime cache updates on top of M1.

**Architecture:** Server management is composed below the workspace screen boundary; apps/mobile/src/app/mobile-product-app.tsx is not edited. A custom expo-image-picker adapter retains the selected URI only in volatile operation/UI state, while the official uploadFiles transport returned by @uploadthing/expo generateReactNativeHelpers performs upload. Mobile accepts only schema-validated completion serverData and authoritative M1 claim responses; provider URL/key fields are discarded.

**Tech Stack:** TypeScript 6, React Native 0.85, Expo 56, TanStack Query 5, @wizards/types Zod contracts, @uploadthing/expo 7.2.6, uploadthing 7.7.4, React Native Share, Jest, Node test runner, pnpm.

**Official transport references:**

- https://docs.uploadthing.com/api-reference/expo
- https://github.com/pingdotgg/uploadthing/blob/main/packages/expo/src/index.ts
- https://github.com/pingdotgg/uploadthing/blob/main/packages/expo/src/image-picker.ts

## Global Constraints

- Work directly on uat. Create no branch, worktree, merge commit, or task-level commit.
- Start only after M1 is deployed and healthy. Anonymous POST /api/v1/mobile/servers must return 401, not 404.
- Produce exactly one M2 commit:

```text
feat(mobile): add server creation, invites and avatar upload
```

- Do not edit apps/mobile/src/app/mobile-product-app.tsx.
- This milestone is JavaScript-only. Do not run expo prebuild, expo run:android, expo run:ios, Gradle, EAS build, CocoaPods, or create a new development client.
- Add no native picker/share dependency. Reuse expo-image-picker and React Native Share.
- Do not use @uploadthing/expo useImageUploader. The custom picker must retain local URI for optimistic preview; the official uploadFiles function must remain the transport.
- Local URI is operation/UI memory only. Never put it in MobileMediaRuntimeState, TanStack data/keys, auth storage, logs, analytics, errors, or realtime payloads.
- Fetch the access token after selection and immediately before uploadFiles. Keep it function-local and set it to null in finally for all post-token exits.
- Parse only response[0].serverData with MobileMediaUploadCompletionResponseSchema. Never trust, return, log, cache, or compare provider key/url/name/size.
- Claim only by opaque claimId through POST /api/v1/mobile/uploads.
- Create the server before icon upload. Icon failure leaves the server intact and retryable.
- Share only M1 canonical HTTPS shareUrl. Never reconstruct from code or persist code/shareUrl.
- M2 adds no server settings/member/role UI; those are M3.
- Keep graphify-out, artifacts, .env.maestro, local media, and tsbuildinfo unstaged.

---

### Task 1: Lock the custom picker and official UploadThing transport

**Files:**

- Modify: apps/mobile/package.json
- Modify: pnpm-lock.yaml
- Modify: apps/mobile/jest.config.js
- Create: apps/mobile/src/media/mobile-image-upload-contract.ts
- Create: apps/mobile/src/media/mobile-image-picker.ts
- Create: apps/mobile/src/media/mobile-uploadthing-client.ts
- Create: apps/mobile/scripts/mobile-image-upload-contract.test.ts
- Create: apps/mobile/scripts/mobile-media-upload-architecture.test.ts

**Interfaces:**

```ts
export type MobilePickedImage = {
  file: File;
  localUri: string;
};

export type MobileImageUploadTarget =
  | { purpose: "profile-avatar" }
  | { purpose: "server-icon"; targetServerId: string };

export async function pickMobileImage(): Promise<MobilePickedImage | null>;

export async function uploadMobileImageToUploadThing(input: {
  accessToken: string;
  file: File;
  signal?: AbortSignal;
  target: MobileImageUploadTarget;
}): Promise<MobileMediaUploadCompletionResponse>;
```

- [ ] **Step 1: Write RED contract and architecture tests**

mobile-image-upload-contract.test.ts covers:

- profile-avatar forbids targetServerId;
- server-icon requires a bounded targetServerId;
- MIME is JPEG, PNG, or WebP only;
- known fileSize above 4 MiB is rejected before file reading;
- file:, content:, and ph: are accepted as volatile local schemes;
- http:, https:, data:, empty, and overlong URI values fail closed;
- exactly one UploadThing result is required;
- only valid serverData is returned;
- adjacent provider key/url fields are ignored.

mobile-media-upload-architecture.test.ts reads sources and asserts:

```ts
assert.match(pickerSource, /from "expo-image-picker"/);
assert.match(transportSource, /generateReactNativeHelpers/);
assert.match(transportSource, /\.uploadFiles/);
assert.doesNotMatch(transportSource, /useImageUploader/);
assert.doesNotMatch(contractSource, /MobileMediaRuntimeState/);
assert.doesNotMatch(productAppSource, /useMobileServerManagementFeature/);
```

- [ ] **Step 2: Run RED**

```powershell
corepack pnpm --filter @wizards/mobile exec node --test --import tsx scripts/mobile-image-upload-contract.test.ts scripts/mobile-media-upload-architecture.test.ts
```

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Add JS-only dependencies**

```powershell
corepack pnpm --filter @wizards/mobile add @uploadthing/expo@7.2.6 uploadthing@7.7.4
```

Review package and lock changes. Stop if installation introduces a config plugin, native project edit, new picker, or native rebuild requirement. Add @uploadthing/.\* and uploadthing to Jest transformIgnorePatterns allowlist. Inspect peer resolution for `expo-constants`; if pnpm does not link the Expo-56-compatible package deterministically, add it with `expo install expo-constants` and review only package/lock changes. This remains JS-only and must not run prebuild or create a development client.

- [ ] **Step 4: Implement the custom picker**

Request library permission only from the user action, select one image, validate local scheme/MIME/known size, then create the React Native FormData-compatible File shape used by the official Expo adapter:

```ts
const blob = await fetch(asset.uri).then((response) => response.blob());
if (blob.size > 4 * 1024 * 1024) {
  throw new MobileImageUploadError("selected-file-too-large");
}

const file = Object.assign(
  new File([blob], asset.fileName ?? "mobile-image", {
    type: asset.mimeType,
  }),
  { uri: asset.uri },
);

return { file: file as File, localUri: asset.uri };
```

Do not alter apps/mobile/src/app/providers/mobile-media-provider.tsx or existing message-attachment selection.

- [ ] **Step 5: Implement uploadFiles transport**

Create helpers once:

```ts
const helpers = generateReactNativeHelpers({
  url: new URL("/api/uploadthing", getMobileRuntimeConfig().apiUrl),
});
```

Call the official transport:

```ts
const rows = await helpers.uploadFiles("mobileMediaUploader", {
  files: [input.file],
  headers: { Authorization: "Bearer " + input.accessToken },
  input: MobileMediaUploadIntentSchema.parse(input.target),
  signal: input.signal,
});

return parseMobileUploadCompletion(rows);
```

parseMobileUploadCompletion returns only MobileMediaUploadCompletionResponseSchema.parse(rows[0].serverData). Do not import the web FileRouter into mobile; the shared Zod schemas are the client boundary.

- [ ] **Step 6: Run GREEN**

```powershell
corepack pnpm --filter @wizards/mobile exec node --test --import tsx scripts/mobile-image-upload-contract.test.ts scripts/mobile-media-upload-architecture.test.ts
corepack pnpm --filter @wizards/mobile typecheck
corepack pnpm --filter @wizards/mobile exec expo install --check
```

Expected: all commands exit 0 without native build.

### Task 2: Add strict server-management and media-claim clients

**Files:**

- Create: apps/mobile/src/workspace/mobile-server-management-client.ts
- Create: apps/mobile/src/media/mobile-media-claim-client.ts
- Create: apps/mobile/scripts/mobile-server-management-client.test.ts
- Create: apps/mobile/scripts/mobile-media-claim-client.test.ts

**Interfaces:**

```ts
export function createMobileServer(
  client: MobileApiClient,
  input: MobileServerCreateRequest,
): Promise<MobileServerCreateResponse>;

export function joinMobileServer(
  client: MobileApiClient,
  input: MobileServerJoinRequest,
): Promise<MobileServerJoinResponse>;

export function createMobileServerInvite(
  client: MobileApiClient,
  serverId: string,
  input: MobileServerInviteCreateRequest,
): Promise<MobileServerInviteCreateResponse>;

export function claimMobileMediaUpload(
  client: MobileApiClient,
  input: MobileMediaClaimRequest,
): Promise<MobileMediaClaimResponse>;
```

- [ ] **Step 1: Write RED client tests**

Assert exact methods/paths:

```text
POST /api/v1/mobile/servers
POST /api/v1/mobile/servers/join
POST /api/v1/mobile/servers/{encodedServerId}/invites
POST /api/v1/mobile/uploads
```

Assert input parses before transport, output parses before return, unknown fields fail closed, invite response is HTTPS-only, claim input is claimId-only, and bounded errors contain no body/token/code/provider data.

- [ ] **Step 2: Run RED**

```powershell
corepack pnpm --filter @wizards/mobile exec node --test --import tsx scripts/mobile-server-management-client.test.ts scripts/mobile-media-claim-client.test.ts
```

- [ ] **Step 3: Implement schema-first clients**

Use the exact M1 schemas from @wizards/types:

```text
MobileServerCreateRequestSchema
MobileServerCreateResponseSchema
MobileServerJoinRequestSchema
MobileServerJoinResponseSchema
MobileServerInviteCreateRequestSchema
MobileServerInviteCreateResponseSchema
MobileMediaClaimRequestSchema
MobileMediaClaimResponseSchema
```

The clients accept no avatarUrl, iconUrl, local URI, provider key, or provider URL.

- [ ] **Step 4: Run GREEN**

```powershell
corepack pnpm --filter @wizards/mobile exec node --test --import tsx scripts/mobile-server-management-client.test.ts scripts/mobile-media-claim-client.test.ts
corepack pnpm --filter @wizards/mobile typecheck
```

### Task 3: Orchestrate picker, token, upload, claim, and cancellation

**Files:**

- Create: apps/mobile/src/media/mobile-image-upload-service.ts
- Create: apps/mobile/src/media/use-mobile-image-upload.ts
- Create: apps/mobile/scripts/mobile-image-upload-service.test.ts

**Interfaces:**

```ts
export type MobileImageUploadOutcome =
  | { status: "cancelled" }
  | { message: string; status: "error" }
  | { response: MobileMediaClaimResponse; status: "claimed" };

export interface MobileImageUploadDependencies {
  claimUpload(input: MobileMediaClaimRequest): Promise<MobileMediaClaimResponse>;
  getAccessToken(): Promise<string | null>;
  pickImage(): Promise<MobilePickedImage | null>;
  uploadFile(input: {
    accessToken: string;
    file: File;
    signal?: AbortSignal;
    target: MobileImageUploadTarget;
  }): Promise<MobileMediaUploadCompletionResponse>;
}

export async function executeMobileImageUpload(input: {
  dependencies: MobileImageUploadDependencies;
  onLocalPreview(localUri: string): void;
  signal?: AbortSignal;
  target: MobileImageUploadTarget;
}): Promise<MobileImageUploadOutcome>;

export function useMobileImageUpload(): {
  isBusy: boolean;
  selectAndUpload(
    target: MobileImageUploadTarget,
    onLocalPreview: (localUri: string) => void,
  ): Promise<MobileImageUploadOutcome>;
};
```

- [ ] **Step 1: Write RED orchestration tests**

Prove exact order:

```text
pickImage -> onLocalPreview -> getAccessToken -> uploadFile -> claimUpload
```

Cover cancellation without token lookup, missing token without upload, token fetched once immediately before upload, claimId-only claim, requested/completion/claim purpose-target equality, concurrent call rejection, AbortSignal behavior, and bounded errors without URI/token/key/url/body/stack.

Production token lifecycle is fixed:

```ts
let accessToken: string | null = null;
try {
  accessToken = await dependencies.getAccessToken();
  if (!accessToken) {
    return { message: MOBILE_UPLOAD_MESSAGES.signedOut, status: "error" };
  }
  const completion = await dependencies.uploadFile({
    accessToken,
    file: picked.file,
    signal,
    target,
  });
  const response = await dependencies.claimUpload({
    claimId: completion.claimId,
  });
  return { response, status: "claimed" };
} finally {
  accessToken = null;
}
```

- [ ] **Step 2: Run RED**

```powershell
corepack pnpm --filter @wizards/mobile exec node --test --import tsx scripts/mobile-image-upload-service.test.ts
```

- [ ] **Step 3: Implement pure service and thin hook**

The hook gets apiClient/getAccessToken from useMobileAuth, creates one AbortController per operation, aborts on unmount, and rejects duplicate operations with a ref. Cache updates remain with purpose-specific callers.

- [ ] **Step 4: Run GREEN**

```powershell
corepack pnpm --filter @wizards/mobile exec node --test --import tsx scripts/mobile-image-upload-service.test.ts
corepack pnpm --filter @wizards/mobile typecheck
```

### Task 4: Reconcile selected server access

**Files:**

- Create: apps/mobile/src/workspace/mobile-workspace-selection.ts
- Modify: apps/mobile/src/app/features/use-mobile-messaging-feature.ts
- Create: apps/mobile/scripts/mobile-workspace-selection.test.ts

**Interface:**

```ts
export function resolveMobileWorkspaceServerSelection(
  currentServerId: string | null,
  servers: readonly { id: string }[],
): string | null;
```

- [ ] **Step 1: Write RED tests**

Preserve accessible selection; fall back to first server when current disappears; choose first when null; return null for empty; do not mutate/sort; remain stable with duplicate ids.

- [ ] **Step 2: Run RED**

```powershell
corepack pnpm --filter @wizards/mobile exec node --test --import tsx scripts/mobile-workspace-selection.test.ts
```

- [ ] **Step 3: Integrate reconciliation**

Replace the current null-only bootstrap effect. If selection changes, stop old typing, clear selected/active channel and message/search state, explicitly invoke the existing voice-leave operation before clearing the selected voice id, and set the resolved id. Do not call handleOpenWorkspaceServer when unchanged. Keep handleOpenWorkspaceServer available so create/join selects immediately. Tests must assert the old voice room is actually left rather than merely hiding its local selection.

- [ ] **Step 4: Run GREEN**

```powershell
corepack pnpm --filter @wizards/mobile exec node --test --import tsx scripts/mobile-workspace-selection.test.ts scripts/mobile-phase-two-architecture.test.ts scripts/mobile-screen-sync.test.ts
corepack pnpm --filter @wizards/mobile typecheck
```

Confirm mobile-product-app.tsx has no diff.

### Task 5: Add create/join BottomSheet and canonical native Share

**Files:**

- Create: apps/mobile/src/workspace/mobile-server-create-join-sheet.tsx
- Create: apps/mobile/src/app/features/use-mobile-server-management-feature.ts
- Create: apps/mobile/src/query/use-mobile-server-management-mutations.ts
- Modify: apps/mobile/src/app/screens/workspace-browser.tsx
- Modify: apps/mobile/src/workspace/mobile-workspace-client.ts
- Modify: apps/mobile/src/query/mobile-workspace-query.ts
- Modify: apps/mobile/src/app/mobile-screen-state.ts
- Modify: apps/mobile/src/app/mobile-query-view-state.ts
- Modify: apps/mobile/src/locale/mobile-copy.ts
- Modify: apps/mobile/src/invite/mobile-invite-contract.ts
- Create: apps/mobile/src/invite/mobile-invite-share.ts
- Modify: apps/mobile/scripts/mobile-invite-contract.test.ts
- Modify: apps/mobile/scripts/mobile-workspace-client.test.ts
- Modify: apps/mobile/scripts/mobile-screen-state.test.ts
- Modify: apps/mobile/scripts/mobile-query-view-state.test.ts
- Modify: apps/mobile/scripts/mobile-bootstrap-contract.test.ts
- Modify: packages/types/src/mobile.ts
- Modify: packages/types/src/mobile.test.ts
- Modify: apps/web/src/lib/mobile/bootstrap.ts
- Modify: apps/web/src/lib/mobile/bootstrap.test.ts
- Modify: apps/mobile/src/quality/mobile-quality-gate.ts
- Modify: apps/mobile/scripts/mobile-quality-gate.test.ts
- Create: apps/mobile/scripts/mobile-invite-share.test.ts
- Create: apps/mobile/component-tests/mobile-server-create-join.test.tsx
- Create: apps/mobile/component-tests/mobile-server-invite-share.test.tsx

**Interfaces:**

```ts
export interface MobileServerCreateJoinSheetProps {
  busy: boolean;
  error: string | null;
  onClose(): void;
  onCreate(input: { name: string }): Promise<{ serverId: string }>;
  onJoin(input: { inviteCode: string }): Promise<{ serverId: string }>;
  onServerReady(serverId: string): void;
  open: boolean;
}

export interface MobileShareAdapter {
  share(content: { message: string }): Promise<{ action: string }>;
}

export function shareMobileInviteUrl(
  shareUrl: string,
  adapter?: MobileShareAdapter,
): Promise<"dismissed" | "shared">;
```

- [ ] **Step 1: Write RED tests**

Invite parsing accepts bounded direct codes and existing Whispr deep-link URLs; rejects foreign hosts/paths; never echoes input in error. Share accepts canonical HTTPS and calls Share.share exactly with { message: shareUrl }.

BottomSheet tests cover open/close/backdrop/back, create/join mode, input validation, duplicate-submit guard, bounded errors, and success selecting returned id. Add RED contract tests proving that the existing workspace client, query, screen-state, and query-view-state path preserves `MobileManagedWorkspaceServerDetailResponseSchema.detail.capabilities` instead of parsing through the older base-detail schema and silently stripping them. Change the bootstrap invite feature expectation from `requires-server-contract` to `available` only now that the M1 join endpoint and this M2 client both exist; lock the shared default, web producer, mobile bootstrap consumer, enabled/pending counts, and mobile quality-gate wording to that same value. Preserve explicit old-backend `requires-server-contract` fixtures so backward-compatible degraded-state rendering remains covered.

Stable testIDs:

```text
mobile-server-add-open
mobile-server-create-join-sheet
mobile-server-mode-create
mobile-server-mode-join
mobile-server-create-name
mobile-server-create-submit
mobile-server-join-input
mobile-server-join-submit
mobile-server-create-error
mobile-server-join-error
mobile-server-invite-share-{serverId}
mobile-server-invite-share-error
```

- [ ] **Step 2: Run RED**

```powershell
corepack pnpm --filter @wizards/types exec node --import tsx --test src/mobile.test.ts
corepack pnpm --filter @wizards/mobile exec node --test --import tsx scripts/mobile-invite-contract.test.ts scripts/mobile-invite-share.test.ts scripts/mobile-workspace-client.test.ts scripts/mobile-screen-state.test.ts scripts/mobile-query-view-state.test.ts scripts/mobile-bootstrap-contract.test.ts scripts/mobile-quality-gate.test.ts
corepack pnpm --filter @wizards/mobile exec jest --runInBand component-tests/mobile-server-create-join.test.tsx component-tests/mobile-server-invite-share.test.tsx
corepack pnpm --filter @wizards/web exec node --import tsx --test --test-force-exit src/lib/mobile/bootstrap.test.ts
```

- [ ] **Step 3: Implement mutations and feature**

Create/join success invalidates bootstrap and the returned workspace key. Invite creation returns directly and is never cached. The feature calls existing onOpenServer(response.server.id) immediately, then allows invalidation/refetch to settle. Parse the existing workspace-detail request with `MobileManagedWorkspaceServerDetailResponseSchema` and propagate that exact managed type through query, screen-state, and view-state layers so capability flags cannot be stripped or widened. Switch the shared/bootstrap invite capability to `available` in the same change; do not enable any other pending bootstrap feature. Rewrite the stale quality-gate claim that invite acceptance is blocked, while retaining generic UI handling for older servers that still report the pending state.

- [ ] **Step 4: Wire below workspace screen**

workspace-browser.tsx calls useMobileServerManagementFeature directly, enables the existing add button, and composes the existing app/components/kit/bottom-sheet.tsx. Thread no new props through home-screen.tsx or mobile-product-app.tsx.

Show invite only when:

```ts
serverState.payload.detail.capabilities.canManageInvites === true;
```

Share the M1 response shareUrl directly and release it when Share settles.

- [ ] **Step 5: Add matching Turkish/English copy**

Add keys for modes, fields, validation, busy/success/error, invite share, icon follow-up, avatar upload/retry/cancel/permission. TestIDs stay locale-independent.

- [ ] **Step 6: Run GREEN**

```powershell
corepack pnpm --filter @wizards/types exec node --import tsx --test src/mobile.test.ts
corepack pnpm --filter @wizards/mobile exec node --test --import tsx scripts/mobile-invite-contract.test.ts scripts/mobile-invite-share.test.ts scripts/mobile-locale-preferences.test.ts scripts/mobile-workspace-client.test.ts scripts/mobile-screen-state.test.ts scripts/mobile-query-view-state.test.ts scripts/mobile-bootstrap-contract.test.ts scripts/mobile-quality-gate.test.ts
corepack pnpm --filter @wizards/mobile exec jest --runInBand component-tests/mobile-server-create-join.test.tsx component-tests/mobile-server-invite-share.test.tsx
corepack pnpm --filter @wizards/web exec node --import tsx --test --test-force-exit src/lib/mobile/bootstrap.test.ts
corepack pnpm --filter @wizards/mobile typecheck
```

### Task 6: Add optimistic avatar preview, rollback, secure session and caches

**Files:**

- Modify: apps/mobile/src/auth/session-manager.ts
- Modify: apps/mobile/src/auth/mobile-auth-context.tsx
- Modify: apps/mobile/scripts/mobile-session-contract.test.ts
- Create: apps/mobile/src/social/mobile-profile-avatar-editor.tsx
- Modify: apps/mobile/src/social/social-account-screens.tsx
- Create: apps/mobile/src/query/mobile-profile-cache.ts
- Create: apps/mobile/scripts/mobile-profile-cache.test.ts
- Create: apps/mobile/component-tests/mobile-profile-avatar-upload.test.tsx

**Interfaces:**

```ts
export function replaceMobileSessionUser(
  session: MobileSessionSnapshot,
  user: MobileSessionUser,
): MobileSessionSnapshot | null;

export interface MobileAuthContextValue {
  replaceSessionUser(user: MobileSessionUser): Promise<boolean>;
}

export function patchMobileProfileAvatarCaches(input: {
  avatarUrl: string;
  queryClient: QueryClient;
  userId: string;
}): void;
```

- [ ] **Step 1: Write RED session/cache tests**

Same-user replacement preserves tokens/schemaVersion/lastValidatedAt; mismatched id fails; normalization is HTTPS-only; local/http/malformed avatar never persists; storage-save failure leaves committed state unchanged. Cache tests patch only matching bootstrap/profile/friends/workspace identities and preserve unrelated references.

- [ ] **Step 2: Write RED component tests**

Prove canonical initial avatar, immediate local preview, claim response replaces preview, upload/claim failure rolls back, retry starts once, busy disables controls, unmount aborts, and session-store failure after successful claim keeps canonical remote avatar with bounded sync warning.

TestIDs:

```text
mobile-profile-avatar-picker
mobile-profile-avatar-preview
mobile-profile-avatar-upload-status
mobile-profile-avatar-error
mobile-profile-avatar-retry
```

- [ ] **Step 3: Run RED**

```powershell
corepack pnpm --filter @wizards/mobile exec node --test --import tsx scripts/mobile-session-contract.test.ts scripts/mobile-profile-cache.test.ts
corepack pnpm --filter @wizards/mobile exec jest --runInBand component-tests/mobile-profile-avatar-upload.test.tsx
```

- [ ] **Step 4: Implement safe session replacement**

Normalize and require same user, save candidate session first, then commit auth state. On save failure retain prior session. Construct user only from authoritative profile-avatar claim response:

```ts
const user: MobileSessionUser = {
  avatarUrl: response.profile.avatarUrl,
  displayName: response.profile.displayName,
  id: response.profile.id,
  username: response.profile.username,
};
```

Do not call refreshSessionFromStorage after claim; that would reload stale storage.

- [ ] **Step 5: Implement profile flow**

Keep display-name/username PATCH unchanged and do not add avatarUrl to MobileProfileUpdateSchema. Replace the existing `mobile-profile-avatar-picker` action in `ProfileEdit` with `MobileProfileAvatarEditor`; do not render a second picker or route profile uploads through the attachment `MobileMediaRuntimeState`. Call selectAndUpload({ purpose: "profile-avatar" }, setVolatilePreview). Require profile-avatar response, patch canonical caches, replace session, clear volatile URI, then narrowly invalidate bootstrap/profile/friends. Roll back only pre-claim failures. Never compensate a committed remote avatar because local storage failed.

- [ ] **Step 6: Run GREEN**

```powershell
corepack pnpm --filter @wizards/mobile exec node --test --import tsx scripts/mobile-session-contract.test.ts scripts/mobile-profile-cache.test.ts
corepack pnpm --filter @wizards/mobile exec jest --runInBand component-tests/mobile-profile-avatar-upload.test.tsx component-tests/profile-settings-screen.test.tsx
corepack pnpm --filter @wizards/mobile typecheck
```

### Task 7: Add server-icon follow-up without deleting the server

**Files:**

- Modify: apps/mobile/src/app/features/use-mobile-server-management-feature.ts
- Modify: apps/mobile/src/app/screens/workspace-browser.tsx
- Modify: apps/mobile/src/locale/mobile-copy.ts
- Modify: apps/mobile/src/workspace/mobile-server-create-join-sheet.tsx
- Create: apps/mobile/src/query/mobile-server-cache.ts
- Create: apps/mobile/scripts/mobile-server-cache.test.ts
- Modify: apps/mobile/component-tests/mobile-server-create-join.test.tsx
- Create: apps/mobile/component-tests/mobile-server-icon-upload.test.tsx

**Interface:**

```ts
export function patchMobileServerIconCaches(input: {
  iconUrl: string;
  queryClient: QueryClient;
  serverId: string;
}): void;
```

- [ ] **Step 1: Write RED tests**

Patch only matching bootstrap/workspace server. Component tests prove selection occurs before icon pick, target is exact server id, response id must match, cancel/failure retains server, retry never re-creates server, and existing-server upload action respects canUploadServerIcon.

TestIDs:

```text
mobile-server-create-icon
mobile-server-create-icon-preview
mobile-server-create-icon-error
mobile-server-create-icon-retry
mobile-server-create-finish
```

- [ ] **Step 2: Run RED**

```powershell
corepack pnpm --filter @wizards/mobile exec node --test --import tsx scripts/mobile-server-cache.test.ts
corepack pnpm --filter @wizards/mobile exec jest --runInBand component-tests/mobile-server-create-join.test.tsx component-tests/mobile-server-icon-upload.test.tsx
```

- [ ] **Step 3: Implement post-create icon flow**

Select created server first; retain id in volatile sheet state; upload { purpose: "server-icon", targetServerId: createdServerId }; require matching server-icon claim; patch canonical response.server.iconUrl in cache values typed as `MobileManagedWorkspaceServerDetailResponse`; invalidate bootstrap and exact workspace. Cancel/failure exposes retry and never calls server DELETE.

- [ ] **Step 4: Run GREEN**

```powershell
corepack pnpm --filter @wizards/mobile exec node --test --import tsx scripts/mobile-server-cache.test.ts
corepack pnpm --filter @wizards/mobile exec jest --runInBand component-tests/mobile-server-create-join.test.tsx component-tests/mobile-server-icon-upload.test.tsx
corepack pnpm --filter @wizards/mobile typecheck
```

### Task 8: Validate realtime payloads and apply narrow cache updates

**Files:**

- Modify: packages/types/src/mobile-workspace-management.ts
- Modify: packages/types/src/mobile-workspace-management.test.ts
- Modify: apps/mobile/src/realtime/mobile-realtime-contract.ts
- Modify: apps/mobile/src/realtime/realtime-query-bridge.ts
- Create: apps/mobile/src/query/mobile-realtime-cache.ts
- Modify: apps/mobile/src/query/mobile-query-keys.ts
- Modify: apps/mobile/scripts/mobile-realtime-contract.test.ts
- Modify: apps/mobile/scripts/mobile-realtime-query-bridge.test.ts
- Create: apps/mobile/scripts/mobile-realtime-cache.test.ts

**Schemas:**

```text
MobileServerSettingsUpdatedEventSchema
MobileServerMembershipAddedEventSchema
MobileServerMembershipRemovedEventSchema
MobileMessageHistoryClearedEventSchema
MobilePresenceUpdateEventSchema
MobileUserProfileUpdatedEventSchema
```

If M1 already exported them, do not duplicate or alter. Add query prefixes:

```ts
workspaceRoot: () => [...all, "workspace"] as const,
channelMessagesRoot: () => [...all, "channel-messages"] as const,
dmMessagesRoot: () => [...all, "dm-messages"] as const,
```

- [ ] **Step 1: Write RED contract/cache/bridge tests**

Require exact schema success before payload preservation. Malformed ids/status/avatar/fields produce payload null. Map membership/settings to bootstrap+workspace, presence to presence+workspace, profile to bootstrap+presence+workspace.

Prove membership removed immediately removes only that bootstrap server and exact workspace query; added/settings invalidates event server even when inactive; presence/profile patch only matching friends/bootstrap/workspace identities; unrelated references stay identical; missing cache falls back to one debounced narrow invalidation; malformed payload changes nothing; dispose clears timers. Workspace cache helpers must preserve the full `MobileManagedWorkspaceServerDetailResponse`, including every capability flag.

- [ ] **Step 2: Run RED**

```powershell
corepack pnpm --filter @wizards/types exec node --import tsx --test src/mobile-workspace-management.test.ts
corepack pnpm --filter @wizards/mobile exec node --test --import tsx scripts/mobile-realtime-contract.test.ts scripts/mobile-realtime-query-bridge.test.ts scripts/mobile-realtime-cache.test.ts
```

- [ ] **Step 3: Implement explicit schema registry**

createMobileRealtimeEventEnvelope resolves by exact event name, safeParses, derives ids only from parsed data, stores parsed payload on success/null on failure, and leaves message/typing/voice behavior unchanged.

- [ ] **Step 4: Implement narrow bridge behavior**

- membership removed: patch bootstrap and removeQueries exact workspace(serverId);
- membership added/settings: invalidate exact bootstrap and event workspace;
- presence/profile: setQueriesData under workspaceRoot plus exact friends/bootstrap;
- skip generic invalidation only for a successfully patched scope;
- never cast unknown event payload.

The bridge remains auth-context agnostic. Claim path updates current secure session; M3 may later wire verified current-user socket profile payload to replaceSessionUser.

- [ ] **Step 5: Run GREEN**

```powershell
corepack pnpm --filter @wizards/types exec node --import tsx --test src/mobile-workspace-management.test.ts
corepack pnpm --filter @wizards/types typecheck
corepack pnpm --filter @wizards/mobile exec node --test --import tsx scripts/mobile-realtime-contract.test.ts scripts/mobile-realtime-query-bridge.test.ts scripts/mobile-realtime-cache.test.ts
corepack pnpm --filter @wizards/mobile typecheck
```

### Task 9: Verify, graph, commit once, and push uat

**Files:**

- Modify: docs/superpowers/plans/2026-07-13-mobile-phase4-m2-client-realtime.md

- [ ] **Step 1: Run all focused tests**

```powershell
corepack pnpm --filter @wizards/mobile exec node --test --import tsx scripts/mobile-image-upload-contract.test.ts scripts/mobile-media-upload-architecture.test.ts scripts/mobile-server-management-client.test.ts scripts/mobile-server-management-mutations.test.ts scripts/mobile-media-claim-client.test.ts scripts/mobile-image-upload-service.test.ts scripts/mobile-workspace-selection.test.ts scripts/mobile-invite-contract.test.ts scripts/mobile-invite-share.test.ts scripts/mobile-session-contract.test.ts scripts/mobile-profile-cache.test.ts scripts/mobile-server-cache.test.ts scripts/mobile-realtime-contract.test.ts scripts/mobile-realtime-query-bridge.test.ts scripts/mobile-realtime-cache.test.ts
corepack pnpm --filter @wizards/mobile exec jest --runInBand component-tests/mobile-server-create-join.test.tsx component-tests/mobile-server-invite-share.test.tsx component-tests/mobile-profile-avatar-upload.test.tsx component-tests/mobile-server-icon-upload.test.tsx
```

- [ ] **Step 2: Run complete non-device gate**

```powershell
corepack pnpm --filter @wizards/types typecheck
corepack pnpm --filter @wizards/types test
corepack pnpm --filter @wizards/mobile test
corepack pnpm --filter @wizards/mobile exec jest --runInBand
corepack pnpm --filter @wizards/mobile typecheck
corepack pnpm --filter @wizards/mobile quality:check
corepack pnpm --filter @wizards/mobile exec expo install --check
corepack pnpm --filter @wizards/web typecheck
corepack pnpm --filter @wizards/web test
corepack pnpm --filter @wizards/web build
git diff --check
```

Every command must exit 0. Do not substitute native build.

- [ ] **Step 3: Smoke on existing Phase 3 development client**

```powershell
corepack pnpm --filter @wizards/mobile start -- --clear
```

Verify create/select, optional icon claim and retry, join/select, native canonical invite share, avatar preview/canonical/rollback, inaccessible selected-server fallback, malformed realtime no-op, and no token/URI/key/raw provider URL in Metro logs. Stop Metro; do not rebuild client.

- [ ] **Step 4: Update graph and keep generated output unstaged**

```powershell
graphify update .
git status --short
```

- [ ] **Step 5: Verify direct-uat ancestry**

```powershell
git fetch origin uat
git branch --show-current
git rev-parse HEAD
git rev-parse origin/uat
git status --short
```

Require current branch uat and expected M1 ancestry. Stage only reviewed M2 sources/tests/package files, shared realtime schemas if needed, and this plan. Reject graphify-out, artifacts, .env.maestro, local media, tsbuildinfo, native files, and mobile-product-app.tsx.

- [ ] **Step 6: Create the sole M2 commit**

```powershell
git commit -m "feat(mobile): add server creation, invites and avatar upload"
git show --stat --oneline HEAD
git status --short
```

- [ ] **Step 7: Push and verify UAT**

Re-fetch and stop if origin/uat moved unexpectedly:

```powershell
git fetch origin uat
git push origin uat
```

Verify Railway build, /ready 200, /api/health 200, and deployed create/join/invite/claim routing. Confirm logs contain no invite code, bearer token, local URI, UploadThing key, or raw provider URL. If deployment fails after push, stop M3, retry the same commit only for a transient/configuration failure, and never amend or force-push the deployed M2 commit. If repository code must change, use the narrowly scoped deployment-recovery exception defined by M1 and record it in the Phase 4 handoff.
