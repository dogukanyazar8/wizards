# Mobile Active Voice Room (1e) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Render the signed-in user's real LiveKit session as the high-fidelity 1e full-screen voice room while preserving the existing join, leave, mute, minimize, and mini-bar ownership.

**Architecture:** Keep MobileVoiceRoomState as the sole session source. A pure 1e presentation model maps connection, participant, and duration fields to screen props; the stack container owns minimize and chat navigation. The screen consumes semantic theme roles, so light and dark update through the persistent existing theme provider.

**Tech Stack:** React Native, TypeScript, React Navigation, LiveKit, Jest, React Native Testing Library, Expo Android UAT tooling, Graphify.

## Global Constraints

- Work only on uat and preserve all unrelated modified files.
- Do not add mock, dummy, fake, or hard-coded room, server, duration, participant, speaking, mute, or connection data.
- The 1e screen must not request microphone permission on render, mount, minimize, or reconnect; existing explicit join remains the only entry point.
- Back minimizes an active session; leave disconnects LiveKit and removes the mini bar.
- Keep mobile-voice-room-screen, existing haptics, and the mini voice bar across the four main tabs.
- Use existing persistent light/dark theme infrastructure and canonical 390x844 1e geometry.
- Do not type credentials, submit auth, or bypass challenges in UAT validation.

---

## File structure

- Create apps/mobile/src/app/screens/active-voice-room-model.ts: pure display model from MobileVoiceRoomState.
- Create apps/mobile/scripts/mobile-active-voice-room-model.test.ts: model and no-synthetic-state tests.
- Modify apps/mobile/src/app/screens/voice-screen.tsx: full-screen 1e composition and accessible controls.
- Modify apps/mobile/src/app/screens/voice-screen.styles.ts: focused token-based 1e styles.
- Modify apps/mobile/src/app/mobile-product-app.tsx: actual server-name lookup from ready bootstrap data.
- Modify apps/mobile/src/app/screens/mobile-screen-containers.tsx: minimize and voice-channel chat navigation.
- Modify apps/mobile/component-tests/voice-screen-components.test.tsx: state rendering and action tests.
- Modify apps/mobile/component-tests/mobile-screen-containers.test.tsx: minimize and chat navigation tests.
- Modify apps/mobile/component-tests/mobile-communication-theme.test.tsx: light/dark 1e assertions.
- Modify apps/mobile/scripts/mobile-design-contract.test.ts: test ID, measurement, style, permission, and data-source locks.

### Task 1: Pure active-room presentation model

**Files:**
- Create: apps/mobile/src/app/screens/active-voice-room-model.ts
- Test: apps/mobile/scripts/mobile-active-voice-room-model.test.ts

**Interfaces:** consume MobileVoiceRoomState, serverName: string | null, and now: number. Export getMobileActiveVoiceRoomModel(room, serverName, now) with connectionLabel, elapsedLabel, original participants, and action guards.

- [ ] **Step 1: Write the failing model tests.**

~~~ts
test("derives connected content only from the voice room", () => {
  const model = getMobileActiveVoiceRoomModel(
    createVoiceRoom({ connectedAt: 0, status: "connected" }),
    "UAT ENV",
    24_160,
  );
  assert.equal(model.connectionLabel, "Bağlı");
  assert.equal(model.elapsedLabel, "00:24");
  assert.equal(model.participants[0]?.userId, "speaker");
});

test("does not fabricate participants for transient states", () => {
  for (const status of ["connecting", "reconnecting", "error"] as const) {
    const model = getMobileActiveVoiceRoomModel(createVoiceRoom({ participants: [], status }), null, 1);
    assert.equal(model.participants.length, 0);
  }
});
~~~

- [ ] **Step 2: Verify red.** Run: corepack pnpm --filter @wizards/mobile test -- mobile-active-voice-room-model.test.ts --runInBand. Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the minimal model.**

