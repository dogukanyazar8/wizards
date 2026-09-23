/**
 * Ş9 · SPEC-SUNUCU §6.3 — davet penceresinin saf mantığı.
 *
 * Pencere iki şeyi yapar: bir bağlantı üretir, bir de o bağlantıyı bir arkadaşa yollar.
 * İkisinin de karar noktaları burada yaşıyor; `channel-invite-modal.tsx` yalnız çiziyor.
 *
 * **ROL alanı yoktur.** SPEC §6.3 "tasarımdan kaldırıldı" diyor; bu dosyada rol taşıyan
 * hiçbir alan bulunmaz ve pencere de üretmez.
 *
 * Çip kümeleri `Sunucu.dc.html:2660-2661`'den okundu (Ş3 raporu §1.3 aynı satırları
 * kilitliyor). Değerler `CreateServerInviteSchema`'nın kabul aralığındadır: `expiresInHours`
 * 1–720, `maxUses` 1–1000, ikisinde de `null` "sınır yok" demektir.
 */

import type { CreateServerInviteInput } from "@wizards/types";

export type ServerInviteDurationId = "1h" | "12h" | "24h" | "7d" | "30d" | "never";
export type ServerInviteUseLimitId = "1" | "5" | "25" | "100" | "1000" | "unlimited";

export type ServerInviteDurationOption = {
  readonly hours: number | null;
  readonly id: ServerInviteDurationId;
};

export type ServerInviteUseLimitOption = {
  readonly id: ServerInviteUseLimitId;
  readonly maxUses: number | null;
};

/** §6.3 · §8.7 — altı süre çipi. `null` = `Süresiz`. */
export const SERVER_INVITE_DURATIONS: readonly ServerInviteDurationOption[] = [
  { hours: 1, id: "1h" },
  { hours: 12, id: "12h" },
  { hours: 24, id: "24h" },
  { hours: 168, id: "7d" },
  { hours: 720, id: "30d" },
  { hours: null, id: "never" },
];

/** §6.3 · §8.7 — altı kullanım çipi. `null` = `Sınırsız`. */
export const SERVER_INVITE_USE_LIMITS: readonly ServerInviteUseLimitOption[] = [
  { id: "1", maxUses: 1 },
  { id: "5", maxUses: 5 },
  { id: "25", maxUses: 25 },
  { id: "100", maxUses: 100 },
  { id: "1000", maxUses: 1000 },
  { id: "unlimited", maxUses: null },
];

/**
 * Pencerenin varsayılanları ayarlar bölümünün varsayılanlarıyla **aynı değil**.
 *
 * §6.3 iki kartı `SÜRE 7 gün` ve `KULLANIM Sınırsız` çiziyor; §8.7'nin "Yeni davet" kartı
 * ise `7 gün` + `25 kullanım` ile açılıyor. İki yüzey, iki varsayılan — SPEC ikisini de
 * ayrı ayrı veriyor, bu yüzden burada yalnız pencerenin değeri var.
 */
export const SERVER_INVITE_DEFAULT_DURATION_ID: ServerInviteDurationId = "7d";
export const SERVER_INVITE_DEFAULT_USE_LIMIT_ID: ServerInviteUseLimitId = "unlimited";

export function selectInviteDuration(id: ServerInviteDurationId): ServerInviteDurationOption {
  return SERVER_INVITE_DURATIONS.find((option) => option.id === id) ?? SERVER_INVITE_DURATIONS[3]!;
}

export function selectInviteUseLimit(id: ServerInviteUseLimitId): ServerInviteUseLimitOption {
  return (
    SERVER_INVITE_USE_LIMITS.find((option) => option.id === id) ?? SERVER_INVITE_USE_LIMITS[5]!
  );
}

export type ServerInviteFormState = {
  readonly durationId: ServerInviteDurationId;
  readonly useLimitId: ServerInviteUseLimitId;
};

