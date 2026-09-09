"use client";

import {
  FriendsSortSchema,
  MessageSearchPageSchema,
  PollDTOSchema,
  PollVoterDTOSchema,
  type FriendSuggestionDTO,
  type FriendsSort,
  type MessageSearchFilter,
  type MessageSearchPage,
  type PinnedMessageDTO,
  type PollCreateRequest,
  type PollDTO,
  type PollVoterDTO,
} from "@wizards/types";
import { z } from "zod";
import type { ChatMessage, DMMessagePayload } from "@wizards/types";

/**
 * Mesajlar paketinin istemci yüzeyi — Dalga 2 şeritleri **yalnız** buradan
 * çağırır, kendi `fetch`ini yazmaz.
 *
 * Tek sebep: bir uç yolunun ya da yanıt şeklinin bileşenlerin içine dağılması,
 * uç değiştiğinde derleyicinin sessiz kalması demek. Yanıtlar burada zod ile
 * ayrıştırılır, böylece "sunucu bunu döndürüyor" varsayımı tek bir yerde
 * doğrulanır.
 */

export class MessagesClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "MessagesClientError";
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
    throw new MessagesClientError(
      payload?.error ?? "Request failed",
      response.status,
      payload?.code,
    );
  }

  return payload as T;
}

// ---------------------------------------------------------------------------
// Sabitlenen mesajlar (karar #7)
// ---------------------------------------------------------------------------

const PinnedMessageSchema = z.object({
  authorName: z.string(),
  excerpt: z.string(),
  messageId: z.string(),
  pinnedAt: z.string(),
  removable: z.boolean(),
});

const PinsResponseSchema = z.object({ pins: z.array(PinnedMessageSchema) });

export async function fetchConversationPins(conversationId: string): Promise<PinnedMessageDTO[]> {
  const payload = await requestJson<unknown>(
    `/api/v1/dm/${encodeURIComponent(conversationId)}/pins`,
  );

  return PinsResponseSchema.parse(payload).pins;
}

export async function pinDmMessage(
  conversationId: string,
  messageId: string,
): Promise<PinnedMessageDTO[]> {
  const payload = await requestJson<unknown>(
    `/api/v1/dm/${encodeURIComponent(conversationId)}/pins`,
    { body: { messageId }, method: "POST" },
  );

  return PinsResponseSchema.parse(payload).pins;
}

export async function unpinDmMessage(
  conversationId: string,
  messageId: string,
): Promise<PinnedMessageDTO[]> {
  const payload = await requestJson<unknown>(
    `/api/v1/dm/${encodeURIComponent(conversationId)}/pins/${encodeURIComponent(messageId)}`,
    { method: "DELETE" },
  );

  return PinsResponseSchema.parse(payload).pins;
}

// ---------------------------------------------------------------------------
// Anket (karar #1)
// ---------------------------------------------------------------------------

const PollResponseSchema = z.object({ poll: PollDTOSchema });
const PollVotersResponseSchema = z.object({ voters: z.array(PollVoterDTOSchema) });

export async function createPoll(
  input: PollCreateRequest & { content?: string } & (
      { channelId: string; conversationId?: never } | { channelId?: never; conversationId: string }
    ),
): Promise<ChatMessage | DMMessagePayload> {
  const payload = await requestJson<{ message: ChatMessage | DMMessagePayload }>("/api/v1/polls", {
    body: input,
    method: "POST",
  });

  return payload.message;
}

export async function fetchPoll(pollId: string): Promise<PollDTO> {
  const payload = await requestJson<unknown>(`/api/v1/polls/${encodeURIComponent(pollId)}`);

  return PollResponseSchema.parse(payload).poll;
}

/**
 * Tam küme gönderir; boş küme oyu geri çeker (`clearPollVote` ile aynı sonuç).
 *
 * `signal` isteğe bağlı ama gerçek: hızlı ardışık tıklamada önceki istek
 * kesilir. Kesilmeseydi sunucuya art arda giden istekler dönüş sırasını garanti
 * etmez ve geç dönen eski bir yanıt yeni oyu geri alabilirdi.
 */
export async function castPollVote(
  pollId: string,
  optionIds: string[],
  signal?: AbortSignal,
): Promise<PollDTO> {
  const payload = await requestJson<unknown>(`/api/v1/polls/${encodeURIComponent(pollId)}/vote`, {
    body: { optionIds },
    method: "PUT",
    ...(signal ? { signal } : {}),
  });

  return PollResponseSchema.parse(payload).poll;
}

