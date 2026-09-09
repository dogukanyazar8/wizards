# Settings Functional Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Web ve Desktop Ayarlar ekranındaki her referans satırını gerçek kullanıcı davranışı, kalıcılık, runtime tüketimi veya açık unavailable/informational durumu üzerinden otomatik doğrulamak.

**Architecture:** Testler dört kanıt katmanı kullanır: exhaustive satır sözleşmesi, bölüm bridge/service testleri, gerçek runtime tüketici testleri, kritik Web/Tauri uçtan uca contract testleri. Bir test yalnız setter, mock veya kaynak metni doğrulayarak “fonksiyonel” sayılmaz. Henüz üründe bulunmayan davranışlar sessiz başarı yerine açık disabled/unavailable olarak test edilir.

**Tech Stack:** Node 24 test runner, `tsx`, React 19 server rendering, Playwright 1.61, Tauri 2/Rust unit tests, Prisma service dependency seams.

**Spec:** `design_handoff/ayarlar-paketi/referans/Ayarlar-referans.dc.html`

## Global Constraints

- Mevcut kirli `uat` değişiklikleri korunacak; reset, clean, stash, commit veya push yok.
- Referanstaki 170 satır ile ürünün ek `g9` satırı kapsanacak.
- Beklenti değerleri üretim kodunun helper'larından türetilmeyecek; literal ve elle doğrulanmış olacak.
- Mock yalnız DB, browser media API, socket veya işletim sistemi gibi dış sınırda kullanılacak.
- Unsupported satırlar sahte PATCH üretmeyecek; UI açık disabled/unavailable durumu gösterecek.
- Bir runtime tüketicisi bulunmayan preference “çalışıyor” olarak işaretlenmeyecek.

---

### Task 1: Exhaustive settings behavior contract

**Files:**

- Create: `apps/web/src/lib/settings/functional-coverage.test.ts`
- Modify: `apps/web/src/lib/settings/tree.test.ts`

**Interfaces:**

- Consumes: `walkSettingsRows()`, account/AV/appearance/notification/Desktop bridge exports.
- Produces: Her `section/tab/key` occurrence için `runtime`, `platform`, `disabled` veya `informational` kanıtı.

- [ ] **Step 1: Write failing coverage test**

  Test, 170 referans satırı ve `g9` için literal beklenen occurrence listesini gerçek ağaçla karşılaştırır; kanıtsız etkileşimli satırları hata mesajında listeler.

- [ ] **Step 2: Verify RED**

  Run: `pnpm.cmd --filter @wizards/web exec node --import tsx --test src/lib/settings/functional-coverage.test.ts`

  Expected: `FUNCTIONAL_EVIDENCE_MISSING` ile eksik anahtar listesi.

- [ ] **Step 3: Add real probes**

  Her probe gerçek üretim giriş noktasını çağırır ve observable çıktı, side effect, payload, policy kararı veya disabled durumunu doğrular. Yalnız string/file-presence assertion yasak.

- [ ] **Step 4: Verify GREEN**

  Aynı focused komut. Expected: tüm occurrence ve probe testleri PASS.

### Task 2: Account and AV behavior

**Files:**

- Modify: `apps/web/src/components/settings/sections/account/account-surface.test.ts`
- Modify: `apps/web/src/components/settings/sections/account/account-section.test.tsx`
- Modify: `apps/web/src/components/settings/sections/av/av-settings-bridge.test.tsx`
- Modify: ilgili gerçek account/privacy/voice consumer testleri.

- [ ] **Step 1: Add failing consumer tests**

  Privacy policy enforcement, locale/time formatting, idle timer, presence, media device selection, processing, PTT, screen-share kalite/ses davranışları test edilir. Store-only alanlar gerçek tüketici yoksa RED kalır.

- [ ] **Step 2: Verify RED per behavior**

  Her test tek beklenen eksik side effect nedeniyle fail etmeli.

- [ ] **Step 3: Implement minimum real wiring or explicit unavailable state**

  Üretim davranışı tasarım sözleşmesinde mevcutsa gerçek consumer'a bağlanır; platform/API yoksa kontrol disabled yapılır. Test-only branch eklenmez.

