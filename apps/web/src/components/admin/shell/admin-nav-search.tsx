"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useAppShortcutAriaKeyShortcuts,
  useAppShortcutLabel,
} from "@/hooks/use-app-shortcut-label";

export type AdminNavSearchItem = {
  href: string;
  key: string;
  label: string;
};

export function findAdminNavMatches(query: string, items: readonly AdminNavSearchItem[]) {
  const normalizedQuery = query.trim().toLocaleLowerCase("tr-TR");

  if (!normalizedQuery) {
    return [...items];
  }

  return items.filter((item) => item.label.toLocaleLowerCase("tr-TR").includes(normalizedQuery));
}

export function AdminNavSearch({ items }: { items: AdminNavSearchItem[] }) {
  const shortcut = useAppShortcutLabel("commandPalette.toggle");
  const ariaShortcut = useAppShortcutAriaKeyShortcuts("commandPalette.toggle");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const matches = useMemo(() => findAdminNavMatches(query, items), [items, query]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  function navigate(href: string) {
    router.push(href);
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="relative w-full max-w-[440px]">
      <label className="app-panel-soft flex h-10 items-center gap-2 rounded-[12px] border px-3">
        <Search className="text-app-soft shrink-0" size={16} />
        <input
          aria-controls="admin-module-results"
          aria-keyshortcuts={ariaShortcut}
          aria-expanded={open}
          className="min-w-0 flex-1 bg-transparent text-[13px] text-app-foreground outline-hidden placeholder:text-app-soft"
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && matches[0]) {
              event.preventDefault();
              navigate(matches[0].href);
            }
          }}
          placeholder="Modüle git…"
          ref={inputRef}
          value={query}
        />
        <span className="text-app-soft inline-flex items-center gap-1 text-[11px] font-semibold">
          {shortcut}
        </span>
      </label>
      {open ? (
        <div
          className="app-overlay absolute left-0 right-0 top-12 z-20 rounded-[12px] border p-1.5 shadow-[0_16px_38px_hsl(var(--shadow-color)/0.16)]"
          id="admin-module-results"
          role="listbox"
        >
          {matches.length === 0 ? (
            <p className="text-app-muted px-3 py-2 text-[12px]">Modül bulunamadı.</p>
          ) : (
            matches.map((item) => (
              <button
                className="text-app-foreground flex w-full items-center rounded-[9px] px-3 py-2 text-left text-[12.5px] font-semibold hover:bg-[var(--surface-hover)]"
                key={item.key}
                onClick={() => navigate(item.href)}
                role="option"
                type="button"
              >
                {item.label}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
