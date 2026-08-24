/**
 * Sunucu kimliğinden türeyen görsel değerler: baş harf ve tint’i — SPEC §2.1 (ray) ve §2.2 (panel).
 *
 * Tasarımdaki `W/O/P/T/G` renkleri **örnek veridir**; ürün sabit renk ataması yapmaz, tint sunucu
 * kimliğinden türer. Havuzda yalnız mevcut token'lar var (yeni renk yok) ve `--primary` bilerek
 * **dışarıda**: dolu primary zemin aktif sunucunun işaretidir, pasif bir satır onu taşımamalı.
 */
export const SERVER_ACCENT_TOKENS = ["warning", "success", "danger", "tertiary"] as const;

export type ServerAccentToken = (typeof SERVER_ACCENT_TOKENS)[number];

/** Aynı tint iki yüzeyde farklı opaklıkla çizilir (ray daha soluk). */
export type ServerAccentSurface = "panel" | "rail";

export type ServerAccentStyle = {
  background: string;
  color: string;
};

/**
 * SPEC'in verdiği opaklıklar. `tertiary` bir opaklık değil, kendi yüzey token'ı — o yüzden burada
 * yok, `getServerAccentStyle` onu ayrı ele alır.
 */
const ACCENT_ALPHA: Record<
  Exclude<ServerAccentToken, "tertiary">,
  Record<ServerAccentSurface, number>
> = {
  danger: { panel: 0.16, rail: 0.14 },
  success: { panel: 0.18, rail: 0.16 },
  warning: { panel: 0.18, rail: 0.16 },
};

/**
 * FNV-1a — kısa kimliklerde bile dağılımı düzgün, sıraya bağlı değil, bağımlılık gerektirmez.
 *
 * Dışa açık, çünkü ikinci bir tint havuzu daha var: "Kaldığın yer" satırının ikon karesi
 * (`presentation.ts`). Aynı hash iki yerde yeniden yazılmaz.
 */
export function hashIdentityId(identityId: string): number {
  let hash = 0x811c9dc5;

  for (let index = 0; index < identityId.length; index += 1) {
    hash ^= identityId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash;
}

export function selectServerAccent(serverId: string): ServerAccentToken {
  return SERVER_ACCENT_TOKENS[hashIdentityId(serverId) % SERVER_ACCENT_TOKENS.length]!;
}

export function getServerAccentStyle(
  serverId: string,
  surface: ServerAccentSurface,
): ServerAccentStyle {
  const token = selectServerAccent(serverId);

  if (token === "tertiary") {
    return {
      background: "hsl(var(--surface-tertiary))",
      color: "hsl(var(--text-secondary))",
    };
  }

  return {
    background: `hsl(var(--${token}) / ${ACCENT_ALPHA[token][surface]})`,
    color: `hsl(var(--${token}))`,
  };
}

/**
 * Sunucu ikonunun baş harfi — SPEC §2.1 (ray, 600/15) ve §2.2 (panel, 600/12): tek karakter.
 * `shortName` varsa onun ilk karakteri kullanılır; hiçbir şey yoksa `?`.
 */
export function getServerInitial(server: { name: string; shortName?: string | null }): string {
  const source = server.shortName?.trim() || server.name.trim();

  return Array.from(source)[0] ?? "?";
}
