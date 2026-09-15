"use client";

import { useCallback, useRef, useState } from "react";
import { useI18n } from "@/components/providers/locale-provider";
import { openDesktopControl, type DesktopControlSection } from "@/lib/desktop/controls";
import {
  launchDesktopControlSection,
  type DesktopControlLaunchState,
} from "./desktop-control-launch";

export function useDesktopControlLaunch() {
  const { t } = useI18n();
  const [state, setState] = useState<DesktopControlLaunchState>("idle");
  const opening = useRef(false);
  const launch = useCallback((section: DesktopControlSection) => {
    if (opening.current) return;
    opening.current = true;
    void launchDesktopControlSection(section, openDesktopControl, setState).finally(() => {
      opening.current = false;
    });
  }, []);

  return {
    launch,
    pending: state === "pending",
    feedback:
      state === "idle" ? null : (
        <p className="mb-4 text-sm text-app-muted" role={state === "error" ? "alert" : "status"}>
          {t(state === "error" ? "desktop.control.openError" : "desktop.control.opening")}
        </p>
      ),
  };
}
