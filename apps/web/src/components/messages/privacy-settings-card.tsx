"use client";

import React, { useId } from "react";
import { CheckCheck, Lock, PenLine } from "lucide-react";
import type { ConversationPrivacy } from "@wizards/types";

import { useI18n } from "@/components/providers/locale-provider";
import { MESSAGES_METRICS, hairline, pxToRem } from "@/lib/messages/metrics";
import { cn } from "@/lib/utils";

/**
 * `GİZLİLİK VE GÜVENLİK` — SPEC-MESAJLAR §15.5.2.
 *
 * Tek kart, üç bölmeli satır. **Karar K2:** ilk satır tasarımda `Uçtan uca
 * şifreli · Anahtar doğrulandı · 21 Ağu` yazıyor; üründe uçtan uca şifreleme
 * **yok** (şemada anahtar ya da cihaz modeli bulunmuyor). Ölçü, ikon karosu,
 * yeşil zemin ve `Aktif` pill'i tasarımdaki gibi kalır; metin aktarım
 * şifrelemesini söyler. Sapma `lib/messages/metrics.ts` dosyasının başındaki
 * sapma listesinde kayıtlıdır.
 *
 * **İki anahtar hesap genelidir, sohbet başına değil.** Kart bir sohbet panelinde
 * duruyor ama okundu bilgisini burada kapatmak onu her yerde kapatır — Ayarlar
 * ekranındaki satırın yaptığı şeyin aynısı. `MESSAGING_PRIVACY_QUERY_KEY` bu
 * yüzden **paylaşılan** anahtardır: iki yüzey aynı önbellek satırını okur, biri
 * yazınca diğeri kendiliğinden doğru olur.
 */

const { profilePanel, shadow } = MESSAGES_METRICS;

/**
 * `/api/v1/users/me/privacy` önbellek anahtarı.
 *
 * Kökü `["user", …]`: `lib/settings/client.ts` içindeki `settingsQueryKeys` aynı
 * kökü kullanıyor ve oradaki `mentions` satırı ("Ayarlar sayfası ile bahsetme
 * modalı — tek anahtar, tek önbellek") bu paylaşımın emsalidir. Ayarlar
 * ekranının `g6` satırı bugün hiçbir uca bağlı **değil**
 * (`components/settings/sections/account/account-surface.ts` içinde `TODO(api)`
 * olarak duruyor); bağlandığında **bu** anahtarı kullanmalı, ikinci bir anahtar
 * açmamalı — yoksa aynı tercih iki yerde iki farklı değer gösterir.
 */
export const MESSAGING_PRIVACY_QUERY_KEY = ["user", "messaging-privacy"] as const;

/**
 * Üç satırın **ortak** ızgarası: 30px ikon kolonu · esneyen metin · en az anahtar
 * genişliğinde kontrol kolonu.
 *
 * SPEC bunu ayrıca kabul kriterine koyuyor ("ikon kolonu ve kontrol kolonu üç
 * satırda da aynı hizada"). Üç satırı ayrı ayrı padding'leyip gözle tutturmak
 * `Aktif` pill'i ile 40px anahtarın genişliği farklı olduğu anda bozulur; tek bir
 * ızgara dizesi bozulamaz. `subgrid` **kullanılmıyor**: proje browserslist'i
 * Chrome 111'i destekliyor, `subgrid` Chrome 117'de geldi.
 */
export const PRIVACY_ROW_GRID_TEMPLATE = `${pxToRem(profilePanel.privacyTileSize)} minmax(0, 1fr) minmax(${pxToRem(
  profilePanel.switchWidth,
)}, auto)`;

/** Her satırın birebir aynı kutu ölçüsü — hizanın tek kaynağı. */
export const privacyRowStyle: Readonly<React.CSSProperties> = Object.freeze({
  alignItems: "center",
  columnGap: pxToRem(profilePanel.privacyRowGap),
  display: "grid",
  gridTemplateColumns: PRIVACY_ROW_GRID_TEMPLATE,
  minHeight: pxToRem(profilePanel.privacyRowMinHeight),
  padding: `${pxToRem(profilePanel.privacyRowPaddingY)} ${pxToRem(profilePanel.privacyRowPaddingX)}`,
});

export type PrivacyToggleKey = keyof ConversationPrivacy;

