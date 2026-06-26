"use client";

import { useEffect } from "react";
import { shouldAllowDesktopNativeContextMenu } from "@/lib/desktop/context-menu";
import { isWhisprDesktopRuntime } from "@/lib/desktop/runtime";

export function DesktopContextMenuGuard() {
  useEffect(() => {
    if (!isWhisprDesktopRuntime()) {
      return;
    }

    const handleContextMenu = (event: MouseEvent) => {
      if (shouldAllowDesktopNativeContextMenu(event.target)) {
        return;
      }

      event.preventDefault();
    };

    document.addEventListener("contextmenu", handleContextMenu);

    return () => {
      document.removeEventListener("contextmenu", handleContextMenu);
    };
  }, []);

  return null;
}
