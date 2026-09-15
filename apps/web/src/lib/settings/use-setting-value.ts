"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import type { SettingsSection, SettingsTab } from "@/lib/settings/navigation";
import { SETTINGS_DIRTY_PROFILE_KEYS } from "@/lib/settings/metrics";
import {
  SETTINGS_LOCKED_ROW_KEYS,
  walkSettingsRows,
  type SettingsRiskyBlockKey,
} from "@/lib/settings/tree";

/**
 * Satır motorunun okuma/yazma köprüsü — Ş6 §5.
 *
 * Üç şey burada, **tek** yerde çözülür:
 *
 * 1. **Paylaşılan anahtarlar tek durumdur** (tuzak #4). `nd2`, `na5`, `na6`, `nq1`, `ns1` Genel
 *    sekmesiyle ayrıntı sekmesinde aynı satır anahtarını taşır; iki sekme de aynı `key` ile
 *    okuduğu için ikinci bir yerel state kurulmaz — biri değişince diğeri aynı anda değişir.
 *    `v7`/`x1` ve `v8`/`x5` ise **farklı** anahtarlarla aynı tercihtir (sapma #4); ağaçtaki
 *    `stateKey` ikisini aynı kutuya bağlar. `np4` bu listede yoktur ve bağlanmaz.
 * 2. **Yazmalar kuyruklanır.** Kaydırıcı sürüklenirken satır başına onlarca `setValue` gelir;
 *    250 ms içinde birikenler anahtar bazında son yazan kazanacak şekilde **tek** yamada
 *    birleşir. Sürükleme başına 40 istek çıkarmak sunucuyu değil, kullanıcıyı cezalandırırdı:
 *    yanıtlar sırasız döner ve değer zıplar.
 * 3. **Hata değeri geri alır.** Yama düşerse anahtar sunucunun bildiği son değere döner ve
 *    durum `error` olur; kabuk `Kaydedilemedi · yeniden dene` gösterir (tuzak #14 — gösterge
 *    gerçek yanıt üzerine kurulur, sabit gecikmeyle taklit edilmez).
 *
 * Taşıma yolu (`write`) **dışarıdan verilir**. Motor hangi ucun hangi anahtarı yazdığını
 * bilmez; bilseydi 169 satırlık bir uç eşlemesi bu dosyaya sıkışır ve Ş7–Ş10 aynı dosyada
 * çakışırdı. Sağlayıcı zorunlu bir `write` ister: uydurma bir varsayılan, kaydetmediği hâlde
 * `Kaydedildi` diyen bir gösterge demek olurdu.
 */

export type SettingValue = boolean | number | string;

export type SettingSaveStatus = "idle" | "saving" | "saved" | "error";

export type SettingsPatch = Record<string, SettingValue>;

export type SettingsWriteFn = (patch: SettingsPatch) => Promise<void>;

/** Ş6 §5 — bu pencere içinde biriken yamalar tek istekte birleşir. */
export const SETTINGS_WRITE_COALESCE_MS = 250;

/** Ses satırı üç değer taşır: anahtar, profil (`ns1_p`) ve seviye (`ns1_v`). */
export const SETTINGS_SOUND_PROFILE_SUFFIX = "_p";
export const SETTINGS_SOUND_VOLUME_SUFFIX = "_v";

const DIRTY_PROFILE_KEYS: ReadonlySet<string> = new Set(SETTINGS_DIRTY_PROFILE_KEYS);
const LOCKED_KEYS: ReadonlySet<string> = new Set(SETTINGS_LOCKED_ROW_KEYS);

/**
 * Satır anahtarını **durum** anahtarına çevirir.
 *
 * Ağaçtaki `stateKey` yalnız sapma #4'ün iki çiftinde dolu; kalan 166 satırda anahtarın kendisi
 * durumun da adıdır. Eşleme ağaçtan **üretilir**, elle yazılmaz: elle yazılan bir tablo ağaç
 * değiştiğinde sessizce eskir.
 */
const STATE_KEY_BY_ROW_KEY: ReadonlyMap<string, string> = buildStateKeyIndex();

function buildStateKeyIndex(): ReadonlyMap<string, string> {
  const index = new Map<string, string>();

  for (const { row } of walkSettingsRows()) {
    if (row.stateKey) {
      index.set(row.key, row.stateKey);
    }
  }

  return index;
}

export function resolveSettingStateKey(rowKey: string): string {
  return STATE_KEY_BY_ROW_KEY.get(rowKey) ?? rowKey;
}

/** SPEC_DEVIATIONS #5 — kirli profil alanları önek sezgisiyle değil, sayılarak bilinir. */
export function isDirtyProfileKey(rowKey: string): boolean {
  return DIRTY_PROFILE_KEYS.has(rowKey);
}

