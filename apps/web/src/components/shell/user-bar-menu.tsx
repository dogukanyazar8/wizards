"use client";

import React, { useCallback, useEffect, useState } from "react";
import { LogOut, Settings } from "lucide-react";

import { useI18n } from "@/components/providers/locale-provider";
import { useVoiceState } from "@/components/providers/voice-provider";
import { UserBarDndCard } from "@/components/shell/user-bar-dnd-card";
import { UserBarDeviceRow } from "@/components/shell/user-bar-device-row";
import { UserBarInputMeter } from "@/components/shell/user-bar-input-meter";
import { useAppShortcutLabel } from "@/hooks/use-app-shortcut-label";
import { useAudioDevices } from "@/hooks/use-audio-devices";
import type { DndDuration } from "@/lib/presence/dnd";
import { SETTINGS_METRICS, hairline, pxToEm, pxToRem } from "@/lib/settings/metrics";
import { matchesAppShortcut, type AppShortcutEvent } from "@/lib/shortcuts/catalog";

/**
 * Ayarlar Ş12 — kullanıcı barındaki dişlinin açtığı 308 px menü (SPEC §3).
 *
 * Menü beş satırdır: durum · cihazlar · Ayarlar · Bildirim ayarları · Çıkış. `Boşta sayılma
 * süresi` buradan **çıktı** (K9) ve Gizlilik › Görünürlük'e taşındı; tercihin kendisi ölmedi,
 * `usePresenceIdleTimeoutPreference` artık sunucudan okuyor.
 *
 * Durum yazımı burada **yok**: anahtar ve çipler yukarı haber verir, presence yazısını
 * kullanıcı barı yapar — kullanıcı barındaki nokta ile menü arasında ikinci bir durum kaynağı
 * olmasın diye.
 */

const { actions, devices, dnd, sectionLabel, ...box } = SETTINGS_METRICS.userMenu;

/* ------------------------------------------------------------------ kısayol */

/**
 * `⌘,` / `Ctrl+,` — Ayarlar penceresinin kısayolu (§5).
 *
 * Komut paletinin `⌘K` eşleyicisiyle aynı sözleşme: yazarken susar, `Alt`/`Shift` ile birlikte
 * eşleşmez ve `metaKey` ile `ctrlKey` arasında ayrım yapmaz — platformun hangisini kullandığına
 * tuş kombinasyonu değil, **ipucu metni** karar verir.
 */
export function isSettingsShortcut(event: AppShortcutEvent): boolean {
  return matchesAppShortcut("settings.open", event);
}

/**
 * Tek dinleyici, kaç kullanıcı barı çizilirse çizilsin.
 *
 * `UserProfileFooter` aynı anda birden çok yüzeyde (kanal kenarı, gezinme paneli, mobil
 * çekmece) canlı olabiliyor; her biri kendi `keydown` dinleyicisini kursa `⌘,` tek basışta
 * pencereyi birkaç kez açmaya çalışırdı.
 */
const shortcutListeners = new Set<() => void>();
let detachShortcut: (() => void) | null = null;

function handleShortcutKeyDown(event: KeyboardEvent) {
  if (!isSettingsShortcut(event)) {
    return;
  }

  event.preventDefault();
  for (const listener of shortcutListeners) {
    listener();
  }
}

export function useSettingsShortcut(onOpen: () => void): void {
  useEffect(() => {
    shortcutListeners.add(onOpen);

    if (detachShortcut === null) {
      window.addEventListener("keydown", handleShortcutKeyDown);
      detachShortcut = () => window.removeEventListener("keydown", handleShortcutKeyDown);
    }

    return () => {
      shortcutListeners.delete(onOpen);

      if (shortcutListeners.size === 0) {
        detachShortcut?.();
        detachShortcut = null;
      }
    };
  }, [onOpen]);
}

/**
 * İpucu metni platformdan okunur; sabit `⌘` gömülmez (§5).
 *
 * Sunucuda platform bilinmez: tarafsız `Ctrl/Cmd+,`, istemcide gerçek platform gösterilir.
 */
export function useSettingsShortcutChip(): string {
  return useAppShortcutLabel("settings.open");
}

