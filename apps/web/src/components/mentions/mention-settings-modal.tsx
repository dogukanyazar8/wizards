"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Moon } from "lucide-react";
import {
  MENTION_SETTINGS_DEFAULTS,
  type MentionDesktopMode,
  type MentionSettings,
  type MentionSettingsPatch,
} from "@wizards/types";

import { MentionSettingsRow } from "@/components/mentions/mention-settings-row";
import { useI18n } from "@/components/providers/locale-provider";
import { Modal } from "@/components/ui/modal";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { MENTIONS_METRICS, hairline, pxToRem } from "@/lib/mentions/metrics";
import {
  fetchMentionSettings,
  patchMentionSettings,
  settingsQueryKeys,
} from "@/lib/settings/client";

/**
 * Bahsetme bildirimleri modalı — SPEC §7, karar K6.
 *
 * Değerler Ş4'ün ucundan gelir ve **Ayarlar sayfasıyla aynı sorgu anahtarını** paylaşır
 * (`settingsQueryKeys.mentions`): iki yüzey aynı anahtarı okuduğu için biri kaydettiğinde
 * diğeri kendiliğinden tazelenir. İki ayrı anahtar, aynı ayarın iki farklı değerini gösteren
 * iki ekran demekti.
 *
 * **İyimser güncelleme yok.** Bir bildirim ayarı sessizce yanlış kaydedilirse kullanıcı bunu
 * ancak beklediği bildirim gelmediğinde fark eder; o yüzden `Kaydet` yanıtı beklenir ve hata
 * satır içinde kalır, değerler geri sarılmaz.
 *
 * `suppressRoleMentions` / `suppressEveryoneMentions` ters mantığı **servis katmanında** çözülür
 * (K6). Bu dosya anahtarın kendisini okur; `!suppress` yazmaz.
 */

const { settingsModal } = MENTIONS_METRICS;

type QuietDraft = { readonly from: string; readonly to: string };

export type MentionToggleKey = "me" | "role" | "everyone" | "threadReplies";

/** SPEC §7 dört anahtar satırı, tasarımdaki sırayla. */
const TOGGLES: ReadonlyArray<{
  readonly key: MentionToggleKey;
  readonly subtitleKey: string;
  readonly testId: string;
  readonly titleKey: string;
}> = [
  {
    key: "me",
    subtitleKey: "mentions.settings.me.subtitle",
    testId: "mention-settings-me",
    titleKey: "mentions.settings.me.title",
  },
  {
    key: "role",
    subtitleKey: "mentions.settings.role.subtitle",
    testId: "mention-settings-role",
    titleKey: "mentions.settings.role.title",
  },
  {
    key: "everyone",
    subtitleKey: "mentions.settings.everyone.subtitle",
    testId: "mention-settings-everyone",
    titleKey: "mentions.settings.everyone.title",
  },
  {
    key: "threadReplies",
    subtitleKey: "mentions.settings.thread.subtitle",
    testId: "mention-settings-thread",
    titleKey: "mentions.settings.thread.title",
  },
];

const DEFAULT_QUIET: QuietDraft = { from: "23:00", to: "08:00" };

/** Yalnız **değişen** alanlar gönderilir; dokunulmamış bir anahtarı yeniden yazmak yok. */
export function buildMentionSettingsPatch(
  base: MentionSettings,
  draft: MentionSettings,
): MentionSettingsPatch {
  const patch: Record<string, unknown> = {};

  for (const key of ["me", "role", "everyone", "threadReplies"] as const) {
    if (base[key] !== draft[key]) {
      patch[key] = draft[key];
    }
  }

  if (base.desktop !== draft.desktop) {
    patch.desktop = draft.desktop;
  }

  const quiet: Record<string, unknown> = {};
  for (const key of ["enabled", "from", "to", "timeZone"] as const) {
    if (base.quietHours[key] !== draft.quietHours[key]) {
      quiet[key] = draft.quietHours[key];
    }
  }

  if (Object.keys(quiet).length > 0) {
    patch.quietHours = quiet;
  }

  return patch as MentionSettingsPatch;
}

