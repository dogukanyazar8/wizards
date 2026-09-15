"use client";

import React from "react";

import { Modal } from "@/components/ui/modal";
import {
  useAppShortcutAccessibleLabels,
  useAppShortcutLabels,
} from "@/hooks/use-app-shortcut-label";
import {
  APP_SHORTCUT_CATALOG,
  APP_SHORTCUT_IDS,
  type AppShortcutId,
} from "@/lib/shortcuts/catalog";
import { useI18n } from "@/components/providers/locale-provider";

const CATEGORY_ORDER = [
  "navigation",
  "voice",
  "message",
  "composer",
  "mentions",
  "accessibility",
] as const;

const CATEGORY_LABEL_KEYS = {
  accessibility: "shortcuts.category.accessibility",
  composer: "shortcuts.category.composer",
  mentions: "shortcuts.category.mentions",
  message: "shortcuts.category.message",
  navigation: "shortcuts.category.navigation",
  voice: "shortcuts.category.voice",
} as const;

function ShortcutRow({ id }: { id: AppShortcutId }) {
  const { t } = useI18n();
  const labels = useAppShortcutLabels(id);
  const accessibleLabels = useAppShortcutAccessibleLabels(id);
  const shortcut = APP_SHORTCUT_CATALOG[id];

  return (
    <li className="flex items-center justify-between gap-4 py-2.5">
      <span className="text-sm text-app-foreground">{t(shortcut.labelKey)}</span>
      <span className="flex shrink-0 flex-wrap justify-end gap-1.5">
        {labels.map((label, index) => (
          <kbd
            aria-label={accessibleLabels[index]}
            className="rounded-md border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.7)] px-2 py-1 [font-family:inherit] text-xs font-semibold text-app-foreground shadow-sm"
            key={label}
          >
            {label}
          </kbd>
        ))}
      </span>
    </li>
  );
}

export function ShortcutHelpDialog({ onClose, open }: { onClose: () => void; open: boolean }) {
  const { t } = useI18n();

  return (
    <Modal
      className="max-w-2xl"
      closeLabel={t("shortcuts.help.close")}
      description={t("shortcuts.help.description")}
      onClose={onClose}
      open={open}
      title={t("shortcuts.help.title")}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        {CATEGORY_ORDER.map((category) => {
          const ids = APP_SHORTCUT_IDS.filter(
            (id) => APP_SHORTCUT_CATALOG[id].category === category,
          );

          return (
            <section key={category}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-app-muted">
                {t(CATEGORY_LABEL_KEYS[category])}
              </h3>
              <ul className="mt-1 divide-y divide-[hsl(var(--border)/0.45)]">
                {ids.map((id) => (
                  <ShortcutRow id={id} key={id} />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </Modal>
  );
}