/* ------------------------------------------------------------------- bileşen */

export type UserBarMenuProps = {
  readonly dndActive: boolean;
  readonly dndDuration: DndDuration | null;
  readonly dndPending?: boolean;
  readonly logoutPending?: boolean;
  readonly onLogout: () => void;
  readonly onOpenSettings: () => void;
  readonly onSelectDndDuration: (duration: DndDuration) => void;
  readonly onToggleDnd: () => void;
};

function SectionLabel({ children, trailing }: { children: string; trailing?: string }) {
  return (
    <div
      className="flex items-center"
      style={{ gap: pxToRem(sectionLabel.gap), paddingBottom: pxToRem(sectionLabel.paddingBottom) }}
    >
      <span
        className="uppercase"
        style={{
          color: "hsl(var(--text-muted))",
          fontFamily: "var(--font-display)",
          fontSize: pxToRem(sectionLabel.fontSize),
          fontWeight: sectionLabel.weight,
          letterSpacing: `${sectionLabel.tracking}em`,
          lineHeight: 1,
        }}
      >
        {children}
      </span>
      <span
        aria-hidden="true"
        className="flex-1"
        style={{ background: "hsl(var(--border) / 0.5)", height: hairline() }}
      />
      {trailing ? (
        <span
          style={{
            color: `hsl(var(--text-muted) / ${sectionLabel.trailingAlpha})`,
            fontSize: pxToRem(sectionLabel.trailingFontSize),
            fontWeight: 500,
            lineHeight: 1,
          }}
        >
          {trailing}
        </span>
      ) : null}
    </div>
  );
}

function Divider() {
  return (
    <div
      aria-hidden="true"
      style={{ background: `hsl(var(--border) / ${box.dividerAlpha})`, height: hairline() }}
    />
  );
}

function ActionRow({
  danger = false,
  disabled = false,
  icon,
  kbd,
  label,
  onClick,
  testId,
}: {
  danger?: boolean;
  disabled?: boolean;
  icon: React.ReactNode;
  kbd?: string;
  label: string;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      className={`flex w-full items-center bg-transparent text-left transition disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.45)] ${danger ? "hover:bg-[hsl(var(--danger)/0.1)]" : "hover:bg-[var(--surface-hover)]"}`}
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      style={{
        // Zemin **sınıftan** iniyor (`bg-transparent`), satır içinden değil: satır içi bir
        // `background`, `hover:bg-*` kuralının ezemeyeceği tek şeydir ve vurguyu öldürür.
        border: 0,
        borderRadius: pxToRem(actions.rowRadius),
        gap: pxToRem(actions.rowGap),
        padding: pxToRem(actions.rowPadding),
      }}
      type="button"
    >
      <span
        className="grid flex-none place-items-center"
        style={{
          background: danger
            ? `hsl(var(--danger) / ${actions.dangerIconSurfaceAlpha})`
            : "hsl(var(--surface-soft))",
          borderRadius: pxToRem(actions.iconRadius),
          color: `hsl(var(--${danger ? "danger" : "text-secondary"}))`,
          height: pxToRem(actions.iconSize),
          width: pxToRem(actions.iconSize),
        }}
      >
        {icon}
      </span>
      <span
        className="min-w-0 flex-1 truncate"
        style={{
          color: `hsl(var(--${danger ? "danger" : "foreground"}))`,
          fontSize: pxToRem(actions.labelFontSize),
          fontWeight: 600,
          lineHeight: actions.labelLineHeight,
        }}
      >
        {label}
      </span>
      {kbd ? (
        <span
          aria-hidden="true"
          className="flex-none"
          style={{
            background: "hsl(var(--surface-tertiary))",
            borderRadius: pxToRem(actions.kbdRadius),
            color: "hsl(var(--text-muted))",
            fontFamily: "var(--font-display)",
            fontSize: pxToRem(actions.kbdFontSize),
            fontWeight: 600,
            lineHeight: 1.4,
            padding: `${pxToRem(actions.kbdPaddingY)} ${pxToRem(actions.kbdPaddingX)}`,
          }}
        >
          {kbd}
        </span>
      ) : null}
    </button>
  );
}

