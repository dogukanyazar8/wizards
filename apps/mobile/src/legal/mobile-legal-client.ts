import {
  MobileLegalDocumentResponseSchema,
  type MobileLegalDocumentId,
  type MobileLegalDocumentResponse,
} from "@wizards/types";

import type { MobileApiClient } from "../api/mobile-api-client";

export function buildMobileLegalDocumentPath(documentId: MobileLegalDocumentId): string {
  return `/api/v1/mobile/legal/${encodeURIComponent(documentId)}`;
}

export async function fetchMobileLegalDocument(
  client: MobileApiClient,
  documentId: MobileLegalDocumentId,
): Promise<MobileLegalDocumentResponse> {
  const payload = await client.requestJson<unknown>(buildMobileLegalDocumentPath(documentId), {
    method: "GET",
  });

  return MobileLegalDocumentResponseSchema.parse(payload);
}
