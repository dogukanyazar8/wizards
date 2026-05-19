"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppStartupScreen } from "@/components/app/app-startup-screen";
import {
  isWhisprDesktopRuntime,
  promoteWhisprDesktopWindow,
  showWhisprDesktopWindow,
} from "@/lib/desktop/runtime";
import { resolveDesktopStartDestination } from "@/lib/desktop/start";

const DESKTOP_STARTUP_MIN_VISIBLE_MS = 760;
const DESKTOP_MAIN_VIEWPORT_READY_WIDTH = 900;

interface DesktopStartClientProps {
  callbackUrl: string;
}

function waitForMainWindowViewport() {
  return new Promise<boolean>((resolve) => {
    window.setTimeout(() => {
      resolve(window.innerWidth >= DESKTOP_MAIN_VIEWPORT_READY_WIDTH);
    }, 120);
  });
}

function waitForMinimumStartupVisibility() {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, DESKTOP_STARTUP_MIN_VISIBLE_MS);
  });
}

export function DesktopStartClient({ callbackUrl }: DesktopStartClientProps) {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const destinationPromise = resolveDesktopStartDestination(callbackUrl).then((resolution) => {
      if (!cancelled) {
        setAuthenticated(resolution.authenticated);
      }

      return resolution.destination;
    });

    if (!isWhisprDesktopRuntime()) {
      void destinationPromise.then((destination) => {
        if (!cancelled) {
          router.replace(destination);
        }
      });
      return undefined;
    }

    void showWhisprDesktopWindow();

    void (async () => {
      const [destination] = await Promise.all([
        destinationPromise,
        waitForMinimumStartupVisibility(),
      ]);

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

    return () => {
      cancelled = true;
    };
  }, [callbackUrl, router]);

  return (
    <AppStartupScreen
      busy
      experience="desktop"
      status={authenticated ? "workspace" : "session"}
      variant="page"
    />
  );
}
