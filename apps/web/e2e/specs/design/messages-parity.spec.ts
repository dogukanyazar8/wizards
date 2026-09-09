import type { Page } from "@playwright/test";

import { HOME_METRICS } from "@/lib/home/metrics";
import { MESSAGES_METRICS } from "@/lib/messages/metrics";
import { expect, test } from "../../fixtures/test";
import { loginAs } from "../../helpers/auth";
import { getE2EDMConversationId, setE2EUserTheme } from "../../helpers/db";
import {
  applyParityTheme,
  collectUndersizedTapTargets,
  expectNoClippedText,
  expectNoOverflow,
  waitForRootFontSize,
  type ParityTheme,
} from "../../helpers/design-parity";
import { gotoAppRoute } from "../../helpers/navigation";
import { resetAndSeedE2EData } from "../../setup/e2e-database";

/**
 * Mesajlar parity matrisi — SPEC-MESAJLAR §1, Dalga 3 §1.
 *
 * Ana Sayfa matrisinin yapısını izler ve **aynı** yardımcıları kullanır; ikinci
 * bir parity altyapısı, iki farklı "taşma yok" tanımı demek olurdu.
 *
 * Tema ekseninin tuzağı burada da geçerli (Faz 4 §6.1): `applyParityTheme`
 * yalnız `localStorage` yazıyor ve oturum açık kullanıcıda `ThemeSessionSync`
 * hesabın kayıtlı temasını uygulayıp onu eziyor. Bu yüzden `User.theme` de
 * ayarlanıyor ve uygulanan tema ekranda **doğrulanıyor**.
 */

const VIEWPORTS = [
  { expectedRootFontSize: 16, height: 920, name: "base", width: 1360 },
  { expectedRootFontSize: 16, height: 900, name: "hd", width: 1600 },
  { expectedRootFontSize: 18, height: 1080, name: "fhd", width: 1920 },
  { expectedRootFontSize: 24, height: 1440, name: "qhd", width: 2560 },
  { expectedRootFontSize: 32, height: 2160, name: "uhd", width: 3840 },
  // Ölçek yükseklikten sınırlanır: 1440 / 920 = 1.56 → ×1.5'te kalır.
  { expectedRootFontSize: 24, height: 1440, name: "ultra", width: 5120 },
] as const;

const THEMES: readonly ParityTheme[] = ["theme-light", "theme-dark"];

/**
 * Kabuğun sabit sütunları. Sayılar **sözlükten** okunur, buraya kopyalanmaz: sunucu rayı ve
 * gezinme paneli Mesajlar'ın değil kabuğun malıdır ve kabuk onları paket dışında da değiştirir.
 * Gezinme paneli 228'den 280'e genişledi (`NAV_PANEL_ADJUSTMENTS`, Bahsedilmeler kabuğu); bu
 * dosya sayıyı elinde tutsaydı matrisin 132 kombinasyonu tek bir bayat sabitten kırılırdı —
 * nitekim kırıldı. Matrisin işi ölçüyü ezberlemek değil, sözlüğün **ekrandaki** karşılığını
 * doğrulamak.
 */
const COLUMN_WIDTHS = {
  navPanel: HOME_METRICS.panel.width,
  rail: MESSAGES_METRICS.layout.railWidth,
  serverRail: HOME_METRICS.rail.width,
  sidePanel: MESSAGES_METRICS.layout.sidePanelWidth,
} as const;

/** Ana alanın asgari genişliği; sağ panel açıkken ikincisi. İkisi de aynı sözlükten. */
const MAIN_MIN_WIDTH = MESSAGES_METRICS.layout.mainMinWidth;
const MAIN_MIN_WIDTH_WITH_PANEL = MESSAGES_METRICS.layout.mainMinWidthWithPanel;

const TAP_TARGET_SELECTOR =
  '[data-testid="messages-screen-root"] button, [data-testid="messages-screen-root"] a[href]';

/**
 * Tasarımın kendi ölçüsü 44px'in altında kalan yüzeyler.
 *
 * Liste **kapalı**: burada olmayan yeni bir küçük hedef testi kırar. Hepsi
 * SPEC'in verdiği ölçüdür (başlık ikonları 34×34, hover şeridi 30×30, panel
 * kapatma 30×30, bestekâr araç şeridi 31 yüksek, bestekâr eylemleri 34×34) ve
 * `pointer: coarse` altında büyütülmeleri gerekir — o iş ayrıca ölçülüp rapora
 * yazılır.
 *
 * Not: ölçüler `rem` olduğu için yüksek çözünürlükte **büyüyorlar** (1920'de
 * 34 → 38.3), yani 44 eşiğine yaklaşırlar ama hiçbir ölçekte geçmezler. Bu
 * yüzden istisna listesi çözünürlükten bağımsız tek liste.
 */
