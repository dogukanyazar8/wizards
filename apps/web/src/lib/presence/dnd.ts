import type { UserStatusValue } from "@/lib/home/focus";

/**
 * Ayarlar Ş12 §2 / K8 — "Rahatsız Etmeyin" süre sözleşmesi.
 *
 * Rahatsız Etmeyin ayrı bir bayrak **değildir**: presence `DND` artı bir süre penceresidir.
 * Anahtar `status = DND` yazar, süre çipi `statusExpiresAt` + `statusRestoreTo` kurar ve
 * pencere kapanınca eski durum geri gelir.
 *
 * Bu dosyada saat okunmaz — `now` her zaman parametredir. Süreyi **mevcut odak makinesi**
 * yönetir (`FocusControlsProvider` + sunucudaki `sweepExpiredFocus`); burada ikinci bir geri
 * sayım yoktur ve kurulamaz da: geri sayacak bir şey tutmuyoruz, yalnız mutlak bir an
 * yazıyoruz.
 *
 * `statusRestoreTo` sözleşmesi tek cümlede: **DND açılmadan önceki durum**. Açıkken süre
 * değiştirmek onu ezmez, çünkü ezerse yazacağı tek değer `DND`'nin kendisi olurdu ve kullanıcı
 * kapatınca kendi durumuna değil, kapattığı duruma dönerdi.
 */

export type { UserStatusValue };

/** Dört çip, tasarımın çizdiği sırayla: `30 dk · 1 saat · 8 saat · Ben açana kadar`. */
export type DndDuration = "30m" | "1h" | "8h" | "until";

export const DND_DURATIONS = ["30m", "1h", "8h", "until"] as const satisfies readonly DndDuration[];

/**
 * Çipin dakika karşılığı; `until` = süre yok.
 *
 * 480 dakika, Ana Sayfa'nın `HomeFocusUpdateSchema` üst sınırının (240) üstündedir. O sınır
 * `Odak` düğmesinin sabit 25 dakikası içindir; bu şeridin dört çipi kendi yazma yolundan
 * geçer (`updatePresenceDndAction`) — ama ikisinin **aynı** dört kolonu yazdığı unutulmamalı.
 */
export const DND_DURATION_MINUTES: Readonly<Record<DndDuration, number | null>> = {
  "30m": 30,
  "1h": 60,
  "8h": 480,
  until: null,
};

/** Anahtar süre seçilmeden açıldığında kurulan pencere; referansın açılış durumu `1 saat`. */
export const DEFAULT_DND_DURATION: DndDuration = "1h";

export function resolveStatusMenuDndDuration(status: UserStatusValue): DndDuration | null {
  return status === "DND" ? DEFAULT_DND_DURATION : null;
}

/** i18n anahtarı — çip etiketi ve `Bildirimler durdu · {süre}` satırı aynı metni okur. */
export const DND_DURATION_LABEL_KEYS: Readonly<Record<DndDuration, string>> = {
  "30m": "settings.userMenu.dnd.duration.30m",
  "1h": "settings.userMenu.dnd.duration.1h",
  "8h": "settings.userMenu.dnd.duration.8h",
  until: "settings.userMenu.dnd.duration.until",
};

const MINUTE_MS = 60_000;

/** Kullanıcı satırının bu sözleşmeyi ilgilendiren dört kolonu. */
export type DndRow = {
  readonly status: UserStatusValue;
  readonly statusExpiresAt: Date | string | null;
  readonly statusFocusMinutes: number | null;
  readonly statusRestoreTo: UserStatusValue | null;
};

export type DndPatch = {
  readonly status: "DND";
  /** `Ben açana kadar` → `null`. */
  readonly statusExpiresAt: string | null;
  readonly statusFocusMinutes: number | null;
  readonly statusRestoreTo: UserStatusValue;
};

export type DndClearPatch = {
  readonly status: UserStatusValue;
  readonly statusExpiresAt: null;
};

export type DndWritePlan = {
  /**
   * False when the stored row already says exactly this. Aynı çipe ikinci kez basmak pencereyi
   * **uzatmaz** ve her arkadaşın soketini boşuna uyandırmaz.
   */
  readonly changed: boolean;
  readonly data: {
    readonly status: UserStatusValue;
    readonly statusExpiresAt: Date | null;
    readonly statusFocusMinutes: number | null;
    readonly statusRestoreTo: UserStatusValue | null;
  };
};

export function isDndDuration(value: unknown): value is DndDuration {
  return typeof value === "string" && (DND_DURATIONS as readonly string[]).includes(value);
}

/**
 * Rahatsız Etmeyin **şu anda açık mı**.
 *
 * Ölçüt `statusExpiresAt` değil `status`'tür: `Ben açana kadar` seçildiğinde bir bitiş anı
 * yoktur ama mod açıktır. Süreye bakan bir kontrol bu dalı "kapalı" sayar ve `statusRestoreTo`
 * bir sonraki çip dokunuşunda `DND` ile ezilirdi.
 */