/**
 * Açık satırın ikon karosu primary, kapalının sönük (§15.5.2 son paragraf).
 * Karo anahtarla **aynı** render'da döner — iyimser güncelleme sayesinde ağ
 * beklenmez, yani göz için anında.
 */
export function privacyTileTone(active: boolean): { background: string; color: string } {
  return active
    ? { background: "hsl(var(--primary)/0.14)", color: "hsl(var(--primary))" }
    : { background: "hsl(var(--surface-soft))", color: "hsl(var(--text-muted))" };
}

type PrivacyRowDescriptor = {
  readonly a11yKey: string;
  readonly key: PrivacyToggleKey;
  readonly subtitleKey: string;
  readonly titleKey: string;
};

export const PRIVACY_ROWS: readonly PrivacyRowDescriptor[] = Object.freeze([
  {
    a11yKey: "messages.profile.a11y.readReceipts",
    key: "readReceipts",
    subtitleKey: "messages.profile.privacy.readReceipts.subtitle",
    titleKey: "messages.profile.privacy.readReceipts.title",
  },
  {
    a11yKey: "messages.profile.a11y.typing",
    key: "typingIndicator",
    subtitleKey: "messages.profile.privacy.typing.subtitle",
    titleKey: "messages.profile.privacy.typing.title",
  },
] satisfies readonly PrivacyRowDescriptor[]);

function RowText({
  subtitle,
  subtitleId,
  title,
}: {
  subtitle: string;
  subtitleId: string;
  title: string;
}) {
  return (
    <span className="min-w-0">
      <span
        className="block text-[hsl(var(--foreground))]"
        style={{
          fontSize: pxToRem(profilePanel.privacyTitleFontSize),
          fontWeight: 600,
          lineHeight: 1.2,
        }}
      >
        {title}
      </span>
      <span
        className="block truncate text-[hsl(var(--text-muted))]"
        id={subtitleId}
        style={{
          fontSize: pxToRem(profilePanel.privacySubFontSize),
          lineHeight: profilePanel.privacySubLineHeight,
          marginTop: pxToRem(profilePanel.privacySubMarginTop),
        }}
      >
        {subtitle}
      </span>
    </span>
  );
}

function IconTile({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: { background: string; color: string };
}) {
  return (
    <span
      aria-hidden="true"
      className="grid place-items-center transition-colors"
      style={{
        background: tone.background,
        borderRadius: pxToRem(profilePanel.privacyTileRadius),
        color: tone.color,
        height: pxToRem(profilePanel.privacyTileSize),
        width: pxToRem(profilePanel.privacyTileSize),
      }}
    >
      {children}
    </span>
  );
}

type PrivacySwitchProps = {
  checked: boolean;
  describedById: string;
  disabled: boolean;
  label: string;
  onChange: (next: boolean) => void;
  testId: string;
};

/**
 * 40×24 anahtar — §15.5.2.
 *
 * `motion-safe:` sınıfı `prefers-reduced-motion: reduce` açıkken topuzun `left`
 * geçişini **tamamen** kapatır; hareketi JavaScript'ten okuyup dallanmak yerine
 * CSS'e bırakmak, tercihi oturum ortasında değiştiren kullanıcıyı da kapsar.
 */
function PrivacySwitch({
  checked,
  describedById,
  disabled,
  label,
  onChange,
  testId,
}: PrivacySwitchProps) {
  return (
    <button
      aria-checked={checked}
      aria-describedby={describedById}
      aria-label={label}
      className={cn(
        "relative shrink-0 justify-self-end transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
        checked ? "bg-[hsl(var(--primary))]" : "bg-[hsl(var(--surface-tertiary))]",
        disabled && "cursor-not-allowed opacity-50",
      )}
      data-testid={testId}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      role="switch"
      style={{
        borderRadius: pxToRem(999),
        height: pxToRem(profilePanel.switchHeight),
        width: pxToRem(profilePanel.switchWidth),
      }}
      type="button"
    >
      <span
        aria-hidden="true"
        className="absolute rounded-full bg-white motion-safe:transition-[left]"
        style={{
          boxShadow: `0 ${pxToRem(shadow.toggleKnob.offsetY)} ${pxToRem(
            shadow.toggleKnob.blur,
          )} hsl(var(--shadow-color)/${shadow.toggleKnob.alpha})`,
          height: pxToRem(profilePanel.switchKnobSize),
          left: pxToRem(
            checked ? profilePanel.switchKnobOffsetOn : profilePanel.switchKnobOffsetOff,
          ),
          top: pxToRem(profilePanel.switchKnobTop),
          transitionDuration: "0.18s",
          width: pxToRem(profilePanel.switchKnobSize),
        }}
      />
    </button>
  );
}

