import {
  MobileAdminCaseClaimResponseSchema,
  MobileAdminCaseDetailResponseSchema,
  MobileAdminCaseDismissResponseSchema,
  MobileAdminCaseEscalateResponseSchema,
  MobileAdminCaseListResponseSchema,
  type MobileAdminCaseClaimResponse,
  type MobileAdminCaseDetailResponse,
  type MobileAdminCaseDismissResponse,
  type MobileAdminCaseEscalateResponse,
  type MobileAdminCaseListResponse,
} from "@wizards/types";

import type { MobileApiClient } from "../api/mobile-api-client";

const ADMIN_CASES_PATH = "/api/v1/mobile/admin/cases";

function casePath(caseId: string, suffix = ""): string {
  return `${ADMIN_CASES_PATH}/${encodeURIComponent(caseId)}${suffix}`;
}

export async function fetchMobileAdminCases(
  client: MobileApiClient,
): Promise<MobileAdminCaseListResponse> {
  return MobileAdminCaseListResponseSchema.parse(await client.requestJson(ADMIN_CASES_PATH));
}

export async function fetchMobileAdminCase(
  client: MobileApiClient,
  caseId: string,
): Promise<MobileAdminCaseDetailResponse> {
  return MobileAdminCaseDetailResponseSchema.parse(await client.requestJson(casePath(caseId)));
}

/** Bodyless on purpose: the claimant is the session, same as on the console. */
export async function claimMobileAdminCase(
  client: MobileApiClient,
  caseId: string,
): Promise<MobileAdminCaseClaimResponse> {
  return MobileAdminCaseClaimResponseSchema.parse(
    await client.requestJson(casePath(caseId, "/claim"), { method: "POST" }),
  );
}

export async function dismissMobileAdminCase(
  client: MobileApiClient,
  caseId: string,
  resolution: string,
): Promise<MobileAdminCaseDismissResponse> {
  return MobileAdminCaseDismissResponseSchema.parse(
    await client.requestJson(casePath(caseId, "/dismiss"), {
      body: { resolution },
      method: "POST",
    }),
  );
}

/** Hands the case to the desktop console and marks it urgent while doing so. */
export async function escalateMobileAdminCase(
  client: MobileApiClient,
  caseId: string,
  note?: string,
): Promise<MobileAdminCaseEscalateResponse> {
  const trimmed = note?.trim() ?? "";

  return MobileAdminCaseEscalateResponseSchema.parse(
    await client.requestJson(casePath(caseId, "/escalate"), {
      body: trimmed ? { note: trimmed } : {},
      method: "POST",
    }),
  );
}
