"use client";

export type DesktopGameOverlayState = "failed" | "hidden" | "preparing" | "repairing" | "visible";

export type DesktopGameOverlayEvent =
  | { type: "hide" }
  | { type: "repair-failed" }
  | { type: "repair-requested" }
  | { type: "repair-succeeded" }
  | { type: "show-failed" }
  | { type: "show-requested" }
  | { type: "show-succeeded" };

export function transitionDesktopGameOverlayState(
  state: DesktopGameOverlayState,
  event: DesktopGameOverlayEvent,
): DesktopGameOverlayState {
  switch (event.type) {
    case "hide":
      return "hidden";
    case "show-requested":
      return state === "visible" ? "visible" : "preparing";
    case "show-succeeded":
      return "visible";
    case "show-failed":
      return "failed";
    case "repair-requested":
      return state === "hidden" ? "hidden" : "repairing";
    case "repair-succeeded":
      return "visible";
    case "repair-failed":
      return state === "hidden" ? "hidden" : "failed";
  }
}

export function isDesktopGameOverlayOperationInFlight(state: DesktopGameOverlayState) {
  return state === "preparing" || state === "repairing";
}