export type PrivacySettingsCardProps = {
  /** Bekleyen yazma sırasında anahtar tıklanamaz olur; satır gizlenmez. */
  disabled?: boolean;
  onToggle: (key: PrivacyToggleKey, next: boolean) => void;
  value: ConversationPrivacy;
};

export function PrivacySettingsCard({
  disabled = false,
  onToggle,
  value,
}: PrivacySettingsCardProps) {
  const { t } = useI18n();
  const idPrefix = useId();
  const encryptionSubtitleId = `${idPrefix}-encryption`;

  return (
    <div
      className="overflow-hidden bg-[hsl(var(--surface-card))]"
      data-testid="profile-privacy-card"
      style={{
        borderColor: "hsl(var(--border)/0.6)",
        borderRadius: pxToRem(profilePanel.privacyCardRadius),
        borderStyle: "solid",
        borderWidth: hairline(),
        marginTop: pxToRem(profilePanel.privacyCardMarginTop),
      }}
    >
      {/*
        Şifreleme satırı bir tercih değil, bir **durum**: kontrolü salt okunur bir
        pill, düğme değil. Kapatılamayan bir şeyi düğme gibi çizmek, kapatılabilir
        sanan birine yalan söylemektir.
      */}
      <div
        data-testid="profile-privacy-row-encryption"
        style={{ ...privacyRowStyle, background: "hsl(var(--success)/0.09)" }}
      >
        <IconTile tone={{ background: "hsl(var(--success)/0.18)", color: "hsl(var(--success))" }}>
          <Lock
            style={{
              height: pxToRem(profilePanel.privacyIconSize),
              width: pxToRem(profilePanel.privacyIconSize),
            }}
          />
        </IconTile>
        <RowText
          subtitle={t("messages.profile.privacy.encryption.subtitle")}
          subtitleId={encryptionSubtitleId}
          title={t("messages.profile.privacy.encryption.title")}
        />
        <span
          className="justify-self-end whitespace-nowrap text-[hsl(var(--success))]"
          data-testid="profile-privacy-encryption-state"
          style={{
            background: "hsl(var(--success)/0.16)",
            borderRadius: pxToRem(999),
            fontSize: pxToRem(profilePanel.privacyStatePillFontSize),
            fontWeight: 600,
            letterSpacing: profilePanel.privacyStatePillTracking,
            lineHeight: 1.3,
            padding: `${pxToRem(profilePanel.privacyStatePillPaddingY)} ${pxToRem(
              profilePanel.privacyStatePillPaddingX,
            )}`,
          }}
        >
          {t("messages.profile.privacy.encryption.state")}
        </span>
      </div>

      {PRIVACY_ROWS.map((row) => {
        const checked = value[row.key];
        const subtitleId = `${idPrefix}-${row.key}`;

        return (
          <div
            data-testid={`profile-privacy-row-${row.key}`}
            key={row.key}
            style={{
              ...privacyRowStyle,
              borderTopColor: "hsl(var(--border)/0.5)",
              borderTopStyle: "solid",
              borderTopWidth: hairline(),
            }}
          >
            <IconTile tone={privacyTileTone(checked)}>
              {row.key === "readReceipts" ? (
                <CheckCheck
                  style={{
                    height: pxToRem(profilePanel.privacyIconSize),
                    width: pxToRem(profilePanel.privacyIconSize),
                  }}
                />
              ) : (
                <PenLine
                  style={{
                    height: pxToRem(profilePanel.privacyIconSize),
                    width: pxToRem(profilePanel.privacyIconSize),
                  }}
                />
              )}
            </IconTile>
            <RowText
              subtitle={t(row.subtitleKey)}
              subtitleId={subtitleId}
              title={t(row.titleKey)}
            />
            <PrivacySwitch
              checked={checked}
              describedById={subtitleId}
              disabled={disabled}
              label={t(row.a11yKey)}
              onChange={(next) => onToggle(row.key, next)}
              testId={`profile-privacy-toggle-${row.key}`}
            />
          </div>
        );
      })}
    </div>
  );
}
