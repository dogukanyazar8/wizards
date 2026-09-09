/**
 * Sağ panelin veri modeli — SPEC-SUNUCU §4.1 (üye listesi) ve §4.2 (ses kanalı katılımcıları).
 *
 * Bileşen yalnız çizer; hangi satırın hangi gruba düştüğü, alt satırda ne yazdığı ve hangi
 * durum ikonunun görüneceği burada karara bağlanır. Ayrım iki nedenden zorunlu:
 *
 * 1. Panel dört kancaya bağlı (`useAppStore`, `useVoiceStates`, `useI18n`, `useToast`).
 *    Gruplama kuralı bileşenin içinde kalsaydı "çevrimdışı üye çevrimiçi grubuna düşmez"
 *    gibi bir kuralı doğrulamak için sağlayıcı ağacı kurmak gerekirdi.
 * 2. Aynı kural iki yüzeyde geçerli: masaüstü kolonu ve `<1280px`'in çekmecesi.
 *
 * **SPEC'in iki grubu bugünkü beş grubun yerine geçer.** Bugün panel role göre gruplandırıyor
 * (`owner/admin/role/member/offline`); SPEC §4.1 yalnız `ÇEVRİMİÇİ` ve `ÇEVRİMDIŞI` istiyor ve
 * rol bilgisini satırın içindeki rozete indiriyor. Rozetin rengi hâlâ `Role.color`'dan gelir
 * (`role-color.ts` köprüsü) — yani rol bilgisi kaybolmaz, yer değiştirir.
 */

import type { WorkspaceMember, WorkspaceRole } from "@wizards/types";

import { getRoleToneColor, roleColorToTone, type ServerRoleTone } from "@/lib/servers/role-color";
import type { VoiceStateParticipantDTO } from "@/lib/voice/types";

export type MemberPanelPresence = WorkspaceMember["status"];

export type MemberPanelGroupKey = "online" | "offline" | "inChannel" | "notInChannel";

/** Ses kanalı satırındaki davet düğmesinin iki hâli — SPEC §4.2, geçiş **tek yönlü**. */
export type VoiceInviteState = "idle" | "sent";

export type MemberPanelRoleBadge = {
  readonly label: string;
  readonly tone: ServerRoleTone | "owner";
};

export type MemberPanelRow = {
  readonly avatarUrl: string | null;
  readonly deafened: boolean;
  readonly displayName: string;
  readonly presence: MemberPanelPresence;
  readonly roleBadge: MemberPanelRoleBadge | null;
  readonly screenSharing: boolean;
  /** SPEC §4.1'in `500 11px` muted alt satırı. */
  readonly subtitle: string;
  readonly userId: string;
  readonly username: string;
  /** `voiceChannelName` doluysa üye o kanalda konuşuyor demektir. */
  readonly voiceChannelName: string | null;
};

export type MemberPanelGroup = {
  readonly key: MemberPanelGroupKey;
  readonly rows: readonly MemberPanelRow[];
};

/**
 * Presence noktasının ve grup başlığı noktasının rengi. Dört durumun dördü de bir token;
 * bileşen `hsl(...)` dizisini kendi kurmaz.
 */
const PRESENCE_TOKENS: Record<MemberPanelPresence, string> = {
  DND: "--danger",
  IDLE: "--warning",
  OFFLINE: "--text-muted",
  ONLINE: "--success",
};

export function getPresenceColor(presence: MemberPanelPresence): string {
  return `hsl(var(${PRESENCE_TOKENS[presence]}))`;
}

/**
 * Rol rozetinin iki rengi. `owner` tonu SPEC'in `Sunucu` rozetidir (referansta `primary/.14`);
 * adlandırılmış roller kendi `Role.color` tamsayısından `role-color.ts` üstünden gelir.
 */
export function getRoleBadgeColors(badge: MemberPanelRoleBadge): {
  background: string;
  foreground: string;
} {
  if (badge.tone === "owner") {
    return {
      background: "hsl(var(--primary) / 0.14)",
      foreground: "hsl(var(--primary))",
    };
  }

  return {
    background: getRoleToneColor(badge.tone, 0.14),
    foreground: getRoleToneColor(badge.tone),
  };
}