export function isMentionSettingsDirty(base: MentionSettings, draft: MentionSettings): boolean {
  return Object.keys(buildMentionSettingsPatch(base, draft)).length > 0;
}

export type MentionSettingsModalProps = {
  readonly onClose: () => void;
};

export function MentionSettingsModal({ onClose }: MentionSettingsModalProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { show } = useToast();
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const settingsQuery = useQuery({
    queryFn: fetchMentionSettings,
    queryKey: settingsQueryKeys.mentions,
  });

  /**
   * Taslak **türetilir**, efektle kopyalanmaz: `edits` yalnız kullanıcının dokunduğu alanları
   * tutar ve gösterilen değer `base` ile onun birleşimidir. Sunucudan gelen ayarı bir efektte
   * state'e kopyalamak fazladan bir render turu açar ve React Compiler'ın
   * `set-state-in-effect` kuralına takılır; dahası, yanıt sonradan tazelenirse iki kaynak
   * sessizce ayrışırdı.
   */
  const [edits, setEdits] = useState<Partial<MentionSettings> | null>(null);
  const [quietEditing, setQuietEditing] = useState(false);
  const [quietEdits, setQuietEdits] = useState<Partial<QuietDraft> | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmingClose, setConfirmingClose] = useState(false);

  const base = settingsQuery.data ?? null;
  const draft = useMemo<MentionSettings | null>(
    () => (base ? { ...base, ...edits } : null),
    [base, edits],
  );
  const quietDraft = useMemo<QuietDraft>(
    () => ({
      from: quietEdits?.from ?? base?.quietHours.from ?? DEFAULT_QUIET.from,
      to: quietEdits?.to ?? base?.quietHours.to ?? DEFAULT_QUIET.to,
    }),
    [base, quietEdits],
  );

  /**
   * SPEC §7: açılışta odak **ilk anahtarda**. `Modal` açılışta kendi kapat butonuna odaklanıyor
   * ve o buton çocuklardan önce çiziliyor; mikro görev, sağlayıcının efektinden **sonra** koşan
   * ilk noktadır ve bir zamanlayıcı kurmaz.
   */
  useEffect(() => {
    queueMicrotask(() => {
      bodyRef.current?.querySelector<HTMLElement>('[role="switch"]')?.focus();
    });
  }, []);

  const saveMutation = useMutation({
    mutationFn: (patch: MentionSettingsPatch) => patchMentionSettings(patch),
    onError: () => setSaveError(t("mentions.settings.saveError")),
    onSuccess: (saved) => {
      queryClient.setQueryData(settingsQueryKeys.mentions, saved);
      show({ message: t("mentions.settings.title"), tone: "default" });
      onClose();
    },
  });

  const dirty = useMemo(
    () => (base && draft ? isMentionSettingsDirty(base, draft) : false),
    [base, draft],
  );

  const requestClose = () => {
    if (dirty && !confirmingClose) {
      // SPEC bunu konuşmuyor; kirli bir formu tek `Esc` ile atmak, kullanıcının yaptığı işi
      // sormadan silmek olurdu. Rapora sapma olarak yazıldı.
      setConfirmingClose(true);
      return;
    }

    onClose();
  };

  const update = (patch: Partial<MentionSettings>) => {
    setEdits((current) => ({ ...current, ...patch }));
    setSaveError(null);
  };

  const quiet = draft?.quietHours ?? MENTION_SETTINGS_DEFAULTS.quietHours;

  return (
    <Modal
      // SPEC §7: 496 genişlik, 22 yarıçap. `Modal` varsayılanı `max-w-lg` (512) ve 28 yarıçap.
      className="max-w-[31rem] rounded-[1.375rem]"
      closeLabel={t("mentions.settings.close")}
      description={t("mentions.settings.subtitle")}
      headerIcon={
        <span
          aria-hidden="true"
          className="flex items-center justify-center bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))]"
          style={{
            borderRadius: pxToRem(settingsModal.headerIconRadius),
            height: pxToRem(settingsModal.headerIconBox),
            width: pxToRem(settingsModal.headerIconBox),
          }}
        >
          <Bell
            style={{
              height: pxToRem(settingsModal.headerIconSize),
              width: pxToRem(settingsModal.headerIconSize),
            }}
          />
        </span>
      }
      onClose={requestClose}
      open
      title={t("mentions.settings.title")}
    >
      <MentionSettingsForm
        bodyRef={bodyRef}
        confirmingClose={confirmingClose}
        dirty={dirty}
        draft={draft}
        onCancel={onClose}
        onDesktopChange={(desktop) => update({ desktop })}
        onQuietApply={() => {
          update({
            quietHours: {
              enabled: true,
              from: quietDraft.from,
              timeZone: quiet.timeZone,
              to: quietDraft.to,
            },
          });
          setQuietEditing(false);
        }}
        onQuietCancel={() => setQuietEditing(false)}
        onQuietDraftChange={(field, value) =>
          setQuietEdits((current) => ({ ...current, [field]: value }))
        }
        onQuietEdit={() => setQuietEditing(true)}
        onSave={() => {
          if (base && draft) {
            setSaveError(null);
            saveMutation.mutate(buildMentionSettingsPatch(base, draft));
          }
        }}
        onToggle={(key, value) => update({ [key]: value })}
        quietDraft={quietDraft}
        quietEditing={quietEditing}
        saveError={saveError}
        saving={saveMutation.isPending}
      />
    </Modal>
  );
}

