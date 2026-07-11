import { queryOptions, useQuery } from "@tanstack/react-query";
import type {
  MobileChannelThreadMessagesResponse,
  MobileDMMessagesThreadResponse,
} from "@wizards/types";
import type { MobileApiClient } from "../api/mobile-api-client";
import { fetchMobileDMMessageThread } from "../dm/mobile-dm-client";
import { fetchMobileChannelMessageThread } from "../workspace/mobile-workspace-client";
import { mobileQueryKeys } from "./mobile-query-keys";

export function getMobileChannelMessageThreadQueryOptions(
  client: MobileApiClient,
  channelId: string,
  messageId: string,
) {
  return queryOptions<MobileChannelThreadMessagesResponse>({
    enabled: channelId.length > 0 && messageId.length > 0,
    queryFn: () => fetchMobileChannelMessageThread(client, { channelId, messageId }),
    queryKey: mobileQueryKeys.channelThread(channelId, messageId),
  });
}

export function useMobileChannelMessageThreadQuery(
  client: MobileApiClient,
  channelId: string,
  messageId: string,
) {
  return useQuery(getMobileChannelMessageThreadQueryOptions(client, channelId, messageId));
}

export function getMobileDMMessageThreadQueryOptions(
  client: MobileApiClient,
  conversationId: string,
  messageId: string,
) {
  return queryOptions<MobileDMMessagesThreadResponse>({
    enabled: conversationId.length > 0 && messageId.length > 0,
    queryFn: () => fetchMobileDMMessageThread(client, { conversationId, messageId }),
    queryKey: mobileQueryKeys.dmThread(conversationId, messageId),
  });
}

export function useMobileDMMessageThreadQuery(
  client: MobileApiClient,
  conversationId: string,
  messageId: string,
) {
  return useQuery(getMobileDMMessageThreadQueryOptions(client, conversationId, messageId));
}
