"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { ExternalLink } from "lucide-react";
import { getDesktopAdminConsoleOpen, setDesktopAdminConsoleVisible } from "@/lib/desktop/controls";
import { isWhisprDesktopRuntime } from "@/lib/desktop/runtime";
import { useAdminSurface } from "@/components/admin/shell/admin-console-surface";

/** The desktop flag is injected before hydration and never changes afterwards. */
const subscribeToDesktopRuntime = () => () => {};

/**
 * F8 entry point. Renders only inside the desktop app, and never inside the
 * console window itself — a window that could detach a copy of itself is how
 * moderators end up with two consoles and one queue.
 */
export function AdminConsoleDetachButton() {
  const surface = useAdminSurface();
  const isDesktop = useSyncExternalStore(
    subscribeToDesktopRuntime,
    isWhisprDesktopRuntime,
    () => false,
  );
  const [isOpen, setIsOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isDesktop) {
      return;
    }

    // The native side owns the window, so the label starts from what it says
    // rather than from a guess this component keeps.
    void getDesktopAdminConsoleOpen().then(setIsOpen, () => setIsOpen(false));
  }, [isDesktop]);

  if (!isDesktop || surface === "console") {
    return null;
  }

  const toggle = async () => {
    setBusy(true);
    try {
      const next = !isOpen;
      await setDesktopAdminConsoleVisible(next);
      setIsOpen(next);
    } catch {
      // The window either opened or it did not; the next click asks again.
      setIsOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      className="text-app-muted hover:bg-[hsl(var(--surface-soft))] flex items-center gap-1.5 rounded-[10px] border border-[hsl(var(--border)/0.7)] px-2.5 py-1.5 text-[12px] font-semibold disabled:opacity-60"
      data-testid="admin-console-detach"
      disabled={busy}
      onClick={() => void toggle()}
      type="button"
    >
      <ExternalLink size={14} strokeWidth={2} />
      {isOpen ? "Konsolu kapat" : "Konsolu ayır"}
    </button>
  );
}
