import type { MobileDMAttachmentsResponse, MobileDMAttachmentsTab } from "@wizards/types";
import {
  loadConversationSharedMessages,
  mapDmSharedMediaItems,
  toSharedMediaKind,
} from "@/lib/dm/shared-media";

export type MobileDMAttachmentsInput = {
  conversationId: string;
  cursor?: string | undefined;
  limit: number;
  tab: MobileDMAttachmentsTab;
  userId: string;
};

/**
 * The mobile shape of §15.5's shared list — karar K11.
 *
 * Every rule this used to own (the keyset page, 2c §7's history floor, C4's
 * expiry filter, scan-status URL redaction) now lives in
 * `loadConversationSharedMessages`, which the web endpoint reads through as
 * well. What is left here is the shape difference and nothing else: mobile
 * names the kinds `media | files | links`, carries `tab` back in the response,
 * and returns a discriminated item union instead of §15.5's three DTOs. The
 * adapter is on this side on purpose — the shared service is not bent towards a
 * shipped mobile contract.
 */
export async function listMobileDMAttachments(
  input: MobileDMAttachmentsInput,
): Promise<MobileDMAttachmentsResponse> {
  const page = await loadConversationSharedMessages({
    conversationId: input.conversationId,
    cursor: input.cursor,
    kind: toSharedMediaKind(input.tab),
    limit: input.limit,
    viewerId: input.userId,
  });

  return {
    items: mapDmSharedMediaItems(page.messages, input.tab),
    nextCursor: page.nextCursor,
    tab: input.tab,
  };
}
