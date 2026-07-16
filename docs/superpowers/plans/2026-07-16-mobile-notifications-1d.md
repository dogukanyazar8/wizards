# Whispr Mobile 1D Bildirimler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** UAT Bildirimler sekmesini gerçek bildirim verisi, güvenli aksiyonlar ve 1D yüksek sadakatli görselle tamamlamak.

**Architecture:** `NotificationsScreen` API sorgusunun kanonik görünüm katmanı olarak kalır. Saf yardımcılar bildirimleri gün ve gerçek bağlama göre sınıflandırır; ekran mevcut mark-read, native permission, deep-link ve LiveKit katılım akışlarını bu yardımcıların çıkışına bağlar. Stil değerleri sabit renkler yerine mevcut tema token'larına bağlanır.

**Tech Stack:** Expo React Native, TypeScript, TanStack Query, React Native Testing Library, Jest, node:test, Maestro/ADB.

## Global Constraints

- `uat` üzerinde çalış; kullanıcı değişikliklerini resetleme, silme veya stash'leme.
- Üretim UI'ında dummy/mock/fake bildirim, kullanıcı, sunucu, kanal, unread değeri ya da izin durumu oluşturma.
- İzin yalnızca CTA dokunuşu ile; mikrofon yalnızca gerçek sesli-oda katılım aksiyonu ile istenir.
- `mobile-notifications-screen` testID'si korunur; etkileşimli hedefler en az 44px olur.
- 1D renk, tipografi ve geometri `design_handoff_whispr_mobile/Whispr Mobile Redesign.dc.html#1d` ile uyumlu olmalıdır.

---

### Task 1: Saf bildirim sunum modelini kilitle

**Files:**
- Create: `apps/mobile/src/app/screens/notifications-screen-model.ts`
- Test: `apps/mobile/component-tests/notifications-screen-model.test.ts`

**Consumes:** `MobileNotificationItem` ve `createdAt`, `type`, `actor`, `server`, `channel`, `messageQuote`, `actionUrl` alanları.

**Produces:** `groupMobileNotificationsByDay(notifications, now)` ve `getMobileNotificationPresentation(notification)`; satır türü yalnızca gerçek API alanlarından belirlenir.

- [ ] **Step 1: Write the failing test**

```ts
expect(groupMobileNotificationsByDay([todayMention, yesterdayReaction], now)).toEqual([
  { label: "BUGÜN", notifications: [todayMention] },
  { label: "DÜN", notifications: [yesterdayReaction] },
]);
expect(getMobileNotificationPresentation(todayMention).kind).toBe("mention");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm --filter @wizards/mobile exec jest component-tests/notifications-screen-model.test.ts --runInBand`

Expected: FAIL because `notifications-screen-model` does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
export function groupMobileNotificationsByDay(
  notifications: readonly MobileNotificationItem[],
  now: Date,
): readonly MobileNotificationDayGroup[] {
  // Compare local calendar dates and return only labels derived from each createdAt value.
}
```

`getMobileNotificationPresentation` must map supported API types to semantic icon/role values and retain the original `actionUrl`; it must not inspect `body` text to invent an event.

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm --filter @wizards/mobile exec jest component-tests/notifications-screen-model.test.ts --runInBand`

Expected: PASS.

### Task 2: Prove the screen behavior before changing it

**Files:**
- Create: `apps/mobile/component-tests/notifications-screen-1d.test.tsx`
- Modify: `apps/mobile/src/app/screens/notifications-screen.tsx`

**Consumes:** Task 1 presentation model and existing notification runtime/query hooks.

**Produces:** tests for permission, unread, grouping, deep-link, state, and accessibility contracts.

- [ ] **Step 1: Write failing component tests**

```tsx
it("does not request native permission until the explicit CTA is pressed", async () => {
  const view = await render(<NotificationsScreen {...notRequestedProps} />);
  expect(onRequestNotificationPermission).not.toHaveBeenCalled();
  await fireEvent.press(view.getByTestId("mobile-notifications-request-permission"));
  expect(onRequestNotificationPermission).toHaveBeenCalledTimes(1);
});

it("marks the selected real notification read before opening its safe action URL", async () => {
  const view = await render(<NotificationsScreen {...unreadMentionProps} />);
  await fireEvent.press(view.getByTestId(`mobile-notification-${mention.id}`));
  expect(markRead).toHaveBeenCalledWith(mention.id);
  expect(onOpenNotification).toHaveBeenCalledWith(mention.actionUrl);
});
```

Add independent assertions for `BUGÜN`/`DÜN`, mark-all, loading skeleton, exact empty copy, retry/offline, 44px CTA, and no hard-coded reference identities.

- [ ] **Step 2: Run tests to verify they fail**

Run: `corepack pnpm --filter @wizards/mobile exec jest component-tests/notifications-screen-1d.test.tsx --runInBand`

Expected: FAIL because the current screen has no grouped model, navigation callback, or skeleton.

- [ ] **Step 3: Implement the smallest screen and prop changes**

```tsx
<Pressable
  accessibilityLabel={notification.body}
  onPress={() => onOpenNotification(notification)}
  testID={`mobile-notification-${notification.id}`}
>
  <MobileNotificationFeedRow notification={notification} />
</Pressable>
```

Keep query ownership in `NotificationsScreen`; pass only explicit callbacks from `MobileProductApp` for route navigation and a real voice join. Do not request permission from effects, mount, refresh, or background code.

