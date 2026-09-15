"use client";

import { confirmAction } from "@/lib/confirmation";

import React, {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  startTransition,
  useId,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { settingsRouteFromPathname, writeSettingsHistory } from "@/lib/settings/window-navigation";

import { useI18n } from "@/components/providers/locale-provider";
import { SettingsDirtyBar } from "@/components/settings/settings-dirty-bar";
import {
  SettingsDirtyRegistryProvider,
  SettingsStoreReportProvider,
  type SettingsDirtyHandlers,
  type SettingsStoreReport,
} from "@/components/settings/settings-ladder";
import { SettingsSearchHighlightProvider } from "@/components/settings/settings-search-highlight";
import { SettingsHeader } from "@/components/settings/settings-header";
import { SettingsNav } from "@/components/settings/settings-nav";
import { SettingsSearchPanel } from "@/components/settings/settings-search-panel";
import { SettingsSkeleton } from "@/components/settings/settings-skeleton";
import { SettingsTabStrip } from "@/components/settings/settings-tab-strip";
import {
  createSettingsWindowState,
  resolveSettingsEscape,
  resolveSettingsNavigationMethod,
  settingsWindowReducer,
} from "@/components/settings/settings-window-state";
import { isWhisprDesktopRuntime } from "@/lib/desktop/runtime";
import type { SettingsBootstrapPayload } from "@/lib/settings/bootstrap-types";
import { toSettingsWindowIdentity } from "@/lib/settings/client";
import { SETTINGS_METRICS, hairline, pxToRem } from "@/lib/settings/metrics";
import {
  resolveSettingsRoute,
  type SettingsRoute,
  type SettingsSection,
  type SettingsTab,
} from "@/lib/settings/navigation";
import {
  SETTINGS_TREE,
  findSettingsSection,
  findSettingsTab,
  type SettingsRiskyBlockKey,
  type SettingsSectionDef,
  type SettingsTabDef,
} from "@/lib/settings/tree";
import { cn } from "@/lib/utils";

const { body, window: windowMetrics } = SETTINGS_METRICS;

/**
 * Referans `Ayarlar-referans.dc.html:741` — örtü katmanının `padding:26px` değeri.
 * Ş13'te sözlüğe taşındı (`window.viewportPadding`); burada yalnız okunuyor.
 */
const WINDOW_VIEWPORT_PADDING = windowMetrics.viewportPadding;

/** Çalışma zamanı bir oturum içinde değişmez; abonelik boş bir sözleşmedir. */
const subscribeDesktopRuntime = () => () => {};
const getDesktopRuntimeServerSnapshot = () => false;

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Ş5 §9 — arama 250 ms debounce ile çalışır (`body.searchDebounceMs`). */
function useDebouncedValue(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    if (value === debounced) return;

    const timer = setTimeout(() => setDebounced(value), delayMs);

    return () => clearTimeout(timer);
  }, [debounced, delayMs, value]);

  return debounced;
}

/**
 * Bölüm gövdesini çizen taraf için sözleşme. Ş6 satır motorunu, Ş7–Ş10 bölümleri buradan alır;
 * kabuk hiçbir satır çizmez.
 */
/**
 * Bölüm köküne inen sözleşme.
 *
 * F1'den önce burada iki alan daha vardı (`runSave`, `onTouch`) ve **hiçbiri bölüme
 * indirilmiyordu**: kayıt defteri yalnız merdiven dörtlüsünü geçiriyor, kalan ikisi yerde
 * kalıyordu. Sonuç üründe kayıt göstergesinin `idle`da donması ve kirli şeridin hiç çıkmamasıydı.
 *
 * İkisinin de yerini kutunun kendi raporu aldı (`settings-ladder.tsx` §`useReportSettingsStore`):
 * durum ve kirli anahtarlar bölümün **değer kutusundan** okunur. Bölümün "kaydettim" diyebildiği
 * bir kanal artık yok — kaydeden kutu, raporlayan da kutu.
 */
export type SettingsSectionRenderInput = {
  readonly openRisky: SettingsRiskyBlockKey | null;
  readonly openSelect: string | null;
  readonly section: SettingsSectionDef;
  readonly tab: SettingsTabDef;
  readonly toggleRisky: (key: SettingsRiskyBlockKey) => void;
  readonly toggleSelect: (rowKey: string) => void;
};

