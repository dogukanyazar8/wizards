/**
 * Ş3 · SPEC §6.3 — davet bağlantısının QR kodu.
 *
 * QR **istemcide** üretilir; sunucuya yeni bir uç eklenmez. Mobil dalın
 * `GET .../invites/[inviteId]/qr` ucu yerinde duruyor ve orada kalıyor: web'de aynı işi
 * yapmak bir tur ağ gecikmesi ve davet kodunu ikinci kez taşıyan bir yanıt demekti.
 *
 * Renk kuralı: hiçbir hex gömülü değil. İki renk de çalışma anında CSS token'ından okunur
 * (`--foreground` modüller, `--surface-card` zemin) ve `qrcode` paketinin istediği hex
 * biçimine burada çevrilir — paket `color.dark`/`color.light` için hex'ten başkasını kabul
 * etmiyor, `hsl(...)` dizesi geçmiyor. Token okunamazsa üretim sessizce düşer; uydurulmuş
 * bir varsayılan renk, temayla çelişen bir QR çizmekten iyidir.
 */

/** Modüllerin (koyu kareler) rengi. */
const DEFAULT_FOREGROUND_TOKEN = "--foreground";
/** Zeminin (açık kareler) rengi. */
const DEFAULT_BACKGROUND_TOKEN = "--surface-card";

/**
 * Tasarım QR kutusunun ölçüsünü vermiyor — referansta yalnız kesikli bir "QR kod" çipi var
 * ve K3 onu kaldırıyor. Bu yüzden ölçü `SERVER_METRICS`'te yok; aşağıdakiler yalnız
 * yedektir, çağıran (Ş9 penceresi / Ş13 ayarlar bölümü) gerçek kutu ölçüsünü geçirir.
 */
const DEFAULT_QR_WIDTH = 256;
const DEFAULT_QR_MARGIN = 1;

export type InviteQrTheme = {
  /** Zemin rengi tokeni; varsayılan `--surface-card`. */
  backgroundToken?: string;
  /** Modül rengi tokeni; varsayılan `--foreground`. */
  foregroundToken?: string;
  /**
   * Token'ların okunacağı öğe; varsayılan `document.documentElement`.
   *
   * `theme` bilerek `"light" | "dark"` birleşimi **değil**: tema zaten token'ın kendi
   * değerinde. Kip adı taşımak, aynı gerçeği iki yerde tutup birinin bayatlamasına
   * izin vermek olurdu. Farklı bir palet altında çizmek isteyen, o paleti taşıyan öğeyi
   * `scope` olarak verir.
   */
  scope?: Element | null;
};

export type InviteQrColors = {
  dark: string;
  light: string;
};

type InviteQrCanvasRenderer = (
  canvas: HTMLCanvasElement,
  text: string,
  options: {
    color: { dark: string; light: string };
    errorCorrectionLevel: "M";
    margin: number;
    width: number;
  },
) => Promise<void>;

export type RenderInviteQrOptions = {
  margin?: number;
  /** Test dikişi; varsayılan `getComputedStyle` okuması. */
  readToken?: (token: string, scope: Element | null) => string;
  theme?: InviteQrTheme;
  /** Test dikişi; varsayılan `qrcode` paketinin `toCanvas`'ı. */
  toCanvas?: InviteQrCanvasRenderer;
  width?: number;
};

export type InviteQrHsl = {
  hue: number;
  lightness: number;
  saturation: number;
};

const HSL_TOKEN_PATTERN =
  /^(-?\d+(?:\.\d+)?)(?:deg)?\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%(?:\s*\/.*)?$/;

/**
 * Token değeri `"199 89% 48%"` biçimindedir (globals.css bileşenleri saklar, `hsl()` sarmaz).
 * `deg` eki ve `/ alpha` kuyruğu kabul edilir; alfa yok sayılır, QR'ın yarı saydam modülü olmaz.
 */