- [ ] **Step 4: Run tests to verify they pass**

Run: `corepack pnpm --filter @wizards/mobile exec jest component-tests/notifications-screen-1d.test.tsx --runInBand`

Expected: PASS.

### Task 3: Apply the 1D visual contract with theme roles

**Files:**
- Modify: `apps/mobile/src/app/screens/notifications-screen.tsx`
- Modify: `apps/mobile/src/app/screens/notifications-screen.styles.ts`
- Modify: `apps/mobile/component-tests/notifications-screen-1d.test.tsx`
- Modify: `apps/mobile/scripts/mobile-design-contract.test.ts`

**Consumes:** Task 1 semantic presentation and existing `MobileTheme` token roles.

**Produces:** 1D header, permission card, grouped cards, skeletons and state views whose dimensions are style-testable.

- [ ] **Step 1: Write failing geometry tests**

```ts
expect(styles.notificationsTitle).toMatchObject({ fontSize: 26, letterSpacing: -0.52 });
expect(styles.notificationPermissionCard).toMatchObject({ borderRadius: 20, marginHorizontal: 20 });
expect(styles.notificationFeedRowUnread).toMatchObject({ borderRadius: 18, borderWidth: 1 });
expect(styles.notificationUnreadDot).toMatchObject({ height: 8, width: 8 });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `corepack pnpm --filter @wizards/mobile exec jest component-tests/notifications-screen-1d.test.tsx --runInBand`

Expected: FAIL on the current header/list geometry.

- [ ] **Step 3: Implement semantic styles and loading layout**

Use `theme.surface.background`, `theme.text.primary`, `theme.accent.*`, `theme.border.subtle`, semantic spacing and sizing tokens. Implement skeleton rows with the same 44px icon, text columns, 18px row radius and 6px separation as real cards; never render sample copy as placeholder content.

- [ ] **Step 4: Run test and quality contracts**

Run: `corepack pnpm --filter @wizards/mobile exec jest component-tests/notifications-screen-1d.test.tsx mobile-redesign-semantic-role-gate.test.tsx --runInBand`

Expected: PASS with no raw-color or semantic-role violation.

### Task 4: Wire safe route and voice actions from the product runtime

**Files:**
- Modify: `apps/mobile/src/app/mobile-product-app.tsx`
- Modify: `apps/mobile/src/app/screens/notifications-screen.tsx`
- Modify: `apps/mobile/component-tests/notifications-screen-1d.test.tsx`

**Consumes:** `joinVoiceChannel`, `openMobileVoiceRoom`, and existing safe route-intent navigation.

**Produces:** real notification deep-link and voice join callbacks without an alternate permission path.

- [ ] **Step 1: Write failing callback tests**

```tsx
await fireEvent.press(view.getByTestId(`mobile-notification-${mention.id}`));
expect(onOpenNotification).toHaveBeenCalledWith(mention.actionUrl);
await fireEvent.press(view.getByTestId(`mobile-notification-voice-join-${voice.id}`));
expect(onJoinVoiceNotification).toHaveBeenCalledWith(voice);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `corepack pnpm --filter @wizards/mobile exec jest component-tests/notifications-screen-1d.test.tsx --runInBand`

Expected: FAIL because callbacks are not yet exposed.

- [ ] **Step 3: Add callback wiring**

The product runtime must invoke `joinVoiceChannel` only after the voice join chip press, then call `openMobileVoiceRoom` only after a successful join. For ordinary notification rows, forward only Zod-validated relative `actionUrl` values to the existing route-intent handler.

- [ ] **Step 4: Run tests to verify they pass**

Run: `corepack pnpm --filter @wizards/mobile exec jest component-tests/notifications-screen-1d.test.tsx --runInBand`

Expected: PASS.

### Task 5: Verify the mobile product and real-device evidence

**Files:**
- Modify: only source/test files from Tasks 1-4 if a verification failure exposes a defect.

- [ ] **Step 1: Run focused and package verification**

Run:

```powershell
corepack pnpm --filter @wizards/mobile test
corepack pnpm --filter @wizards/mobile test:components -- --runInBand
corepack pnpm --filter @wizards/mobile typecheck
corepack pnpm --filter @wizards/mobile quality:check
```

Expected: each command exits 0.

- [ ] **Step 2: Update the graph**

Run: `graphify update .`

Expected: graph update completes after code changes.

- [ ] **Step 3: Build, capture, and gate Android UAT**

Run:

```powershell
corepack pnpm --filter @wizards/mobile android:uat:local
corepack pnpm --filter @wizards/mobile visual:capture:android -- --anchor 1d
$env:WHISPR_DEVICE_CAPTURE_DIRECTORY='artifacts/redesign'; corepack pnpm --filter @wizards/mobile visual:gate -- --target 1d-light
```

Expected: Android install succeeds; capture manifest, screenshot and overlay/report are produced; 1d-light exits 0. If no prepared UAT session exists, do not enter credentials or bypass authentication; report the blocked evidence step.

## Self-review

- Coverage: Tasks 1-4 cover data derivation, permission safety, unread/realtime mutation, grouping, action wiring, visual geometry and all state views; Task 5 covers required command/device evidence.
- No-placeholder scan: completed; code blocks name exact interfaces and commands.
- Type consistency: `MobileNotificationItem` remains the only notification payload source; product callbacks are explicit screen props rather than an alternate store.
