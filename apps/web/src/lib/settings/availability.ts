/**
 * Ayarlar ekranının sabit unavailable sözleşmesi.
 *
 * Kalıcılık veya yerel state tek başına işlev sayılmaz. Bir satır gerçek consumer, platform
 * komutu ya da teslim yolu kazanana kadar burada kalır ve ortak render motoru onu etkileşime
 * kapatır. Dinamik kapılar (ör. kullanıcı adı bekleme süresi) bölümünde hesaplanır.
 */

export const ACCOUNT_UNAVAILABLE_ROWS = {
  s2: true,
} as const satisfies Readonly<Record<string, true>>;

export const AV_UNAVAILABLE_ROWS = {
  k3: true,
} as const satisfies Readonly<Record<string, true>>;

export const APPEARANCE_UNAVAILABLE_ROWS = {} as const satisfies Readonly<Record<string, true>>;

export const NOTIFICATION_UNAVAILABLE_ROWS = {
  na3: true,
  nd4: true,
  ne1: true,
  np1: true,
  np2: true,
  np3: true,
  np4: true,
  np5: true,
  ns1: true,
  ns2: true,
  ns3: true,
  ns4: true,
  ns5: true,
} as const satisfies Readonly<Record<string, true>>;

export const DESKTOP_UNAVAILABLE_ROWS = {
  z7: true,
  z8: true,
} as const satisfies Readonly<Record<string, true>>;

export const UPDATES_UNAVAILABLE_ROWS = {
  h4: true,
} as const satisfies Readonly<Record<string, true>>;