export async function clearPollVote(pollId: string, signal?: AbortSignal): Promise<PollDTO> {
  const payload = await requestJson<unknown>(`/api/v1/polls/${encodeURIComponent(pollId)}/vote`, {
    method: "DELETE",
    ...(signal ? { signal } : {}),
  });

  return PollResponseSchema.parse(payload).poll;
}

/**
 * Anonim ankette **403** döner ve hiçbir kimlik taşımaz (karar #11). Kart o
 * durumda bağlantıyı zaten çizmez; buraya düşen bir 403 bir hata durumudur,
 * sessizce yutulmaz.
 */
export async function fetchPollVoters(pollId: string): Promise<PollVoterDTO[]> {
  const payload = await requestJson<unknown>(`/api/v1/polls/${encodeURIComponent(pollId)}/voters`);

  return PollVotersResponseSchema.parse(payload).voters;
}

/**
 * Mesajı başka bir sohbete iletir (SPEC §5.3).
 *
 * Ek taşımıyor: bir eki ikinci bir mesaja bağlamak depolama sahipliğini
 * çoğaltmak demek. Metni olmayan mesajda uç `FORWARD_REQUIRES_TEXT` veriyor ve
 * çağıran nedeni söyleyebiliyor.
 */
export async function forwardDmMessage(
  messageId: string,
  targetConversationId: string,
): Promise<DMMessagePayload> {
  const payload = await requestJson<{ message: DMMessagePayload }>("/api/v1/dm/messages/forward", {
    body: { messageId, targetConversationId },
    method: "POST",
  });

  return payload.message;
}

// ---------------------------------------------------------------------------
// Global mesaj arama (karar #6)
// ---------------------------------------------------------------------------

export type GlobalSearchInput = {
  cursor?: string | null;
  /** Sayfa başına sonuç; uç 50'de tavanlıyor. */
  limit?: number | null;
  query: string;
} & Partial<MessageSearchFilter>;

/**
 * `signal` isteğe bağlı: panel yazarken art arda sorgu atar ve önceki isteği
 * kesmezse sunucuya her harf için bir sorgu bırakılır.
 */
export async function searchDmMessagesGlobal(
  input: GlobalSearchInput,
  signal?: AbortSignal,
): Promise<MessageSearchPage> {
  const params = new URLSearchParams({ q: input.query });

  if (input.personId) {
    params.set("personId", input.personId);
  }

  if (input.from) {
    params.set("from", input.from);
  }

  if (input.to) {
    params.set("to", input.to);
  }

  if (input.cursor) {
    params.set("cursor", input.cursor);
  }

  if (input.limit) {
    params.set("limit", String(input.limit));
  }

  const payload = await requestJson<unknown>(`/api/v1/dm/messages/search?${params.toString()}`, {
    ...(signal ? { signal } : {}),
  });

  return MessageSearchPageSchema.parse(payload);
}

// ---------------------------------------------------------------------------
// Arkadaşlar (karar #8)
// ---------------------------------------------------------------------------

const SuggestionsResponseSchema = z.object({
  suggestions: z.array(
    z.object({
      avatarUrl: z.string().nullable(),
      id: z.string(),
      initials: z.string(),
      mutualFriendCount: z.number(),
      name: z.string(),
      username: z.string(),
      viaServerName: z.string(),
    }),
  ),
});

export async function fetchFriendSuggestions(): Promise<FriendSuggestionDTO[]> {
  const payload = await requestJson<unknown>("/api/v1/friends/suggestions");

  return SuggestionsResponseSchema.parse(payload).suggestions;
}

const InvitableServersResponseSchema = z.object({
  servers: z.array(
    z.object({
      iconUrl: z.string().nullable(),
      id: z.string(),
      name: z.string(),
    }),
  ),
});

/**
 * Görüntüleyenin **davet üretebildiği** sunucular (SPEC §4).
 *
 * Yetki kararı sunucuda; istemci "üyeyse davet edebilir" diye tahmin etseydi
 * kullanıcı yapamayacağı bir işi dener ve 403 alırdı.
 */
export async function fetchInvitableServers(): Promise<
  { iconUrl: string | null; id: string; name: string }[]
> {
  const payload = await requestJson<unknown>("/api/v1/servers/invitable");

  return InvitableServersResponseSchema.parse(payload).servers;
}

const FriendsSortResponseSchema = z.object({ sort: FriendsSortSchema });

export async function fetchFriendsSort(): Promise<FriendsSort> {
  const payload = await requestJson<unknown>("/api/v1/friends/sort");

  return FriendsSortResponseSchema.parse(payload).sort;
}

export async function updateFriendsSort(sort: FriendsSort): Promise<void> {
  await requestJson("/api/v1/friends/sort", { body: { sort }, method: "PUT" });
}
