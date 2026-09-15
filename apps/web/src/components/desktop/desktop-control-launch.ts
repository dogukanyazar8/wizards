import type { DesktopControlSection } from "@/lib/desktop/controls";

export type DesktopControlLaunchState = "error" | "idle" | "pending";

type OpenDesktopControl = (section: DesktopControlSection) => Promise<boolean>;
type SetDesktopControlLaunchState = (state: DesktopControlLaunchState) => void;

export function desktopControlSectionForSettingsAction(
  rowKey: string,
  actionIndex: number,
): DesktopControlSection | null {
  if (rowKey === "n4") {
    return actionIndex === 0 ? "diagnostics" : actionIndex === 1 ? "recovery" : null;
  }
  if (actionIndex !== 0) return null;
  if (rowKey === "w1" || rowKey === "w2" || rowKey === "w8") return "app";
  if (rowKey === "q3") return "shortcuts";
  if (rowKey === "h1" || rowKey === "o3") return "updates";
  return null;
}

export async function launchDesktopControlSection(
  section: DesktopControlSection,
  openControl: OpenDesktopControl,
  setState: SetDesktopControlLaunchState,
) {
  setState("pending");

  try {
    const finalState = (await openControl(section)) ? "idle" : "error";
    setState(finalState);
    return finalState;
  } catch {
    setState("error");
    return "error";
  }
}
