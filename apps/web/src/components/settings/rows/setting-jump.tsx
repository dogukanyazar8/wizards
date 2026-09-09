"use client";

import React from "react";

import type { SettingsSection, SettingsTab } from "@/lib/settings/navigation";

import { SettingActionButton } from "./setting-actions";

/**
 * Atlama satırı — SPEC-AYARLAR §4.4 (`jump`).
 *
 * Bir düğme, başka bir alt sekmeye geçirir. Hedef **ağaçtan** gelir (`row.target`), çağrı
 * yerinden değil: hedefi elle yazan bir satır, sekme anahtarı değiştiğinde sessizce hiçbir yere
 * gitmeyen bir düğme bırakırdı.
 *
 * `<a href>` değil `<button>`: geçiş aynı pencerenin içindeki sekme değişimi ve URL'i kabuk
 * (`router.replace`) yazıyor; bir bağlantı sağ tık menüsünde "yeni sekmede aç" vaat eder ve o
 * vaat modal içinde tutulamaz.
 */

export type SettingJumpProps = {
  readonly describedById?: string | undefined;
  readonly label: string;
  readonly onJump: (target: { section: SettingsSection; tab: SettingsTab }) => void;
  readonly target: { section: SettingsSection; tab: SettingsTab };
  readonly testId?: string;
};

export function SettingJump({ describedById, label, onJump, target, testId }: SettingJumpProps) {
  return (
    <SettingActionButton
      describedById={describedById}
      entry={{ label, onClick: () => onJump(target) }}
      testId={testId}
    />
  );
}
