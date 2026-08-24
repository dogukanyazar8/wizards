/**
 * Kabuğun **3. sütununu** rotadan seçer.
 *
 * Ana Sayfa paketinde bu fonksiyon 2. sütunu seçiyordu (karar #8: "2. sütun rota
 * başına değişir"). Mesajlar paketi karar #2 onu tersine çevirdi: gezinme paneli
 * artık **her rotada** durur ve rotaya göre değişen şey onun sağındaki sütundur.
 * SPEC-MESAJLAR §1 üç sol kolonu 74 + 228 + 276 diye sayıyor; ilk ikisi sabit.
 *
 * Tek seçici: `WizardsShell` bu fonksiyonun sonucuna göre dallanır, kopyalanmış
 * üç kabuk yoktur.
 *
 *   `null`       → 3. sütun yok; ana alan gezinme panelinin sağından başlar.
 *                  `/home`, `/events`, `/inbox` ve kabuk içindeki
 *                  tanınmayan her yol.
 *   `discover`   → Keşfet dizin rayı (276) — `/discover`; durum sorgu dizesinde.
 *   `messages`   → Mesajlar sohbet rayı (276) — `/messages` ve altındaki her yol.
 *   `mentions`   → Bahsedilmeler rayı (276) — `/mentions` ve altındaki her yol.
 *   `channels`   → `ChannelSidebar` — `/channels/[serverId]/*`, `/servers/[serverId]/*`.
 *
 * Bahsedilmeler Ş1: `/mentions` `null` dalından çıktı. Ekranın kendi rayı var ve
 * SPEC-BAHSEDILMELER §1 sol üç kolonu Mesajlar ile aynı sayıyla — 74 + 228 + 276 —
 * veriyor; iki ekranın rayı aynı genişlikte olduğu için kabuk tek bir kural yazar.
 */
export type ThirdColumn = "channels" | "discover" | "mentions" | "messages" | null;

/** `/channels/[serverId]` yerine Mesajlar ekranını açan sunucu kimliği. */
const DIRECT_MESSAGE_SEGMENT = "@me";

/** Sondaki `/` yolun anlamını değiştirmez; karşılaştırmadan önce düşer. */
function stripTrailingSlash(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

/**
 * `usePathname` segmenti yüzde kodlu (`%40me`) verebilir. Bozuk kodlama gerçek bir yol olamaz, o
 * yüzden çözülemeyen segment olduğu gibi geri döner.
 */
function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function selectThirdColumn(pathname: string): ThirdColumn {
  const pathOnly = pathname.split(/[?#]/u, 1)[0] ?? pathname;
  const [, firstSegment = "", secondSegment = ""] = stripTrailingSlash(pathOnly).split("/");

  // Keşfet kendi dizin kolonunu taşır (SPEC-KESFET §1: 74 + 228 + 276). Ana Sayfa
  // paketinde `/discover` `null` dalındaydı çünkü o gün ekranın kolonu yoktu.
  if (firstSegment === "discover") {
    return "discover";
  }

  // Mesajlar kendi rotasında: `/messages`, `/messages/friends` ve
  // `/messages/[conversationId]` üçü de aynı rayı taşır.
  if (firstSegment === "messages") {
    return "messages";
  }

  // Bahsedilmeler kendi rotasında: filtre, kaynak ve arama URL sorgusunda durur, o
  // yüzden `/mentions` ile `/mentions?filter=unread` aynı raya düşer.
  if (firstSegment === "mentions") {
    return "mentions";
  }

  if (firstSegment === "channels") {
    // Eski `/channels/@me` yolu sunucu tarafında yönleniyor; yönlendirme
    // tamamlanana kadar ray yerinde kalsın diye burası hâlâ `messages` diyor.
    // Ray kaybolup geri gelseydi, yönlendirme bir sıçrama gibi görünürdü.
    return !secondSegment || decodeSegment(secondSegment) === DIRECT_MESSAGE_SEGMENT
      ? "messages"
      : "channels";
  }

  // `(main)/servers/[serverId]/about` sunucu bağlamında açılır; kanal listesi görünür kalır.
  if (firstSegment === "servers" && secondSegment) {
    return "channels";
  }

  return null;
}
