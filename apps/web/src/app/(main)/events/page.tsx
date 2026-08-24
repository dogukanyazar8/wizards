import { Suspense } from "react";

import { EventsPage } from "@/components/events/events-page";

/**
 * `/events` — Etkinlikler (4B · Takvim şeridi).
 *
 * `(main)` grubunun layout'u oturumu ve ban kontrolünü **zaten** yapıyor; burada ikinci bir
 * `requireAuth` yok. Ekranın bütün durumu adres çubuğunda (`lib/events/routes.ts`, Ş0.4) ve
 * onu okuyan `useSearchParams` bir `Suspense` sınırı istiyor — sınır olmadan bütün rota
 * istemci tarafında render edilmeye zorlanır.
 *
 * Sol taraf (sunucu rayı 74, gezinme paneli 228) `WizardsShell` içinde hazır ve bu ekran ona
 * dokunmuyor; değdiği tek nokta gezinme panelindeki saat ipucu ve o Ş4'ün işi.
 */
export const dynamic = "force-dynamic";

export default function EventsRoute() {
  return (
    <Suspense fallback={null}>
      <EventsPage />
    </Suspense>
  );
}