export function UserBarMenu({
  dndActive,
  dndDuration,
  dndPending = false,
  logoutPending = false,
  onLogout,
  onOpenSettings,
  onSelectDndDuration,
  onToggleDnd,
}: UserBarMenuProps) {
  const { t } = useI18n();
  const shortcutChip = useSettingsShortcutChip();
  const { audioPreferences, setAudioPreference } = useVoiceState();
  const { inputDevices, outputDevices, supportsOutputSelection } = useAudioDevices();

  /** Aynı anda tek cihaz listesi açık (§3). */
  const [openDeviceList, setOpenDeviceList] = useState<"input" | "output" | null>(null);

  const toggleDeviceList = useCallback((kind: "input" | "output") => {
    setOpenDeviceList((current) => (current === kind ? null : kind));
  }, []);

  return (
    <div
      className="flex flex-col"
      data-testid="user-bar-menu"
      style={{
        background: "hsl(var(--surface-card))",
        border: `${hairline()} solid hsl(var(--border))`,
        borderRadius: pxToRem(box.radius),
      }}
    >
      <div
        style={{
          padding: `${pxToRem(dnd.sectionPaddingTop)} ${pxToRem(dnd.sectionPaddingX)} ${pxToRem(dnd.sectionPaddingBottom)}`,
        }}
      >
        <SectionLabel>{t("settings.userMenu.section.status")}</SectionLabel>
        <UserBarDndCard
          active={dndActive}
          duration={dndDuration}
          onSelectDuration={onSelectDndDuration}
          onToggle={onToggleDnd}
          pending={dndPending}
        />
      </div>

      <Divider />

      <div
        style={{
          padding: `${pxToRem(devices.sectionPaddingY)} ${pxToRem(devices.sectionPaddingX)}`,
        }}
      >
        <SectionLabel trailing={t("settings.userMenu.section.thisDevice")}>
          {t("settings.userMenu.section.devices")}
        </SectionLabel>

        <div className="flex flex-col" style={{ gap: pxToRem(devices.rowGap) }}>
          <UserBarDeviceRow
            devices={inputDevices}
            kind="input"
            onSelect={(deviceId) => {
              setAudioPreference("inputDeviceId", deviceId);
              setOpenDeviceList(null);
            }}
            onToggle={() => toggleDeviceList("input")}
            open={openDeviceList === "input"}
            selectedDeviceId={audioPreferences.inputDeviceId}
          />

          {/* `setSinkId` olmayan tarayıcıda çıkış cihazı **seçilemez**; satır yerinde kalır ama
              açılmaz ve nedenini kendi değerinde söyler (ses ayarlarıyla aynı metin). */}
          <UserBarDeviceRow
            devices={outputDevices}
            disabled={!supportsOutputSelection}
            disabledValue={t("voice.devices.outputUnsupported")}
            kind="output"
            onSelect={(deviceId) => {
              setAudioPreference("outputDeviceId", deviceId);
              setOpenDeviceList(null);
            }}
            onToggle={() => toggleDeviceList("output")}
            open={openDeviceList === "output"}
            selectedDeviceId={audioPreferences.outputDeviceId}
          />
        </div>

        <UserBarInputMeter deviceId={audioPreferences.inputDeviceId} />
      </div>

      <Divider />

      <div
        className="flex flex-col"
        style={{ gap: pxToRem(actions.gap), padding: pxToRem(actions.padding) }}
      >
        <ActionRow
          icon={
            <Settings
              aria-hidden="true"
              style={{
                height: pxToEm(actions.iconGlyphSize),
                width: pxToEm(actions.iconGlyphSize),
              }}
            />
          }
          kbd={shortcutChip}
          label={t("settings.userMenu.action.settings")}
          onClick={onOpenSettings}
          testId="user-appearance-settings-button"
        />

        <ActionRow
          danger
          disabled={logoutPending}
          icon={
            <LogOut
              aria-hidden="true"
              style={{
                height: pxToEm(actions.iconGlyphSize),
                width: pxToEm(actions.iconGlyphSize),
              }}
            />
          }
          label={t("settings.userMenu.action.logout")}
          onClick={onLogout}
          testId="user-logout-button"
        />
      </div>
    </div>
  );
}