/** Tuzak #5 — kilitli anahtar istemci süsü değil; PATCH'e hiç girmez. */
export function isLockedSettingKey(rowKey: string): boolean {
  return LOCKED_KEYS.has(rowKey);
}

/**
 * Ağacın taşıdığı başlangıç değerleri.
 *
 * `defaultValue` referanstaki açılış değeridir; sunucudan gerçek değer gelene kadar satır bir
 * şey çizmek zorunda ve boş bir anahtar `undefined` kontrolünü on üç kontrole birden yayardı.
 */
export function buildSettingsDefaults(): SettingsPatch {
  const values: SettingsPatch = {};

  for (const { row } of walkSettingsRows()) {
    const key = resolveSettingStateKey(row.key);
    // The combined status row owns text plus a separately persisted emoji value.
    if (row.block === "profileEmoji") values.pe = "";

    if (row.type === "input" || row.type === "textarea") {
      values[key] = "";
      continue;
    }

    if (row.type === "sound") {
      values[key] = row.defaultValue ?? true;
      values[`${key}${SETTINGS_SOUND_PROFILE_SUFFIX}`] = row.sound?.profile ?? "whispr";
      values[`${key}${SETTINGS_SOUND_VOLUME_SUFFIX}`] = row.sound?.volume ?? 0;
      continue;
    }

    if (row.defaultValue !== undefined) {
      values[key] = row.defaultValue;
    }
  }

  return values;
}

/** Ağaç çalışma zamanında değişmiyor; 169 satırı her kanca çağrısında gezmek gereksizdi. */
const SETTINGS_DEFAULT_VALUES: SettingsPatch = buildSettingsDefaults();

type TimerHandle = unknown;

export type SettingsScheduler = {
  clearTimer: (handle: TimerHandle) => void;
  setTimer: (callback: () => void, delayMs: number) => TimerHandle;
};

const DEFAULT_SCHEDULER: SettingsScheduler = {
  clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  setTimer: (callback, delayMs) => setTimeout(callback, delayMs),
};

export type SettingsValueStoreOptions = {
  coalesceMs?: number;
  scheduler?: SettingsScheduler;
  values?: SettingsPatch;
  write: SettingsWriteFn;
};

/**
 * Değer kutusu — React'ten bağımsız.
 *
 * Kuyruk, geri alma ve kirli bayrağı burada saf mantık olarak durur; kanca yalnız bir
 * `useSyncExternalStore` sarmalayıcısıdır. Ayrım keyfi değil: bir React ağacı kurmadan
 * "sürükleme tek yamada birleşiyor mu" sorusunu ancak böyle sorabiliyoruz.
 */
export class SettingsValueStore {
  private readonly listeners = new Set<() => void>();

  private readonly scheduler: SettingsScheduler;

  private readonly coalesceMs: number;

  private writeFn: SettingsWriteFn;

  private values: SettingsPatch;

  /** Sunucunun bildiği son değer; yama düşerse buraya dönülür. */
  private readonly baseline = new Map<string, SettingValue>();

  private readonly statuses = new Map<string, SettingSaveStatus>();

  private readonly pending = new Map<string, SettingValue>();

  private readonly inFlight = new Map<string, SettingValue>();

  private readonly dirty = new Set<string>();

  private lastFailedPatch: SettingsPatch | null = null;

  private timer: TimerHandle = null;
  private sending: Promise<void> | null = null;