/** `@everyone` rozet olarak çizilmez; rozet "bu üyenin ayırt edici rolü" demektir. */
function pickHighestRole(
  member: WorkspaceMember,
  roleById: ReadonlyMap<string, WorkspaceRole>,
): WorkspaceRole | null {
  let best: WorkspaceRole | null = null;

  for (const badge of member.roles) {
    const role = roleById.get(badge.id);
    if (!role || role.isDefault) {
      continue;
    }

    if (!best || role.position > best.position) {
      best = role;
    }
  }

  return best;
}

export type MemberPanelLabels = {
  readonly admin: string;
  readonly owner: string;
  /** `Genel Sohbet · sesi kapalı` gibi birleşimlerin ayıracı. */
  readonly separator: string;
  readonly screenSharing: string;
  readonly deafened: string;
};

function buildRoleBadge(
  member: WorkspaceMember,
  roleById: ReadonlyMap<string, WorkspaceRole>,
  labels: MemberPanelLabels,
): MemberPanelRoleBadge | null {
  if (member.accessLevel === "OWNER") {
    return { label: labels.owner, tone: "owner" };
  }

  const role = pickHighestRole(member, roleById);
  if (role) {
    return { label: role.name, tone: roleColorToTone(role.color) };
  }

  // Rol atanmamış yönetici de bir rozet taşır; SPEC'in `Yönetici` rozeti danger tonundadır.
  return member.accessLevel === "ADMIN" ? { label: labels.admin, tone: "danger" } : null;
}

/**
 * Alt satır. Sıra tesadüfi değil: **ses durumu her şeyin önünde** çünkü panelin işi kimin
 * nerede olduğunu göstermek; ses yoksa kullanıcının kendi yazdığı durum; o da yoksa kullanıcı
 * adı. Boş bir alt satır satırı 3px kısaltıp listeyi tırtıklı yapardı.
 */
function buildSubtitle(
  member: WorkspaceMember,
  voice: { channelName: string; deafened: boolean; screenSharing: boolean } | null,
  labels: MemberPanelLabels,
): string {
  if (voice) {
    const suffix = voice.screenSharing
      ? labels.screenSharing
      : voice.deafened
        ? labels.deafened
        : null;

    return suffix ? `${voice.channelName}${labels.separator}${suffix}` : voice.channelName;
  }

  const custom = member.customStatus?.trim();

  return custom && custom.length > 0 ? custom : `@${member.username}`;
}

export type VoicePresenceIndex = ReadonlyMap<
  string,
  { channelName: string; deafened: boolean; screenSharing: boolean }
>;

/**
 * `useVoiceStates` kanal başına katılımcı veriyor; panel üye başına arıyor. Ters çevirme
 * burada, çünkü hem üye listesi hem ses paneli aynı haritayı okuyor ve iki ayrı ters çevirme
 * iki farklı "kim nerede" cevabı üretebilirdi.
 */
export function buildVoicePresenceIndex(
  states: readonly { channelId: string; participants: readonly VoiceStateParticipantDTO[] }[],
  channelNameById: ReadonlyMap<string, string>,
): VoicePresenceIndex {
  const index = new Map<
    string,
    { channelName: string; deafened: boolean; screenSharing: boolean }
  >();

  for (const state of states) {
    const channelName = channelNameById.get(state.channelId);
    if (!channelName) {
      continue;
    }

    for (const participant of state.participants) {
      index.set(participant.userId, {
        channelName,
        deafened: participant.isDeafened,
        screenSharing: participant.isScreenSharing ?? false,
      });
    }
  }

  return index;
}

/**
 * Üye arama kutusunun istemci tarafı süzmesi. Ş2'nin `q` parametresi sunucu tarafındaki
 * **gerçek** kaynaktır; bu süzme yalnız yüklü sayfayı daraltır ve yazarken listeyi bekletmez.
 */
export function matchesMemberQuery(
  member: Pick<WorkspaceMember, "displayName" | "username">,
  query: string,
  locale: string,
): boolean {
  const needle = query.trim().toLocaleLowerCase(locale);
  if (needle.length === 0) {
    return true;
  }

  return (
    member.displayName.toLocaleLowerCase(locale).includes(needle) ||
    member.username.toLocaleLowerCase(locale).includes(needle)
  );
}