export function parseHslToken(raw: string): InviteQrHsl | null {
  const match = HSL_TOKEN_PATTERN.exec(raw.trim());

  if (!match) {
    return null;
  }

  const hue = Number(match[1]);
  const saturation = Number(match[2]);
  const lightness = Number(match[3]);

  if (!Number.isFinite(hue) || saturation > 100 || lightness > 100) {
    return null;
  }

  return { hue, lightness, saturation };
}

function toHexPair(channel: number): string {
  return Math.round(Math.min(Math.max(channel, 0), 255))
    .toString(16)
    .padStart(2, "0");
}

/** HSL → `#rrggbb`. Kaynak değer token'dan geldiği için burada renk *seçilmiyor*, çevriliyor. */
export function hslToHex({ hue, lightness, saturation }: InviteQrHsl): string {
  const normalizedSaturation = saturation / 100;
  const normalizedLightness = lightness / 100;
  const chroma = (1 - Math.abs(2 * normalizedLightness - 1)) * normalizedSaturation;
  const sector = (((hue % 360) + 360) % 360) / 60;
  const second = chroma * (1 - Math.abs((sector % 2) - 1));
  const offset = normalizedLightness - chroma / 2;

  const [red, green, blue] = (() => {
    if (sector < 1) return [chroma, second, 0];
    if (sector < 2) return [second, chroma, 0];
    if (sector < 3) return [0, chroma, second];
    if (sector < 4) return [0, second, chroma];
    if (sector < 5) return [second, 0, chroma];
    return [chroma, 0, second];
  })();

  return `#${toHexPair((red + offset) * 255)}${toHexPair((green + offset) * 255)}${toHexPair(
    (blue + offset) * 255,
  )}`;
}

function readCssToken(token: string, scope: Element | null): string {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return "";
  }

  return window.getComputedStyle(scope ?? document.documentElement).getPropertyValue(token);
}

/** İki token da okunup ayrıştırılabiliyorsa renk çifti, aksi hâlde `null` (üretim iptal). */
export function resolveInviteQrColors(
  readToken: (token: string, scope: Element | null) => string,
  theme: InviteQrTheme = {},
): InviteQrColors | null {
  const scope = theme.scope ?? null;
  const foreground = parseHslToken(
    readToken(theme.foregroundToken ?? DEFAULT_FOREGROUND_TOKEN, scope),
  );
  const background = parseHslToken(
    readToken(theme.backgroundToken ?? DEFAULT_BACKGROUND_TOKEN, scope),
  );

  if (!foreground || !background) {
    return null;
  }

  return { dark: hslToHex(foreground), light: hslToHex(background) };
}

/**
 * Verilen canvas'a davet bağlantısının QR'ını çizer.
 *
 * `true` = çizildi. `false` = çizilmedi ve **hiçbir şey fırlatılmadı**: canvas yok, token
 * okunamadı ya da üretim hata verdi. Bağlantı satırı ve `Kopyala` düğmesi QR'a bağlı
 * değildir, bu yüzden hata yolu sessizdir (Ş3 §4).
 */
export async function renderInviteQr(
  canvas: HTMLCanvasElement | null | undefined,
  url: string,
  options: RenderInviteQrOptions = {},
): Promise<boolean> {
  if (!canvas || url.trim().length === 0) {
    return false;
  }

  try {
    const colors = resolveInviteQrColors(options.readToken ?? readCssToken, options.theme);

    if (!colors) {
      return false;
    }

    // Dinamik import: `qrcode` yalnız QR gerçekten çizilirken indirilir, davet penceresini
    // hiç açmayan sayfaların paketine girmez.
    const toCanvas =
      options.toCanvas ?? ((await import("qrcode")).toCanvas as unknown as InviteQrCanvasRenderer);

    await toCanvas(canvas, url, {
      color: { dark: colors.dark, light: colors.light },
      errorCorrectionLevel: "M",
      margin: options.margin ?? DEFAULT_QR_MARGIN,
      width: options.width ?? DEFAULT_QR_WIDTH,
    });

    return true;
  } catch {
    return false;
  }
}