  constructor(options: SettingsValueStoreOptions) {
    this.writeFn = options.write;
    this.coalesceMs = options.coalesceMs ?? SETTINGS_WRITE_COALESCE_MS;
    this.scheduler = options.scheduler ?? DEFAULT_SCHEDULER;
    this.values = { ...SETTINGS_DEFAULT_VALUES, ...(options.values ?? {}) };
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  getValue = (key: string): SettingValue | undefined => this.values[resolveSettingStateKey(key)];

  getKeyStatus = (key: string): SettingSaveStatus =>
    this.statuses.get(resolveSettingStateKey(key)) ?? "idle";

  /** Başlıktaki tek gösterge: bir yama düştüyse hata, biri uçuyorsa kaydediliyor. */
  getStatus = (): SettingSaveStatus => {
    let sawSaved = false;

    for (const status of this.statuses.values()) {
      if (status === "error") return "error";
      if (status === "saving") return "saving";
      if (status === "saved") sawSaved = true;
    }

    return sawSaved ? "saved" : "idle";
  };

  getDirtyKeys = (): readonly string[] => [...this.dirty];

  setWrite = (write: SettingsWriteFn): void => {
    this.writeFn = write;
  };

  isDirty = (): boolean => this.dirty.size > 0;

  /**
   * Dokununca kaydeder (PROMPT §7) — profil alanları hariç: onlar kirli bayrağı kurar ve alttaki
   * kayıt şeridini bekler.
   */
  setValue = (key: string, next: SettingValue): void => {
    const stateKey = resolveSettingStateKey(key);

    if (isLockedSettingKey(stateKey)) {
      return;
    }

    if (this.values[stateKey] === next) {
      return;
    }

    this.rememberBaseline(stateKey);
    this.values = { ...this.values, [stateKey]: next };

    if (isDirtyProfileKey(stateKey)) {
      this.dirty.add(stateKey);
      this.emit();
      return;
    }

    this.enqueue(stateKey, next);
    this.emit();
  };

  /** Kirli profil alanlarını tek yamada gönderir — kayıt şeridindeki yeşil düğme. */
  commitDirty = (): void => {
    if (this.dirty.size === 0) {
      return;
    }

    for (const key of this.dirty) {
      const value = this.values[key];

      if (value !== undefined) {
        this.enqueue(key, value);
      }
    }

    this.dirty.clear();
    this.emit();
  };

  /**
   * Kayıt şeridindeki yeşil `Değişiklikleri kaydet`.
   *
   * `commitDirty` yamayı yalnız **kuyruğa** koyar ve 250 ms'lik birleştirme penceresini bekler;
   * şeridin düğmesi ise yazmanın sonucunu bilmek zorunda — kabuk `Kaydedildi` ya da
   * `Kaydedilemedi`yi buradan öğreniyor. `flushPending` zamanlayıcıyı atlar ve hatayı yutmaz.
   */
  commitDirtyAndFlush = async (): Promise<void> => {
    this.commitDirty();
    await this.flushPending();
  };

  /** Kayıt şeridindeki `Sıfırla` — taslak değerleri sunucunun bildiği hâle döndürür. */
  resetDirty = (): void => {
    if (this.dirty.size === 0) {
      return;
    }

    const restored = { ...this.values };

    for (const key of this.dirty) {
      const baseline = this.baseline.get(key);

      if (baseline !== undefined) {
        restored[key] = baseline;
        this.baseline.delete(key);
      }

      this.statuses.delete(key);
    }

    this.values = restored;
    this.dirty.clear();
    this.emit();
  };

  /**
   * `settings.updated` soketi. Kendi yazması uçuşta olan anahtar **atlanır**: sunucu henüz eski
   * değeri yayınlıyor olabilir ve onu yazmak kullanıcının az önceki dokunuşunu geri alırdı.
   */
  applyRemote = (patch: SettingsPatch): void => {
    let changed = false;
    const next = { ...this.values };

    for (const [rawKey, value] of Object.entries(patch)) {
      const key = resolveSettingStateKey(rawKey);

      if (this.pending.has(key) || this.inFlight.has(key) || this.dirty.has(key)) {
        continue;
      }

      if (next[key] !== value) {
        next[key] = value;
        this.baseline.delete(key);
        changed = true;
      }
    }

    if (changed) {
      this.values = next;
      this.emit();
    }
  };

  /** Bekleyen yamayı zamanlayıcıyı beklemeden gönderir (pencere kapanırken). */
  flush = (): void => {
    this.clearTimer();
    void this.send();
  };

  /**
   * Ş13 — kirli şeridin yeşil düğmesinin yolu: bekleyen yamayı **bekleyerek** gönderir ve
   * hatayı yutmaz.
   *
   * `flush()` ateşle-unut'tur (sökülme temizliği onu `await` edemez) ve `send()` hatayı
   * `settle(..., "error")` ile yutar. Kabuğun `runSave`'i o sözleşmeyle beslenirse gösterge
   * yazma düşse bile `Kaydedildi` derdi — tuzak #14'ün tam olarak yasakladığı şey.
   */
  flushPending = async (): Promise<void> => {
    this.clearTimer();

    const previousFailure = this.lastFailedPatch;

    await this.send();

    if (this.lastFailedPatch && this.lastFailedPatch !== previousFailure) {
      throw new Error(`SETTINGS_WRITE_FAILED:${Object.keys(this.lastFailedPatch).join(",")}`);
    }
  };

  /** `Kaydedilemedi · yeniden dene` — düşen son yamayı olduğu gibi tekrar dener. */
  retry = (): void => {
    const patch = this.lastFailedPatch;

    if (!patch) {
      return;
    }

    this.lastFailedPatch = null;
    const restored = { ...this.values };

    for (const [key, value] of Object.entries(patch)) {
      this.rememberBaseline(key);
      restored[key] = value;
      this.enqueue(key, value);
    }

    this.values = restored;
    this.emit();
  };

  /** Testlerin ve sağlayıcının sökülürken çağırdığı temizlik. */
  dispose = (): void => {
    this.clearTimer();
    this.listeners.clear();
  };

  private rememberBaseline(key: string): void {
    if (!this.baseline.has(key)) {
      const current = this.values[key];

      if (current !== undefined) {
        this.baseline.set(key, current);
      }
    }
  }

  private enqueue(key: string, value: SettingValue): void {
    this.pending.set(key, value);
    this.statuses.set(key, "saving");

    if (this.timer === null) {
      this.timer = this.scheduler.setTimer(() => {
        this.timer = null;
        void this.send();
      }, this.coalesceMs);
    }
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      this.scheduler.clearTimer(this.timer);
      this.timer = null;
    }
  }

