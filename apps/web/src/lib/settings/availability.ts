/**
 * Ayarlar ekranının sabit unavailable sözleşmesi.
 *
 * Kalıcılık veya yerel state tek başına işlev sayılmaz. Bir satır gerçek consumer, platform
 * komutu ya da teslim yolu kazanana kadar burada kalır ve ortak render motoru onu etkileşime
 * kapatır. Dinamik kapılar (ör. kullanıcı adı bekleme süresi) bölümünde hesaplanır.
 */

export const ACCOUNT_UNAVAILABLE_ROWS = {
  ae: true,
  ae2: true,
  ap: true,
  g6: true,
  g7: true,
  g8: true,
  pbio: true,
  pe: true,
  ps: true,
  px: true,
  pz: true,
  s2: true,
} as const satisfies Readonly<Record<string, true>>;

export const AV_UNAVAILABLE_ROWS = {
  e4: true,
  e5: true,
  i4: true,
  k3: true,
  u3: true,
} as const satisfies Readonly<Record<string, true>>;

export const APPEARANCE_UNAVAILABLE_ROWS = {
  m2: true,
  m4: true,
  v1: true,
  v2: true,
  v3: true,
  v4: true,
  v5: true,
  v6: true,
  v7: true,
  v8: true,
  x1: true,
  x2: true,
  x3: true,
  x5: true,
  x6: true,
  x7: true,
} as const satisfies Readonly<Record<string, true>>;

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
  h1: true,
  h4: true,
  n4: true,
  q1: true,
  z7: true,
  z8: true,
} as const satisfies Readonly<Record<string, true>>;

export const ABOUT_UNAVAILABLE_ROWS = {
  o3: true,
  o5: true,
} as const satisfies Readonly<Record<string, true>>;
