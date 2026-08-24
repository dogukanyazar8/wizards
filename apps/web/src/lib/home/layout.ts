import { RESPONSIVE_BREAKPOINTS } from "@/lib/responsive";

/**
 * Ana Sayfa'nın küçük ekran kırılımları — `08-faz7` §3.
 *
 * Kompozisyon **değişir**, ölçek değil: 1360'ın altında ızgara dört kolondan ikiye, 960'ın
 * altında bire iner ve nav paneli drawer'a taşınır. Ölçek motoru bu aralıkta zaten ×1'dedir
 * (`scale.ts`: `fit = min(w/1360, h/920)` birden küçük).
 *
 * Yerleşim tablosu **açıkça yazılıdır**; `grid-auto-flow` ile kendiliğinden akıtılmaz (§5 tuzağı).
 * Sıra tasarımda tanımlı ve her kırılımda farklı: dar ekranda "Durumun" ile "Sıradaki" ayrı
 * satırlara düşer, otomatik yerleşim ise onları yan yana bırakırdı.
 *
 * Kırılım **CSS'te** seçilir, JavaScript'te değil. Sebebi ölçülmüş bir hatadır: görünüm alanı
 * genişliğini React'ta okumak sunucuda bir varsayım (`useSyncExternalStore`ün SSR anlık görüntüsü
 * 1280'dir), istemcide başka bir sayı demektir — ilk boya yanlış kırılımda çıkar ve hidrasyon
 * uyuşmazlığı doğar. Medya sorgusu ikisini de doğru yapar ve tek bir JavaScript satırı çalışmaz.
 */

export type CommandCenterLayout = "medium" | "narrow" | "wide";

export type CommandCenterCardId =
  "awaiting" | "continue" | "friends" | "live" | "presence" | "upNext";

export type CommandCenterCardPlacement = {
  readonly columnSpan: number;
  readonly columnStart: number;
  readonly rowSpan: number;
  readonly rowStart: number;
};

export type CommandCenterGrid = {
  readonly cards: Readonly<Record<CommandCenterCardId, CommandCenterCardPlacement>>;
  readonly columns: number;
  readonly rows: number;
  /** ≥1360 tek ekranlıktır ve kaydırmaz; altındaki iki kırılımda dikey kaydırma serbesttir. */
  readonly scrollable: boolean;
};

function place(
  columnStart: number,
  columnSpan: number,
  rowStart: number,
  rowSpan = 1,
): CommandCenterCardPlacement {
  return { columnSpan, columnStart, rowSpan, rowStart };
}

/** §3 tablosu, satır satır. Tek doğruluk kaynağı; JSX'te de CSS'te de sihirli sayı yoktur. */
export const COMMAND_CENTER_GRID: Readonly<Record<CommandCenterLayout, CommandCenterGrid>> = {
  /** 4 kolon: Kaldığın yer · Şu an canlı / Yanıt bekliyor · Durumun · Sıradaki / Arkadaşlar. */
  wide: {
    cards: {
      awaiting: place(1, 2, 2),
      continue: place(1, 2, 1),
      friends: place(1, 4, 3),
      live: place(3, 2, 1),
      presence: place(3, 1, 2),
      upNext: place(4, 1, 2),
    },
    columns: 4,
    rows: 3,
    scrollable: false,
  },
  /**
   * 2 kolon: Kaldığın yer · Şu an canlı üstte; Yanıt bekliyor solda iki satır boyunca,
   * sağında Durumun ve Sıradaki alt alta; Arkadaşlar tam genişlik.
   */
  medium: {
    cards: {
      awaiting: place(1, 1, 2, 2),
      continue: place(1, 1, 1),
      friends: place(1, 2, 4),
      live: place(2, 1, 1),
      presence: place(2, 1, 2),
      upNext: place(2, 1, 3),
    },
    columns: 2,
    rows: 4,
    scrollable: true,
  },
  /** Tek kolon, §3'ün sırası: Kaldığın yer → Şu an canlı → Yanıt bekliyor → Durumun → Sıradaki → Arkadaşlar. */
  narrow: {
    cards: {
      awaiting: place(1, 1, 3),
      continue: place(1, 1, 1),
      friends: place(1, 1, 6),
      live: place(1, 1, 2),
      presence: place(1, 1, 4),
      upNext: place(1, 1, 5),
    },
    columns: 1,
    rows: 6,
    scrollable: true,
  },
};

/**
 * Eşikler `RESPONSIVE_BREAKPOINTS`ten okunur; bu modül ikinci bir kopyasını tutmaz.
 *
 * Kabuk (nav panelinin drawer'a taşınması) bu fonksiyonu okur; ızgaranın kendisi CSS'ten
 * kırılır ve bu fonksiyonu hiç çağırmaz.
 */
export function selectCommandCenterLayout(width: number): CommandCenterLayout {
  if (!Number.isFinite(width) || width <= 0) {
    return "wide";
  }

  if (width < RESPONSIVE_BREAKPOINTS.commandCenter) {
    return "narrow";
  }

  if (width < RESPONSIVE_BREAKPOINTS.commandCenterWide) {
    return "medium";
  }

  return "wide";
}

/** CSS `grid-area` kısayolu: `satır / kolon / satır-sonu / kolon-sonu`. */
export function toGridArea(placement: CommandCenterCardPlacement): string {
  return [
    placement.rowStart,
    placement.columnStart,
    placement.rowStart + placement.rowSpan,
    placement.columnStart + placement.columnSpan,
  ].join(" / ");
}

/** Izgara ve kartların `data-` tutamakları; CSS ile JSX aynı adları burada paylaşır. */
export const COMMAND_CENTER_GRID_ATTRIBUTE = "data-home-bento";
export const COMMAND_CENTER_CARD_ATTRIBUTE = "data-home-card";

const CARD_ORDER: readonly CommandCenterCardId[] = [
  "continue",
  "live",
  "awaiting",
  "presence",
  "upNext",
  "friends",
];

function layoutRules(layout: CommandCenterLayout): string {
  const grid = COMMAND_CENTER_GRID[layout];
  const rules = [
    `[${COMMAND_CENTER_GRID_ATTRIBUTE}]{grid-template-columns:repeat(${grid.columns},minmax(0,1fr));grid-template-rows:repeat(${grid.rows},auto);flex:${grid.scrollable ? "0 0 auto" : "1 1 0%"}}`,
    `[${COMMAND_CENTER_GRID_ATTRIBUTE}-scroll]{overflow-y:${grid.scrollable ? "auto" : "hidden"}}`,
  ];

  for (const id of CARD_ORDER) {
    rules.push(
      `[${COMMAND_CENTER_CARD_ATTRIBUTE}="${id}"]{grid-area:${toGridArea(grid.cards[id])}}`,
    );
  }

  return rules.join("");
}

/**
 * §3 tablosunun CSS karşılığı — mobil öncelikli, iki medya sorgusu.
 *
 * Eşikler `RESPONSIVE_BREAKPOINTS`ten gelir; medya sorgusundaki px **görünüm alanı** pikselidir
 * ve kök font boyutuyla ölçeklenmez (ölçeklenseydi 4K'da kompozisyon kırılırdı, §8.1).
 */
export function buildCommandCenterCss(): string {
  return [
    layoutRules("narrow"),
    `@media (min-width:${RESPONSIVE_BREAKPOINTS.commandCenter}px){${layoutRules("medium")}}`,
    `@media (min-width:${RESPONSIVE_BREAKPOINTS.commandCenterWide}px){${layoutRules("wide")}}`,
  ].join("");
}
