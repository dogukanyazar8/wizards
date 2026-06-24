export const WHISPR_OVERLAY_OPEN_EVENT = "whispr:overlay-open";

export type WhisprOverlayOpenDetail = {
  group: string;
  id: string;
};

export function announceOverlayOpen(group: string, id: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<WhisprOverlayOpenDetail>(WHISPR_OVERLAY_OPEN_EVENT, {
      detail: { group, id },
    }),
  );
}

export function getOverlayOpenDetail(event: Event): WhisprOverlayOpenDetail | null {
  const detail = (event as CustomEvent<Partial<WhisprOverlayOpenDetail>>).detail;

  if (!detail || typeof detail.group !== "string" || typeof detail.id !== "string") {
    return null;
  }

  return { group: detail.group, id: detail.id };
}
