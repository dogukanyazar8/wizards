"use client";

import React from "react";
import { Copy, Maximize2, Minimize2, Minus, Square, X } from "lucide-react";
import type { ClientPlatform } from "@wizards/ui/platform-keyboard.mjs";
import { cn } from "@/lib/utils";

export type DesktopWindowControlsProps = {
  platform: ClientPlatform;
  maximized: boolean;
  labels: { close: string; minimize: string; maximize: string };
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
};

export function DesktopWindowControls({
  platform,
  maximized,
  labels,
  onClose,
  onMinimize,
  onMaximize,
}: DesktopWindowControlsProps) {
  const mac = platform === "macos";
  const actions = {
    close: { icon: X, onClick: onClose, color: "bg-[#ff5f57]" },
    minimize: { icon: Minus, onClick: onMinimize, color: "bg-[#febc2e]" },
    maximize: {
      icon: mac ? (maximized ? Minimize2 : Maximize2) : maximized ? Copy : Square,
      onClick: onMaximize,
      color: "bg-[#28c840]",
    },
  };
  const order = mac
    ? (["close", "minimize", "maximize"] as const)
    : (["minimize", "maximize", "close"] as const);

  return (
    <div
      className="flex h-full shrink-0 items-center gap-1 px-1.5"
      data-window-controls={mac ? "macos" : "standard"}
    >
      {order.map((action) => {
        const { icon: Icon, onClick, color } = actions[action];
        return (
          <button
            aria-label={labels[action]}
            className={cn(
              "group inline-flex h-7 items-center justify-center transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.48)]",
              mac
                ? "w-7 rounded-full"
                : "w-9 rounded-lg text-app-muted hover:bg-[hsl(var(--surface-soft)/0.78)] hover:text-app-foreground",
              !mac && action === "close" && "hover:bg-[hsl(var(--danger)/0.94)] hover:text-white",
            )}
            data-window-action={action}
            key={action}
            onClick={onClick}
            title={labels[action]}
            type="button"
          >
            {mac ? (
              <span
                aria-hidden="true"
                className={cn(
                  "flex h-3 w-3 items-center justify-center rounded-full text-black/80",
                  color,
                )}
              >
                <Icon
                  className="h-2 w-2 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
                  strokeWidth={2.5}
                />
              </span>
            ) : (
              <Icon aria-hidden="true" className="h-3.5 w-3.5" />
            )}
          </button>
        );
      })}
    </div>
  );
}
