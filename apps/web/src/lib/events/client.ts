"use client";

import {
  CreateEventInputSchema,
  EventsListResponseSchema,
  type CreateEventInput,
  type EventCounts,
  type EventMineFilter,
  type EventRsvp,
  type EventTab,
  type EventTimeFilter,
  type EventsListResponse,
  type SetEventReminderInput,
  type SetEventRsvpInput,
} from "@wizards/types";

import { EventDetailResponseSchema, type EventDetailResponse } from "@/lib/events/detail-contract";
import {
  EventWriteResponseSchema,
  type EventWriteResponsePayload,
} from "@/lib/events/write-contract";

/**
 * Etkinlikler — ekranın istemci yüzeyi. Dalga 2 şeritleri **yalnız** buradan çağırır, kendi
 * `fetch`ini yazmaz: bir uç yolunun ya da yanıt şeklinin bileşenlerin içine dağılması, uç
 * değiştiğinde derleyicinin sessiz kalması demek.
 *
 * Yanıtlar burada zod ile ayrıştırılır — "sunucu bunu döndürüyor" varsayımı tek bir yerde
 * doğrulanır.
 *
 * Dosya üç bölüm: **Ş1** (bu şerit) okuma yüzeyini ve sorgu anahtarlarını sahiplenir; `// Ş2`
 * sınırının altını detay ucu, `// Ş3` sınırının altını yazma yolları doldurur.
 */

export class EventsClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "EventsClientError";
  }
}

type JsonRequestInit = Omit<RequestInit, "body"> & { body?: unknown };

async function requestJson<T>(url: string, init: JsonRequestInit = {}): Promise<T> {
  const { body, headers, ...rest } = init;
  const response = await fetch(url, {
    ...rest,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: { "Content-Type": "application/json", ...(headers ?? {}) },
  });

  const payload = (await response.json().catch(() => null)) as {
    code?: string;
    error?: string;
  } | null;

  if (!response.ok) {
    throw new EventsClientError(payload?.error ?? "Request failed", response.status, payload?.code);
  }

  return payload as T;
}

// ---------------------------------------------------------------------------
// Sorgu anahtarları (Ş1)
// ---------------------------------------------------------------------------

/**
 * Akış anahtarı **isteğin kendisi** kadar ayrıntılı: sekme, zaman, kaynak, katılım, arama ve
 * hafta sunucu tarafında uygulanıyor, bu yüzden hepsi anahtarın parçası. Tek anahtar
 * kullanılsaydı yeni filtre yüklenirken eskisinin kartları görünür kalır ve yeni filtreye
 * aitmiş gibi sayılırdı.
 *
 * `lists` ve `counts` **önek**tir, çağrılabilir değil: Ş4'ün socket yamaları açık olan bütün
 * liste sorgularını `setQueriesData` ile aynı anda yamıyor ve bir öneki tek tek anahtarlardan
 * yeniden kurmak, filtre eksenlerinin sayısı değiştiğinde sessizce eksik eşleşirdi.
 *
 * Sayaçların **ayrı bir ucu yoktur**: aynı yanıtın içindeler (SPEC §8 "sayaçlar tek kaynaktan
 * gelir"). `counts` anahtarı yalnızca `?limit=0` kipinin — kart istemeyen kabuk ipucunun —
 * önbellek yeridir; ikinci bir uç açılsaydı sekme pilleriyle ızgara iki farklı ana bakardı.
 */
export const eventsQueryKeys = {
  counts: ["events", "counts"] as const,
  details: (eventId: string) => ["events", "detail", eventId] as const,
  list: (input: {
    mine?: EventMineFilter | null;
    query?: string | null;
    source?: string | null;
    tab: EventTab;
    time?: EventTimeFilter | null;
    weekStart?: string | null;
  }) =>
    [
      "events",
      "list",
      input.tab,
      input.time ?? "",
      input.source ?? "",
      input.mine ?? "",
      input.query ?? "",
      input.weekStart ?? "",
    ] as const,
  lists: ["events", "list"] as const,
  root: ["events"] as const,
};

/**
 * Tazeleme işini socket olayları yapıyor (Ş4); bu değerler yalnız yeniden odaklanmada koşacak
 * bir yeniden çekmeyi sınırlar.
 */
export const EVENTS_STALE_TIME_MS = {
  detail: 30_000,
  list: 20_000,
} as const;

