import type { MobilePermissionKey } from "@wizards/types";

import type { MobileLocale } from "./mobile-copy";

type MobileRoleDetailLabels = Readonly<{
  back: string;
  delete: string;
  deleteBody: string;
  error: string;
  loadingTitle: string;
  members: string;
  membersEmpty: string;
  missingTitle: string;
  name: string;
  permissions: string;
  protected: string;
  retry: string;
  roleColor: string;
  save: string;
}>;

type MobileServerMembersLabels = Readonly<{
  back: string;
  close: string;
  empty: string;
  error: string;
  kick: string;
  kickBody: string;
  loadMore: string;
  members: string;
  offline: string;
  present: string;
  retry: string;
  roles: string;
  rolesHint: string;
  rolesUnavailable: string;
  status: Readonly<Record<string, string>>;
}>;

export const mobileRoleDetailCopy: Readonly<Record<MobileLocale, MobileRoleDetailLabels>> = {
  en: {
    back: "Back",
    delete: "Delete role",
    deleteBody: "Delete this role for everyone? It is removed from all members right away.",
    error: "This role action could not be completed. Please try again.",
    loadingTitle: "Loading role…",
    members: "Members in role",
    membersEmpty: "No members have this role yet.",
    missingTitle: "Role unavailable",
    name: "Role name",
    permissions: "Permissions",
    protected: "This role is managed by the system and cannot be edited here.",
    retry: "Try again",
    roleColor: "Colour",
    save: "Save changes",
  },
  tr: {
    back: "Geri",
    delete: "Rolü sil",
    deleteBody: "Bu rol herkes için silinsin mi? Anında tüm üyelerden kaldırılır.",
    error: "Rol işlemi tamamlanamadı. Lütfen yeniden deneyin.",
    loadingTitle: "Rol yükleniyor…",
    members: "Roldeki üyeler",
    membersEmpty: "Bu role sahip üye yok.",
    missingTitle: "Rol bulunamadı",
    name: "Rol adı",
    permissions: "İzinler",
    protected: "Bu rol sistem tarafından yönetiliyor ve buradan düzenlenemez.",
    retry: "Yeniden dene",
    roleColor: "Renk",
    save: "Değişiklikleri kaydet",
  },
};

export const mobileRoleDetailPermissionLabels: Readonly<
  Record<MobileLocale, Readonly<Record<MobilePermissionKey, string>>>
> = {
  en: {
    ADMINISTRATOR: "Administrator (all)",
    MANAGE_SERVER: "Manage server",
    MANAGE_CHANNELS: "Manage channels",
    MANAGE_ROLES: "Manage roles",
    MANAGE_MESSAGES: "Manage messages",
    CLEAR_CHANNEL_HISTORY: "Clear channel history",
    ATTACH_FILES: "Attach files",
    USE_GIFS: "Use GIFs",
    ADD_REACTIONS: "Add reactions",
    VIEW_CHANNEL: "View channels",
    SEND_MESSAGES: "Send messages",
    CONNECT_VOICE: "Connect to voice",
    SPEAK: "Speak",
    STREAM: "Stream",
    USE_VIDEO: "Use video",
    MUTE_MEMBERS: "Mute members",
    DEAFEN_MEMBERS: "Deafen members",
    MOVE_MEMBERS: "Move members",
    MANAGE_INVITES: "Manage invites",
    KICK_MEMBERS: "Kick members",
    BAN_MEMBERS: "Ban members",
    TIMEOUT_MEMBERS: "Timeout members",
    VIEW_AUDIT_LOG: "View audit log",
    MENTION_EVERYONE: "Mention @everyone",
  },
  tr: {
    ADMINISTRATOR: "Yönetici (tüm izinler)",
    MANAGE_SERVER: "Sunucuyu yönet",
    MANAGE_CHANNELS: "Kanalları yönet",
    MANAGE_ROLES: "Rolleri yönet",
    MANAGE_MESSAGES: "Mesajları yönet",
    CLEAR_CHANNEL_HISTORY: "Kanal geçmişini temizle",
    ATTACH_FILES: "Dosya ekle",
    USE_GIFS: "GIF kullan",
    ADD_REACTIONS: "Tepki ekle",
    VIEW_CHANNEL: "Kanalları gör",
    SEND_MESSAGES: "Mesaj gönder",
    CONNECT_VOICE: "Ses kanallarına katıl",
    SPEAK: "Konuş",
    STREAM: "Yayın yap",
    USE_VIDEO: "Video kullan",
    MUTE_MEMBERS: "Üyeleri sustur",
    DEAFEN_MEMBERS: "Üyeleri sağırlaştır",
    MOVE_MEMBERS: "Üyeleri taşı",
    MANAGE_INVITES: "Davetleri yönet",
    KICK_MEMBERS: "Üyeleri at",
    BAN_MEMBERS: "Üyeleri yasakla",
    TIMEOUT_MEMBERS: "Üyeleri zaman aşımına al",
    VIEW_AUDIT_LOG: "Denetim kaydını gör",
    MENTION_EVERYONE: "@everyone bahset",
  },
};

export const mobileServerMembersCopy: Readonly<Record<MobileLocale, MobileServerMembersLabels>> = {
  en: {
    back: "Back",
    close: "Close",
    empty: "There are no members to show.",
    error:
      "Member changes could not be completed. Permissions may have changed; the list was refreshed.",
    kick: "Kick member",
    kickBody: "This removes the member from the server.",
    loadMore: "Could not load more members. Try again.",
    members: "Members",
    offline: "Offline",
    present: "Online",
    retry: "Retry",
    roles: "Roles",
    rolesHint: "Tap a role to assign or remove it instantly.",
    rolesUnavailable: "No assignable roles are available.",
    status: {
      DND: "Do not disturb",
      IDLE: "Idle",
      OFFLINE: "Offline",
      ONLINE: "Online",
    },
  },
  tr: {
    back: "Geri",
    close: "Kapat",
    empty: "Gösterilecek üye yok.",
    error: "Üye değişiklikleri tamamlanamadı. Yetkiler değişmiş olabilir; liste yenilendi.",
    kick: "Üyeyi çıkar",
    kickBody: "Bu işlem üyeyi sunucudan çıkarır.",
    loadMore: "Daha fazla üye yüklenemedi. Tekrar deneyin.",
    members: "Üyeler",
    offline: "Çevrimdışı",
    present: "Çevrimiçi",
    retry: "Tekrar dene",
    roles: "Roller",
    rolesHint: "Rolü anında atamak veya kaldırmak için dokun.",
    rolesUnavailable: "Atanabilir rol bulunmuyor.",
    status: {
      DND: "Rahatsız etmeyin",
      IDLE: "Boşta",
      OFFLINE: "Çevrimdışı",
      ONLINE: "Çevrimiçi",
    },
  },
};
