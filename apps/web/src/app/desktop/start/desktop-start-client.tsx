"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppStartupScreen } from "@/components/app/app-startup-screen";
import {
  isWhisprDesktopRuntime,
  promoteWhisprDesktopWindow,
  showWhisprDesktopWindow,
} from "@/lib/desktop/runtime";

const DESKTOP_STARTUP_MIN_VISIBLE_MS = 760;
const DESKTOP_MAIN_VIEWPORT_READY_WIDTH = 900;

interface DesktopStartClientProps {
  authenticated: boolean;
  destination: string;
}

function waitForMainWindowViewport() {
  return new Promise<boolean>((resolve) => {
    window.setTimeout(() => {
      resolve(window.innerWidth >= DESKTOP_MAIN_VIEWPORT_READY_WIDTH);
    }, 120);
  });
}

export function DesktopStartClient({ authenticated, destination }: DesktopStartClientProps) {
  const router = useRouter();

  useEffect(() => {
    if (!isWhisprDesktopRuntime()) {
      router.replace(destination);
      return undefined;
    }

    let cancelled = false;
    void showWhisprDesktopWindow();

    const fadeTimeoutId = window.setTimeout(() => {
      void (async () => {
        const promoted = await promoteWhisprDesktopWindow();
        const viewportReady = promoted ? await waitForMainWindowViewport() : false;

        if (cancelled) {
          return;
        }

        if (viewportReady) {
          router.replace(destination);
          return;
        }

        window.location.replace(destination);
      })();
    }, DESKTOP_STARTUP_MIN_VISIBLE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(fadeTimeoutId);
    };
  }, [destination, router]);

  return (
    <AppStartupScreen
      busy
      experience="desktop"
      status={authenticated ? "workspace" : "session"}
      variant="page"
    />
  );
}