/**
 * Kabuk ipucunun sorgu seçeneği tek bir `staleTime` alanı istiyor, o yüzden nesne değil sayı.
 * İpucu her rotada çiziliyor; 30 saniye altındaki bir değer, hiçbir şey değişmemiş olsa da
 * gezinmede sayaç isteği üretirdi.
 */
export const EVENTS_COUNTS_STALE_TIME_MS = 30_000;

export type EventsListRequest = {
  readonly cursor?: string | null;
  readonly limit?: number;
  readonly mine?: EventMineFilter | null;
  readonly query?: string | null;
  readonly source?: string | null;
  readonly tab: EventTab;
  readonly time?: EventTimeFilter | null;
  readonly weekStart?: string | null;
};

/**
 * Akışın bir sayfası — ızgara, hafta şeridi ve sayaçlar aynı yanıttan.
 *
 * **Arama sunucuda**: yüklenmiş sayfaları istemcide süzmek, sayfalı bir listede "sonuç yok"
 * demenin en hızlı yolu — ekran yalnız elindeki sayfayı süzer ve geri kalanını hiç sormaz.
 *
 * İmleç **opak**: yönünü kendi içinde taşır (`asc` / `desc`), çağıran onu yalnız geri verir.
 */
export async function fetchEvents(input: EventsListRequest): Promise<EventsListResponse> {
  const params = new URLSearchParams({ tab: input.tab });

  if (input.time) {
    params.set("time", input.time);
  }

  if (input.source) {
    params.set("source", input.source);
  }

  if (input.mine) {
    params.set("mine", input.mine);
  }

  if (input.query) {
    params.set("q", input.query);
  }

  if (input.weekStart) {
    params.set("week", input.weekStart);
  }

  if (input.cursor) {
    params.set("cursor", input.cursor);
  }

  if (input.limit) {
    params.set("limit", String(input.limit));
  }

  return EventsListResponseSchema.parse(
    await requestJson<unknown>(`/api/v1/events?${params.toString()}`),
  );
}

/**
 * Yalnız sayaçlar — kart yok, hafta şeridi yok (`?limit=0`).
 *
 * Gezinme panelindeki saat ipucu (Ş4) her rotada çiziliyor ve `/events` dışında tam listeye
 * ihtiyacı yok. Aynı uç, aynı görünürlük dalları, aynı `counts` bloğu: ikinci bir sayaç ucu
 * açılsaydı ipucu ile sekme pilleri bir gün ayrı sayı gösterirdi (SPEC §8).
 *
 * `signal` zorunlu değil ama geçilmesi beklenir: rota değiştiğinde uçmakta olan bir ipucu
 * isteği artık kimsenin okumadığı bir yanıtı bekler.
 */
export async function fetchEventCounts(signal?: AbortSignal): Promise<EventCounts> {
  // Ş10 — adres `?limit=0`; `tab=all` **yazılmıyor** çünkü ucun varsayılanı zaten `all`
  // (`parseEventTab`) ve sayaç bloğu sekmeden bağımsız (tuzak #3). Fazladan parametre iki
  // şeridin (Ş1 ↔ Ş4) hafif istek sözleşmesini ayırmıştı; tek adres, tek kural.
  const payload = await requestJson<unknown>("/api/v1/events?limit=0", signal ? { signal } : {});

  return EventsListResponseSchema.parse(payload).counts;
}

// ─────────────────────────────── Ş2 ────────────────────────────────────────
// Ş1 yukarısını sahiplenir (anahtarlar + akış sayfası). Aşağısı 326 px detay paneli.

export type EventDetailRequest = {
  /** 8'erlik katılımcı sayfası; `{count} kişi daha` bağlantısının taşıdığı imleç. */
  readonly attendeeCursor?: string | null;
  readonly eventId: string;
};

/**
 * Detay panelinin tek okuması (`GET /api/v1/events/:id`).
 *
 * Yanıt **metin taşımaz**: CTA metnini istemci üç alandan kurar — `rsvp === "going"` →
 * `events.detail.leave`, `canJoinLive` → `events.detail.joinLive`, diğer → `events.card.join`
 * (SPEC §5). `joinHref` sunucudan gelir çünkü kanal erişimi (`VIEW_CHANNEL` + `CONNECT_VOICE`)
 * izleyiciye göre değişir; istemci `/channels/...` yolunu kendisi kurmaz.
 *
 * Görmediği bir etkinlikte uç **404** döner, 403 değil: 403 etkinliğin varlığını sızdırırdı.
 * `EventsClientError.status` bu yüzden panelde "bulunamadı" dalına düşer.
 *
 * Önbellek anahtarı `eventsQueryKeys.details(eventId)`; imleçli sayfa çağıranın anahtarına
 * kendi halkasını ekler, böylece `event:updated` (Ş4) ön ekten hepsini geçersiz kılabilir.
 */
