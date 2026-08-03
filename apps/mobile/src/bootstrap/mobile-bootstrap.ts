import { MobileBootstrapPayloadSchema, type MobileBootstrapPayload } from "@wizards/types";
import type { MobileApiClient } from "../api/mobile-api-client";

export const MOBILE_BOOTSTRAP_ENDPOINT = "/api/v1/mobile/bootstrap";

export type MobileBootstrapSummary = {
  disabledFeatureCount: number;
  directMessageCount: number;
  enabledFeatureCount: number;
  pendingContractCount: number;
  serverTime: string;
  unreadDirectMessageCount: number;
  workspaceCount: number;
};

export async function fetchMobileBootstrap(
  client: MobileApiClient,
  /** TanStack's own signal: a cancelled query must stop costing the JS thread. */
  signal?: AbortSignal,
): Promise<MobileBootstrapPayload> {
  const payload = await client.requestJson<unknown>(
    MOBILE_BOOTSTRAP_ENDPOINT,
    signal ? { signal } : {},
  );
  return MobileBootstrapPayloadSchema.parse(payload);
}

export function summarizeMobileBootstrap(payload: MobileBootstrapPayload): MobileBootstrapSummary {
  const features = Object.values(payload.features);

  return {
    disabledFeatureCount: features.filter((feature) => feature.status === "disabled").length,
    directMessageCount: payload.home.directMessages.totalCount,
    enabledFeatureCount: features.filter((feature) => feature.status === "available").length,
    pendingContractCount: features.filter(
      (feature) =>
        feature.status === "requires-server-contract" ||
        feature.status === "requires-native-permission",
    ).length,
    serverTime: payload.app.serverTime,
    unreadDirectMessageCount: payload.home.directMessages.unreadCount,
    workspaceCount: payload.home.servers.totalCount,
  };
}
