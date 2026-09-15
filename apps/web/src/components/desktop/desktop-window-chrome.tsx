"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useClientPlatform } from "@/hooks/use-client-platform";
import { useI18n } from "@/components/providers/locale-provider";
import { DesktopWindowControls } from "@/components/desktop/desktop-window-controls";
import type { Window as TauriWindow } from "@tauri-apps/api/window";
import {
  shouldUseSquareDesktopFrame,
  type DesktopWindowFrameState,
} from "@/components/desktop/desktop-window-frame-state";
import {
  WHISPR_DESKTOP_BEFORE_CLOSE_EVENT,
  completeWhisprDesktopBeforeClose,
  getWhisprDesktopBeforeCloseRequestId,
  isWhisprDesktopRuntime,
  promoteWhisprDesktopWindow,
} from "@/lib/desktop/runtime";
import { isDesktopStartupWindowPending } from "@/lib/desktop/startup-window";
import { clearDesktopTransientAuthSession } from "@/lib/desktop/session";

type WindowAction = (window: TauriWindow) => Promise<void>;
const subscribeToDesktopRuntime = () => () => {};

async function runWindowAction(action: WindowAction) {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await action(getCurrentWindow());
  } catch {
    // Window controls are only available inside the Tauri desktop shell.
  }
}

function isChromeLessDesktopPathname(pathname: string | null) {
  return (
    pathname === "/desktop/start" ||
    pathname === "/desktop/voice-mini" ||
    pathname === "/desktop/game-overlay"
  );
}

