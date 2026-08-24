"use client";

import {
  MentionCountsSchema,
  MentionListResponseSchema,
  MentionSchema,
  type Mention,
  type MentionContext,
  type MentionCounts,
  type MentionFilter,
  type MentionListResponse,
  type MentionWindow,
} from "@wizards/types";
import { MentionContextSchema } from "@wizards/types";
import { z } from "zod";

import { MENTIONS_DEFAULT_WINDOW } from "@/lib/mentions/routes";

/**
 * Bahsedilmeler — ekranın istemci yüzeyi. Dalga 2 şeritleri **yalnız** buradan çağırır,
 * kendi `fetch`ini yazmaz: bir uç yolunun ya da yanıt şeklinin bileşenlerin içine dağılması,
 * uç değiştiğinde derleyicinin sessiz kalması demek.
 *
 * Yanıtlar burada zod ile ayrıştırılır — "sunucu bunu döndürüyor" varsayımı tek bir yerde
 * doğrulanır.
 */

export class MentionsClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "MentionsClientError";
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
    throw new MentionsClientError(
      payload?.error ?? "Request failed",
      response.status,
      payload?.code,
    );
  }

  return payload as T;
}

// ---------------------------------------------------------------------------
// Sorgu anahtarları ve sayaç (Ş1)
// ---------------------------------------------------------------------------

/**
 * Akış anahtarı **isteğin kendisi** kadar ayrıntılı: filtre, kaynak, arama ve pencere sunucu
 * tarafında uygulanıyor, bu yüzden hepsi anahtarın parçası. Tek anahtar kullanılsaydı yeni
 * filtre yüklenirken eskisinin kartları görünür kalır ve yeni filtreye aitmiş gibi sayılırdı.
 */
export const mentionsQueryKeys = {
  context: (mentionId: string) => ["mentions", "context", mentionId] as const,
  counts: (window: MentionWindow) => ["mentions", "counts", window] as const,
  list: (input: {
    filter: MentionFilter;
    query: string | null;
    source: string | null;
    window: MentionWindow;
  }) =>
    [
      "mentions",
      "list",
      input.filter,
      input.source ?? "",
      input.query ?? "",
      input.window,
    ] as const,
  root: ["mentions"] as const,
};

/**
 * Tazeleme işini socket olayları yapıyor (`mention:new` · `mention:state` · `mention:read-all`);
 * bu değerler yalnız yeniden odaklanmada koşacak bir yeniden çekmeyi sınırlar.
 */
export const MENTIONS_STALE_TIME_MS = {
  context: 60_000,
  counts: 30_000,
  list: 20_000,
} as const;

export async function fetchMentionCounts(
  window: MentionWindow = MENTIONS_DEFAULT_WINDOW,
): Promise<MentionCounts> {
  const params = new URLSearchParams({ window });
  return MentionCountsSchema.parse(
    await requestJson<unknown>(`/api/v1/mentions/counts?${params.toString()}`),
  );
}

// ─────────────────────────────── Ş3 ────────────────────────────────────────
// Ş1 yukarısını sahiplenir (anahtarlar + sayaç sorgusu). Aşağısı okuma API'sinin geri
// kalanı: akış sayfası, bağlam paneli, durum yazımı ve `Tümünü okundu işaretle`.

export type MentionsListRequest = {
  readonly cursor?: string | null;
  readonly filter: MentionFilter;
  readonly limit?: number;
  readonly query?: string | null;
  readonly source?: string | null;
  readonly window?: MentionWindow;
};

/**
 * Akışın bir sayfası. **Arama sunucuda**: yüklenmiş sayfaları istemcide süzmek, sayfalı bir
 * listede "sonuç yok" demenin en hızlı yolu — ekran yalnız elindeki sayfayı süzer ve geri
 * kalanı hiç sormaz.
 */
export async function fetchMentions(input: MentionsListRequest): Promise<MentionListResponse> {
  const params = new URLSearchParams({ filter: input.filter });

  if (input.source) {
    params.set("source", input.source);
  }

  if (input.query) {
    params.set("q", input.query);
  }

  if (input.window && input.window !== MENTIONS_DEFAULT_WINDOW) {
    params.set("window", input.window);
  }

  if (input.cursor) {
    params.set("cursor", input.cursor);
  }

  if (input.limit) {
    params.set("limit", String(input.limit));
  }

  return MentionListResponseSchema.parse(
    await requestJson<unknown>(`/api/v1/mentions?${params.toString()}`),
  );
}

/** SPEC §6 — bahsetmenin öncesi ve sonrasıyla ±2 mesaj. */
export async function fetchMentionContext(mentionId: string): Promise<MentionContext> {
  return MentionContextSchema.parse(
    await requestJson<unknown>(`/api/v1/mentions/${encodeURIComponent(mentionId)}/context`),
  );
}

export type MentionStateRequest = {
  readonly dismissed?: boolean;
  readonly read?: boolean;
  readonly readLater?: boolean;
};

/**
 * Okundu / sonra oku / listeden kaldır. Üç alan bağımsız: `readLater` yazmak kartı okumaz
 * (karar K5) ve `dismissed` yazmak mesajı silmez.
 */
export async function updateMentionState(
  mentionId: string,
  patch: MentionStateRequest,
): Promise<Mention> {
  return MentionSchema.parse(
    await requestJson<unknown>(`/api/v1/mentions/${encodeURIComponent(mentionId)}/state`, {
      body: patch,
      method: "PATCH",
    }),
  );
}

const ReadAllResponseSchema = z.object({
  affected: z.number().int().min(0),
  undoToken: z.string(),
});

const UndoReadAllResponseSchema = z.object({ restored: z.number().int().min(0) });

/**
 * Karar K11: **yalnız bahsetmeler** okunur. Bugünkü `markAllNotificationsRead` arkadaşlık
 * isteklerini ve sistem bildirimlerini de okuyor ve bu ekranda çağrılmaz.
 *
 * Dönen `undoToken` 10 dakika geçerli; `Geri al` toast'ı onu taşır.
 */
export async function markAllMentionsRead(): Promise<z.infer<typeof ReadAllResponseSchema>> {
  return ReadAllResponseSchema.parse(
    await requestJson<unknown>("/api/v1/mentions/read-all", { body: {}, method: "POST" }),
  );
}

export async function undoMarkAllMentionsRead(
  undoToken: string,
): Promise<z.infer<typeof UndoReadAllResponseSchema>> {
  return UndoReadAllResponseSchema.parse(
    await requestJson<unknown>("/api/v1/mentions/read-all?undo=1", {
      body: { undoToken },
      method: "POST",
    }),
  );
}
