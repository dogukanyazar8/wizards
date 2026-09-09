/**
 * İşlemsel e-posta tasarım tokenları — `design_handoff/eposta-handoff/SPEC.md` §1 ve §2.
 *
 * Uygulamada renkler `hsl(var(--token))` olarak tutulur; e-posta istemcileri CSS değişkeni ve
 * `hsl()` desteğinde tutarsız olduğu için açık tema değerleri hex'e çevrilmiştir. Bu dosya o
 * çevrimin **tek** kaynağıdır: şablonlarda ve bloklarda ham hex yazılmaz.
 */

export const EMAIL_COLORS = {
  /** Buton zemini, işaret rozeti. */
  primary: "#5966F2",
  /** Gövde içi bağlantı metni, yedek URL. */
  link: "#4C59E0",
  /** Üst marka bandı (koyu tema zemininin hex karşılığı). */
  bandBackground: "#11151D",
  /** Başlık, kod, güçlü değer metni. */
  foreground: "#1A202D",
  /** Gövde metni, alt bilgi bağlantıları. */
  textSecondary: "#515C70",
  /** Etiketler, ikincil satırlar. */
  textMuted: "#778092",
  /** Bant üstü etiket, telif satırı, meta etiketleri. */
  textFaint: "#8B93A5",
  /** Kart ve kutu kenarlığı. */
  border: "#CED4DE",
  /** 1 px yatay ayırıcı. */
  divider: "#E3E6EE",
  /** Kod kutusu, yedek bağlantı kutusu, alt bilgi zemini. */
  surfaceSubtle: "#F9FAFB",
  /** E-posta dışı zemin (`<body>`). */
  pageBackground: "#F2F4F7",
  /** Kart gövdesi. Beyaz metin ve marka işareti çubukları da bu değeri kullanır. */
  card: "#FFFFFF",
  /** Süre vurgusu ("10 dakika", "30 dakika"). */
  warning: "#B4761A",
} as const;

export type EmailColor = keyof typeof EMAIL_COLORS;

/**
 * Gmail ve Outlook masaüstü web fontu yüklemez; yedek yığın bilinçli olarak bu sırayla
 * verilmiştir (SPEC "Tipografi"). Daktilo font hiçbir rolde kullanılmaz.
 */
export const EMAIL_FONTS = {
  heading: "'Outfit','Trebuchet MS',Tahoma,Arial,sans-serif",
  body: "'Figtree',Arial,Helvetica,sans-serif",
} as const;

export const EMAIL_FONT_STYLESHEET_URL =
  "https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=Figtree:wght@400;500;600&display=swap";

export type EmailTypeSpec = {
  color: string;
  fontFamily: string;
  fontSize: string;
  fontWeight: number;
  letterSpacing?: string;
  lineHeight: string;
  textTransform?: "uppercase";
};

/**
 * SPEC §2 tipografi tablosu. Rol adları tabloyla birebir eşleşir; bloklar bu rolleri okur ve
 * yalnız referans uygulamanın (`html/*.html`) noktasal farklarını `overrides` ile geçer.
 */