const PRESENCE_ORDER: Record<MemberPanelPresence, number> = {
  DND: 2,
  IDLE: 1,
  OFFLINE: 3,
  ONLINE: 0,
};

function compareRows(locale: string) {
  return (left: MemberPanelRow, right: MemberPanelRow) => {
    const presenceDelta = PRESENCE_ORDER[left.presence] - PRESENCE_ORDER[right.presence];
    if (presenceDelta !== 0) {
      return presenceDelta;
    }

    return left.displayName.localeCompare(right.displayName, locale, { sensitivity: "base" });
  };
}

export type BuildMemberRowsInput = {
  readonly labels: MemberPanelLabels;
  readonly locale: string;
  readonly members: readonly WorkspaceMember[];
  readonly query: string;
  readonly roles: readonly WorkspaceRole[];
  readonly voiceIndex: VoicePresenceIndex;
};

function toRows(input: BuildMemberRowsInput): MemberPanelRow[] {
  const roleById = new Map(input.roles.map((role) => [role.id, role]));

  return input.members
    .filter((member) => matchesMemberQuery(member, input.query, input.locale))
    .map((member) => {
      const voice = input.voiceIndex.get(member.userId) ?? null;

      return {
        avatarUrl: member.avatarUrl,
        deafened: voice?.deafened ?? false,
        displayName: member.displayName,
        presence: member.status,
        roleBadge: buildRoleBadge(member, roleById, input.labels),
        screenSharing: voice?.screenSharing ?? false,
        subtitle: buildSubtitle(member, voice, input.labels),
        userId: member.userId,
        username: member.username,
        voiceChannelName: voice?.channelName ?? null,
      } satisfies MemberPanelRow;
    });
}

/** SPEC §4.1 — iki grup, sırası sabit: önce çevrimiçi, sonra çevrimdışı. */
export function buildPresenceGroups(input: BuildMemberRowsInput): readonly MemberPanelGroup[] {
  const rows = toRows(input);
  const compare = compareRows(input.locale);

  return [
    {
      key: "online",
      rows: rows.filter((row) => row.presence !== "OFFLINE").sort(compare),
    },
    {
      key: "offline",
      rows: rows.filter((row) => row.presence === "OFFLINE").sort(compare),
    },
  ];
}

export type BuildVoiceGroupsInput = BuildMemberRowsInput & {
  /** Panelin gösterdiği ses kanalındaki katılımcı kimlikleri. */
  readonly participantIds: ReadonlySet<string>;
};

/**
 * SPEC §4.2 — `BU KANALDA` / `KANALDA DEĞİL`.
 *
 * "Kanalda değil" grubu çevrimdışı üyeleri de içerir (referansta `Kerem Ünal · Çevrimdışı`
 * satırı var) ama **davet düğmesi yalnız çevrimiçi olana** anlamlıdır: davet soket üstünden
 * gider ve çevrimdışı hedef onu hiç görmez. Düğmenin çizilip çizilmeyeceğine bileşen değil
 * `canInviteToVoice` karar verir.
 */
export function buildVoiceGroups(input: BuildVoiceGroupsInput): readonly MemberPanelGroup[] {
  const rows = toRows(input);
  const compare = compareRows(input.locale);

  return [
    {
      key: "inChannel",
      rows: rows.filter((row) => input.participantIds.has(row.userId)).sort(compare),
    },
    {
      key: "notInChannel",
      rows: rows.filter((row) => !input.participantIds.has(row.userId)).sort(compare),
    },
  ];
}

export function canInviteToVoice(row: MemberPanelRow): boolean {
  return row.presence !== "OFFLINE";
}

/**
 * `Davet et` → `Gönderildi` geçişi. SPEC "geri alınmaz" diyor, bu yüzden fonksiyon yalnız
 * ekler; ikinci tıklama aynı kümeyi döndürür ve referans eşitliği React'ın gereksiz
 * render'ını da keser.
 */
export function markVoiceInviteSent(
  sent: ReadonlySet<string>,
  userId: string,
): ReadonlySet<string> {
  if (sent.has(userId)) {
    return sent;
  }

  return new Set([...sent, userId]);
}

export function getVoiceInviteState(sent: ReadonlySet<string>, userId: string): VoiceInviteState {
  return sent.has(userId) ? "sent" : "idle";
}
