import type { DesktopControlSection } from "@/lib/desktop/controls";

export type DesktopControlLaunchState = "error" | "idle" | "pending";

type OpenDesktopControl = (section: DesktopControlSection) => Promise<boolean>;
type SetDesktopControlLaunchState = (state: DesktopControlLaunchState) => void;

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
