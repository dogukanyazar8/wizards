import {
  MobileBootstrapPayloadSchema,
  type MobileBootstrapPayload,
} from "@wizards/types";
import type { MobileApiClient } from "../api/mobile-api-client";

export const MOBILE_BOOTSTRAP_ENDPOINT = "/api/v1/mobile/bootstrap";

export type MobileBootstrapSummary = {
  disabledFeatureCount: number;
  enabledFeatureCount: number;
  pendingContractCount: number;
  serverTime: string;
};

export async function fetchMobileBootstrap(
  client: MobileApiClient,
): Promise<MobileBootstrapPayload> {
  const payload = await client.requestJson<unknown>(MOBILE_BOOTSTRAP_ENDPOINT);
  return MobileBootstrapPayloadSchema.parse(payload);
}

export function summarizeMobileBootstrap(
  payload: MobileBootstrapPayload,
): MobileBootstrapSummary {
  const features = Object.values(payload.features);

  return {
    disabledFeatureCount: features.filter((feature) => feature.status === "disabled").length,
    enabledFeatureCount: features.filter((feature) => feature.status === "available").length,
    pendingContractCount: features.filter(
      (feature) =>
        feature.status === "requires-server-contract" ||
        feature.status === "requires-native-permission",
    ).length,
    serverTime: payload.app.serverTime,
  };
}
