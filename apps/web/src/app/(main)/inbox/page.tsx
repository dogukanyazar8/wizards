import { InboxScreen } from "@/components/screens/inbox-screen";

/**
 * `/inbox` — Gelen kutusu (`07-faz6` §4).
 *
 * `(main)` grubunun layout'u oturumu ve ban kontrolünü **zaten** yapıyor
 * (00-ortak-baglam §6.8); burada ikinci bir `requireAuth` yok.
 */
export const dynamic = "force-dynamic";

export default function InboxRoute() {
  return <InboxScreen />;
}
