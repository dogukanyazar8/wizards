"use client";

import { useEffect, useState } from "react";
import { Maximize2, Minus, X } from "lucide-react";
import type { Window as TauriWindow } from "@tauri-apps/api/window";
import { isWhisprDesktopRuntime } from "@/lib/desktop/runtime";
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
        "inline-flex h-full w-11 items-center justify-center text-app-muted transition hover:bg-[hsl(var(--surface-soft)/0.72)] hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--ring)/0.55)]",
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
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const desktop = isWhisprDesktopRuntime();
    setIsDesktop(desktop);

    if (!desktop) {
      return;
    }

    document.documentElement.classList.add("whispr-desktop-chrome");
    return () => {
      document.documentElement.classList.remove("whispr-desktop-chrome");
    };
  }, []);

  if (!isDesktop) {
    return null;
  }

  return (
    <div
      className="desktop-window-chrome flex h-[var(--desktop-titlebar-height)] select-none items-center border-b border-[hsl(var(--border)/0.72)] bg-[linear-gradient(180deg,hsl(var(--surface-card)/0.96),hsl(var(--surface-soft)/0.7))] text-app-foreground shadow-[0_1px_0_hsl(var(--background)/0.34)]"
      data-testid="desktop-window-chrome"
    >
      <div className="flex h-full min-w-0 flex-1 items-center gap-2 px-3" data-tauri-drag-region>
        <span
          aria-hidden="true"
          className="grid h-5 w-5 shrink-0 place-items-center rounded-lg border border-[hsl(var(--primary)/0.24)] bg-[hsl(var(--primary)/0.12)] text-[11px] font-extrabold text-[hsl(var(--primary))]"
          data-tauri-drag-region
        >
          W
        </span>
        <span
          className="truncate text-xs font-bold uppercase tracking-[0.18em] text-app-muted"
          data-tauri-drag-region
        >
          Whispr
        </span>
      </div>

      <div className="flex h-full shrink-0 items-center">
        <ChromeButton
          aria-label="Minimize window"
          icon={<Minus className="h-4 w-4" />}
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
          className="hover:bg-[hsl(var(--danger))] hover:text-white"
          icon={<X className="h-4 w-4" />}
          onClick={() => {
            void runWindowAction((window) => window.close());
          }}
          title="Close"
        />
      </div>
    </div>
  );
}
