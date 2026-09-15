import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { MobileReleaseDetailSchema, MobileReleaseListResponseSchema } from "@wizards/types";

async function readReleaseData(path: string, signal: AbortSignal) {
  const response = await fetch(path, { signal, cache: "no-store", credentials: "same-origin" });
  if (!response.ok) throw new Error("Unable to load release notes");
  return response.json();
}

export function releaseListOptions(installed: string) {
  return infiniteQueryOptions({
    queryKey: ["release-notes", "list", installed],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }) => {
      const query = new URLSearchParams({ installed, limit: "10" });
      if (pageParam) query.set("cursor", pageParam);
      return MobileReleaseListResponseSchema.parse(
        await readReleaseData(`/api/v1/app/releases?${query}`, signal),
      );
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 60_000,
    retry: false,
  });
}

export function releaseDetailOptions(version: string, installed: string) {
  return queryOptions({
    queryKey: ["release-notes", "detail", version, installed],
    queryFn: async ({ signal }) =>
      MobileReleaseDetailSchema.parse(
        await readReleaseData(
          `/api/v1/app/releases/${encodeURIComponent(version)}?${new URLSearchParams({ installed })}`,
          signal,
        ),
      ),
    staleTime: 60_000,
    retry: false,
  });
}