export type SettingsWindowProps = {
  /**
   * Bootstrap'ın hesap parçası. Kimliğe **burada** indirgenir, sunucuda değil:
   * `toSettingsWindowIdentity` bir istemci modülünde yaşıyor ve sunucu bileşeninden
   * çağrılamaz.
   */
  readonly account: SettingsBootstrapPayload["initialAccount"];
  /** `modal` uygulama içinden (intercepting route), `page` doğrudan adresle açılan tam ekran. */
  readonly mode: "modal" | "page";
  readonly onDiscardProfile?: (() => void) | undefined;
  readonly onSaveProfile?: (() => Promise<unknown>) | undefined;
  readonly onSignOut?: (() => void) | undefined;
  /** Ş6 bağlanana kadar yer tutucu çizilir. */
  readonly renderSection?: ((input: SettingsSectionRenderInput) => React.ReactNode) | undefined;
  readonly route: SettingsRoute;
};

/**
 * 1180 × 800 Ayarlar penceresi — SPEC §4, Ş5.
 *
 * Bu bileşen **hiçbir ayar satırı çizmez**: çerçeve, gezinme, başlık, sekme şeridi, kayıt
 * göstergesi ve kirli şerit burada; içerik `renderSection` yuvasından gelir.
 *
 * Adres sahiptir (K2): bölüm ve sekme `/settings/[section]/[tab]` yolundan okunur ve oraya geri
 * yazılır. Tam ekran kipinde gezinme geçmişe eklenir; uygulama içi modal kipinde ise bölüm,
 * sekme ve arama hedefleri `replace` kullanır. Böylece sağ üst çarpı tek `back()` ile modalı
 * kapatır.
 *
 * Örtü kartın **kardeşidir** (tuzak #11): kart `pointer-events:none` taşıyan ayrı bir katmanda
 * ortalanır ve kendisi `pointer-events:auto` alır. Kartın içine tıklamak bu yüzden kapatmaz —
 * `stopPropagation` ile kurulan bir kapatma, kartın içindeki bir menü portal'a taşındığı anda
 * sessizce bozulur.
 */
