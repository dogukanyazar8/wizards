import { ApiError } from "@/lib/api";
import { comparePublicationVersions } from "./publication-contract";

export function assertPublicationAdvance(
  input: { version: string; baselineSha: string | null },
  previous: { version: string; sourceSha: string | null } | null,
) {
  if (input.baselineSha !== (previous?.sourceSha ?? null))
    throw new ApiError(
      "Publication baseline changed; regenerate notes",
      409,
      "PUBLICATION_BASELINE_CHANGED",
    );
  if (previous && comparePublicationVersions(input.version, previous.version) <= 0)
    throw new ApiError("Published version must increase", 409, "PUBLICATION_VERSION_NOT_MONOTONIC");
}