export function isDndActive(row: Pick<DndRow, "status">): boolean {
  return row.status === "DND";
}

/**
 * Pencerenin geri döneceği durum.
 *
 * Açıkken saklanan hedef **korunur** (K8); kapalıyken şu anki durum hedef olur. `DND` hiçbir
 * dalda hedef yazılmaz — pencere kendine dönerdi.
 */
export function resolveDndRestoreTo(
  row: Pick<DndRow, "status" | "statusRestoreTo">,
): UserStatusValue {
  if (!isDndActive(row)) {
    return row.status;
  }

  return row.statusRestoreTo !== null && row.statusRestoreTo !== "DND"
    ? row.statusRestoreTo
    : "ONLINE";
}

/**
 * Anahtarı açan / süreyi değiştiren yazma.
 *
 * `current` ya yalnız durumdur ya da satırın kendisi; ikinci biçim açıkken saklanan hedefi
 * taşır ve sözleşmenin "ezmez" yarısı ancak onunla doğrulanabilir.
 */
export function buildDndPatch(
  duration: DndDuration,
  current: UserStatusValue | Pick<DndRow, "status" | "statusRestoreTo">,
  now: Date = new Date(),
): DndPatch {
  const row = typeof current === "string" ? { status: current, statusRestoreTo: null } : current;
  const minutes = DND_DURATION_MINUTES[duration];

  return {
    status: "DND",
    statusExpiresAt:
      minutes === null ? null : new Date(now.getTime() + minutes * MINUTE_MS).toISOString(),
    statusFocusMinutes: minutes,
    statusRestoreTo: resolveDndRestoreTo(row),
  };
}

/** Anahtarı kapatan yazma. Pencere kapanır, durum hedefe döner. */
export function clearDndPatch(restoreTo: UserStatusValue): DndClearPatch {
  return {
    status: restoreTo === "DND" ? "ONLINE" : restoreTo,
    statusExpiresAt: null,
  };
}

function toTime(value: Date | string | null): number | null {
  if (value === null) {
    return null;
  }

  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

/**
 * Hangi çip seçili çizilir.
 *
 * Kayıtlı dakika bir çipe denk gelmiyorsa (eski satır, `Odak` düğmesinin 25 dakikası) hiçbir
 * çip seçili değildir — yanlış bir çipi işaretlemek, kullanıcıya seçmediği bir süreyi seçtiğini
 * söylerdi.
 */
export function selectDndDuration(
  row: Pick<DndRow, "status" | "statusExpiresAt" | "statusFocusMinutes">,
): DndDuration | null {
  if (!isDndActive(row)) {
    return null;
  }

  if (toTime(row.statusExpiresAt) === null) {
    return "until";
  }

  return (
    DND_DURATIONS.find((duration) => DND_DURATION_MINUTES[duration] === row.statusFocusMinutes) ??
    null
  );
}

/**
 * Sunucudaki tek karar noktası: gelen çipi saklanan satırla birleştirir.
 * `duration === null` anahtarın kapatılmasıdır.
 */
export function planDndWrite(input: {
  readonly duration: DndDuration | null;
  readonly now: Date;
  readonly row: DndRow;
}): DndWritePlan {
  const { duration, now, row } = input;
  const storedExpiresAt = toTime(row.statusExpiresAt);

  if (duration === null) {
    const data = {
      status: clearDndPatch(resolveDndRestoreTo(row)).status,
      statusExpiresAt: null,
      statusFocusMinutes: null,
      statusRestoreTo: null,
    } as const;

    return {
      changed:
        data.status !== row.status ||
        storedExpiresAt !== null ||
        row.statusFocusMinutes !== null ||
        row.statusRestoreTo !== null,
      data,
    };
  }

  // Aynı çipe ikinci kez basmak yeniden açmak değildir: pencere olduğu yerde kalır.
  if (isDndActive(row) && selectDndDuration(row) === duration) {
    return {
      changed: false,
      data: {
        status: row.status,
        statusExpiresAt: storedExpiresAt === null ? null : new Date(storedExpiresAt),
        statusFocusMinutes: row.statusFocusMinutes,
        statusRestoreTo: row.statusRestoreTo,
      },
    };
  }

  const patch = buildDndPatch(duration, row, now);
  const data = {
    status: "DND" as UserStatusValue,
    statusExpiresAt: patch.statusExpiresAt === null ? null : new Date(patch.statusExpiresAt),
    statusFocusMinutes: patch.statusFocusMinutes,
    statusRestoreTo: patch.statusRestoreTo,
  };

  return {
    changed:
      data.status !== row.status ||
      (data.statusExpiresAt?.getTime() ?? null) !== storedExpiresAt ||
      data.statusFocusMinutes !== row.statusFocusMinutes ||
      data.statusRestoreTo !== row.statusRestoreTo,
    data,
  };
}
