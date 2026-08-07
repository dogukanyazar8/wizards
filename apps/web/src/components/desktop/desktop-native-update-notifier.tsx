"use client";

import { useState } from "react";
import { CircleAlert, LoaderCircle, ShieldCheck } from "lucide-react";
import { useI18n } from "@/components/providers/locale-provider";
import {
  launchDesktopControlSection,
  type DesktopControlLaunchState,
} from "@/components/desktop/desktop-control-launch";
import { openDesktopControl } from "@/lib/desktop/controls";

export function DesktopNativeUpdateNotifier() {
  const { t } = useI18n();
  const [state, setState] = useState<DesktopControlLaunchState>("idle");

  const pending = state === "pending";
  const error = state === "error";
  const label = t(
    error
      ? "desktop.control.openError"
      : pending
        ? "desktop.control.opening"
        : "desktop.control.label",
  );

  return (
    <button
      aria-label={error ? label : t("desktop.control.openUpdates")}
      className="inline-flex h-7 max-w-[190px] items-center gap-1.5 rounded-xl border border-[hsl(var(--primary)/0.24)] bg-[hsl(var(--primary)/0.1)] px-2.5 text-[11px] font-black text-[hsl(var(--primary))] shadow-[0_8px_22px_hsl(var(--primary)/0.08)] transition hover:border-[hsl(var(--primary)/0.42)] hover:bg-[hsl(var(--primary)/0.14)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:cursor-wait disabled:opacity-65"
      disabled={pending}
      onClick={() => {
        void launchDesktopControlSection("updates", openDesktopControl, setState);
      }}
      title={t(error ? "desktop.control.openError" : "desktop.control.openUpdates")}
      type="button"
    >
      {pending ? (
        <LoaderCircle aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
      ) : error ? (
        <CircleAlert aria-hidden="true" className="h-3.5 w-3.5" />
      ) : (
        <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />
      )}
      <span aria-live="polite" className="truncate">
        {label}
      </span>
    </button>
  );
}