- [ ] **Step 4: Run account and AV focused suites**

  Run exact modified test files with Node/tsx runner.

### Task 3: Appearance behavior

**Files:**

- Modify: `apps/web/src/components/settings/sections/appearance/appearance-settings-bridge.test.tsx`
- Modify: gerçek shell/message/accessibility consumer testleri ve yalnız gerekli üretim dosyaları.

- [ ] **Step 1: Add failing DOM/runtime tests**

  Theme, font, density, widths, message/media flags, animation, contrast, focus, text scale, TTS, screen-reader descriptions, system preference takip davranışları ayrı observable sonuçlarla test edilir.

- [ ] **Step 2: Verify RED**

  Attribute veya PATCH varlığı tek başına başarı kabul edilmez.

- [ ] **Step 3: Wire real consumers or disable unsupported controls**

- [ ] **Step 4: Run focused appearance and affected consumer tests**

### Task 4: Notification behavior

**Files:**

- Modify: `apps/web/src/lib/notifications/prefs-policy.test.ts`
- Modify: notification producer service tests.
- Modify: `apps/web/src/components/providers/sound-effects-provider` tests.
- Modify: notification panel tests.

- [ ] **Step 1: Add producer matrix RED tests**

  Her notification type producer'ı `NotificationPrefs` policy kararından geçmeden socket, push veya email gönderememeli.

- [ ] **Step 2: Add sound/panel/exception RED tests**

  Enabled/profile/volume gerçek playback'i; panel preference gerçek panel çıktısını; exception scope gerçek delivery kararını değiştirmeli.

- [ ] **Step 3: Implement shared policy and consumer wiring**

  Direkt emit/push yolları mevcut merkezi policy'ye taşınır. Email teslim altyapısı yoksa kontrol unavailable olur.

- [ ] **Step 4: Run notification focused suites**

### Task 5: Desktop/Tauri and About contracts

**Files:**

- Modify: `apps/web/src/components/settings/sections/desktop/desktop-section.test.tsx`
- Modify: `apps/web/src/components/settings/sections/desktop/desktop-settings-bridge.test.ts`
- Modify: `apps/web/src/lib/desktop/*.test.ts`
- Modify: `apps/desktop/src-tauri/src/lib.rs` tests only when a native command is required.
- Modify: About block tests.

- [ ] **Step 1: Add failing command dispatch tests**

  Startup, close behavior, minimized launch, shortcuts, overlays, permissions, updater, diagnostics, recovery ve About actions exact Tauri/browser outcome ile test edilir.

- [ ] **Step 2: Verify RED**

  `refreshRuntime()` gerçek updater/repair/test sonucu yerine geçemez.

- [ ] **Step 3: Implement real commands or explicit unavailable state**

- [ ] **Step 4: Run Web Desktop tests and Rust unit tests**

### Task 6: Critical Web E2E

**Files:**

- Modify: `apps/web/e2e/specs/settings/settings-window.spec.ts`
- Modify: `apps/web/e2e/specs/settings/notification-panel.spec.ts`

- [ ] **Step 1: Add section-level persistence and runtime E2E**

  Her bölümden riskli ve kullanıcıya görünür davranışlar seçilir; tüm 171 satırı ayrı browser testi yapmak yerine exhaustive unit/integration contract ile E2E birlikte kullanılır.

- [ ] **Step 2: Run Chromium settings specs**

  Run: `pnpm.cmd --filter @wizards/web exec playwright test --project=chromium e2e/specs/settings`

  Environment yoksa `ENV BLOCKED`; unit/integration sonucu ile karıştırılmaz.

### Task 7: Verification and mutation review

**Files:** All changed files.

- [ ] **Step 1: Run focused modified tests**
- [ ] **Step 2: Run full Web unit suite**
- [ ] **Step 3: Run Web typecheck and lint**
- [ ] **Step 4: Run Rust tests when Rust changed**
- [ ] **Step 5: Run settings Playwright suite when environment permits**
- [ ] **Step 6: Mutation review**

  Her preference için yanlış payload, yanlış branch, eksik side effect, boş return veya silent default mutasyonu en az bir testi düşürmeli.

- [ ] **Step 7: Update Graphify**

  Run: `graphify.exe update .`