~~~ts
export function getMobileActiveVoiceRoomModel(
  room: MobileVoiceRoomState,
  serverName: string | null,
  now: number,
) {
  return {
    channelName: room.channelName,
    connectionLabel: getVoiceConnectionLabel(room.status),
    elapsedLabel: formatVoiceElapsedTime(room.connectedAt, now),
    participants: room.participants,
    serverName,
    canLeave: room.status !== "idle" && room.status !== "leaving",
    canToggleMute: room.status === "connected",
  };
}
~~~

Implement a label for every existing connection status, return null duration when connectedAt is absent, and never substitute a participant or server value.

- [ ] **Step 4: Verify green.** Re-run Step 2; expected: PASS.
- [ ] **Step 5: Commit.** Run: git add apps/mobile/src/app/screens/active-voice-room-model.ts apps/mobile/scripts/mobile-active-voice-room-model.test.ts; then git commit -m "feat(mobile): model active voice room state".

### Task 2: Render and test the full-screen 1e UI

**Files:**
- Modify: apps/mobile/src/app/screens/voice-screen.tsx
- Modify: apps/mobile/src/app/screens/voice-screen.styles.ts
- Modify: apps/mobile/component-tests/voice-screen-components.test.tsx
- Modify: apps/mobile/component-tests/mobile-communication-theme.test.tsx

**Interfaces:** consume Task 1 model and onMinimize, onOpenChat, onLeaveVoiceChannel, onToggleVoiceMute, onSelectVoiceAudioOutput, and existing invite callbacks. Produce VoiceScreen with a 1e root and four controls.

- [ ] **Step 1: Write failing rendering and action tests.**

~~~tsx
it("renders actual speaking and muted participants in the 1e grid", async () => {
  const view = await render(
    <VoiceScreen {...createVoiceScreenProps({
      voiceRoomState: createConnectedVoiceRoom({
        participants: [
          createParticipant({ isSpeaking: true, userId: "speaker" }),
          createParticipant({ isMuted: true, userId: "muted" }),
        ],
      }),
    })} />,
  );
  expect(view.getByTestId("mobile-voice-room-screen")).toBeTruthy();
  expect(view.getByTestId("mobile-voice-participant-speaker")).toBeTruthy();
  expect(view.getByTestId("mobile-voice-participant-muted-badge")).toBeTruthy();
});

it("uses controls without requesting microphone permission", async () => {
  const props = createVoiceScreenProps();
  const view = await render(<VoiceScreen {...props} />);
  await fireEvent.press(view.getByTestId("mobile-voice-minimize"));
  await fireEvent.press(view.getByTestId("mobile-voice-mute-toggle"));
  await fireEvent.press(view.getByTestId("mobile-voice-chat"));
  await fireEvent.press(view.getByTestId("mobile-voice-leave"));
  expect(props.onRequestVoicePermission).not.toHaveBeenCalled();
});
~~~

- [ ] **Step 2: Verify red.** Run: corepack pnpm --filter @wizards/mobile test:components -- voice-screen-components.test.tsx --runInBand. Expected: FAIL because the 1e IDs and callbacks do not exist.

- [ ] **Step 3: Implement 1e composition.**

~~~tsx
<View style={styles.activeVoiceRoomScreen} testID={testID}>
  <ActiveVoiceRoomHeader model={model} onMinimize={onMinimize} />
  <ActiveVoiceRoomParticipantGrid participants={model.participants} onInvite={onOpenVoiceInvite} />
  <View style={styles.activeVoiceRoomControls}>
    <ActiveVoiceRoomControl testID="mobile-voice-mute-toggle" onPress={onToggleVoiceMute} />
    <ActiveVoiceRoomControl testID="mobile-voice-audio-output" onPress={toggleAudioOutput} />
    <ActiveVoiceRoomControl testID="mobile-voice-chat" onPress={onOpenChat} />
    <ActiveVoiceRoomControl testID="mobile-voice-leave" tone="danger" onPress={onLeaveVoiceChannel} />
  </View>
  <Text style={styles.activeVoiceRoomPermissionFootnote}>{copy.voiceSetupFootnote}</Text>
