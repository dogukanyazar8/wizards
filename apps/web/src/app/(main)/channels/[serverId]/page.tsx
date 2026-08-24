import { permanentRedirect } from "next/navigation";

import { toMessagesRedirect } from "@/lib/messages/routes";

type ServerPageProps = {
  params: Promise<{ serverId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Sunucu kök sayfası.
 *
 * `@me` dalı **yönlendirmeye** indi: Mesajlar artık `/messages` ve Arkadaşlar
 * paneli `/messages/friends`. Sorgu dizesi korunuyor — `?dmTab=pending` gibi
 * paylaşılmış bir bağlantı hedefine ulaşmaya devam ediyor.
 */
export default async function ServerPage({ params, searchParams }: ServerPageProps) {
  const { serverId } = await params;

  if (decodeURIComponent(serverId) === "@me") {
    permanentRedirect(toMessagesRedirect(null, await searchParams));
  }

  return null;
}
