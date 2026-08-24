import { permanentRedirect } from "next/navigation";

import { toMessagesRedirect } from "@/lib/messages/routes";

/**
 * Eski `/channels` yolu. Mesajlar artık `/messages`.
 *
 * `permanentRedirect` (308): yol kalıcı olarak taşındı ve tarayıcı da arama
 * motoru da bunu önbelleğe alabilir. Geçici bir yönlendirme, eski yolu her
 * ziyarette bir tur daha maliyet olarak bırakırdı.
 */
type ChannelsRedirectProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ChannelsRedirect({ searchParams }: ChannelsRedirectProps) {
  permanentRedirect(toMessagesRedirect(null, await searchParams));
}
