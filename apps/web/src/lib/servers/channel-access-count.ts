import type { WorkspaceChannel, WorkspaceChannelPermissionPreset } from "@wizards/types";

/**
 * SPEC-SUNUCU §3.1'in alt satırındaki `N üye erişebilir` sayısı.
 *
 * **TODO(api):** kanala erişebilen üye sayısını veren bir uç **yok**. `GET /servers/[id]`
 * kanal başına `permissionPreset` bile doldurmuyor (Ş12 T1) ve rol → üye eşlemesi yalnız
 * sayfalanmış üye listesinden çıkarılabiliyor. Bu yüzden sayı **türetiliyor** ve türetilemediği
 * yerde `null` dönüyor: yanlış bir sayı yazmaktansa satırı hiç yazmamak doğru.
 *
 * Kural, `workspace-modals.tsx`in kanal düzenleme kipiyle **aynı** varsayımı kullanır —
 * ön ayar gelmediğinde `locked` bayrağı okunur:
 *
 * | Ön ayar | Sayı | Gerekçe |
 * | --- | --- | --- |
 * | `PUBLIC` | sunucunun üye sayısı | herkes görür ve kullanır |
 * | `LOCKED_VISIBLE` | sunucunun üye sayısı | herkes **görür**; kullanmak izin ister |
 * | `PRIVATE` · `ROLE_GATED` | `null` | rol → üye eşlemesi istemcide eksik |
 *
 * Sayı geldiğinde tek değişecek şey bu modüldür; başlık alanı zaten `number | null` okuyor.
 */
export function resolveChannelAccessPreset(
  channel: Pick<WorkspaceChannel, "locked"> & {
    permissionPreset?: WorkspaceChannelPermissionPreset | undefined;
  },
): WorkspaceChannelPermissionPreset {
  return channel.permissionPreset ?? (channel.locked ? "LOCKED_VISIBLE" : "PUBLIC");
}

export function resolveChannelAccessCount(input: {
  readonly memberCount: number;
  readonly preset: WorkspaceChannelPermissionPreset;
}): number | null {
  if (input.preset === "PRIVATE" || input.preset === "ROLE_GATED") {
    return null;
  }

  return Number.isFinite(input.memberCount) && input.memberCount >= 0 ? input.memberCount : null;
}

/**
 * Kanalın kategorisinin adı — başlıktaki `PAYCORE` çipi (§3.1). Kategorisiz kanalda `null`;
 * çip o zaman çizilmez (referansta kategorisiz kanal yok, uydurma bir etiket yazılmaz).
 */
export function resolveChannelCategoryName(
  detail: {
    readonly categories: readonly {
      readonly channels: readonly { readonly id: string }[];
      readonly name: string;
    }[];
  } | null,
  channelId: string,
): string | null {
  if (!detail) {
    return null;
  }

  for (const category of detail.categories) {
    if (category.channels.some((channel) => channel.id === channelId)) {
      return category.name;
    }
  }

  return null;
}

/** Kanalı sunucu detayının iki listesinde birden arar (kategorili + kategorisiz). */
export function findWorkspaceChannel<T extends { readonly id: string }>(
  detail: {
    readonly categories: readonly { readonly channels: readonly T[] }[];
    readonly ungroupedChannels: readonly T[];
  } | null,
  channelId: string,
): T | null {
  if (!detail) {
    return null;
  }

  const ungrouped = detail.ungroupedChannels.find((channel) => channel.id === channelId);

  if (ungrouped) {
    return ungrouped;
  }

  for (const category of detail.categories) {
    const found = category.channels.find((channel) => channel.id === channelId);

    if (found) {
      return found;
    }
  }

  return null;
}
