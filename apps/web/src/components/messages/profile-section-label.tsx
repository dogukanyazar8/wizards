"use client";

// Değer olarak içe aktarılıyor, yalnız tip olarak değil: `tsconfig` `jsx: "preserve"` diyor ve
// `node --test --import tsx` klasik dönüşümü kullanıyor, yani JSX `React.createElement`e
// derleniyor. Tip import'uyla bu dosya sunucuda hiç çizilemiyordu (`React is not defined`) ve
// onu kullanan her profil bölümü test edilemez hâle geliyordu. Next'in derleyicisi için gereksiz,
// test koşucusu için şart (emsal: `ui/skeleton.tsx`, `providers/account-preference-provider.tsx`).
import React from "react";

import { DISPLAY_FONT } from "@/components/home/home-primitives";
import { MESSAGES_METRICS, pxToRem } from "@/lib/messages/metrics";
import { cn } from "@/lib/utils";

const { profilePanel } = MESSAGES_METRICS;

export type ProfileSectionLabelProps = {
  /**
   * Right-hand counter (`ROZETLER 6 / 16`, `ORTAK SUNUCULAR 3`). A string rather than a
   * number because §15.3.2's badge counter is a fraction, not a count.
   */
  count?: string | undefined;
  /** Optional trailing hairline that fills the row — §15.4 and §16 draw one, §15.3 does not. */
  rule?: boolean;
  children: React.ReactNode;
};

/**
 * SPEC-MESAJLAR §15.3 — the uppercase section heading the profile panel repeats a dozen
 * times (`HAKKINDA`, `ROZETLER`, `ORTAK SUNUCULAR`, `PAYLAŞILAN MEDYA`, `GİZLİLİK VE
 * GÜVENLİK`, …).
 *
 * One component rather than a dozen inline spans: the label is uppercased **in CSS**, so
 * the dictionary holds normal-case Turkish (`Rozetler`) and a locale whose casing rules
 * differ — Turkish dotted/dotless I among them — is the browser's problem to get right,
 * not the translator's. Twelve hand-written spans would also be twelve chances to drift
 * the 0.14em tracking that `metrics.ts` records as a deviation from the SPEC's 0.15em.
 */
export function ProfileSectionLabel({ children, count, rule = false }: ProfileSectionLabelProps) {
  return (
    <div
      className="flex items-center text-[hsl(var(--text-muted))]"
      style={{ gap: pxToRem(profilePanel.sectionLabelGap) }}
    >
      <span
        className={cn("whitespace-nowrap uppercase", DISPLAY_FONT)}
        style={{
          fontSize: pxToRem(profilePanel.sectionLabelFontSize),
          fontWeight: 600,
          letterSpacing: profilePanel.sectionLabelTracking,
          lineHeight: 1,
        }}
      >
        {children}
      </span>
      {rule ? (
        <span aria-hidden="true" className="h-px flex-1 bg-[hsl(var(--border)/0.5)]" />
      ) : null}
      {count === undefined ? null : (
        <span
          className={cn("text-[hsl(var(--text-muted)/0.8)]", DISPLAY_FONT)}
          style={{
            fontSize: pxToRem(profilePanel.sectionCountFontSize),
            fontWeight: 600,
            lineHeight: 1,
          }}
        >
          {count}
        </span>
      )}
    </div>
  );
}