const DESIGN_TAP_TARGET_EXCEPTIONS = new Set([
  "conversation-header-more",
  "conversation-header-search",
  "conversation-header-threads",
  "conversation-header-video-call",
  "conversation-header-voice-call",
  // Bestekâr (SPEC §5.6): araç şeridi 31 yüksek, eylem düğmeleri 34×34.
  "emoji-picker-button",
  "gif-picker-button",
  "message-file-button",
  "message-action-more",
  "message-action-pin",
  "message-action-react",
  "message-action-reply",
  "message-action-thread",
  "message-formatting-toggle",
  "message-poll-button",
  "message-send-button",
  // Arama süzgeç çipi (SPEC §6.2): çip yüksekliği 26, iki düğmesi de çipin içinde.
  "message-search-chip-remove-date",
  "message-search-chip-remove-person",
  "message-search-chip-toggle-date",
  "message-search-chip-toggle-person",
  "messages-rail-new-group",
  "messages-side-panel-close",
  "pinned-strip-dismiss",
  "voice-recorder-start",
]);

type MessagesState = {
  name: string;
  open: (page: Page) => Promise<void>;
  /** Sağ panel açık mı — ana alanın asgari genişliği buna göre değişir. */
  sidePanel?: boolean;
};

/** SPEC'in 11 durumu; her biri kendi yolunu açar ve kendi çapasını bekler. */
const STATES: readonly MessagesState[] = [
  {
    name: "empty",
    open: async (page) => {
      await gotoAppRoute(page, "/messages", { readyTestId: "messages-empty-state" });
    },
  },
  {
    name: "friends",
    open: async (page) => {
      await gotoAppRoute(page, "/messages/friends", { readyTestId: "friends-dashboard" });
    },
  },
  {
    name: "friends-pending",
    open: async (page) => {
      await gotoAppRoute(page, "/messages/friends?dmTab=pending", {
        readyTestId: "friends-dashboard",
      });
    },
  },
  {
    name: "friends-add",
    open: async (page) => {
      await gotoAppRoute(page, "/messages/friends?dmTab=add", {
        readyTestId: "friends-dashboard",
      });
    },
  },
  {
    name: "friends-blocked",
    open: async (page) => {
      await gotoAppRoute(page, "/messages/friends?dmTab=blocked", {
        readyTestId: "friends-dashboard",
      });
    },
  },
  {
    name: "conversation",
    open: async (page) => {
      await openConversation(page);
    },
  },
  {
    name: "conversation-search",
    open: async (page) => {
      await openConversation(page);
      await page.getByTestId("conversation-header-search").click();
      await expect(page.getByTestId("messages-search-panel")).toBeVisible();
    },
    sidePanel: true,
  },
  {
    name: "new-message-picker",
    open: async (page) => {
      await gotoAppRoute(page, "/messages", { readyTestId: "messages-empty-state" });
      await page.getByTestId("messages-empty-new-message").click();
      await expect(page.getByTestId("new-message-picker")).toBeVisible();
    },
  },
  {
    name: "group-create",
    open: async (page) => {
      await gotoAppRoute(page, "/messages", { readyTestId: "messages-empty-state" });
      await page.getByTestId("messages-empty-new-group").click();
      await expect(page.getByTestId("group-create-dialog")).toBeVisible();
    },
  },
  {
    name: "poll-composer",
    open: async (page) => {
      await openConversation(page);
      await page.getByTestId("message-poll-button").click();
      await expect(page.getByTestId("poll-composer")).toBeVisible();
    },
  },
  {
    name: "pinned-list",
    open: async (page) => {
      await openConversation(page);
      await page.getByTestId("conversation-header-pins").click();
      await expect(
        page.getByTestId("pinned-list").or(page.getByTestId("pinned-list-empty")),
      ).toBeVisible();
    },
  },
];

async function openConversation(page: Page): Promise<void> {
  const conversationId = await getE2EDMConversationId();

  await gotoAppRoute(page, `/messages/${conversationId}`, { readyTestId: "message-input" });
  await expect(page.getByTestId("conversation-header")).toBeVisible();
}

