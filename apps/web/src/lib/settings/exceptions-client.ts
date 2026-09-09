"use client";

import type {
  NotificationExceptionLevel,
  NotificationExceptionList,
  NotificationExceptionScope,
} from "@/lib/notifications/exceptions-service";

/**
 * İstisna listesinin istemci yüzü (K4 §2).
 *
 * Okuma tek uçtan gelir; **yazma gelmez**. Her satır kendi mevcut ucuna yazar ve üç yolun
 * hangisinin seçileceği burada, tek yerde bilinir — Ş9 üç ayrı çağrıyı bilmez, `updateException`
 * çağırır. Yeni bir yazma ucu açmak, üç tabloya dördüncü bir yazar eklemek olurdu.
 */

const EXCEPTIONS_ENDPOINT = "/api/v1/users/me/notification-exceptions";

export async function fetchNotificationExceptions(): Promise<NotificationExceptionList> {
  const response = await fetch(EXCEPTIONS_ENDPOINT);

  if (!response.ok) throw new Error("Failed to fetch notification exceptions");

  return response.json() as Promise<NotificationExceptionList>;
}

export const notificationExceptionQueryKeys = {
  list: ["user", "notification-exceptions"] as const,
};

/**
 * Kapsamın bu düzeyi yazacak bir ucu yok.
 *
 * Sessizce yutmak yerine tip taşıyan bir hata: Ş9 kontrolü `disabled` çizebilsin, kullanıcı da
 * hiçbir şey olmayan bir düğmeye basmasın.
 */
export class NotificationExceptionUnsupportedError extends Error {
  readonly scope: NotificationExceptionScope;

  constructor(scope: NotificationExceptionScope, reason: string) {
    super(`Unsupported notification exception write for ${scope}: ${reason}`);
    this.name = "NotificationExceptionUnsupportedError";
    this.scope = scope;
  }
}

/**
 * TODO(api): sunucu kapsamının web ucu yok. `PATCH /api/v1/mobile/servers/[serverId]/settings`
 * `requireMobileApiUserId` ile korunuyor (Bearer JWT), yani oturum çerezli bir web isteği oraya
 * ulaşamıyor. Ş4 yeni uç açmıyor (§2); web eşleniği açıldığında yalnız bu tablo değişir.
 *
 * TODO(api): kanal ucu `DEFAULT` yazamıyor — `all | mentions | muted` üçlüsünü kabul ediyor.
 * "İstisnayı kaldır" bu yüzden yalnız DM'de çalışıyor; kanal için ucun `default` düzeyini
 * öğrenmesi gerekiyor.
 */
export const NOTIFICATION_EXCEPTION_WRITE_SUPPORT: Readonly<
  Record<NotificationExceptionScope, { readonly remove: boolean; readonly update: boolean }>
> = {
  channel: { remove: false, update: true },
  dm: { remove: true, update: true },
  server: { remove: false, update: false },
};

export function canUpdateException(scope: NotificationExceptionScope): boolean {
  return NOTIFICATION_EXCEPTION_WRITE_SUPPORT[scope].update;
}

export function canRemoveException(scope: NotificationExceptionScope): boolean {
  return NOTIFICATION_EXCEPTION_WRITE_SUPPORT[scope].remove;
}

export type NotificationExceptionPatch = {
  readonly level: NotificationExceptionLevel;
};

type ScopedRequest = {
  readonly body: Record<string, string>;
  readonly url: string;
};

/**
 * Kanal ucunun sözlüğü üç üyeli. `off` oraya `muted` olarak iner çünkü uç `muted` seçimini
 * zaten `NOTHING + muted` olarak yazıyor — iki düzey aynı satıra düşer, üçüncü bir anlam
 * uydurulmaz. `important` kanalda karşılıksızdır: `UserChannelSettings`'te `suppress*` kolonu
 * yok.
 */
const CHANNEL_LEVELS: Partial<Record<NotificationExceptionLevel, string>> = {
  all: "all",
  mentions: "mentions",
  muted: "muted",
  off: "muted",
};

/** DM ucunun sözlüğü de üç üyeli; `important` orada da karşılıksızdır. */
const DM_LEVELS: Partial<Record<NotificationExceptionLevel, string>> = {
  all: "ALL",
  mentions: "MENTIONS",
  muted: "NONE",
  off: "NONE",
};

function channelRequest(
  channelId: string,
  level: NotificationExceptionLevel,
): ScopedRequest | null {
  const mapped = CHANNEL_LEVELS[level];

  if (!mapped) return null;

  return {
    body: { level: mapped },
    url: `/api/v1/channels/${encodeURIComponent(channelId)}/notification-settings`,
  };
}

function dmRequest(
  conversationId: string,
  level: NotificationExceptionLevel,
): ScopedRequest | null {
  const mapped = DM_LEVELS[level];

  if (!mapped) return null;

  return {
    body: { notifyLevel: mapped },
    url: `/api/v1/dm/${encodeURIComponent(conversationId)}/notify`,
  };
}

function buildRequest(
  scope: NotificationExceptionScope,
  scopeId: string,
  level: NotificationExceptionLevel,
): ScopedRequest | null {
  if (scope === "channel") return channelRequest(scopeId, level);
  if (scope === "dm") return dmRequest(scopeId, level);

  return null;
}

/**
 * Satırın düzeyini **kendi** kaynağına yazar.
 *
 * Yanıt gövdesi kapsamdan kapsama farklı (`{ level }` · `{ notifyLevel }`); çağıran bunu
 * okumaz, listeyi tazeler. Tek bir birleşik DTO uydurmak, üç ucun üçünü de bu dosyaya bağımlı
 * hâle getirirdi.
 */
export async function updateException(
  scope: NotificationExceptionScope,
  scopeId: string,
  patch: NotificationExceptionPatch,
): Promise<void> {
  const request = buildRequest(scope, scopeId, patch.level);

  if (!request) {
    throw new NotificationExceptionUnsupportedError(
      scope,
      `no endpoint writes level "${patch.level}"`,
    );
  }

  const response = await fetch(request.url, {
    body: JSON.stringify(request.body),
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
  });

  if (!response.ok) throw new Error("Failed to update notification exception");
}

/**
 * "İstisnayı kaldır" — satırı varsayılana döndürür.
 *
 * DM'de bu `notifyLevel = ALL` demektir ve satır listeden düşer. Kanal ve sunucuda karşılığı
 * olan bir uç yok (yukarıdaki `TODO(api):`), bu yüzden çağrı tip taşıyan bir hatayla döner.
 */
export async function removeException(
  scope: NotificationExceptionScope,
  scopeId: string,
): Promise<void> {
  if (!canRemoveException(scope)) {
    throw new NotificationExceptionUnsupportedError(scope, "no endpoint restores the default");
  }

  await updateException(scope, scopeId, { level: "all" });
}
