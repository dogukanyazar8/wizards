"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import type { SettingsRiskyBlockKey } from "@/lib/settings/tree";

import type {
  SettingSaveStatus,
  SettingsRowRuntime,
  SettingsValueStore,
} from "@/lib/settings/use-setting-value";

/**
 * Merdivenin **tek** tanımı, tüketici tarafı — Ş13, tuzak #12.
 *
 * Durumun sahibi kabuktur (`settingsWindowReducer`): aynı anda tek açılır menü, tek riskli
 * blok. Bölümler o durumu bir prop zinciriyle taşımaz; kayıt defteri (`settings-sections.tsx`)
 * bir kez sağlar, satır motorunu besleyen köprüler buradan okur.
 *
 * Prop zinciri yerine bağlam olmasının nedeni ölçülebilir: on üç sekme bileşeni ve üç köprü
 * hook'u arasında dolaştırılan bir prop, bir yerde unutulduğunda **sessizce** yerel duruma
 * düşer — menü açık kalır, `Esc` pencereyi kapatır ve kimse fark etmez. Bağlam yoksa köprü
 * yerel merdivenini kurar (yalıtılmış blok testleri bu dalda koşuyor); varsa kabuğunkini alır.
 */
export type SettingsLadder = {
  readonly openRisky: SettingsRiskyBlockKey | null;
  readonly openSelect: string | null;
  readonly toggleRisky: (key: SettingsRiskyBlockKey) => void;
  readonly toggleSelect: (key: string) => void;
};

const SettingsLadderContext = createContext<SettingsLadder | null>(null);

export function SettingsLadderProvider({
  children,
  value,
}: {
  readonly children: React.ReactNode;
  readonly value: SettingsLadder;
}) {
  return <SettingsLadderContext.Provider value={value}>{children}</SettingsLadderContext.Provider>;
}

/**
 * Köprülerin `useSettingsRowRuntimeState`'e vereceği kısmi geçersiz kılma.
 *
 * Bağlam yokken **boş** nesne döner ve motor kendi yerel merdivenini kurar; bu ayrım
 * `useSettingsRowRuntimeState` içinde `"openSelect" in overrides` ile okunuyor (Ş9 raporu §4.7:
 * `??` ile okunduğunda "kabuk menüyü kapattı" ile "kabuk merdiveni devretmedi" aynı görünüyor).
 *
 * `setOpenSelect(null)` — motorun "menüyü kapat" çağrısı — kabuğun **çevirme** eylemine
 * dönüştürülür: açık olan anahtar tekrar gönderilince indirgeyici onu kapatır.
 */
export function useSettingsLadderOverrides(): Partial<SettingsRowRuntime> {
  const ladder = useContext(SettingsLadderContext);

  return useMemo(() => {
    if (!ladder) return {};

    return {
      openRisky: ladder.openRisky,
      openSelect: ladder.openSelect,
      setOpenRisky: (key: SettingsRiskyBlockKey | null) => {
        const target = key ?? ladder.openRisky;
        if (target) ladder.toggleRisky(target);
      },
      setOpenSelect: (key: string | null) => ladder.toggleSelect(key ?? ladder.openSelect ?? ""),
    };
  }, [ladder]);
}

/**
 * Kirli şerit dikişi — Ş13.
 *
 * Kirli bayrağının **sahibi** kabuk (`settingsWindowReducer`), taslak değerlerin sahibi ise
 * bölümün değer kutusu (`SettingsValueStore.commitDirty` / `.resetDirty`). Şerit kabukta,
 * kutu bölümde: bağ ancak bölümün kendini kabuğa **kaydetmesiyle** kurulabilir.
 *
 * Kayıt bir efekttedir ve sökülürken temizlenir; bölüm değişince kabuk eski bölümün
 * `commitDirty`sini çağırmaz.
 */
export type SettingsDirtyHandlers = {
  readonly commit: () => Promise<unknown>;
  readonly discard: () => void;
};

const SettingsDirtyRegistryContext = createContext<
  ((handlers: SettingsDirtyHandlers | null) => void) | null
>(null);

export function SettingsDirtyRegistryProvider({
  children,
  register,
}: {
  readonly children: React.ReactNode;
  readonly register: (handlers: SettingsDirtyHandlers | null) => void;
}) {
  return (
    <SettingsDirtyRegistryContext.Provider value={register}>
      {children}
    </SettingsDirtyRegistryContext.Provider>
  );
}

/** Kirli profil alanı tutan bölüm bunu çağırır; kabuk yoksa (yalıtılmış test) sessizdir. */
export function useRegisterSettingsDirtyHandlers(handlers: SettingsDirtyHandlers): void {
  const register = useContext(SettingsDirtyRegistryContext);

  useEffect(() => {
    if (!register) return;

    register(handlers);

    return () => register(null);
  }, [handlers, register]);
}