export type MentionSettingsFormProps = {
  readonly bodyRef?: React.RefObject<HTMLDivElement | null>;
  readonly confirmingClose: boolean;
  readonly dirty: boolean;
  /** `null` = ayarlar henüz yüklenmedi; anahtarlar iskelet olur ve tıklanamaz. */
  readonly draft: MentionSettings | null;
  readonly onCancel: () => void;
  readonly onDesktopChange: (desktop: MentionDesktopMode) => void;
  readonly onQuietApply: () => void;
  readonly onQuietCancel: () => void;
  readonly onQuietDraftChange: (field: "from" | "to", value: string) => void;
  readonly onQuietEdit: () => void;
  readonly onSave: () => void;
  readonly onToggle: (key: MentionToggleKey, value: boolean) => void;
  readonly quietDraft: QuietDraft;
  readonly quietEditing: boolean;
  readonly saveError: string | null;
  readonly saving: boolean;
};

/**
 * Modalın **gövdesi**, saf sunum. Ayrı durmasının ölçülebilir sebebi: `Modal` gövdeye
 * portallanıyor ve `document` olmayan bir ortamda (sunucu çizimi, birim testi) `null`
 * döndürüyor — kabuğun içine gömülü bir gövde hiçbir zaman doğrulanamazdı.
 */