</View>
~~~

Use only room.participants in the two-column grid. Implement 80px squircle avatars, radius-28 cards, 14px grid gap, 26px mute badge, 60px/radius-22 controls, semantic success ring for real speaking, and a real connection chip. Reuse the current device selection sheet for audio output and current invite flow. Do not mount PermissionReadinessCard, camera/screen-share surfaces, or a permission request from 1e.

- [ ] **Step 4: Write both theme assertions.**

~~~ts
expect(createVoiceScreenStyles(darkTheme).activeVoiceRoomScreen.backgroundColor).toBe("#1E2235");
expect(createVoiceScreenStyles(lightTheme).activeVoiceRoomScreen.backgroundColor).toBe("#F6F7FB");
expect(createVoiceScreenStyles(lightTheme).activeVoiceRoomParticipantCard).toMatchObject({
  backgroundColor: "#FFFFFF", borderColor: "#E7E9F4", borderRadius: 28, borderWidth: 1,
});
~~~

Use semantic theme roles in implementation. Add a named theme token only if no current role represents the required value; never place hex values in JSX.

- [ ] **Step 5: Verify green.** Run: corepack pnpm --filter @wizards/mobile test:components -- voice-screen-components.test.tsx mobile-communication-theme.test.tsx --runInBand. Expected: PASS.
- [ ] **Step 6: Commit.** Run: git add apps/mobile/src/app/screens/voice-screen.tsx apps/mobile/src/app/screens/voice-screen.styles.ts apps/mobile/component-tests/voice-screen-components.test.tsx apps/mobile/component-tests/mobile-communication-theme.test.tsx; then git commit -m "feat(mobile): render active voice room redesign".

### Task 3: Wire real server context and safe navigation

**Files:**
- Modify: apps/mobile/src/app/mobile-product-app.tsx
- Modify: apps/mobile/src/app/screens/mobile-screen-containers.tsx
- Modify: apps/mobile/component-tests/mobile-screen-containers.test.tsx

**Interfaces:** consume voiceRoomState.serverId, ready bootstrapState.payload.home.servers.recent, and VoiceRoom navigation. Supply serverName, onMinimize, and onOpenChat to VoiceScreen.

- [ ] **Step 1: Write failing navigation tests.**

~~~tsx
it("minimizes an active room without leaving it", async () => {
  const view = await render(
    <VoiceRoomStackScreenContainer navigation={navigation as never} route={{} as never} />,
  );
  await fireEvent.press(view.getByTestId("mobile-voice-minimize"));
  expect(mockVoiceScreenProps.onLeaveVoiceChannel).not.toHaveBeenCalled();
  expect(navigation.navigate).toHaveBeenCalledWith("MainTabs", { screen: "overview" });
});
~~~

Add a separate test that mobile-voice-chat calls navigation.navigate("ChannelChat", { channelId, serverId }) and does nothing when either actual ID is absent.

- [ ] **Step 2: Verify red.** Run: corepack pnpm --filter @wizards/mobile test:components -- mobile-screen-containers.test.tsx --runInBand. Expected: FAIL because the new callbacks are not supplied.

- [ ] **Step 3: Implement real lookup and route guard.**

~~~tsx
const voiceServerName = bootstrapState.status === "ready"
  ? (bootstrapState.payload.home.servers.recent.find((server) => server.id === voiceRoomState.serverId)?.name ?? null)
  : null;

const openVoiceRoomChat = useCallback(() => {
  if (!room.channelId || !room.serverId) return;
  navigation.navigate("ChannelChat", { channelId: room.channelId, serverId: room.serverId });
}, [navigation, room.channelId, room.serverId]);
~~~

Pass voiceServerName through voiceScreenProps; pass onMinimize={minimizeVoiceRoom} and onOpenChat={openVoiceRoomChat}. Retain onLeaveVoiceChannel={leaveVoiceRoom}; do not call join or permission logic.