  private async send(): Promise<void> {
    if (this.sending) {
      await this.sending;
      return this.send();
    }
    if (this.pending.size === 0) return;
    this.sending = this.sendBatch();
    try {
      await this.sending;
    } finally {
      this.sending = null;
    }
    if (this.pending.size > 0) await this.send();
  }

  private async sendBatch(): Promise<void> {
    if (this.pending.size === 0) {
      return;
    }

    const patch: SettingsPatch = {};

    for (const [key, value] of this.pending) {
      patch[key] = value;
      this.inFlight.set(key, value);
    }

    this.pending.clear();

    try {
      await this.writeFn(patch);
      this.settle(patch, "saved");
    } catch {
      this.lastFailedPatch = patch;
      this.settle(patch, "error");
    }
  }

  private settle(patch: SettingsPatch, status: SettingSaveStatus): void {
    const restored = { ...this.values };

    for (const key of Object.keys(patch)) {
      this.inFlight.delete(key);

      // Yama uçarken kullanıcı aynı anahtarı yeniden değiştirdiyse yeni değer kazanır:
      // eski yanıtın onu ezmesi, kullanıcının son dokunuşunu geri almak olurdu.
      if (this.pending.has(key) || this.dirty.has(key)) {
        if (status === "saved" && patch[key] !== undefined) this.baseline.set(key, patch[key]);
        if (!this.pending.has(key)) this.statuses.set(key, status);
        continue;
      }

      if (status === "error") {
        const baseline = this.baseline.get(key);

        if (baseline !== undefined) {
          restored[key] = baseline;
        }
      }

      this.baseline.delete(key);
      this.statuses.set(key, status);
    }

    if (status === "error") {
      this.values = restored;
    }

    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

/** Aynı anda tek açılır menü, tek riskli blok (tuzak #12) — merdiven burada tanımlanır. */
export type SettingsRowRuntime = {
  /** Ş7–Ş10'un `descriptionData` / `titleData` / `badgeData` alanlarını doldurduğu sözlük. */
  data: Readonly<Record<string, string>>;
  /**
   * K5 — karşılığı **olmayan** satırın kontrolü `disabled` çizilir.
   *
   * Telefon numarası satırının iki düğmesi (`ap`) ve 30 günlük bekleme süren kullanıcı adı alanı
   * (`pu`) ağaçta normal satırlar; onları çizilmez yapmak "böyle bir alan yok" derdi, çalışır
   * çizmek ise olmayan bir uca tıklatırdı. Bayrak bölüm şeridinden gelir çünkü hangi ucun bugün
   * var olduğunu **bölüm** bilir, motor değil.
   */
  disabledRows?: Readonly<Record<string, boolean>>;
  /** Eylem satırının hangi düğmesine basıldığı; gövde bölüm şeridinin işi. */
  onAction: (rowKey: string, actionIndex: number) => void;
  onJump: (target: { section: SettingsSection; tab: SettingsTab }) => void;
  onNavigate: (rowKey: string) => void;
  onSoundPreview: (rowKey: string) => void;
  openRisky: SettingsRiskyBlockKey | null;
  openSelect: string | null;
  /** Ş7'nin yazdığı üç riskli blok gövdesi; satır anahtarına göre çözülür. */
  riskyBodies: Readonly<Record<string, ReactNode>>;
  setOpenRisky: (key: SettingsRiskyBlockKey | null) => void;
  setOpenSelect: (key: string | null) => void;
};

/** Boş harita tek bir kez kurulur; her render'da yeni bir nesne referansı üretmez. */
const NO_DISABLED_ROWS: Readonly<Record<string, boolean>> = {};

const NOOP_RUNTIME: SettingsRowRuntime = {
  data: {},
  disabledRows: NO_DISABLED_ROWS,
  onAction: () => {},
  onJump: () => {},
  onNavigate: () => {},
  onSoundPreview: () => {},
  openRisky: null,
  openSelect: null,
  riskyBodies: {},
  setOpenRisky: () => {},
  setOpenSelect: () => {},
};

export const SettingsValueContext = createContext<SettingsValueStore | null>(null);
export const SettingsRowRuntimeContext = createContext<SettingsRowRuntime>(NOOP_RUNTIME);

export function useSettingsValueStore(): SettingsValueStore | null {
  return useContext(SettingsValueContext);
}

export function useSettingsRowRuntime(): SettingsRowRuntime {
  return useContext(SettingsRowRuntimeContext);
}

/**
 * Merdivenin **tek** uygulaması (tuzak #12).
 *
 * `openSelect` satır, `openRisky` riskli blok anahtarını taşır; ikinci bir menü açmak birincisini
 * kapatmayı ayrıca kodlamayı gerektirmez — durumun kendisi tekliği taşır. Ş5 kabuğun reducer'ı
 * bu iki değeri `overrides` ile devralır (bölüm/sekme değişiminde ikisini de kapatması gerekir);
 * devralmadığında merdiven burada yaşar ve hiçbir çağrı yerinde tekrarlanmaz.
 */
export function useSettingsRowRuntimeState(
  overrides: Partial<SettingsRowRuntime> = {},
): SettingsRowRuntime {
  const [openSelect, setOpenSelect] = useState<string | null>(null);
  const [openRisky, setOpenRisky] = useState<SettingsRiskyBlockKey | null>(null);

  return {
    data: overrides.data ?? NOOP_RUNTIME.data,
    disabledRows: overrides.disabledRows ?? NO_DISABLED_ROWS,
    onAction: overrides.onAction ?? NOOP_RUNTIME.onAction,
    onJump: overrides.onJump ?? NOOP_RUNTIME.onJump,
    onNavigate: overrides.onNavigate ?? NOOP_RUNTIME.onNavigate,
    onSoundPreview: overrides.onSoundPreview ?? NOOP_RUNTIME.onSoundPreview,
    // Ş13 — devralma `??` ile okunamaz: kabuk menüyü kapattığında da `null` gönderir ve `??`
    // o değeri **yerel** duruma düşürür, yani devralma sessizce yarım kalır (Ş9 raporu §4.7).
    // Alanın varlığı devralmanın kendisidir.
    openRisky: "openRisky" in overrides ? (overrides.openRisky ?? null) : openRisky,
    openSelect: "openSelect" in overrides ? (overrides.openSelect ?? null) : openSelect,
    riskyBodies: overrides.riskyBodies ?? NOOP_RUNTIME.riskyBodies,
    setOpenRisky: overrides.setOpenRisky ?? setOpenRisky,
    setOpenSelect: overrides.setOpenSelect ?? setOpenSelect,
  };
}

export type UseSettingValueResult<T extends SettingValue> = {
  locked: boolean;
  setValue: (next: T) => void;
  status: SettingSaveStatus;
  value: T;
};

/**
 * Satırın tek okuma/yazma kapısı.
 *
 * Sağlayıcı yoksa (bileşenlerin yalıtılmış testleri, Ş7–Ş10'un blok testleri) ağaçtaki
 * varsayılan çizilir ve `setValue` bir şey yapmaz — kutu yokken yazacak bir yer de yoktur.
 * Bu yalnız test/izole render için geçerli bir durum; üretimde kabuk her zaman bir kutu verir.
 */
export function useSettingValue<T extends SettingValue>(
  key: string,
  fallback?: T,
): UseSettingValueResult<T> {
  const store = useSettingsValueStore();
  const stateKey = resolveSettingStateKey(key);

  const subscribe = useCallback(
    (listener: () => void) => store?.subscribe(listener) ?? (() => {}),
    [store],
  );

  const readValue = useCallback(() => store?.getValue(stateKey), [store, stateKey]);
  const readStatus = useCallback(() => store?.getKeyStatus(stateKey) ?? "idle", [store, stateKey]);

  const stored = useSyncExternalStore(subscribe, readValue, readValue);
  const status = useSyncExternalStore(subscribe, readStatus, readStatus);

  const setValue = useCallback(
    (next: T) => {
      store?.setValue(stateKey, next);
    },
    [store, stateKey],
  );

  const value = (stored ?? fallback ?? SETTINGS_DEFAULT_VALUES[stateKey]) as T;

  return { locked: isLockedSettingKey(stateKey), setValue, status, value };
}
