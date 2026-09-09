/**
 * Üye moderasyonunun saf katmanı — SPEC-SUNUCU §8.6 + **K3**.
 *
 * Ş2 uçları yazdı ve raporunda iki açık uç bıraktı: zaman aşımı süre **listesi** sözleşmede
 * yok (uç serbest bir ISO tarih alıyor) ve `deleteMessageSeconds` için bir seçenek kümesi
 * verilmedi. K3 listeyi UI şeridine bıraktığı için ikisi de burada yaşıyor — bileşenin içinde
 * değil, çünkü "60 sn mi 1 dk mı", "sahibe uygulanabilir mi" ve "kalan süre ne yazar"
 * sorularının hepsi test edilebilir kararlar ve hiçbiri render'a bağlı değil.
 *
 * Sunucu tarafındaki kapı (`assertCanActOnMember`, `member-timeout.ts`) **değiştirilmedi**;
 * buradaki kurallar onun aynası. Aynanın kırıldığı tek yer olsa bile uç yine reddeder.
 */

import type { WorkspaceAccessLevel, WorkspaceMemberFilter } from "@wizards/types";

/**
 * SPEC §8.6'nın yedi çipi, **soldan sağa referanstaki sırayla**
 * (`Sunucu.dc.html:2641`): `Tümü · Üye · Moderatör · Admin · Sunucu Sahibi · Çevrimiçi ·
 * Çevrimdışı`. Sözleşme enum'u (`WorkspaceMemberFilterSchema`) aynı yedi değeri taşır ama
 * bir **küme**dir; sıra bir sunum kararı ve yeri burası.
 */
export const SERVER_MEMBER_FILTERS: readonly WorkspaceMemberFilter[] = [
  "all",
  "member",
  "moderator",
  "admin",
  "owner",
  "online",
  "offline",
];

export type ServerTimeoutDurationId = "60s" | "5m" | "10m" | "1h" | "1d" | "1w";

export type ServerTimeoutDuration = {
  readonly id: ServerTimeoutDurationId;
  readonly seconds: number;
};

/** K3'ün altı süresi (`14-dalga5-s13…` §1): 60 sn · 5 dk · 10 dk · 1 sa · 1 gün · 1 hafta. */
export const SERVER_TIMEOUT_DURATIONS: readonly ServerTimeoutDuration[] = [
  { id: "60s", seconds: 60 },
  { id: "5m", seconds: 300 },
  { id: "10m", seconds: 600 },
  { id: "1h", seconds: 3_600 },
  { id: "1d", seconds: 86_400 },
  { id: "1w", seconds: 604_800 },
];

export type ServerBanDeleteWindowId = "none" | "1h" | "6h" | "12h" | "24h" | "3d" | "7d";

export type ServerBanDeleteWindow = {
  readonly id: ServerBanDeleteWindowId;
  readonly seconds: number;
};

/**
 * Ban penceresindeki "mesaj silme penceresi". Üst sınır `ServerBanSchema`'nın izin verdiği
 * yedi gün (604 800 sn); `none` = hiçbir mesaj silinmez ve **alan gövdeye hiç konmaz**
 * (`0` göndermek de aynı sonucu verirdi, ama "seçim yapılmadı" ile "sıfır saniye seçildi"
 * ayrımını audit metadata'sında kaybetmek istemedik).
 */
export const SERVER_BAN_DELETE_WINDOWS: readonly ServerBanDeleteWindow[] = [
  { id: "none", seconds: 0 },
  { id: "1h", seconds: 3_600 },
  { id: "6h", seconds: 21_600 },
  { id: "12h", seconds: 43_200 },
  { id: "24h", seconds: 86_400 },
  { id: "3d", seconds: 259_200 },
  { id: "7d", seconds: 604_800 },
];

/** `ServerBanSchema.reason` / `ServerMemberTimeoutSchema.reason` ile aynı sınır. */
export const SERVER_MODERATION_REASON_MAX_LENGTH = 200;

export function selectTimeoutDuration(id: ServerTimeoutDurationId): ServerTimeoutDuration {
  return (
    SERVER_TIMEOUT_DURATIONS.find((option) => option.id === id) ?? SERVER_TIMEOUT_DURATIONS[0]!
  );
}

export function selectBanDeleteWindow(id: ServerBanDeleteWindowId): ServerBanDeleteWindow {
  return (
    SERVER_BAN_DELETE_WINDOWS.find((option) => option.id === id) ?? SERVER_BAN_DELETE_WINDOWS[0]!
  );
}

/** Seçilen süreden ucun beklediği ISO damgası. Uç geçmiş tarihi 400 ile reddediyor (Ş2 §4). */
export function resolveTimeoutUntil(nowMs: number, seconds: number): string {
  return new Date(nowMs + seconds * 1_000).toISOString();
}

/**
 * Zaman aşımı bir **zaman damgası**, bayrak değil (Ş2 §3.3): süresi geçmiş bir kolon zaman
 * aşımı değildir. Sınır katı — `until === now` **zaman aşımı değil**, sunucu tarafındaki
 * `isMemberTimedOut` ile aynı karşılaştırma.
 */