/** Ölçülen tema, istenen tema mı? Faz 4 §6.1 tuzağının kalıcı bekçisi. */
async function expectAppliedTheme(page: Page, theme: ParityTheme): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          Array.from(document.documentElement.classList).filter((name) =>
            name.startsWith("theme-"),
          ),
        ),
      { timeout: 10_000 },
    )
    .toEqual([theme]);
}

/** Kabuğun sabit sütunları; ölçü rem cinsinden büyür, oran sabit kalır. */
async function expectColumnWidths(page: Page, rootFontSize: number): Promise<void> {
  const scale = rootFontSize / 16;
  const measure = async (testId: string) =>
    (await page.getByTestId(testId).boundingBox())?.width ?? 0;

  expect(await measure("server-rail")).toBeCloseTo(COLUMN_WIDTHS.serverRail * scale, -1);
  expect(await measure("app-nav-panel")).toBeCloseTo(COLUMN_WIDTHS.navPanel * scale, -1);
}

async function runParityChecks(
  page: Page,
  viewport: (typeof VIEWPORTS)[number],
  theme: ParityTheme,
  state: MessagesState,
): Promise<void> {
  const combination = `${state.name}-${viewport.name}-${viewport.width}x${viewport.height}-${theme}`;

  await setE2EUserTheme("alice", theme);
  await applyParityTheme(page, theme);
  await page.setViewportSize({ height: viewport.height, width: viewport.width });
  await loginAs(page, "alice");
  await state.open(page);

  await expectAppliedTheme(page, theme);

  const rootFontSize = await waitForRootFontSize(page, viewport.expectedRootFontSize);
  await expectNoOverflow(page);
  await expectNoClippedText(page);
  await expectColumnWidths(page, rootFontSize);

  /*
   * Ana alanın asgari genişliği: sağ panel açıkken 442, kapalıyken 782 (§1.2).
   *
   * `messages-main` yalnız **sohbet** yüzeyinde var; boş durum ve Arkadaşlar
   * kendi köklerini çiziyor. Bu yüzden ana alan sohbet rayının sağ kenarından
   * görünüm alanının sağına kadar ölçülüyor — hangi durum çizilirse çizilsin
   * aynı sayıyı veren tek tanım bu.
   */
  const scale = rootFontSize / 16;
  const railBox = await page.getByTestId("messages-rail").boundingBox();
  const railRight = railBox ? railBox.x + railBox.width : 0;
  const panelWidthActual = state.sidePanel
    ? ((await page.locator("[data-messages-side-panel]").boundingBox())?.width ?? 0)
    : 0;
  const mainWidth = viewport.width - railRight - panelWidthActual;
  const expectedMin = (state.sidePanel ? MAIN_MIN_WIDTH_WITH_PANEL : MAIN_MIN_WIDTH) * scale;

  expect(mainWidth).toBeGreaterThanOrEqual(expectedMin - 1);

  if (state.sidePanel) {
    expect(panelWidthActual).toBeCloseTo(COLUMN_WIDTHS.sidePanel * scale, -1);
  }

  const undersized = await collectUndersizedTapTargets(page, TAP_TARGET_SELECTOR);
  const { mkdir, writeFile } = await import("node:fs/promises");

  await mkdir("test-results/parity-tap", { recursive: true });
  await writeFile(
    `test-results/parity-tap/messages-${combination}.json`,
    `${JSON.stringify(undersized, null, 2)}\n`,
    "utf8",
  );

  const unexpected = undersized
    .map((target) => target.testId ?? target.label)
    .filter((label) => !DESIGN_TAP_TARGET_EXCEPTIONS.has(label))
    .sort();

  expect(unexpected).toEqual([]);

  await page.screenshot({
    fullPage: false,
    path: `test-results/parity/messages-${combination}.png`,
  });
}

test.describe("Mesajlar parity matrisi", () => {
  test.beforeAll(async () => {
    // Attachment E2E aynı tohum konuşmalarını bilinçli olarak mutasyona uğratır. Parity
    // matrisi yalnız tasarımın sabit fixture'ını ölçmeli; önceki spec'in artığını değil.
    await resetAndSeedE2EData();
  });

  test.afterAll(async () => {
    // Matris `User.theme`'i yazıyor; sonraki spec'ler tohumun varsayılanını beklesin.
    await setE2EUserTheme("alice", "theme-dark");
  });

  for (const viewport of VIEWPORTS) {
    for (const theme of THEMES) {
      for (const state of STATES) {
        test(`${state.name} · ${viewport.name} ${viewport.width}×${viewport.height} · ${theme}`, async ({
          page,
        }) => {
          await runParityChecks(page, viewport, theme, state);
        });
      }
    }
  }
});
