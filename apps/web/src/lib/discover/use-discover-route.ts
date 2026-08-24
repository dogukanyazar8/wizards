"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import {
  buildDiscoverHref,
  parseDiscoverRoute,
  type DiscoverRouteState,
} from "@/lib/discover/routes";

export function useDiscoverRoute() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const route = useMemo(() => parseDiscoverRoute(searchParams), [searchParams]);

  const push = useCallback(
    (patch: Partial<DiscoverRouteState>) => {
      router.push(buildDiscoverHref(patch, route), { scroll: false });
    },
    [route, router],
  );

  const replace = useCallback(
    (patch: Partial<DiscoverRouteState>) => {
      router.replace(buildDiscoverHref(patch, route), { scroll: false });
    },
    [route, router],
  );

  const replaceHref = useCallback(
    (href: string) => {
      router.replace(href, { scroll: false });
    },
    [router],
  );

  return { push, replace, replaceHref, route };
}