/**
 * Kutu ↔ kabuk raporu — F1 dikişi.
 *
 * Kabuğun başlığındaki kayıt göstergesi ve alttaki kirli şerit, bölümün değer kutusundaki
 * durumu okumak zorunda; ama kutu bölümün içinde, gösterge kabukta. Önceki sürümde bu bağ için
 * iki alan (`runSave`, `onTouch`) `SettingsSectionRenderInput`'a konmuştu ve **hiçbir bölüme
 * indirilmemişti**: gösterge `idle`da donuyor, kirli şerit hiç çıkmıyordu. Birim testler yeşildi
 * çünkü hepsi bileşeni doğrudan prop vererek çiziyordu.
 *
 * Bağ artık tek yönlü bir rapordur ve kaynağı kutunun kendisidir:
 *
 * - `getStatus()` — başlığın üç durumu. Kutu bunu **gerçek yanıt** üzerine yazıyor, o yüzden
 *   göstergenin ayrı bir zamanlayıcıya ihtiyacı yok (tuzak #14).
 * - `getDirtyKeys()` — kirli şeridin görünürlüğü. Anahtar listesi olduğu için kabuk her yeni
 *   anahtar için kendi `touch` eylemini işletebiliyor; ikinci bir kirli bayrağı doğmuyor.
 * - `retry()` — `Kaydedilemedi · yeniden dene`. Düşen yamayı kutu zaten saklıyor.
 *
 * Rapor **kutudan** okunur, bölümden değil: bölüm "kaydettim" diyebilseydi, hiçbir şey
 * kaydetmeyen bir yazma yolu da diyebilirdi.
 */
export type SettingsStoreReport = {
  readonly onDirtyKeys: (keys: readonly string[]) => void;
  readonly onRetry: (retry: (() => void) | null) => void;
  readonly onStatus: (status: SettingSaveStatus) => void;
};

const SettingsStoreReportContext = createContext<SettingsStoreReport | null>(null);
type SaveReport = { status: SettingSaveStatus; retry?: (() => void) | undefined };
const SettingsSaveSourcesContext = createContext<
  ((source: symbol, report: SaveReport | null) => void) | null
>(null);

export function SettingsStoreReportProvider({
  children,
  value,
}: {
  readonly children: React.ReactNode;
  readonly value: SettingsStoreReport;
}) {
  // Native writes and profile uploads can run alongside the section's value store.
  // A completed write must never hide another pending or failed write.
  const sources = useRef(new Map<symbol, SaveReport>());
  const reportSave = useCallback(
    (source: symbol, report: SaveReport | null) => {
      sources.current.delete(source);
      if (report && report.status !== "idle") sources.current.set(source, report);
      const reports = [...sources.current.values()].reverse();
      const current =
        reports.find((entry) => entry.status === "saving") ??
        reports.find((entry) => entry.status === "error") ??
        reports[0];
      value.onRetry(current?.status === "error" ? (current.retry ?? null) : null);
      value.onStatus(current?.status ?? "idle");
    },
    [value],
  );
  return (
    <SettingsStoreReportContext.Provider value={value}>
      <SettingsSaveSourcesContext.Provider value={reportSave}>
        {children}
      </SettingsSaveSourcesContext.Provider>
    </SettingsStoreReportContext.Provider>
  );
}

/** Report real write outcomes; late replies from an unmounted section are ignored. */
export function useSettingsSaveReporter() {
  const report = useContext(SettingsSaveSourcesContext);
  const source = useRef(Symbol("settings-save"));
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    const key = source.current;
    return () => {
      active.current = false;
      report?.(key, null);
    };
  }, [report]);
  return useCallback(
    (status: SettingSaveStatus, retry?: () => void) => {
      if (active.current) report?.(source.current, { status, retry });
    },
    [report],
  );
}

/**
 * Bölüm köprülerinin kutuyu kabuğa bağladığı **tek** çağrı.
 *
 * Abonelik kutunun kendi `subscribe`ıdır; kutu her yayınında durum ve kirli anahtarlar yeniden
 * okunur. Değişmediyse rapor edilmez — aksi hâlde her satır dokunuşu kabuğu yeniden çizerdi.
 *
 * Kirli şerit `commitDirty` / `resetDirty` kaydını da buradan alır: kaydı ayrı bir çağrıya
 * bırakmak, "kutuyu bildirdim ama şeridin düğmelerini bağlamadım" hâlini mümkün kılardı.
 */
export function useReportSettingsStore(store: SettingsValueStore | null): void {
  const report = useContext(SettingsStoreReportContext);
  const register = useContext(SettingsDirtyRegistryContext);
  const reportSave = useSettingsSaveReporter();

  useEffect(() => {
    if (!store || !report) return;

    let lastStatus: SettingSaveStatus | null = null;
    let lastDirty = "";

    const publish = () => {
      const status = store.getStatus();

      if (status !== lastStatus) {
        lastStatus = status;
        reportSave(status, () => store.retry());
      }

      const keys = store.getDirtyKeys();
      const signature = keys.join(",");

      if (signature !== lastDirty) {
        lastDirty = signature;
        report.onDirtyKeys(keys);
      }
    };

    publish();

    const unsubscribe = store.subscribe(publish);

    return () => {
      unsubscribe();
      // Bölüm değişirken kabuk devralınan durumu bırakır: yeni bölümün kutusu kendi
      // durumunu yayınlayana kadar başlıkta önceki bölümün `Kaydedildi`si asılı kalmasın.
      reportSave("idle");
      report.onDirtyKeys([]);
    };
  }, [report, reportSave, store]);

  useEffect(() => {
    if (!store || !register) return;

    register({
      commit: () => store.commitDirtyAndFlush(),
      discard: () => store.resetDirty(),
    });

    return () => register(null);
  }, [register, store]);
}
