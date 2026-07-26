import {
  MobileFeedbackDetailResponseSchema,
  MobileFeedbackListResponseSchema,
  MobileFeedbackSubmitResponseSchema,
  MobileRoadmapListResponseSchema,
  MobileRoadmapVoteResponseSchema,
  type MobileFeedbackDetailResponse,
  type MobileFeedbackListResponse,
  type MobileFeedbackSubmitRequest,
  type MobileFeedbackSubmitResponse,
  type MobileRoadmapListResponse,
  type MobileRoadmapVoteResponse,
} from "@wizards/types";

import type { MobileApiClient } from "../api/mobile-api-client";

export async function submitMobileFeedback(
  client: MobileApiClient,
  input: MobileFeedbackSubmitRequest,
): Promise<MobileFeedbackSubmitResponse> {
  return MobileFeedbackSubmitResponseSchema.parse(
    await client.requestJson("/api/v1/mobile/feedback", { body: input, method: "POST" }),
  );
}

export async function fetchMobileFeedback(
  client: MobileApiClient,
  feedbackId: string,
): Promise<MobileFeedbackDetailResponse> {
  return MobileFeedbackDetailResponseSchema.parse(
    await client.requestJson(`/api/v1/mobile/feedback/${encodeURIComponent(feedbackId)}`),
  );
}

/** The "Bildirdiklerim" tab: the viewer's own reports, newest first. */
export async function fetchMobileFeedbackList(
  client: MobileApiClient,
): Promise<MobileFeedbackListResponse> {
  return MobileFeedbackListResponseSchema.parse(
    await client.requestJson("/api/v1/mobile/feedback"),
  );
}

export async function fetchMobileRoadmap(
  client: MobileApiClient,
): Promise<MobileRoadmapListResponse> {
  return MobileRoadmapListResponseSchema.parse(
    await client.requestJson("/api/v1/mobile/feedback/roadmap"),
  );
}

/**
 * The desired end state travels in the body, not a delta, so a retry after a
 * dropped response settles on the same row instead of toggling twice.
 */
export async function setMobileRoadmapVote(
  client: MobileApiClient,
  roadmapItemId: string,
  voted: boolean,
): Promise<MobileRoadmapVoteResponse> {
  return MobileRoadmapVoteResponseSchema.parse(
    await client.requestJson(
      `/api/v1/mobile/feedback/roadmap/${encodeURIComponent(roadmapItemId)}/vote`,
      { body: { voted }, method: "PUT" },
    ),
  );
}