export function isMemberTimedOut(until: string | null | undefined, nowMs: number): boolean {
  if (!until) {
    return false;
  }

  const untilMs = Date.parse(until);

  return Number.isFinite(untilMs) && untilMs > nowMs;
}

export type TimeoutRemainingUnit = "day" | "hour" | "minute" | "second";

export type TimeoutRemaining = {
  readonly unit: TimeoutRemainingUnit;
  readonly value: number;
};

/**
 * Satırdaki `Zaman aşımında · <kalan>` çipinin sayısı. Çeviri **burada yapılmaz** — birim ve
 * sayı ayrı döner, metni `server.settings.members.timeout.remaining.*` çoğul kurallarıyla
 * kurar (00 §7).
 *
 * Yuvarlama yukarı: 61 saniye kalan bir zaman aşımı `1 dakika` yazmalı, `1 dakika` yazıp
 * 59 saniye sonra hâlâ sürüyor olmamalı — kullanıcı çipin bittiği anı bekliyor.
 */
export function formatTimeoutRemaining(
  until: string | null | undefined,
  nowMs: number,
): TimeoutRemaining | null {
  if (!isMemberTimedOut(until, nowMs)) {
    return null;
  }

  const seconds = Math.ceil((Date.parse(until as string) - nowMs) / 1_000);

  if (seconds >= 86_400) {
    return { unit: "day", value: Math.ceil(seconds / 86_400) };
  }

  if (seconds >= 3_600) {
    return { unit: "hour", value: Math.ceil(seconds / 3_600) };
  }

  if (seconds >= 60) {
    return { unit: "minute", value: Math.ceil(seconds / 60) };
  }

  return { unit: "second", value: seconds };
}

export type MemberModerationTarget = {
  readonly accessLevel: WorkspaceAccessLevel;
  readonly communicationDisabledUntil: string | null;
  readonly userId: string;
};

export type MemberModerationViewer = {
  readonly canBan: boolean;
  readonly canKick: boolean;
  readonly canTimeout: boolean;
  readonly userId: string;
};

export type MemberModerationActionId = "timeout" | "removeTimeout" | "ban" | "kick";

/**
 * Bir üye satırının menüsünde hangi eylemler duracak.
 *
 * Üç kapı, üçü de uçtaki kapının aynası:
 *
 * - **Sahip hedef alınamaz.** `assertCanActOnMember` sahibi 403 ile, ban ve zaman aşımı uçları
 *   400 `INVALID_TARGET` ile reddediyor. Menüde çizmek, tıklandığında kesin hata veren bir
 *   satır çizmek olurdu.
 * - **Kendine uygulanamaz.** Ban ve zaman aşımı uçları aktörü hedef olarak 400 ile reddediyor.
 * - **Bit yoksa satır yok** (00 §5). `Zaman aşımını kaldır` da `TIMEOUT_MEMBERS` ister; kaldırma
 *   ayrı bir uç değil, `until: null` ile aynı uç.
 *
 * `removeTimeout` yalnız hedef **gerçekten** zaman aşımındayken görünür; süresi geçmiş bir
 * kolon zaman aşımı değildir ve "kaldır" hiçbir şey yapmazdı.
 */
export function listMemberModerationActions(
  viewer: MemberModerationViewer,
  target: MemberModerationTarget,
  nowMs: number,
): readonly MemberModerationActionId[] {
  if (target.accessLevel === "OWNER" || target.userId === viewer.userId) {
    return [];
  }

  const actions: MemberModerationActionId[] = [];
  const timedOut = isMemberTimedOut(target.communicationDisabledUntil, nowMs);

  if (viewer.canTimeout) {
    if (timedOut) {
      actions.push("removeTimeout");
    } else {
      actions.push("timeout");
    }
  }

  if (viewer.canKick) {
    actions.push("kick");
  }

  if (viewer.canBan) {
    actions.push("ban");
  }

  return actions;
}

export type MemberTypeBadge = "owner" | "admin" | "member";

/** Satırdaki tür rozeti — `Sahip` primary · `Admin` danger · `Üye` nötr (SPEC §8.6). */
export function selectMemberTypeBadge(accessLevel: WorkspaceAccessLevel): MemberTypeBadge {
  if (accessLevel === "OWNER") {
    return "owner";
  }

  return accessLevel === "ADMIN" ? "admin" : "member";
}

/**
 * Satırdaki rol açılır düğmesinin yazdığı ad. Üye birden çok rol taşıyabilir; düğme **en
 * yüksek konumlu** rolü yazar, çünkü kullanıcının "rolü" dediği şey odur ve rozet sırası
 * zaten `position`'a bağlı. Rolü yoksa `null` döner ve düğme `@everyone` metnine düşmez —
 * herkesin taşıdığı bir rolü satırda yazmak bilgi taşımaz.
 */
export function selectPrimaryRoleName(
  memberRoleIds: readonly string[],
  roles: readonly {
    readonly id: string;
    readonly isDefault: boolean;
    readonly name: string;
    readonly position: number;
  }[],
): string | null {
  const owned = roles.filter((role) => !role.isDefault && memberRoleIds.includes(role.id));

  if (owned.length === 0) {
    return null;
  }

  return owned.reduce((best, role) => (role.position > best.position ? role : best)).name;
}