export const SERVER_INVITE_INITIAL_STATE: ServerInviteFormState = {
  durationId: SERVER_INVITE_DEFAULT_DURATION_ID,
  useLimitId: SERVER_INVITE_DEFAULT_USE_LIMIT_ID,
};

/**
 * Pencerenin gövdesi. `channelId` verilmezse alan **gönderilmez**: `undefined` "sunucu karar
 * versin" demek, `null` ise "kanalsız davet" demek ve ikisi uçta farklı davranıyor.
 */
export function buildServerInvitePayload(
  state: ServerInviteFormState,
  options: {
    channelId?: string | null | undefined;
    targetUserId?: string | null | undefined;
  } = {},
): CreateServerInviteInput {
  const payload: CreateServerInviteInput = {
    expiresInHours: selectInviteDuration(state.durationId).hours,
    maxUses: selectInviteUseLimit(state.useLimitId).maxUses,
  };

  if (options.channelId !== undefined) {
    payload.channelId = options.channelId;
  }

  if (options.targetUserId) {
    payload.targetUserId = options.targetUserId;
  }

  return payload;
}

/**
 * Davet bağlantısı. Tasarım `whispr.app/i/<kod>` yazıyor; üründe davet rotası
 * `/invite/[code]` ve tek gerçek konak tarayıcının kendi kaynağıdır. Sabit bir alan adı
 * gömmek, UAT'ta tıklandığında üretime giden bir bağlantı üretirdi (Ş9 sapma #1).
 */
export function buildServerInviteUrl(origin: string, code: string): string {
  return `${origin.replace(/\/+$/u, "")}/invite/${code}`;
}

/** Bağlantı satırında `https://` gösterilmez — tasarımda da yok. */
export function toServerInviteDisplayUrl(url: string): string {
  return url.replace(/^https?:\/\//u, "");
}

export type ServerInviteNoticeKey =
  | "server.modal.invite.notice.expiring"
  | "server.modal.invite.notice.never"
  | "server.modal.invite.notice.readyExpiring"
  | "server.modal.invite.notice.readyNever";

/**
 * Success bilgi kutusunun metni iki eksende çekimlenir (§6.3).
 *
 * **Süre:** süreli davette "… 7 gün sonra kendiliğinden sona erer."; süresizde sona erme
 * cümlesi yalan olurdu.
 *
 * **Kopyalanma:** SPEC'in yazdığı cümle "Bağlantı **kopyalandı** · …" ve kutu tasarımda
 * hep duruyor. Kutuyu hiç kopyalamamış kullanıcıya da aynı cümleyle göstermek, olmamış bir
 * eylemi bildirmek olurdu; bu yüzden kopyalanmadan önceki hâli ayrı bir anahtar
 * (Ş9 sapma #2).
 */
export function selectInviteNoticeKey(
  durationId: ServerInviteDurationId,
  copied: boolean,
): ServerInviteNoticeKey {
  if (durationId === "never") {
    return copied ? "server.modal.invite.notice.never" : "server.modal.invite.notice.readyNever";
  }

  return copied
    ? "server.modal.invite.notice.expiring"
    : "server.modal.invite.notice.readyExpiring";
}

export type InviteFriendCandidate = {
  readonly avatarUrl: string | null;
  readonly displayName: string;
  readonly id: string;
  readonly username: string;
};

/**
 * "Arkadaş seçerek davet" listesi. Kaynak **yalnız** arkadaş listesidir: web hedefli davet
 * yolu arkadaşlık kontrolü yapıyor (Ş3 §2.1) ve arkadaş olmayan biri listede görünüp uçta
 * `400 NOT_FRIENDS` almamalı.
 */
export function filterInviteFriends(
  friends: readonly InviteFriendCandidate[],
  query: string,
): readonly InviteFriendCandidate[] {
  const needle = query.trim().toLocaleLowerCase("tr");

  if (needle.length === 0) {
    return friends;
  }

  return friends.filter(
    (friend) =>
      friend.displayName.toLocaleLowerCase("tr").includes(needle) ||
      friend.username.toLocaleLowerCase("tr").includes(needle),
  );
}