- [ ] **Step 4: Verify green.** Re-run Step 2; expected: PASS.
- [ ] **Step 5: Commit.** Run: git add apps/mobile/src/app/mobile-product-app.tsx apps/mobile/src/app/screens/mobile-screen-containers.tsx apps/mobile/component-tests/mobile-screen-containers.test.tsx; then git commit -m "feat(mobile): wire active voice room navigation".

### Task 4: Lock the contract and produce Android evidence

**Files:**
- Modify: apps/mobile/scripts/mobile-design-contract.test.ts
- Test: apps/mobile/scripts/mobile-maestro-testid-contract.test.ts
- Evidence: artifacts/redesign/1e-light/ and artifacts/redesign/diff/1e-light/

**Interfaces:** consume implemented source/test IDs and capture output; produce source-level drift locks and visual evidence.

- [ ] **Step 1: Write failing static contract assertions.**

~~~ts
assert.match(voiceScreenSource, /testID="mobile-voice-room-screen"/);
assert.match(voiceScreenSource, /testID="mobile-voice-minimize"/);
assert.match(voiceScreenSource, /testID="mobile-voice-chat"/);
assert.doesNotMatch(activeRoomSource, /\b(mock|dummy|fake)\b/i);
assert.match(voiceStylesSource, /activeVoiceRoomParticipantCard[\s\S]*borderRadius:\s*28/);
assert.match(voiceStylesSource, /activeVoiceRoomControl[\s\S]*width:\s*60/);
~~~

Scope forbidden-data checks to active-room production files and assert no render/effect path calls onRequestVoicePermission.

- [ ] **Step 2: Verify red.** Run: corepack pnpm --filter @wizards/mobile test -- mobile-design-contract.test.ts mobile-maestro-testid-contract.test.ts --runInBand. Expected: FAIL until 1e source and styles exist.

- [ ] **Step 3: Run required automated verification.**

~~~powershell
corepack pnpm --filter @wizards/mobile test
corepack pnpm --filter @wizards/mobile test:components -- --runInBand
corepack pnpm --filter @wizards/mobile typecheck
corepack pnpm --filter @wizards/mobile quality:check
graphify update .
~~~

Expected: every command exits 0; fix the underlying cause before building.

- [ ] **Step 4: Build, capture, and gate.**

~~~powershell
corepack pnpm --filter @wizards/mobile android:uat:local
corepack pnpm --filter @wizards/mobile visual:capture:android -- --anchor 1e
$env:WHISPR_DEVICE_CAPTURE_DIRECTORY='artifacts/redesign'; corepack pnpm --filter @wizards/mobile visual:gate -- --target 1e-light
~~~

Inspect connected device/activity first. If a signed-in UAT session and real room are prepared, enter only via visible join and accept native microphone permission only after that action. Otherwise report the real-room check blocked; do not sign in or bypass auth.

- [ ] **Step 5: Resolve visual diffs honestly.** Inspect artifacts/redesign/1e-light/1e-light.png, its manifest, and artifacts/redesign/diff/1e-light/visual-diff-overlay.png when present. Correct grid, card, avatar, speaking/mute badge, control, spacing, and theme differences. Never use app output as baseline.

- [ ] **Step 6: Commit intentional files only.** Run git status --short; stage source, tests, and graph output only after review; stage capture artifacts only if repo convention tracks them.

## Plan self-review

- Spec coverage: Tasks 1-2 cover live state, visual 1e layout, controls, themes, and permission safety. Task 3 covers server resolution, minimize, chat, leave semantics, and mini bar preservation. Task 4 covers drift locks, test/type/quality verification, UAT build, capture, gate, and safe manual validation.
- Placeholder scan: no deferred requirements or undefined actions remain.
- Type consistency: the model consumes existing MobileVoiceRoomState; navigation uses existing ChannelChat identifiers; real server context flows through the current provider/container boundary.
