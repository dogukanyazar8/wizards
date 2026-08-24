"use client";

import React, { useId } from "react";

import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { MENTIONS_METRICS, pxToRem } from "@/lib/mentions/metrics";

/**
 * Ayarlar modalının anahtar satırı — SPEC §7.
 *
 * Anahtar mevcut `ToggleSwitch`: `role="switch"` ve `aria-checked` oradan gelir. Ölçüleri de
 * uyuyor (44×26, knob 20, iç boşluk 3) — Mesajlar sözlüğündeki değerler Bahsedilmeler
 * sözlüğüyle **birebir aynı**, o yüzden bileşen çatallanmadı.
 *
 * Başlık ve alt metin `aria-labelledby` / `aria-describedby` ile anahtara bağlanır: görünür
 * etiketi olan bir denetime ayrıca `aria-label` yazmak, ekran okuyucunun görünen metinden
 * farklı bir şey okuması demektir.
 */

const { settingsModal } = MENTIONS_METRICS;

export type MentionSettingsRowProps = {
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly subtitle: string;
  readonly testId?: string;
  readonly title: string;
};

export function MentionSettingsRow({
  checked,
  disabled = false,
  onChange,
  subtitle,
  testId,
  title,
}: MentionSettingsRowProps) {
  const titleId = useId();
  const subtitleId = useId();

  return (
    <div
      className="flex items-center"
      data-testid={testId ?? "mention-settings-row"}
      style={{ gap: pxToRem(settingsModal.toggleRowGap) }}
    >
      <div className="min-w-0 flex-1">
        <p
          className="text-[hsl(var(--foreground))]"
          id={titleId}
          style={{
            fontSize: pxToRem(settingsModal.toggleTitleFontSize),
            fontWeight: settingsModal.toggleTitleWeight,
            lineHeight: settingsModal.toggleTitleLineHeight,
            margin: 0,
          }}
        >
          {title}
        </p>
        <p
          className="text-[hsl(var(--text-muted))]"
          id={subtitleId}
          style={{
            fontSize: pxToRem(settingsModal.toggleSubtitleFontSize),
            lineHeight: settingsModal.toggleSubtitleLineHeight,
            margin: `${pxToRem(settingsModal.toggleSubtitleMarginTop)} 0 0`,
          }}
        >
          {subtitle}
        </p>
      </div>

      <ToggleSwitch
        checked={checked}
        describedById={subtitleId}
        disabled={disabled}
        label={title}
        labelledById={titleId}
        onChange={onChange}
        {...(testId ? { testId: `${testId}-switch` } : {})}
      />
    </div>
  );
}
