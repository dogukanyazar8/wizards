/**
 * Sunucu yüzeylerinin iki yazı ailesi ve başlık takibi.
 *
 * Referansta `var(--w-display)` = Outfit, `var(--w-body)` = Figtree, `var(--w-track)` = `-.02em`.
 * Üründe karşılıkları `app/layout.tsx`'in kurduğu `--font-display` ve `--font-sans`; gövde
 * yazısı `body`'nin varsayılanı olduğu için yalnız **display** açıkça verilir.
 *
 * Sabitler burada, çünkü sunucu ekranı bunları on beş dosyada kullanacak ve on beş yerde
 * `"var(--font-display), sans-serif"` yazmak ilk yazım hatasında sessizce Figtree'ye düşerdi.
 * `lib/servers/metrics.ts` bunları taşıyamaz: sözlük renk ve yazı ailesi taşımaz, yalnız ölçü.
 */

export const DISPLAY_FONT = "var(--font-display), sans-serif";

/** Display başlıklarının takibi — referansın `--w-track` değeri. */
export const DISPLAY_TRACKING = "-0.02em";