export function MentionSettingsForm({
  bodyRef,
  confirmingClose,
  dirty,
  draft,
  onCancel,
  onDesktopChange,
  onQuietApply,
  onQuietCancel,
  onQuietDraftChange,
  onQuietEdit,
  onSave,
  onToggle,
  quietDraft,
  quietEditing,
  saveError,
  saving,
}: MentionSettingsFormProps) {
  const { t } = useI18n();
  const pending = draft === null;
  const quiet = draft?.quietHours ?? MENTION_SETTINGS_DEFAULTS.quietHours;

  return (
    <div
      className="flex flex-col"
      data-testid="mention-settings-modal"
      ref={bodyRef}
      style={{ gap: pxToRem(settingsModal.bodyGap) }}
    >
      {pending
        ? TOGGLES.map((toggle) => (
            <Skeleton
              key={toggle.key}
              style={{ height: pxToRem(settingsModal.switchHeight * 2) }}
            />
          ))
        : TOGGLES.map((toggle) => (
            <MentionSettingsRow
              checked={draft[toggle.key]}
              key={toggle.key}
              onChange={(checked) => onToggle(toggle.key, checked)}
              subtitle={t(toggle.subtitleKey)}
              testId={toggle.testId}
              title={t(toggle.titleKey)}
            />
          ))}

      <div
        aria-hidden="true"
        style={{
          background: `hsl(var(--border)/${settingsModal.dividerAlpha})`,
          height: hairline(),
        }}
      />

      <div className="flex items-center" style={{ gap: pxToRem(settingsModal.toggleRowGap) }}>
        <p
          className="min-w-0 flex-1 text-[hsl(var(--foreground))]"
          style={{
            fontSize: pxToRem(settingsModal.toggleTitleFontSize),
            fontWeight: settingsModal.toggleTitleWeight,
            margin: 0,
          }}
        >
          {t("mentions.settings.desktop.label")}
        </p>
        <SegmentedControl<MentionDesktopMode>
          ariaLabel={t("mentions.settings.desktop.label")}
          onChange={onDesktopChange}
          options={[
            { label: t("mentions.settings.desktop.all"), value: "all" },
            { label: t("mentions.settings.desktop.mentions"), value: "mentions" },
            { label: t("mentions.settings.desktop.off"), value: "off" },
          ]}
          testId="mention-settings-desktop"
          value={draft?.desktop ?? MENTION_SETTINGS_DEFAULTS.desktop}
        />
      </div>

      {/* Sessiz saatler şeridi */}
      <div
        className="flex items-center"
        data-testid="mention-settings-quiet"
        style={{
          background: `hsl(var(--surface-secondary)/${settingsModal.quietSurfaceAlpha})`,
          border: `${hairline()} solid hsl(var(--border)/${settingsModal.quietBorderAlpha})`,
          borderRadius: pxToRem(settingsModal.quietRadius),
          gap: pxToRem(settingsModal.quietGap),
          padding: `${pxToRem(settingsModal.quietPaddingY)} ${pxToRem(
            settingsModal.quietPaddingX,
          )}`,
        }}
      >
        <Moon
          aria-hidden="true"
          className="shrink-0 text-[hsl(var(--warning))]"
          style={{
            height: pxToRem(settingsModal.quietIconSize),
            width: pxToRem(settingsModal.quietIconSize),
          }}
        />

        {quietEditing ? (
          <div className="flex min-w-0 flex-1 flex-wrap items-center" style={{ gap: pxToRem(8) }}>
            {(["from", "to"] as const).map((field) => (
              <label
                className="flex items-center text-[hsl(var(--text-muted))]"
                key={field}
                style={{
                  fontSize: pxToRem(settingsModal.quietSubtitleFontSize),
                  gap: pxToRem(6),
                }}
              >
                {t(`mentions.settings.quiet.${field}`)}
                <input
                  className="bg-[hsl(var(--surface-base))] text-[hsl(var(--foreground))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                  data-testid={`mention-settings-quiet-${field}`}
                  onChange={(event) => onQuietDraftChange(field, event.target.value)}
                  style={{
                    border: `${hairline()} solid hsl(var(--border))`,
                    borderRadius: pxToRem(settingsModal.segmentButtonRadius),
                    fontSize: pxToRem(settingsModal.quietSubtitleFontSize),
                    padding: `0 ${pxToRem(6)}`,
                  }}
                  type="time"
                  value={quietDraft[field]}
                />
              </label>
            ))}

            <button
              className="text-[hsl(var(--primary))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
              data-testid="mention-settings-quiet-apply"
              onClick={onQuietApply}
              style={{
                fontSize: pxToRem(settingsModal.quietEditFontSize),
                fontWeight: settingsModal.quietEditWeight,
              }}
              type="button"
            >
              {t("mentions.settings.quiet.apply")}
            </button>
            <button
              className="text-[hsl(var(--text-muted))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
              data-testid="mention-settings-quiet-cancel"
              onClick={onQuietCancel}
              style={{
                fontSize: pxToRem(settingsModal.quietEditFontSize),
                fontWeight: settingsModal.quietEditWeight,
              }}
              type="button"
            >
              {t("mentions.settings.quiet.cancel")}
            </button>
          </div>
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <p
                className="text-[hsl(var(--foreground))]"
                style={{
                  fontSize: pxToRem(settingsModal.quietTitleFontSize),
                  fontWeight: settingsModal.quietTitleWeight,
                  lineHeight: settingsModal.quietTitleLineHeight,
                  margin: 0,
                }}
              >
                {quiet.enabled
                  ? t("mentions.settings.quiet.title")
                  : t("mentions.settings.quiet.titleOff")}
              </p>
              {quiet.enabled ? (
                <p
                  className="text-[hsl(var(--text-muted))]"
                  style={{
                    fontSize: pxToRem(settingsModal.quietSubtitleFontSize),
                    margin: `${pxToRem(settingsModal.quietSubtitleMarginTop)} 0 0`,
                  }}
                >
                  {t("mentions.settings.quiet.subtitle", {
                    from: quiet.from ?? DEFAULT_QUIET.from,
                    to: quiet.to ?? DEFAULT_QUIET.to,
                  })}
                </p>
              ) : null}
            </div>

            <button
              className="shrink-0 text-[hsl(var(--primary))] transition hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
              data-testid="mention-settings-quiet-edit"
              disabled={pending}
              onClick={onQuietEdit}
              style={{
                fontSize: pxToRem(settingsModal.quietEditFontSize),
                fontWeight: settingsModal.quietEditWeight,
              }}
              type="button"
            >
              {t("mentions.settings.quiet.edit")}
            </button>
          </>
        )}
      </div>

      {saveError ? (
        <p
          className="text-[hsl(var(--danger))]"
          data-testid="mention-settings-error"
          role="alert"
          style={{ fontSize: pxToRem(settingsModal.footerNoteFontSize), margin: 0 }}
        >
          {saveError}
        </p>
      ) : null}

      {confirmingClose ? (
        <p
          className="text-[hsl(var(--warning))]"
          data-testid="mention-settings-dirty"
          role="alert"
          style={{ fontSize: pxToRem(settingsModal.footerNoteFontSize), margin: 0 }}
        >
          {t("mentions.settings.dirtyWarning")}
        </p>
      ) : null}

      {/* Altlık */}
      <div
        className="flex items-center"
        style={{
          borderTop: `${hairline()} solid hsl(var(--border)/${settingsModal.dividerAlpha})`,
          gap: pxToRem(settingsModal.footerGap),
          paddingTop: pxToRem(settingsModal.footerPaddingTop),
        }}
      >
        <p
          className="min-w-0 flex-1 text-[hsl(var(--text-muted))]"
          style={{ fontSize: pxToRem(settingsModal.footerNoteFontSize), margin: 0 }}
        >
          {t("mentions.settings.footerNote")}
        </p>

        <button
          className="grid shrink-0 place-items-center bg-[hsl(var(--surface-card))] text-[hsl(var(--text-secondary))] transition hover:bg-[var(--surface-hover)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          data-testid="mention-settings-cancel"
          onClick={onCancel}
          style={{
            border: `${hairline()} solid hsl(var(--border))`,
            borderRadius: pxToRem(settingsModal.footerButtonRadius),
            fontSize: pxToRem(settingsModal.footerButtonFontSize),
            fontWeight: settingsModal.footerButtonWeight,
            height: pxToRem(settingsModal.footerButtonHeight),
            lineHeight: 1,
            padding: `0 ${pxToRem(settingsModal.footerCancelPaddingX)}`,
          }}
          type="button"
        >
          {t("mentions.settings.cancel")}
        </button>

        <button
          className="grid shrink-0 place-items-center bg-[hsl(var(--primary))] text-white transition hover:brightness-[1.08] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:cursor-not-allowed disabled:opacity-45"
          data-testid="mention-settings-save"
          disabled={pending || !dirty || saving}
          onClick={onSave}
          style={{
            borderRadius: pxToRem(settingsModal.footerButtonRadius),
            boxShadow: `${pxToRem(settingsModal.footerSaveShadow.x)} ${pxToRem(
              settingsModal.footerSaveShadow.y,
            )} ${pxToRem(settingsModal.footerSaveShadow.blur)} ${pxToRem(
              settingsModal.footerSaveShadow.spread,
            )} hsl(var(--primary))`,
            fontSize: pxToRem(settingsModal.footerButtonFontSize),
            fontWeight: settingsModal.footerButtonWeight,
            height: pxToRem(settingsModal.footerButtonHeight),
            lineHeight: 1,
            padding: `0 ${pxToRem(settingsModal.footerSavePaddingX)}`,
          }}
          type="button"
        >
          {t("mentions.settings.save")}
        </button>
      </div>
    </div>
  );
}
