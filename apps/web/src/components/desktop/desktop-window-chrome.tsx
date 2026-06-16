"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Maximize2, Minus, X } from "lucide-react";
import type { Window as TauriWindow } from "@tauri-apps/api/window";
import {
  WHISPR_DESKTOP_BEFORE_CLOSE_EVENT,
  completeWhisprDesktopBeforeClose,
  getWhisprDesktopBeforeCloseRequestId,
  isWhisprDesktopRuntime,
} from "@/lib/desktop/runtime";
import { clearDesktopTransientAuthSession } from "@/lib/desktop/session";
import { cn } from "@/lib/utils";

type WindowAction = (window: TauriWindow) => Promise<void>;

async function runWindowAction(action: WindowAction) {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await action(getCurrentWindow());
  } catch {
    // Window controls are only available inside the Tauri desktop shell.
  }
}

type ChromeButtonProps = {
  "aria-label": string;
  className?: string;
  icon: React.ReactNode;
  onClick: () => void;
  title: string;
};

function ChromeButton({
  "aria-label": ariaLabel,
  className,
  icon,
  onClick,
  title,
}: ChromeButtonProps) {
  return (
    <button
      aria-label={ariaLabel}
      className={cn(
        "inline-flex h-7 w-9 items-center justify-center rounded-lg text-app-muted transition-colors duration-150 hover:bg-[hsl(var(--surface-soft)/0.78)] hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.48)]",
        className,
      )}
      onClick={onClick}
      title={title}
      type="button"
    >
      {icon}
    </button>
  );
}

export function DesktopWindowChrome() {
  const pathname = usePathname();
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const desktop = isWhisprDesktopRuntime();
    const isChromeLessDesktopRoute =
      pathname === "/desktop/start" ||
      pathname === "/desktop/voice-mini" ||
      pathname === "/desktop/game-overlay";
    setIsDesktop(desktop);

    if (!desktop || isChromeLessDesktopRoute) {
      document.documentElement.classList.remove("whispr-desktop-chrome");
      return;
    }

    document.documentElement.classList.add("whispr-desktop-chrome");
    return () => {
      document.documentElement.classList.remove("whispr-desktop-chrome");
    };
  }, [pathname]);

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

  if (
    !isDesktop ||
    pathname === "/desktop/start" ||
    pathname === "/desktop/voice-mini" ||
    pathname === "/desktop/game-overlay"
  ) {
    return null;
  }

  return (
    <div
      className="desktop-window-chrome flex h-[var(--desktop-titlebar-height)] select-none items-center border-b border-[hsl(var(--border)/0.52)] bg-[hsl(var(--surface-card)/0.86)] text-app-foreground shadow-[0_1px_0_hsl(var(--foreground)/0.04)] backdrop-blur-xl supports-[backdrop-filter]:bg-[hsl(var(--surface-card)/0.72)]"
      data-testid="desktop-window-chrome"
    >
      <div className="flex h-full min-w-0 flex-1 items-center gap-2 px-2.5" data-tauri-drag-region>
        <span
          aria-hidden="true"
          className="relative grid h-5 w-5 shrink-0 place-items-center overflow-hidden rounded-md border border-[hsl(var(--primary)/0.18)] bg-[hsl(var(--surface-card)/0.72)] shadow-[0_6px_14px_hsl(var(--primary)/0.1)]"
          data-tauri-drag-region
        >
          <Image
            alt=""
            className="h-full w-full object-cover"
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

      <div className="flex h-full shrink-0 items-center gap-1 px-1.5">
        <ChromeButton
          aria-label="Minimize window"
          icon={<Minus className="h-3.5 w-3.5" />}
          onClick={() => {
            void runWindowAction((window) => window.minimize());
          }}
          title="Minimize"
        />
        <ChromeButton
          aria-label="Maximize window"
          icon={<Maximize2 className="h-3.5 w-3.5" />}
          onClick={() => {
            void runWindowAction((window) => window.toggleMaximize());
          }}
          title="Maximize"
        />
        <ChromeButton
          aria-label="Close window"
          className="hover:bg-[hsl(var(--danger)/0.94)] hover:text-white"
          icon={<X className="h-3.5 w-3.5" />}
          onClick={() => {
            void runWindowAction((window) => window.close());
          }}
          title="Close"
        />
      </div>
    </div>
  );
}