export function DesktopWindowChrome() {
  const platform = useClientPlatform();
  const { t } = useI18n();
  const pathname = usePathname();
  const isDesktop = useSyncExternalStore(
    subscribeToDesktopRuntime,
    isWhisprDesktopRuntime,
    () => false,
  );
  const [windowFrameState, setWindowFrameState] = useState<DesktopWindowFrameState>({
    fullscreen: false,
    maximized: false,
  });
  const isWindowMaximized = windowFrameState.maximized;
  const isChromeLessDesktopRoute = isChromeLessDesktopPathname(pathname);

  useEffect(() => {
    if (!isDesktop || isChromeLessDesktopRoute) {
      document.documentElement.classList.remove("whispr-desktop-chrome");
      document.documentElement.classList.remove("whispr-desktop-square-frame");
      return;
    }

    document.documentElement.classList.add("whispr-desktop-chrome");
    return () => {
      document.documentElement.classList.remove("whispr-desktop-chrome");
      document.documentElement.classList.remove("whispr-desktop-square-frame");
    };
  }, [isChromeLessDesktopRoute, isDesktop]);

  useEffect(() => {
    if (!isDesktop || isChromeLessDesktopRoute) {
      return;
    }

    document.documentElement.classList.toggle(
      "whispr-desktop-square-frame",
      shouldUseSquareDesktopFrame(windowFrameState),
    );
  }, [isChromeLessDesktopRoute, isDesktop, windowFrameState]);

  useEffect(() => {
    if (!isDesktop || isChromeLessDesktopRoute) {
      return;
    }

    let disposed = false;
    let unlistenResize: (() => void) | undefined;

    const syncWindowFrameState = async (window: TauriWindow) => {
      try {
        const [fullscreen, maximized] = await Promise.all([
          window.isFullscreen(),
          window.isMaximized(),
        ]);
        if (!disposed) {
          setWindowFrameState({ fullscreen, maximized });
        }
      } catch {
        // Native frame state is best-effort and only available inside Tauri.
      }
    };

    void (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const currentWindow = getCurrentWindow();
        await syncWindowFrameState(currentWindow);
        unlistenResize = await currentWindow.onResized(() => {
          void syncWindowFrameState(currentWindow);
        });
      } catch {
        // Native window events are unavailable in the web runtime.
      }
    })();

    return () => {
      disposed = true;
      unlistenResize?.();
    };
  }, [isChromeLessDesktopRoute, isDesktop]);

  useEffect(() => {
    if (!isDesktop || isChromeLessDesktopRoute) {
      return;
    }

    /*
     * Açılış penceresi hâlâ ayaktaysa terfi **buranın işi değil**.
     *
     * Bu etki her masaüstü rotasında çalışır ve kabuk yüklenir yüklenmez pencereyi
     * ana ölçüye çıkarıyordu: kullanıcı açılış ekranının maddeleri bitmeden pencerenin
     * büyüdüğünü, kartın arkasında dev bir çerçeve belirdiğini görüyordu. Açılışta
     * terfiyi kabuk, dört adım da bittikten sonra yapar (SPEC-SPLASH §8); burası
     * yalnız açılış dışı yollar (deep link, yeniden yükleme) için son çare kalır.
     */
    if (isDesktopStartupWindowPending()) {
      return;
    }

    void promoteWhisprDesktopWindow();
  }, [isChromeLessDesktopRoute, isDesktop]);

  useEffect(() => {
    if (!isDesktop) {
      return;
    }

    const handleDesktopBeforeCloseFallback = (event: Event) => {
      const requestId = getWhisprDesktopBeforeCloseRequestId(event);
      if (requestId === null) {
        return;
      }

      queueMicrotask(() => {
        if (event.defaultPrevented) {
          return;
        }

        event.preventDefault();
        void clearDesktopTransientAuthSession().finally(() => {
          void completeWhisprDesktopBeforeClose(requestId);
        });
      });
    };

    window.addEventListener(WHISPR_DESKTOP_BEFORE_CLOSE_EVENT, handleDesktopBeforeCloseFallback);
    return () => {
      window.removeEventListener(
        WHISPR_DESKTOP_BEFORE_CLOSE_EVENT,
        handleDesktopBeforeCloseFallback,
      );
    };
  }, [isDesktop]);

  if (!isDesktop || isChromeLessDesktopRoute) {
    return null;
  }

  const maximizeLabel = t(isWindowMaximized ? "desktop.window.restore" : "desktop.window.maximize");
  const controls = (
    <DesktopWindowControls
      platform={platform}
      maximized={isWindowMaximized}
      labels={{
        close: t("desktop.window.close"),
        minimize: t("desktop.window.minimize"),
        maximize: maximizeLabel,
      }}
      onClose={() => void runWindowAction((window) => window.close())}
      onMinimize={() => void runWindowAction((window) => window.minimize())}
      onMaximize={() => {
        void runWindowAction(async (window) => {
          await window.toggleMaximize();
          try {
            const [fullscreen, maximized] = await Promise.all([
              window.isFullscreen(),
              window.isMaximized(),
            ]);
            setWindowFrameState({ fullscreen, maximized });
          } catch {
            setWindowFrameState((current) => ({ ...current, maximized: !current.maximized }));
          }
        });
      }}
    />
  );

  return (
    <div
      className="desktop-window-chrome relative z-[220] flex h-[var(--desktop-titlebar-height)] shrink-0 select-none items-center border-b border-[hsl(var(--border)/0.52)] bg-[hsl(var(--surface-card)/0.86)] text-app-foreground shadow-[0_1px_0_hsl(var(--foreground)/0.04)] backdrop-blur-xl supports-[backdrop-filter]:bg-[hsl(var(--surface-card)/0.72)]"
      data-testid="desktop-window-chrome"
    >
      {platform === "macos" ? controls : null}
      <div className="flex h-full min-w-0 flex-1 items-center gap-2 px-2.5" data-tauri-drag-region>
        <span
          aria-hidden="true"
          className="relative block h-5 w-5 shrink-0 overflow-hidden rounded-[5px]"
          data-tauri-drag-region
        >
          <Image
            alt=""
            className="h-full w-full object-contain drop-shadow-[0_3px_6px_hsl(var(--primary)/0.18)]"
            data-tauri-drag-region
            draggable={false}
            height={20}
            priority
            src="/app-icons/whispr.png"
            unoptimized
            width={20}
          />
        </span>
        <span
          className="truncate text-[12px] font-semibold tracking-[-0.01em] text-app-foreground"
          data-tauri-drag-region
        >
          Whispr
        </span>
      </div>

      {platform !== "macos" ? controls : null}
    </div>
  );
}