export async function fetchEventDetail(input: EventDetailRequest): Promise<EventDetailResponse> {
  const params = new URLSearchParams();

  if (input.attendeeCursor) {
    params.set("attendeeCursor", input.attendeeCursor);
  }

  const query = params.size > 0 ? `?${params.toString()}` : "";

  return EventDetailResponseSchema.parse(
    await requestJson<unknown>(`/api/v1/events/${encodeURIComponent(input.eventId)}${query}`),
  );
}

// ─────────────────────────────── Ş3 ────────────────────────────────────────
// Yazma yolları: RSVP hedef durumu (`SetEventRsvpSchema`), hatırlatma tercihi
// (`SetEventReminderSchema`), etkinlik oluşturma (`CreateEventInputSchema`) ve `.ics`
// indirmesi (K7). Üçü de `requestJson` üzerinden geçer ve yanıtı zod ile ayrıştırır;
// `EventsClientError` ortak hata tipidir.

/**
 * RSVP gövdesi **hedef durum** taşır, toggle değil.
 *
 * İki sekmede açık aynı ekran aynı butona bastığında "tersine çevir" semantiği sonucu
 * isteklerin sırasına bağlar: iki tık birbirini iptal eder ve kullanıcı gördüğünün tersini
 * alır. Hedef durumda iki yarışan tık aynı yere yakınsar; metot da bu yüzden `PUT`.
 */
export async function setEventRsvp(
  eventId: string,
  rsvp: EventRsvp | null,
): Promise<EventWriteResponsePayload> {
  return EventWriteResponseSchema.parse(
    await requestJson<unknown>(`/api/v1/events/${encodeURIComponent(eventId)}/rsvp`, {
      body: { rsvp } satisfies SetEventRsvpInput,
      method: "PUT",
    }),
  );
}

/**
 * Hatırlatma tercihi (K5).
 *
 * Yanıttaki `scheduled` **okunmalı**: `false` ise iş kuyruğa yazılmadı (etkinlik seçilen
 * dakikadan daha yakın, tuzak #8) ve panel "Hatırlatma açık" yerine etkinliğin çok yakın
 * olduğunu söylemeli. Tercih yine kaydedilmiştir; kaybolan bir şey yok.
 */
export async function setEventReminder(
  eventId: string,
  input: SetEventReminderInput,
): Promise<EventWriteResponsePayload> {
  return EventWriteResponseSchema.parse(
    await requestJson<unknown>(`/api/v1/events/${encodeURIComponent(eventId)}/reminder`, {
      body: input,
      method: "PUT",
    }),
  );
}

/**
 * Etkinlik oluşturma (K4 — `MANAGE_EVENTS`).
 *
 * Gövde istemcide de `CreateEventInputSchema`den geçiyor: `channelId` ile
 * `externalLocation`ın birlikte gönderilmesi gibi bir hata, ağ isteğine dönüşmeden modalın
 * içinde yakalanır. Yetkisi olmayan için 403 gelir — `Oluştur` girişleri zaten gizli olmalı,
 * bu ikinci kapı.
 */
export async function createEvent(input: CreateEventInput): Promise<EventWriteResponsePayload> {
  return EventWriteResponseSchema.parse(
    await requestJson<unknown>("/api/v1/events", {
      body: CreateEventInputSchema.parse(input),
      method: "POST",
    }),
  );
}

/**
 * `Takvime ekle` — tek etkinlik `.ics` indirmesinin adresi (K7).
 *
 * `fetch` **yok**: dosyayı tarayıcının indirme yoluna bırakmak, `Content-Disposition`daki
 * dosya adının korunmasının tek yolu. Blob üzerinden indirmek adı kaybeder ve belleğe
 * gereksiz bir kopya alır. Çağıran bu adresi bir `<a download>` ya da `location.assign` ile
 * kullanır.
 */
export function eventCalendarIcsHref(eventId: string): string {
  return `/api/v1/events/${encodeURIComponent(eventId)}/calendar.ics`;
}