export function SettingsWindow({
  account,
  mode,
  onDiscardProfile,
  onSaveProfile,
  onSignOut,
  renderSection,
  route,
}: SettingsWindowProps) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const activeRoute = settingsRouteFromPathname(pathname, route);
  const searchParams = useSearchParams();
  const titleId = useId();

  const identity = useMemo(() => toSettingsWindowIdentity(account), [account]);
  const [state, dispatch] = useReducer(settingsWindowReducer, route, createSettingsWindowState);
  const [draftQuery, setDraftQuery] = useState("");
  const [pendingHighlightedRowKey, setHighlightedRowKey] = useState<string | null>(null);
  const highlightedRowKey = searchParams.get("highlight") ?? pendingHighlightedRowKey;
  const debouncedQuery = useDebouncedValue(draftQuery, body.searchDebounceMs);
  const navigationMethod = resolveSettingsNavigationMethod(mode);

  const cardRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  /**
   * Son gönderilen yama, `Kaydedilemedi · yeniden dene` için saklanır.
   *
   * `useRef` değil `useState`: içerik yuvası her render'da bir `runSave` referansı alıyor ve
   * bir ref'i okuyan fonksiyonu render sırasında dışarı vermek React Compiler'ın `refs`
   * kuralını ihlal ediyor. Fazladan render maliyeti yok — kayıt zaten indirgeyiciyi yazıyor.
   */
  const [lastPatch, setLastPatch] = useState<(() => Promise<unknown>) | null>(null);

  /**
   * Kirli profil alanlarını yazan bölüm kendini buraya kaydeder (`settings-ladder.tsx`).
   * Kabuk hangi bölümün kirli olduğunu bilmez; yalnız "biri kaydolduysa şeridin düğmeleri
   * ona gider" der. Kayıt yoksa şerit bayrağı düşürmekle yetinir.
   */
  const [dirtyHandlers, setDirtyHandlers] = useState<SettingsDirtyHandlers | null>(null);

  /** Aktif bölüm kutusunun `retry`si; `Kaydedilemedi · yeniden dene` bunu çağırır (F1). */
  const [storeRetry, setStoreRetry] = useState<(() => void) | null>(null);

  // K11 — `Masaüstü` yalnız Tauri çalışma zamanında listede. Karar sunucuda bilinmez: sunucu
  // anlık görüntüsü `false`, istemci anlık görüntüsü gerçek çalışma zamanı. Tuzak #10 bu deseni
  // **kırılımlar** için yasaklar (SSR 1280 varsayar ve ilk boya yanlış çıkar); burada ölçülen
  // bir görünüm alanı değil, bir yetenek — ve web'in doğru ilk boyası zaten listesiz olandır.
  const desktopRuntime = useSyncExternalStore(
    subscribeDesktopRuntime,
    isWhisprDesktopRuntime,
    getDesktopRuntimeServerSnapshot,
  );

  const sections = useMemo(
    () => SETTINGS_TREE.filter((section) => !section.desktopOnly || desktopRuntime),
    [desktopRuntime],
  );

  // Adres dışarıdan da değişir (geri tuşu, paylaşılan bağlantı, arama sonucu). İndirgeyici
  // adresin **aynasıdır**; tek başına onun arkasından gitmez.
  useLayoutEffect(() => {
    dispatch({ section: activeRoute.section, tab: activeRoute.tab, type: "syncRoute" });
  }, [activeRoute.section, activeRoute.tab]);

  useEffect(() => {
    dispatch({ query: debouncedQuery, type: "search" });
  }, [debouncedQuery]);

  // PROMPT §8 — kaydırma konumu sekme **ve** bölüm değişiminde sıfırlanır. Yeni bir sekmeye
  // öncekinin kaydırma konumuyla girmek, ilk grubu görünmez yapar.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [state.section, state.tab]);

  const closeWindow = useCallback(async () => {
    if (state.dirty && !(await confirmAction(t("settings.dirtyCloseConfirm")))) {
      return;
    }

    // Modal, onu açan uygulama rotasına tek adım döner. `page` kipinde geçmiş boş olabilir
    // (soğuk bağlantı); `back()` kullanıcıyı uygulamadan atabileceği için `/home`a gider.
    if (mode === "modal") {
      router.back();
      return;
    }

    router.push("/home");
  }, [mode, router, state.dirty, t]);

  const selectSection = useCallback(
    (section: SettingsSection) => {
      setHighlightedRowKey(null);
      startTransition(() => {
        dispatch({ section, type: "selectSection" });
        writeSettingsHistory(window.history, navigationMethod, resolveSettingsRoute(section));
      });
    },
    [navigationMethod],
  );

  /** Tam ekran kipinde `push`; modal kipinde çarpının tek adımda kapatması için `replace`. */
  const selectTab = useCallback(
    (tab: SettingsTab) => {
      setHighlightedRowKey(null);
      startTransition(() => {
        dispatch({ tab, type: "selectTab" });
        writeSettingsHistory(window.history, navigationMethod, { section: state.section, tab });
      });
    },
    [navigationMethod, state.section],
  );

  const goToSearchHit = useCallback(
    (target: { rowKey: string; section: SettingsSection; tab: SettingsTab }) => {
      setDraftQuery("");
      setHighlightedRowKey(target.rowKey);
      dispatch({ query: "", type: "search" });
      startTransition(() => {
        dispatch({ section: target.section, tab: target.tab, type: "syncRoute" });
        writeSettingsHistory(window.history, navigationMethod, target, target.rowKey);
      });
    },
    [navigationMethod],
  );

  const runSave = useCallback(async (patch: () => Promise<unknown>) => {
    setLastPatch(() => patch);
    dispatch({ save: "saving", type: "save" });

    try {
      await patch();
      dispatch({ save: "saved", type: "save" });
    } catch {
      dispatch({ save: "error", type: "save" });
    }
  }, []);

  /**
   * F1 — bölüm kutusunun kabuğa raporu (`settings-ladder.tsx` §`useReportSettingsStore`).
   *
   * Kabuk kutuyu **okumaz**, kutu kabuğa **yazar**: pencere altı bölümün hangisinin hangi kutuyu
   * kurduğunu bilmiyor ve bilmemeli. Rapor üç şey taşır — başlığın üç durumu, kirli anahtar
   * listesi ve düşen yamayı tekrar deneme yolu.
   *
   * Kirli anahtarlar `touch` eylemiyle işlenir; ikinci bir kirli bayrağı tanımlanmaz.
   * Liste boşaldığında `resetDirty` bayrağı düşürür, böylece şerit `Sıfırla`dan sonra kapanır.
   */
  const storeReport = useMemo<SettingsStoreReport>(
    () => ({
      onDirtyKeys: (keys) => {
        if (keys.length === 0) {
          dispatch({ type: "resetDirty" });
          return;
        }

        for (const key of keys) {
          dispatch({ key, type: "touch" });
        }
      },
      onRetry: (retry) => setStoreRetry(() => retry),
      onStatus: (save) => dispatch({ save, type: "save" }),
    }),
    [],
  );

  const retrySave = useCallback(() => {
    // Kutunun kendi yeniden denemesi önce gelir: düşen yamayı o saklıyor ve değeri geri almış
    // durumda. `runSave` yolu yalnız kutusuz yazmalar için (bugün hiçbiri) yedekte durur.
    if (storeRetry) {
      storeRetry();
      return;
    }

    if (lastPatch) {
      void runSave(lastPatch);
    }
  }, [lastPatch, runSave, storeRetry]);

  // `Esc` sırayla: açık menü → riskli blok → pencere (Ş5 §8). Pencere bir rotadır, o yüzden son
  // basamağı indirgeyici değil bu kapanış yürütür.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;

      const targetDialog =
        event.target instanceof Element ? event.target.closest('[role="dialog"]') : null;
      if (targetDialog && targetDialog !== cardRef.current) return;

      event.preventDefault();

      if (resolveSettingsEscape(state) === "window") {
        closeWindow();
        return;
      }

      dispatch({ type: "escape" });
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeWindow, state]);

  // Focus tuzağı yalnız modal kipinde: `page` kipinde pencerenin arkasında yakalanacak bir şey
  // yok, `Tab`'ı hapsetmek tarayıcı arayüzüne çıkışı da engellerdi.
  useEffect(() => {
    if (mode !== "modal") return;

    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const card = cardRef.current;
    // Announce the dialog without selecting a field or opening the on-screen keyboard.
    card?.focus({ preventScroll: true });

    const handleTab = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || event.defaultPrevented || !card) return;

      const targetDialog =
        event.target instanceof Element ? event.target.closest('[role="dialog"]') : null;
      if (targetDialog && targetDialog !== card) return;

      const focusable = card.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);

      if (focusable.length === 0) {
        event.preventDefault();
        card.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && (document.activeElement === first || document.activeElement === card)) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    window.addEventListener("keydown", handleTab);

    return () => {
      window.removeEventListener("keydown", handleTab);
      returnFocusRef.current?.focus();
    };
  }, [mode]);

  const sectionDef = findSettingsSection(state.section);
  const tabDef = findSettingsTab(state.section, state.tab);

  const content = state.query ? (
    <SettingsSearchPanel onSelect={goToSearchHit} query={state.query} />
  ) : sectionDef && tabDef ? (
    <SettingsSearchHighlightProvider rowKey={highlightedRowKey}>
      <SettingsDirtyRegistryProvider register={setDirtyHandlers}>
        <SettingsStoreReportProvider value={storeReport}>
          <Suspense fallback={<SettingsSkeleton />}>
            {renderSection ? (
              renderSection({
                openRisky: state.openRisky,
                openSelect: state.openSelect,
                section: sectionDef,
                tab: tabDef,
                toggleRisky: (key) => dispatch({ key, type: "toggleRisky" }),
                toggleSelect: (rowKey) => dispatch({ key: rowKey, type: "toggleSelect" }),
              })
            ) : (
              // Ş6 satır motorunu bağlayana kadar içerik alanı boş durur. Kabuk hiçbir satır çizmez;
              // yer tutucu bir tasarım değil, bağlanmamış bir yuvadır.
              <div data-settings-content-placeholder data-testid="settings-content-placeholder" />
            )}
          </Suspense>
        </SettingsStoreReportProvider>
      </SettingsDirtyRegistryProvider>
    </SettingsSearchHighlightProvider>
  ) : null;

  const card = (
    <div
      aria-labelledby={titleId}
      aria-modal={mode === "modal" ? true : undefined}
      className="settings-window-card relative flex min-h-0 overflow-hidden"
      data-mode={mode}
      data-testid="settings-window"
      ref={cardRef}
      role="dialog"
      style={{
        background: "hsl(var(--surface-base))",
        border: `${hairline()} solid hsl(var(--border))`,
        boxShadow: `${pxToRem(windowMetrics.shadow.x)} ${pxToRem(windowMetrics.shadow.y)} ${pxToRem(
          windowMetrics.shadow.blur,
        )} ${pxToRem(windowMetrics.shadow.spread)} hsl(var(--shadow-color))`,
        pointerEvents: "auto",
        ["--settings-window-width" as string]: pxToRem(windowMetrics.width),
        ["--settings-window-height" as string]: pxToRem(windowMetrics.height),
        ["--settings-window-radius" as string]: pxToRem(windowMetrics.radius),
        ["--settings-window-nav-width" as string]: pxToRem(SETTINGS_METRICS.nav.width),
        ["--settings-window-nav-icon-width" as string]: pxToRem(SETTINGS_METRICS.nav.iconOnlyWidth),
        ["--settings-window-nav-border" as string]: `${hairline()} solid hsl(var(--border)/${SETTINGS_METRICS.nav.borderRightAlpha})`,
      }}
      tabIndex={-1}
    >
      <SettingsNav
        activeSection={state.section}
        identity={identity}
        onQueryChange={setDraftQuery}
        onSelect={selectSection}
        onSignOut={onSignOut}
        query={draftQuery}
        sections={sections}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <SettingsHeader
          leadKey={sectionDef?.leadKey ?? ""}
          onClose={closeWindow}
          onRetrySave={retrySave}
          saveState={state.save}
          titleId={titleId}
          titleKey={sectionDef?.labelKey ?? "settings.title"}
        />

        <SettingsTabStrip
          activeTab={state.tab}
          onSelect={selectTab}
          tabs={sectionDef?.tabs ?? []}
        />

        <div
          aria-labelledby={`settings-tab-${state.tab}`}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          data-testid="settings-window-body"
          id="settings-window-panel"
          ref={scrollRef}
          role="tabpanel"
          style={{ background: "hsl(var(--surface-base))", scrollbarGutter: "stable" }}
        >
          <div
            className="mx-auto w-full"
            style={{
              maxWidth: pxToRem(body.maxWidth),
              padding: `${pxToRem(body.paddingTop)} ${pxToRem(body.paddingX)} ${pxToRem(
                body.paddingBottom,
              )}`,
            }}
          >
            {content}
          </div>
        </div>

        {state.dirty ? (
          <SettingsDirtyBar
            onDiscard={() => {
              (dirtyHandlers?.discard ?? onDiscardProfile)?.();
              dispatch({ type: "resetDirty" });
            }}
            onSave={() => {
              // F1 — kutu kayıtlıysa bayrağı **o** düşürür: `commitDirty` kirli kümeyi boşaltır
              // ve rapor boş listeyi yollar. Burada koşulsuz `resetDirty` çağırmak, yazma
              // düştüğünde kullanıcının kaydedilmemiş değişikliğini temiz göstermek olurdu —
              // `runSave` hatayı yakalayıp çözüldüğü için `.then` her hâlde koşar.
              if (dirtyHandlers) {
                void runSave(dirtyHandlers.commit);
                return;
              }

              if (!onSaveProfile) {
                dispatch({ type: "resetDirty" });
                return;
              }

              void runSave(onSaveProfile).then(() => dispatch({ type: "resetDirty" }));
            }}
            pending={state.save === "saving"}
          />
        ) : null}
      </div>
    </div>
  );

  const viewportStyle = {
    ["--settings-window-viewport-padding" as string]: pxToRem(WINDOW_VIEWPORT_PADDING),
    ["--settings-window-viewport-padding-small" as string]: pxToRem(windowMetrics.edgePaddingSmall),
  } as React.CSSProperties;

  if (mode === "page") {
    return (
      <div
        className="settings-window-viewport grid h-dvh w-full place-items-center"
        style={viewportStyle}
      >
        {card}
      </div>
    );
  }

  return (
    <div
      className="fixed inset-x-0 bottom-0 top-[var(--app-viewport-top,0px)] z-[90]"
      data-testid="in-app-settings-overlay"
    >
      {/* Örtü kartın **kardeşidir** (tuzak #11): ayrı bir katman, kartın atası değil. */}
      <button
        aria-label={t("settings.close")}
        className="absolute inset-0 cursor-default"
        data-testid="settings-window-backdrop"
        onClick={closeWindow}
        style={{ background: `hsl(var(--backdrop)/${windowMetrics.backdropAlphaMax})` }}
        type="button"
      />
      <div
        className={cn("settings-window-viewport absolute inset-0 grid place-items-center")}
        style={{ ...viewportStyle, pointerEvents: "none" }}
      >
        {card}
      </div>
    </div>
  );
}
