"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  getWhisprDesktopNavigationPath,
  isWhisprDesktopRuntime,
  setWhisprDesktopClientNavigationReady,
  WHISPR_DESKTOP_COMMAND_EVENT,
} from "@/lib/desktop/runtime";

export function DesktopNavigationBridge() {
  const router = useRouter();

  useEffect(() => {
    if (!isWhisprDesktopRuntime()) {
      return;
    }

    const handleDesktopNavigation = (event: Event) => {
      const path = getWhisprDesktopNavigationPath(event);

      if (path) {
        router.push(path);
      }
    };

    window.addEventListener(WHISPR_DESKTOP_COMMAND_EVENT, handleDesktopNavigation);
    setWhisprDesktopClientNavigationReady(true);

    return () => {
      setWhisprDesktopClientNavigationReady(false);
      window.removeEventListener(WHISPR_DESKTOP_COMMAND_EVENT, handleDesktopNavigation);
    };
  }, [router]);

  return null;
}