export const EMAIL_TYPE = {
  brandName: {
    color: EMAIL_COLORS.card,
    fontFamily: EMAIL_FONTS.heading,
    fontSize: "17px",
    fontWeight: 600,
    letterSpacing: "-0.2px",
    lineHeight: "22px",
  },
  bandLabel: {
    color: EMAIL_COLORS.textFaint,
    fontFamily: EMAIL_FONTS.body,
    fontSize: "10.5px",
    fontWeight: 600,
    letterSpacing: "1.5px",
    lineHeight: "16px",
    textTransform: "uppercase",
  },
  eyebrow: {
    color: EMAIL_COLORS.textMuted,
    fontFamily: EMAIL_FONTS.body,
    fontSize: "10.5px",
    fontWeight: 600,
    letterSpacing: "1.7px",
    lineHeight: "15px",
    textTransform: "uppercase",
  },
  heading: {
    color: EMAIL_COLORS.foreground,
    fontFamily: EMAIL_FONTS.heading,
    fontSize: "25px",
    fontWeight: 600,
    letterSpacing: "-0.5px",
    lineHeight: "31px",
  },
  body: {
    color: EMAIL_COLORS.textSecondary,
    fontFamily: EMAIL_FONTS.body,
    fontSize: "14.5px",
    fontWeight: 400,
    lineHeight: "23px",
  },
  code: {
    color: EMAIL_COLORS.foreground,
    fontFamily: EMAIL_FONTS.heading,
    fontSize: "34px",
    fontWeight: 600,
    letterSpacing: "11px",
    lineHeight: "40px",
  },
  button: {
    color: EMAIL_COLORS.card,
    fontFamily: EMAIL_FONTS.body,
    fontSize: "14.5px",
    fontWeight: 600,
    lineHeight: "19px",
  },
  boxLabel: {
    color: EMAIL_COLORS.textMuted,
    fontFamily: EMAIL_FONTS.body,
    fontSize: "10.5px",
    fontWeight: 600,
    letterSpacing: "1.5px",
    lineHeight: "15px",
    textTransform: "uppercase",
  },
  smallNote: {
    color: EMAIL_COLORS.textMuted,
    fontFamily: EMAIL_FONTS.body,
    fontSize: "12.5px",
    fontWeight: 400,
    lineHeight: "19px",
  },
  securityNote: {
    color: EMAIL_COLORS.textSecondary,
    fontFamily: EMAIL_FONTS.body,
    fontSize: "13px",
    fontWeight: 400,
    lineHeight: "21px",
  },
  metaLabel: {
    color: EMAIL_COLORS.textFaint,
    fontFamily: EMAIL_FONTS.body,
    fontSize: "10px",
    fontWeight: 600,
    letterSpacing: "1.3px",
    lineHeight: "19px",
    textTransform: "uppercase",
  },
  metaValue: {
    color: EMAIL_COLORS.foreground,
    fontFamily: EMAIL_FONTS.body,
    fontSize: "12.5px",
    fontWeight: 600,
    lineHeight: "19px",
  },
  /**
   * Alt bilgi satırının kendisi. SPEC'in "Alt bilgi bağlantıları" satırı (600, `#515C70`)
   * paragrafın değil, içindeki `<a>` elemanlarının tanımıdır; bağlantı stili kabukta verilir.
   */
  footerText: {
    color: EMAIL_COLORS.textMuted,
    fontFamily: EMAIL_FONTS.body,
    fontSize: "12px",
    fontWeight: 400,
    lineHeight: "19px",
  },
  copyright: {
    color: EMAIL_COLORS.textFaint,
    fontFamily: EMAIL_FONTS.body,
    fontSize: "11.5px",
    fontWeight: 400,
    lineHeight: "18px",
  },
} as const satisfies Record<string, EmailTypeSpec>;

export type EmailTypeRole = keyof typeof EMAIL_TYPE;

/** SPEC §3 — kart 16 px, kutular 14 px, buton 12 px, marka işareti 10 px. */
export const EMAIL_RADIUS = {
  card: 16,
  box: 14,
  button: 12,
  mark: 10,
} as const;

/**
 * Marka işareti (`Whispr Isaret.dc.html` oranları, animasyonsuz): 36×36 gradyan kare, ortasında
 * dikey ortalanmış beş beyaz çubuk. Yükseklikler bilinçli olarak asimetriktir.
 */
export const EMAIL_MARK = {
  size: 36,
  barWidth: 3,
  barGap: 3,
  barRadius: 2,
  barHeights: [12, 18, 24, 17, 13],
  /** En uzun çubuk; iç tablo bu yüksekliği taşır. */
  innerHeight: 24,
} as const;

export const EMAIL_BRAND_GRADIENT = "linear-gradient(145deg,#7C70FF,#5B62FF 46%,#2F6DFF)";
/** Outlook gradyanı görmez, düz renge düşer. */
export const EMAIL_BRAND_GRADIENT_FALLBACK = "#5B62FF";

/** SPEC §3 — 600 px kart, 520 px altında tek kolon. */
export const EMAIL_CARD_WIDTH = 600;
export const EMAIL_BREAKPOINT = 520;

/** SPEC §6 — Gmail 100 KB üstünü kırpar; teslim hedefi 15 KB. */
export const EMAIL_MAX_BYTES = 15 * 1024;
