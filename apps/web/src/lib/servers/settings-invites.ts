/**
 * `Sunucu ayarları › Davetler` bölümünün saf katmanı — SPEC-SUNUCU §8.7 + **K3**.
 *
 * Süre ve kullanım çipleri `invite-form.ts`'te (Ş9 penceresiyle **ortak**); burada yalnız
 * bölümün kendi üç şeyi var: üçüncü çip grubu (`Hedef kanal`), canlı özet satırı ve mevcut
 * davet satırının iki metni (`3 / 25`, `# welcome-chat`).
 *
 * Neden ayrı dosya: pencere bir davet **taslağını** her çip değişiminde sunucuya yazıyor
 * (`invite-draft` sorgusu), bölüm ise `Davet oluştur`a basılana kadar hiçbir şey yazmıyor.
 * İkisi aynı çip listesini paylaşır, aynı gönderim davranışını **paylaşmaz**.
 */

import {
  type ServerInviteDurationId,
  type ServerInviteUseLimitId,
  SERVER_INVITE_DEFAULT_DURATION_ID,
  selectInviteDuration,
  selectInviteUseLimit,
} from "./invite-form";

export type ServerInviteChannelOption = {
  readonly id: string;
  readonly name: string;
};

/**
 * `Hedef kanal` çipleri — **yalnız yazı kanalları**. Ş3 §3.8: verilen `channelId` uçta yazı
 * kanalı olmak zorunda, ses kanalı 400 alıyor. Kategori sırası korunur, kategorisiz kanallar
 * sona eklenir (`toServerEventChannelOptions` ile aynı sıra kuralı).
 */
export function toServerInviteChannelOptions(detail: {
  readonly categories: readonly {
    readonly channels: readonly {
      readonly id: string;
      readonly name: string;
      readonly type: "TEXT" | "VOICE";
    }[];
    readonly position: number;
  }[];
  readonly ungroupedChannels: readonly {
    readonly id: string;
    readonly name: string;
    readonly type: "TEXT" | "VOICE";
  }[];
}): readonly ServerInviteChannelOption[] {
  const grouped = [...detail.categories]
    .sort((left, right) => left.position - right.position)
    .flatMap((category) => category.channels);

  return [...grouped, ...detail.ungroupedChannels]
    .filter((channel) => channel.type === "TEXT")
    .map((channel) => ({ id: channel.id, name: channel.name }));
}

export type ServerSettingsInviteState = {
  readonly channelId: string | null;
  readonly durationId: ServerInviteDurationId;
  readonly useLimitId: ServerInviteUseLimitId;
};

/**
 * SPEC §8.7'nin varsayılanları: ilk yazı kanalı · **7 gün** · **25 kullanım**
 * (`Sunucu.dc.html:1835`).
 *
 * Not: pencerenin varsayılan kullanım sınırı `unlimited`, bölümün `25`. İkisi de referanstan
 * okundu ve bilerek farklı — pencere "hızlıca paylaş" yüzeyi, bölüm "davet yönet" yüzeyi.
 */
export const SERVER_SETTINGS_INVITE_DEFAULT_USE_LIMIT_ID: ServerInviteUseLimitId = "25";

export function initialServerSettingsInviteState(
  channels: readonly ServerInviteChannelOption[],
): ServerSettingsInviteState {
  return {
    channelId: channels[0]?.id ?? null,
    durationId: SERVER_INVITE_DEFAULT_DURATION_ID,
    useLimitId: SERVER_SETTINGS_INVITE_DEFAULT_USE_LIMIT_ID,
  };
}

export type ServerInviteSummaryParts = {
  readonly channelName: string | null;
  readonly durationId: ServerInviteDurationId;
  readonly useLimitId: ServerInviteUseLimitId;
};

/**
 * Özet satırının parçaları (`# welcome-chat · 7 gün · 25 kullanım`). Metin **burada
 * birleştirilmez**: üç parçanın ikisi çip etiketleriyle aynı çeviri anahtarını paylaşıyor ve
 * `kullanım` çoğul kuralına giriyor (00 §7).
 */
export function buildServerInviteSummaryParts(
  state: ServerSettingsInviteState,
  channels: readonly ServerInviteChannelOption[],
): ServerInviteSummaryParts {
  return {
    channelName: channels.find((channel) => channel.id === state.channelId)?.name ?? null,
    durationId: state.durationId,
    useLimitId: state.useLimitId,
  };
}

export function buildServerSettingsInvitePayload(state: ServerSettingsInviteState): {
  channelId?: string;
  expiresInHours: number | null;
  maxUses: number | null;
} {
  const duration = selectInviteDuration(state.durationId);
  const useLimit = selectInviteUseLimit(state.useLimitId);

  return {
    ...(state.channelId ? { channelId: state.channelId } : {}),
    expiresInHours: duration.hours,
    maxUses: useLimit.maxUses,
  };
}

export type ServerInviteUsesLabel = {
  readonly limit: number | null;
  readonly uses: number;
};

/**
 * Kullanım çipi: `3 / 25` sınırlıysa, `12 / ∞` sınırsızsa. Sonsuzluk işareti bir **metin**
 * değil bir sembol; çeviri dosyasına girmez ve iki dilde aynıdır.
 */
export const INVITE_UNLIMITED_SYMBOL = "∞";

export function formatInviteUses(entry: ServerInviteUsesLabel): string {
  return `${entry.uses} / ${entry.limit ?? INVITE_UNLIMITED_SYMBOL}`;
}

export type InviteRemaining =
  | { readonly kind: "never" }
  | { readonly kind: "expired" }
  | { readonly unit: "day" | "hour" | "minute"; readonly kind: "in"; readonly value: number };

/**
 * Satırın `6 gün` / `Süresiz` metni. Ş3 §3.2: uç `expiresAt` taşıyor, kalan süreyi **istemci**
 * hesaplıyor — iki formatlayıcı istemiyoruz.
 *
 * Aşağı yuvarlanır: 6 gün 20 saat kalan bir davet `6 gün` yazar. Zaman aşımı çipinin tersi
 * (orası yukarı yuvarlıyor) ve bu bilerek: zaman aşımında kullanıcı bitişi bekliyor, davette
 * "en az bu kadar var" bilgisi doğru olan.
 */
export function formatInviteRemaining(
  expiresAt: string | null | undefined,
  nowMs: number,
): InviteRemaining {
  if (!expiresAt) {
    return { kind: "never" };
  }

  const expiresMs = Date.parse(expiresAt);

  if (!Number.isFinite(expiresMs) || expiresMs <= nowMs) {
    return { kind: "expired" };
  }

  const seconds = Math.floor((expiresMs - nowMs) / 1_000);

  if (seconds >= 86_400) {
    return { kind: "in", unit: "day", value: Math.floor(seconds / 86_400) };
  }

  if (seconds >= 3_600) {
    return { kind: "in", unit: "hour", value: Math.floor(seconds / 3_600) };
  }

  return { kind: "in", unit: "minute", value: Math.max(1, Math.floor(seconds / 60)) };
}

/**
 * Satırın kanal çipi. Ş3 §3.1: davet satırı kanal **adını** taşımıyor, yalnız `channelId`;
 * ad sunucu detayından çözülür. Kanal silinmişse ya da davet kanalsızsa `null` döner ve çip
 * hiç çizilmez — "#" yazan boş bir çip yanlış bir kanal iddiasıdır.
 */
export function resolveInviteChannelName(
  channelId: string | null,
  channels: readonly ServerInviteChannelOption[],
): string | null {
  if (!channelId) {
    return null;
  }

  return channels.find((channel) => channel.id === channelId)?.name ?? null;
}
