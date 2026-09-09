/**
 * Sunucu ekranının katman yığını — K11'in tek kaynağı.
 *
 * Ekranda üç tür örtüşen yüzey var ve üçü de aynı anda açılabilecek gibi duruyor: kenar
 * çubuğunun açılırları (sunucu menüsü, `⌘K` arama popover'ı), sunucu ayarları kaplaması ve
 * pencereler. Her yüzey kendi `z-index`'ini uydurursa sıralama dosya sırasına kalır ve `Esc`
 * hangi yüzeyi kapatacağını bilemez. Bu dosya sırayı **veriden** okunur hâle getirir; şeritler
 * kendi sabitini yazmaz.
 *
 * Kurallar (00 §4):
 *
 * 1. Katman sırası `popover (60) < settings (70) < menu (75) < modal (80)`.
 * 2. Aynı anda tek açılır/panel/pencere açık kalır; yeni açılan öncekini kapatır.
 * 3. **Tek istisna:** ayarlar açıkken açılan bir pencere ya da menü ayarları kapatmaz, üstüne
 *    çizilir; kapanınca ayarlara dönülür. Kategori/kanal/etkinlik penceresi ve üye satırının
 *    rol/moderasyon menüsü ayarların **içinden** açılıyor — ayarı kapatmak kullanıcıyı
 *    bulunduğu yerden atmak olurdu. `Esc` o durumda üstteki menüyü kapatır, ayarları değil.
 * 4. `Esc` **en üstteki** katmanı kapatır, hepsini değil.
 *
 * Dosya saf tutuldu: React yok, tarayıcı yok. Yığın sırası ve `Esc` davranışı bu yüzden
 * doğrudan birim testlenebiliyor (`layer-stack.test.ts`); kancanın kendisi
 * `use-layer-stack.ts`'te.
 */

/** SPEC §10 · 00 §4. Sayı üç yerde tekrar edilmez, buradan okunur. */
export const SERVER_LAYER_Z_INDEX = {
  popover: 60,
  settings: 70,
  /**
   * Ayarların **içinden** açılan satır menüleri (üye rol menüsü, moderasyon menüsü). Kendi
   * yığın kaydı var çünkü `Esc` önce onları kapatmalı; `popover` olsalardı ayarları da
   * kapatırlardı (kural 2). Kaplamanın kendi istifleme bağlamında çizildikleri için 75
   * bugün yalnız **sırayı** anlatıyor; ayarların dışına portal edilen bir menü onu okur.
   */
  menu: 75,
  modal: 80,
} as const;

export type ServerLayerKind = keyof typeof SERVER_LAYER_Z_INDEX;

export type ServerLayer = {
  /** Yüzeyin kimliği; aynı `id` iki kez açılırsa yığında bir kez durur. */
  id: string;
  kind: ServerLayerKind;
};

export type ServerLayerStack = readonly ServerLayer[];

export const EMPTY_LAYER_STACK: ServerLayerStack = [];

export function layerZIndex(kind: ServerLayerKind): number {
  return SERVER_LAYER_Z_INDEX[kind];
}

/**
 * Yeni katmanı açar.
 *
 * Pencere ya da menü açılırken **yalnız** ayarlar altta bırakılır (kural 3); geri kalan her
 * durumda yığın temizlenir (kural 2). İki menü aynı anda açık kalamaz: ikincisi açılırken
 * birincisi `retained` süzgecinden geçemez. Aynı `id` yeniden açılırsa yığında ikinci kez görünmez — bir yüzeyin
 * iki kez "açık" olması diye bir şey yok, ama `Esc` sayacı buna takılabilirdi.
 */
export function openLayer(stack: ServerLayerStack, layer: ServerLayer): ServerLayerStack {
  const retained =
    layer.kind === "modal" || layer.kind === "menu"
      ? stack.filter((entry) => entry.kind === "settings" && entry.id !== layer.id)
      : EMPTY_LAYER_STACK;

  return [...retained, layer];
}

/** Katmanı kapatır. Altındaki katman (varsa) yığında kalır ve tekrar en üste çıkar. */
export function closeLayer(stack: ServerLayerStack, id: string): ServerLayerStack {
  return stack.filter((entry) => entry.id !== id);
}

/** `Esc`'in kapatacağı katman. Yığın boşsa `null`. */
export function topLayer(stack: ServerLayerStack): ServerLayer | null {
  return stack.length === 0 ? null : (stack[stack.length - 1] ?? null);
}

/**
 * `Esc` davranışı: en üstteki katmanı kapatır, kapattığını söyler.
 *
 * `closed` `null` dönerse tuş bu yığına ait değildir ve çağıran olayı yutmamalıdır — ekranda
 * başka bir dinleyici (ör. bestekârın kendi `Esc`'i) varsa onun sırası gelmiş demektir.
 */
export function closeTopLayer(stack: ServerLayerStack): {
  closed: ServerLayer | null;
  stack: ServerLayerStack;
} {
  const top = topLayer(stack);

  return top === null ? { closed: null, stack } : { closed: top, stack: stack.slice(0, -1) };
}

/** Yüzeyin kendisi "ben açık mıyım" sorusunu buradan sorar. */
export function isLayerOpen(stack: ServerLayerStack, id: string): boolean {
  return stack.some((entry) => entry.id === id);
}

/**
 * Yüzeyin `Esc` ve odak tuzağını üstlenip üstlenmeyeceği. Ayarlar açık, üstünde pencere varken
 * ayarlar hâlâ **çizilir** ama `Esc` pencerenindir.
 */
export function isTopLayer(stack: ServerLayerStack, id: string): boolean {
  return topLayer(stack)?.id === id;
}
