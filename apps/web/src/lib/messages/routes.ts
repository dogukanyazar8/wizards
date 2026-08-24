/**
 * Mesajlar ekranının rotaları — tek doğruluk kaynağı.
 *
 * Mesajlar bugüne kadar `/channels/@me` altında yaşıyordu: bir **sunucu**
 * rotasının içine yerleştirilmiş, `@me` diye rezerve edilmiş bir kimlikle.
 * Bunun üç bedeli vardı:
 *
 * 1. `@me` App Router'da **paralel rota slotu** demek. Gerçek sayfa
 *    `[serverId]/page.tsx` içinde `decodeURIComponent(serverId) === "@me"`
 *    dalıyla çözülüyordu; yani rota ağacı bir şey diyor, kod başka bir şey
 *    yapıyordu.
 * 2. `usePathname` segmenti `%40me` diye yüzde kodlu verebiliyor ve her okuyanın
 *    bunu ayrıca çözmesi gerekiyordu.
 * 3. Mesajlar, `/home` · `/mentions` · `/events` · `/discover` ile aynı seviyede
 *    bir ekran; rota ağacında öyle görünmüyordu.
 *
 * Artık `/messages`. Eski yollar **kırılmıyor**: `/channels/@me*` sunucu
 * tarafında kalıcı olarak yeni yola yönleniyor ve sorgu dizesi korunuyor —
 * paylaşılmış bir bağlantı, bir bildirim ya da bir e-postadaki `?message=`
 * bağlantısı hedefine ulaşmaya devam ediyor.
 */

export const MESSAGES_ROUTE = "/messages";

/**
 * Arkadaşlar paneli. **Statik** segment: App Router statik segmenti dinamik
 * olandan önce eşleştirir, o yüzden `friends` adında bir konuşma kimliği bile
 * bu sayfayı gölgeleyemez.
 */
export const MESSAGES_FRIENDS_ROUTE = "/messages/friends";

/** Modal niyetini kapatır; sekme/profil gibi bağımsız derin bağlantıları korur. */
export function clearMessagesActionHref(search: string): string {
  const params = new URLSearchParams(search);
  params.delete("dmAction");
  const nextSearch = params.toString();

  return nextSearch ? `${MESSAGES_FRIENDS_ROUTE}?${nextSearch}` : MESSAGES_FRIENDS_ROUTE;
}

/** Konuşma kimliği olamayacak, ayrılmış segmentler. */
const RESERVED_SEGMENTS = new Set(["friends"]);

export function messagesConversationHref(
  conversationId: string,
  query?: Readonly<Record<string, string>>,
): string {
  const base = `${MESSAGES_ROUTE}/${encodeURIComponent(conversationId)}`;

  if (!query) {
    return base;
  }

  const params = new URLSearchParams(query);
  const search = params.toString();

  return search.length > 0 ? `${base}?${search}` : base;
}

function stripTrailingSlash(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

/**
 * Yoldaki aktif konuşma kimliği; yoksa `null`.
 *
 * `useParams` yerine yol üzerinden okunuyor çünkü rayı çizen bileşen
 * `/messages/[conversationId]` ağacının **içinde değil** — kabuğun üçüncü
 * sütununda duruyor ve oradan `params` boş gelir.
 */
export function selectActiveConversationId(pathname: string): string | null {
  const [, first = "", second = ""] = stripTrailingSlash(pathname).split("/");

  if (first !== "messages" || second.length === 0) {
    return null;
  }

  let decoded = second;

  try {
    decoded = decodeURIComponent(second);
  } catch {
    // Bozuk kodlama gerçek bir kimlik olamaz; ham segment olduğu gibi kalır.
  }

  return RESERVED_SEGMENTS.has(decoded) ? null : decoded;
}

/** Yol Mesajlar ekranına mı ait (ray ve gezinme vurgusu için). */
export function isMessagesRoute(pathname: string): boolean {
  const [, first = ""] = stripTrailingSlash(pathname).split("/");

  return first === "messages";
}

/**
 * Eski `/channels/@me...` yolunun yeni karşılığı.
 *
 * `searchParams` **korunuyor**: `?message=`, `?dmCall=`, `?profile=` ve
 * `?dmTab=` bağlantıları bugün dolaşımda ve yönlendirmede düşerlerse
 * kullanıcı hedefe değil, hedefin listesine iner.
 */
export function toMessagesRedirect(
  conversationId: string | null,
  searchParams: Readonly<Record<string, string | string[] | undefined>> = {},
): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") {
      params.set(key, value);
      continue;
    }

    for (const entry of value ?? []) {
      params.append(key, entry);
    }
  }

  // `?dmTab=` yalnız Arkadaşlar panelinde anlamlı; kimlik yoksa oraya iner.
  const base = conversationId
    ? `${MESSAGES_ROUTE}/${encodeURIComponent(conversationId)}`
    : params.has("dmTab")
      ? MESSAGES_FRIENDS_ROUTE
      : MESSAGES_ROUTE;
  const search = params.toString();

  return search.length > 0 ? `${base}?${search}` : base;
}
