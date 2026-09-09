import type { WorkspaceServerDetail } from "@wizards/types";

import type { ServerSettingsSectionCount } from "@/lib/servers/server-settings-model";
import type { ServerViewerPermissions } from "@/lib/servers/viewer-permissions";
import type { ServerSettingsDraft } from "./use-server-settings-draft";

/**
 * Dokuz bölümün **tek** prop sözleşmesi.
 *
 * Bölümler `React.lazy` ile yükleniyor ve kabuk hepsini aynı çağrıyla çiziyor; her bölüm
 * kendi prop kümesini tanımlasaydı kabuk dokuz ayrı dal taşırdı ve `lazy` sınırının iki
 * yanındaki tipler ilk sapmada sessizce ayrışırdı.
 *
 * Ş12/Ş13 kendi bölümlerini doldururken bu sözleşmeyi **genişletebilir** ama daraltamaz:
 * kullanılmayan bir prop bir sonraki şeridin ihtiyacı olabilir, eksik bir prop derlemeyi
 * kırar.
 */
export type ServerSettingsSectionProps = {
  /** Menü çipleriyle **aynı** sayılar (K12); `null` = henüz yüklenmedi, `0` yazılmaz. */
  readonly counts: Record<ServerSettingsSectionCount, number | null>;
  /**
   * Ş13 genişletmesi. §8.6'nın moderasyon menüsü "kendine uygulanamaz" kuralını, §8.9'un
   * devir listesi ise "sahip dışındaki üyeler" kuralını izleyiciyi bilmeden veremez; sunucu
   * özeti yalnız `isOwner`/`isAdmin` taşıyor, kimliği taşımıyor.
   */
  readonly currentUserId: string;
  readonly detail: WorkspaceServerDetail;
  readonly draft: ServerSettingsDraft;
  /** Bekleyen gecikmeli yazmayı hemen gönderir (`blur`). */
  readonly flush: () => void;
  /** §8.9 — silme onayı penceresi kabuğun dışında, `wizards-shell` içinde yaşıyor. */
  readonly onOpenDeleteServer: (serverId: string, serverName: string) => void;
  /** Anahtar · çip · swatch: anında yazar. */
  readonly patch: (fields: Partial<ServerSettingsDraft>) => void;
  /** Metin alanları: gecikmeli yazar. */
  readonly patchDeferred: (fields: Partial<ServerSettingsDraft>) => void;
  /**
   * Ş13 genişletmesi. §8.6/§8.7/§8.8 üç ayrı bite göre yüzey **gizliyor** (`BAN_MEMBERS`,
   * `MANAGE_INVITES`, `MANAGE_EVENTS`) ve 00 §5 pasifleştirmeyi kabul etmiyor. Küme
   * `lib/servers/viewer-permissions.ts`'te bir kez türetilir; her bölüm kendi türetmesini
   * yapsaydı dokuz bölüm dokuz farklı "yönetici" tanımına düşerdi.
   */
  readonly permissions: ServerViewerPermissions;
  readonly uploadthingEnabled: boolean;
};
