"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MobileBugReportCategory } from "@wizards/types";

import { useI18n } from "@/components/providers/locale-provider";
import { Modal } from "@/components/ui/modal";
import {
  ReportGroupLabel,
  ReportNotice,
  ReportNoticeAction,
  ReportRequiredPill,
  ReportAttachmentRow,
  ReportToggle,
} from "@/components/support/bug-report-parts";
import {
  BugReportDiscardDialog,
  BugReportLightbox,
} from "@/components/support/bug-report-overlays";
import { BugReportScreenshotRow } from "@/components/support/bug-report-screenshot-row";
import { BugReportSuccess } from "@/components/support/bug-report-success";
import {
  ChatCategoryIcon,
  CloseIcon,
  NotificationCategoryIcon,
  OtherCategoryIcon,
  PerformanceCategoryIcon,
  ReportHeaderIcon,
  ShieldCheckIcon,
  VoiceCategoryIcon,
} from "@/components/support/report-icons";
import { useUploadThing } from "@/lib/uploadthing";
import { buildBugReportRequest, submitBugReport } from "@/lib/support/bug-report-client";
import {
  REPORT_CATEGORIES,
  bugReportCounterTone,
  bugReportFooterNote,
  bugReportScreenshotAction,
  bugReportScreenshotBoxIntent,
  canSubmitBugReport,
  clampBugReportBody,
  clampUploadPercent,
  createBugReportDraft,
  formatScreenshotSize,
  shouldConfirmBugReportClose,
  toggleBugReportScreenshot,
  validateBugReportDraft,
  type BugReportDraft,
} from "@/lib/support/bug-report-form-model";
import {
  collectReportDiagnostics,
  collectReportLogLines,
  formatReportDeviceLine,
} from "@/lib/support/report-diagnostics";
import {
  REPORT_BODY_MAX_LENGTH,
  REPORT_LOG_LINE_COUNT,
  REPORT_METRICS,
  hairline,
  pxToRem,
} from "@/lib/support/report-metrics";

/**
 * SPEC-INDIRME §A — "Sorun bildir" penceresi.
 *
 * Kararların hepsi `bug-report-form-model.ts`'te; bu dosya yalnız çizer ve
 * yan etkileri (yükleme, gönderim, pano) yürütür.
 *
 * Ekran görüntüsü mevcut mobil medya claim akışını kullanır (K3): dosya
 * `mobileMediaUploader`'a `feedback-attachment` amacıyla gider, dönen `claimId`
 * gövdeye `screenshotUploadKey` olarak girer. İkinci bir yükleme yolu açılmadı.
 */

const {
  body: bodyMetrics,
  chip,
  description,
  footer,
  header,
  motion,
  privacy,
  shell,
} = REPORT_METRICS;

const CATEGORY_ICONS: Record<
  MobileBugReportCategory,
  (props: { readonly size: number; readonly strokeWidth: number }) => React.ReactElement
> = {
  chat: ChatCategoryIcon,
  notification: NotificationCategoryIcon,
  other: OtherCategoryIcon,
  performance: PerformanceCategoryIcon,
  voice: VoiceCategoryIcon,
};

const ACCEPTED_SCREENSHOT_TYPES = "image/jpeg,image/png,image/webp";
/** `mobileMediaUploader` bu sınırı zaten uyguluyor; istemci boşuna yüklemesin. */
const MAX_SCREENSHOT_BYTES = 4 * 1_024 * 1_024;

type ScreenshotFile = {
  readonly file: File;
  readonly name: string;
  readonly sizeLabel: string;
};

export type BugReportModalProps = {
  readonly onClose: () => void;
  readonly open: boolean;
};

export function BugReportModal({ onClose, open }: BugReportModalProps) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<BugReportDraft>(createBugReportDraft);
  const [ticket, setTicket] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [percent, setPercent] = useState(0);
  const [screenshot, setScreenshot] = useState<ScreenshotFile | null>(null);
  const [claimId, setClaimId] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const firstChipRef = useRef<HTMLButtonElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  /** Toggle ile açılan seçicide kullanıcı vazgeçerse toggle geri kapanır. */
  const toggleOpenedPickerRef = useRef(false);

  const diagnostics = useMemo(() => collectReportDiagnostics(), []);
  const deviceLine = formatReportDeviceLine(diagnostics, t("report.device.unknown"));

  useEffect(() => {
    const read = () => setOffline(typeof navigator !== "undefined" && navigator.onLine === false);
    read();
    window.addEventListener("offline", read);
    window.addEventListener("online", read);

    return () => {
      window.removeEventListener("offline", read);
      window.removeEventListener("online", read);
    };
  }, []);

  const { startUpload } = useUploadThing("mobileMediaUploader", {
    onUploadProgress: (value) => setPercent(clampUploadPercent(value)),
  });

  const busy = draft.phase === "busy";
  const submitEnabled = canSubmitBugReport({
    body: draft.body,
    category: draft.category,
    offline,
    phase: draft.phase,
  });
  const note = bugReportFooterNote({
    body: draft.body,
    category: draft.category,
    offline,
    phase: draft.phase,
  });
  const counterTone = bugReportCounterTone(draft.body.length);
  const counterColor =
    counterTone === "danger"
      ? "hsl(var(--danger))"
      : counterTone === "warning"
        ? "hsl(var(--warning))"
        : "hsl(var(--text-muted))";

  const patch = useCallback((next: Partial<BugReportDraft>) => {
    setDraft((current) => ({ ...current, ...next }));
  }, []);

  const clearValidationError = useCallback((current: BugReportDraft) => {
    return current.error === "validate" ? null : current.error;
  }, []);

  const resetScreenshot = useCallback(() => {
    setScreenshot(null);
    setClaimId(null);
    setPercent(0);
  }, []);

  const uploadScreenshot = useCallback(
    async (picked: ScreenshotFile) => {
      setScreenshot(picked);
      setClaimId(null);
      setPercent(0);
      setDraft((current) => ({
        ...current,
        error: current.error === "attach" ? null : current.error,
        includesScreenshot: true,
        screenshotState: "uploading",
      }));

      try {
        const result = await startUpload([picked.file], { purpose: "feedback-attachment" });
        const uploaded = result?.[0]?.serverData as { claimId?: string } | undefined;

        if (!uploaded?.claimId) {
          throw new Error("Upload did not return a claim.");
        }

        setClaimId(uploaded.claimId);
        setPercent(100);
        setDraft((current) => ({ ...current, screenshotState: "ready" }));
      } catch {
        setClaimId(null);
        setDraft((current) => ({ ...current, error: "attach", screenshotState: "failed" }));
      }
    },
    [startUpload],
  );

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] ?? null;
      event.target.value = "";

      if (!file) {
        // Seçici toggle ile açıldıysa ve kullanıcı vazgeçtiyse toggle geri kapanır:
        // açık kalan bir anahtar, olmayan bir eki göndereceğini söylerdi.
        if (toggleOpenedPickerRef.current) {
          setDraft((current) => ({
            ...current,
            includesScreenshot: false,
            screenshotState: "none",
          }));
        }
        toggleOpenedPickerRef.current = false;
        return;
      }

      toggleOpenedPickerRef.current = false;

      if (file.size > MAX_SCREENSHOT_BYTES) {
        setScreenshot({
          file,
          name: file.name,
          sizeLabel: formatScreenshotSize(file.size),
        });
        setDraft((current) => ({
          ...current,
          error: "attach",
          includesScreenshot: true,
          screenshotState: "failed",
        }));
        return;
      }

      void uploadScreenshot({
        file,
        name: file.name,
        sizeLabel: formatScreenshotSize(file.size),
      });
    },
    [uploadScreenshot],
  );

  const handleScreenshotToggle = useCallback(
    (next: boolean) => {
      if (!next) {
        resetScreenshot();
        setDraft((current) => toggleBugReportScreenshot({ ...current, includesScreenshot: true }));
        return;
      }

      toggleOpenedPickerRef.current = true;
      setDraft((current) => ({ ...current, includesScreenshot: true, screenshotState: "none" }));
      openFilePicker();
    },
    [openFilePicker, resetScreenshot],
  );

  const handleScreenshotAction = useCallback(() => {
    const action = bugReportScreenshotAction(draft.screenshotState);

    if (action === "remove") {
      resetScreenshot();
      setDraft((current) => ({
        ...current,
        error: current.error === "attach" ? null : current.error,
        includesScreenshot: false,
        screenshotState: "none",
      }));
      return;
    }

    if (action === "retry" && screenshot) {
      void uploadScreenshot(screenshot);
      return;
    }

    openFilePicker();
  }, [draft.screenshotState, openFilePicker, resetScreenshot, screenshot, uploadScreenshot]);

  const handleScreenshotBoxClick = useCallback(() => {
    const intent = bugReportScreenshotBoxIntent(draft.screenshotState);

    if (intent === "view") {
      patch({ phase: "lightbox" });
      return;
    }

    handleScreenshotAction();
  }, [draft.screenshotState, handleScreenshotAction, patch]);

  const send = useCallback(async () => {
    const validation = validateBugReportDraft({ body: draft.body, category: draft.category });

    if (!validation.valid) {
      patch({ error: "validate" });
      return;
    }

    if (offline || draft.phase === "busy" || draft.category === null) {
      return;
    }

    patch({ error: null, phase: "busy" });

    try {
      const logLines = draft.includesLogs ? collectReportLogLines(REPORT_LOG_LINE_COUNT) : [];
      const response = await submitBugReport(
        buildBugReportRequest({
          appBuild: diagnostics.appBuild,
          appVersion: diagnostics.appVersion,
          body: draft.body,
          category: draft.category,
          deviceInfo: diagnostics.deviceInfo,
          includesDeviceInfo: draft.includesDeviceInfo,
          includesLogs: draft.includesLogs,
          logLines,
          platform: diagnostics.platform,
          releaseChannel: diagnostics.releaseChannel,
          ...(draft.includesScreenshot && claimId ? { screenshotUploadKey: claimId } : {}),
        }),
      );

      setTicket(response.ticket);
      setCopied(false);
      patch({ phase: "done" });
    } catch {
      patch({ error: "submit", phase: "form" });
    }
  }, [claimId, diagnostics, draft, offline, patch]);

  const requestClose = useCallback(() => {
    if (draft.phase === "lightbox" || draft.phase === "discard") {
      patch({ phase: "form" });
      return;
    }

    if (shouldConfirmBugReportClose(draft)) {
      patch({ phase: "discard" });
      return;
    }

    onClose();
  }, [draft, onClose, patch]);

  const copyTicket = useCallback(() => {
    if (!ticket) {
      return;
    }

    void navigator.clipboard?.writeText(ticket).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  }, [ticket]);

  const screenshotSubtitle = (() => {
    if (draft.screenshotState === "ready" && screenshot) {
      return t("report.screenshot.ready", { name: screenshot.name, size: screenshot.sizeLabel });
    }

    if (draft.screenshotState === "uploading") {
      return t("report.screenshot.uploading", {
        percent,
        size: screenshot?.sizeLabel ?? "",
      });
    }

    if (draft.screenshotState === "failed") {
      return t("report.screenshot.failed", { reason: t("report.screenshot.failedReason") });
    }

    return t("report.screenshot.empty");
  })();

  const screenshotActionLabel = (() => {
    const action = bugReportScreenshotAction(draft.screenshotState);
    if (action === "remove") {
      return t("report.screenshot.remove");
    }

    return action === "retry" ? t("report.screenshot.retry") : t("report.screenshot.add");
  })();

  const screenshotBoxTitle = (() => {
    const intent = bugReportScreenshotBoxIntent(draft.screenshotState);
    if (intent === "view") {
      return t("report.screenshot.view");
    }

    return intent === "retry" ? t("report.screenshot.retry") : t("report.screenshot.add");
  })();

  return (
    <>
      <Modal
        className="max-w-none flex-col overflow-hidden rounded-none p-0 shadow-none backdrop-blur-none sm:rounded-none sm:p-0"
        hideHeader
        onClose={requestClose}
        open={open}
        overlayClassName="items-center backdrop-blur-none"
        overlayStyle={{
          background: `hsl(var(--background) / ${shell.backdropAlpha})`,
          padding: pxToRem(shell.backdropPadding),
        }}
        {...(draft.phase === "form" ? { initialFocusRef: firstChipRef } : {})}
        style={{
          background: "hsl(var(--surface-card))",
          border: `${hairline()} solid hsl(var(--border))`,
          borderRadius: pxToRem(shell.radius),
          boxShadow: `0 ${pxToRem(shell.shadow.y)} ${pxToRem(shell.shadow.blur)} ${pxToRem(
            shell.shadow.spread,
          )} hsl(var(--shadow-color))`,
          display: "flex",
          maxHeight: "100%",
          maxWidth: "100%",
          width: pxToRem(shell.width),
        }}
        title={t("report.title")}
      >
        <div data-testid="bug-report-modal" style={{ display: "contents" }}>
          {/* Başlık şeridi — SPEC §A.2. Geri oku değil, kapat (X). */}
          <div
            style={{
              alignItems: "flex-start",
              borderBottom: `${hairline()} solid hsl(var(--border) / ${header.dividerAlpha})`,
              display: "flex",
              gap: pxToRem(header.gap),
              flex: "none",
              padding: `${pxToRem(header.paddingTop)} ${pxToRem(header.paddingX)} ${pxToRem(
                header.paddingBottom,
              )}`,
            }}
          >
            <div
              style={{
                background: `hsl(var(--warning) / ${header.iconSurfaceAlpha})`,
                borderRadius: pxToRem(header.iconRadius),
                color: "hsl(var(--warning))",
                display: "grid",
                flex: "none",
                height: pxToRem(header.iconBox),
                placeItems: "center",
                width: pxToRem(header.iconBox),
              }}
            >
              <ReportHeaderIcon size={header.iconSize} strokeWidth={header.iconStroke} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  color: "hsl(var(--foreground))",
                  fontFamily: "var(--font-display), sans-serif",
                  fontSize: pxToRem(header.titleFontSize),
                  fontWeight: 600,
                  letterSpacing: "-.02em",
                  lineHeight: header.titleLineHeight,
                }}
              >
                {t("report.title")}
              </div>
              <div
                style={{
                  color: "hsl(var(--text-secondary))",
                  fontSize: pxToRem(header.subtitleFontSize),
                  lineHeight: header.subtitleLineHeight,
                  marginTop: pxToRem(header.subtitleMarginTop),
                }}
              >
                {t("report.subtitle")}
              </div>
            </div>
            <button
              aria-label={t("report.success.close")}
              data-testid="bug-report-close"
              onClick={requestClose}
              style={{
                background: "hsl(var(--surface-soft))",
                border: 0,
                borderRadius: pxToRem(header.closeRadius),
                color: "hsl(var(--text-muted))",
                cursor: "pointer",
                display: "grid",
                flex: "none",
                height: pxToRem(header.closeSize),
                placeItems: "center",
                transition: `background ${motion.transitionSeconds}s`,
                width: pxToRem(header.closeSize),
              }}
              title={t("report.success.close")}
              type="button"
            >
              <CloseIcon size={header.closeIconSize} strokeWidth={header.closeIconStroke} />
            </button>
          </div>

          {draft.phase === "done" && ticket !== null ? (
            <BugReportSuccess
              body={t("report.success.body")}
              closeLabel={t("report.success.close")}
              copied={copied}
              copiedLabel={t("report.success.copied")}
              copyLabel={t("report.success.copy")}
              onClose={onClose}
              onCopy={copyTicket}
              ticket={ticket}
              title={t("report.success.title")}
            />
          ) : (
            <>
              {/* Gövde yalnız burada kaydırılır; başlık ve alt bar sabit kalır. */}
              <div
                data-testid="bug-report-body"
                style={{
                  flex: 1,
                  minHeight: 0,
                  opacity: busy ? bodyMetrics.busyOpacity : 1,
                  overflowY: "auto",
                  padding: `${pxToRem(bodyMetrics.paddingTop)} ${pxToRem(
                    bodyMetrics.paddingX,
                  )} ${pxToRem(bodyMetrics.paddingBottom)}`,
                  pointerEvents: busy ? "none" : "auto",
                }}
              >
                <ReportGroupLabel
                  pill={<ReportRequiredPill>{t("report.required")}</ReportRequiredPill>}
                >
                  {t("report.where")}
                </ReportGroupLabel>

                <div
                  role="radiogroup"
                  aria-label={t("report.where")}
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: pxToRem(chip.gap),
                    marginTop: pxToRem(chip.marginTop),
                  }}
                >
                  {REPORT_CATEGORIES.map((category, index) => {
                    const selected = draft.category === category;
                    const Icon = CATEGORY_ICONS[category];

                    return (
                      <button
                        aria-checked={selected}
                        data-testid={`bug-report-category-${category}`}
                        disabled={busy}
                        key={category}
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            category,
                            error: clearValidationError(current),
                          }))
                        }
                        ref={index === 0 ? firstChipRef : undefined}
                        role="radio"
                        style={{
                          alignItems: "center",
                          background: selected ? "hsl(var(--primary))" : "hsl(var(--surface-base))",
                          border: `${hairline()} solid ${
                            selected
                              ? "hsl(var(--primary))"
                              : `hsl(var(--border) / ${chip.borderIdleAlpha})`
                          }`,
                          borderRadius: pxToRem(chip.radius),
                          color: selected ? "#fff" : "hsl(var(--text-secondary))",
                          cursor: busy ? "not-allowed" : "pointer",
                          display: "flex",
                          fontSize: pxToRem(chip.fontSize),
                          fontWeight: 600,
                          gap: pxToRem(chip.iconGap),
                          height: pxToRem(chip.height),
                          lineHeight: 1,
                          padding: `0 ${pxToRem(chip.paddingX)}`,
                          transition: `background ${motion.transitionSeconds}s, color ${motion.transitionSeconds}s, border-color ${motion.transitionSeconds}s`,
                          whiteSpace: "nowrap",
                        }}
                        type="button"
                      >
                        <Icon
                          size={chip.iconSize}
                          strokeWidth={selected ? chip.strokeSelected : chip.strokeIdle}
                        />
                        {t(`report.category.${category}`)}
                      </button>
                    );
                  })}
                </div>

                <ReportGroupLabel marginTop={REPORT_METRICS.groupLabel.sectionMarginTop}>
                  {t("report.what")}
                </ReportGroupLabel>
                <div
                  style={{
                    background: "hsl(var(--surface-base))",
                    border: `${hairline()} solid ${
                      draft.body.length > 0
                        ? `hsl(var(--primary) / ${description.borderFocusAlpha})`
                        : "hsl(var(--border))"
                    }`,
                    borderRadius: pxToRem(description.radius),
                    marginTop: pxToRem(description.marginTop),
                    overflow: "hidden",
                  }}
                >
                  <textarea
                    data-testid="bug-report-body-input"
                    disabled={busy}
                    maxLength={REPORT_BODY_MAX_LENGTH}
                    onChange={(event) => {
                      const value = clampBugReportBody(event.target.value);
                      setDraft((current) => ({
                        ...current,
                        body: value,
                        error: clearValidationError(current),
                      }));
                    }}
                    onKeyDown={(event) => {
                      // Enter form göndermez (SPEC §C klavye notu): metin alanı.
                      if (event.key === "Enter") {
                        event.stopPropagation();
                      }
                    }}
                    placeholder={t("report.placeholder")}
                    ref={textareaRef}
                    rows={description.rows}
                    style={{
                      background: "transparent",
                      border: 0,
                      boxSizing: "border-box",
                      color: "hsl(var(--foreground))",
                      display: "block",
                      fontSize: pxToRem(description.fontSize),
                      fontWeight: 500,
                      lineHeight: description.lineHeight,
                      maxHeight: pxToRem(
                        description.maxRows * description.fontSize * description.lineHeight,
                      ),
                      outline: "none",
                      padding: `${pxToRem(description.paddingY)} ${pxToRem(description.paddingX)}`,
                      resize: "none",
                      width: "100%",
                    }}
                    value={draft.body}
                  />
                  <div
                    style={{
                      alignItems: "center",
                      background: `hsl(var(--surface-soft) / ${description.footerSurfaceAlpha})`,
                      borderTop: `${hairline()} solid hsl(var(--border) / ${description.footerDividerAlpha})`,
                      display: "flex",
                      gap: pxToRem(description.footerGap),
                      padding: `${pxToRem(description.footerPaddingY)} ${pxToRem(
                        description.footerPaddingX,
                      )}`,
                    }}
                  >
                    <span
                      style={{
                        color: "hsl(var(--text-muted))",
                        flex: 1,
                        fontSize: pxToRem(description.hintFontSize),
                        lineHeight: description.hintLineHeight,
                        minWidth: 0,
                      }}
                    >
                      {t("report.hint")}
                    </span>
                    <span
                      data-testid="bug-report-counter"
                      style={{
                        color: counterColor,
                        flex: "none",
                        fontFamily: "var(--font-display), sans-serif",
                        fontSize: pxToRem(description.counterFontSize),
                        fontWeight: 600,
                        lineHeight: 1,
                      }}
                    >
                      {t("report.counter", {
                        count: draft.body.length,
                        max: REPORT_BODY_MAX_LENGTH,
                      })}
                    </span>
                  </div>
                </div>

                <ReportGroupLabel marginTop={REPORT_METRICS.groupLabel.sectionMarginTop}>
                  {t("report.attachments")}
                </ReportGroupLabel>
                <div
                  style={{
                    background: "hsl(var(--surface-base))",
                    border: `${hairline()} solid hsl(var(--border) / ${REPORT_METRICS.attachments.borderAlpha})`,
                    borderRadius: pxToRem(REPORT_METRICS.attachments.radius),
                    marginTop: pxToRem(REPORT_METRICS.attachments.marginTop),
                    overflow: "hidden",
                  }}
                >
                  <ReportAttachmentRow
                    control={
                      <ReportToggle
                        checked={draft.includesLogs}
                        disabled={busy}
                        label={t("report.logs.title")}
                        onChange={(next) => patch({ includesLogs: next })}
                        testId="bug-report-logs-toggle"
                      />
                    }
                    subtitle={t("report.logs.body", { count: REPORT_LOG_LINE_COUNT })}
                    testId="bug-report-logs-row"
                    title={t("report.logs.title")}
                    withDivider={false}
                  />

                  <BugReportScreenshotRow
                    actionLabel={screenshotActionLabel}
                    boxTitle={screenshotBoxTitle}
                    checked={draft.includesScreenshot}
                    disabled={busy}
                    onAction={handleScreenshotAction}
                    onBoxClick={handleScreenshotBoxClick}
                    onToggle={handleScreenshotToggle}
                    percent={percent}
                    state={draft.screenshotState}
                    subtitle={screenshotSubtitle}
                    title={t("report.screenshot.title")}
                    toggleLabel={t("report.screenshot.title")}
                  />

                  <ReportAttachmentRow
                    control={
                      <ReportToggle
                        checked={draft.includesDeviceInfo}
                        disabled={busy}
                        label={t("report.device.title")}
                        onChange={(next) => patch({ includesDeviceInfo: next })}
                        testId="bug-report-device-toggle"
                      />
                    }
                    // Toggle kapalıyken de görünür: kullanıcı ne göndermediğini de bilir.
                    subtitle={deviceLine}
                    testId="bug-report-device-row"
                    title={t("report.device.title")}
                    withDivider
                  />
                </div>

                <div
                  style={{
                    alignItems: "flex-start",
                    background: `hsl(var(--surface-soft) / ${privacy.surfaceAlpha})`,
                    borderRadius: pxToRem(privacy.radius),
                    display: "flex",
                    gap: pxToRem(privacy.gap),
                    marginTop: pxToRem(privacy.marginTop),
                    padding: `${pxToRem(privacy.paddingY)} ${pxToRem(privacy.paddingX)}`,
                  }}
                >
                  <span
                    style={{
                      color: "hsl(var(--success))",
                      flex: "none",
                      marginTop: pxToRem(privacy.iconMarginTop),
                    }}
                  >
                    <ShieldCheckIcon size={privacy.iconSize} strokeWidth={privacy.iconStroke} />
                  </span>
                  <span
                    style={{
                      color: "hsl(var(--text-secondary))",
                      fontSize: pxToRem(privacy.fontSize),
                      lineHeight: privacy.lineHeight,
                      textWrap: "pretty",
                    }}
                  >
                    {t("report.privacy")}
                  </span>
                </div>

                {draft.error !== null ? (
                  <ReportNotice
                    action={
                      draft.error === "submit" ? (
                        <ReportNoticeAction
                          onClick={() => void send()}
                          testId="bug-report-error-retry"
                        >
                          {t("report.error.retry")}
                        </ReportNoticeAction>
                      ) : undefined
                    }
                    testId={`bug-report-error-${draft.error}`}
                    tone="danger"
                  >
                    {t(
                      `report.error.${draft.error === "validate" ? "validation" : draft.error === "submit" ? "submit" : "upload"}`,
                    )}
                  </ReportNotice>
                ) : null}

                {offline ? (
                  <ReportNotice testId="bug-report-offline" tone="warning">
                    {t("report.offline")}
                  </ReportNotice>
                ) : null}
              </div>

              {/* Alt bar — SPEC §A.8. */}
              <div
                style={{
                  alignItems: "center",
                  background: `hsl(var(--surface-secondary) / ${footer.surfaceAlpha})`,
                  borderTop: `${hairline()} solid hsl(var(--border) / ${footer.dividerAlpha})`,
                  display: "flex",
                  flex: "none",
                  flexWrap: "wrap",
                  gap: pxToRem(footer.gap),
                  padding: `${pxToRem(footer.paddingY)} ${pxToRem(footer.paddingX)}`,
                }}
              >
                <span
                  data-testid="bug-report-footer-note"
                  id="bug-report-footer-note"
                  style={{
                    color:
                      note.tone === "warning" ? "hsl(var(--warning))" : "hsl(var(--text-muted))",
                    flex: 1,
                    fontSize: pxToRem(footer.noteFontSize),
                    lineHeight: footer.noteLineHeight,
                    minWidth: pxToRem(footer.noteMinWidth),
                  }}
                >
                  {t(note.key, note.params)}
                </span>
                <button
                  data-testid="bug-report-cancel"
                  onClick={requestClose}
                  style={{
                    background: "transparent",
                    border: `${hairline()} solid hsl(var(--border))`,
                    borderRadius: pxToRem(footer.buttonRadius),
                    color: "hsl(var(--text-secondary))",
                    cursor: "pointer",
                    flex: "none",
                    fontSize: pxToRem(footer.buttonFontSize),
                    fontWeight: 600,
                    height: pxToRem(footer.buttonHeight),
                    lineHeight: 1,
                    padding: `0 ${pxToRem(footer.secondaryPaddingX)}`,
                    transition: `background ${motion.transitionSeconds}s`,
                    whiteSpace: "nowrap",
                  }}
                  type="button"
                >
                  {t("report.cancel")}
                </button>
                <button
                  data-testid="bug-report-submit"
                  // Eksik alanlarla tıklamak doğrulama hatasını gösterir. Bu yüzden düğme
                  // semantik olarak etkindir; soluk görünüm yalnız hazır olmadığını anlatır.
                  aria-describedby="bug-report-footer-note"
                  onClick={() => void send()}
                  style={{
                    alignItems: "center",
                    background: submitEnabled
                      ? "hsl(var(--primary))"
                      : "hsl(var(--surface-tertiary))",
                    border: 0,
                    borderRadius: pxToRem(footer.buttonRadius),
                    boxShadow: submitEnabled
                      ? `0 ${pxToRem(footer.shadow.y)} ${pxToRem(footer.shadow.blur)} ${pxToRem(
                          footer.shadow.spread,
                        )} hsl(var(--primary))`
                      : "none",
                    color: submitEnabled ? "#fff" : "hsl(var(--text-muted))",
                    cursor: "pointer",
                    display: "flex",
                    flex: "none",
                    fontSize: pxToRem(footer.buttonFontSize),
                    fontWeight: 600,
                    gap: pxToRem(footer.buttonGap),
                    height: pxToRem(footer.buttonHeight),
                    lineHeight: 1,
                    padding: `0 ${pxToRem(footer.primaryPaddingX)}`,
                    transition: `filter ${motion.transitionSeconds}s`,
                    whiteSpace: "nowrap",
                  }}
                  type="button"
                >
                  {busy ? (
                    <span
                      data-testid="bug-report-spinner"
                      style={{
                        animation: `wspin ${motion.spinnerSeconds}s linear infinite`,
                        border: `${pxToRem(footer.spinnerBorderWidth)} solid currentColor`,
                        borderRadius: "50%",
                        borderTopColor: "transparent",
                        display: "block",
                        height: pxToRem(footer.spinnerSize),
                        width: pxToRem(footer.spinnerSize),
                      }}
                    />
                  ) : null}
                  {busy ? t("report.submitting") : t("report.submit")}
                </button>
              </div>
            </>
          )}

          <input
            accept={ACCEPTED_SCREENSHOT_TYPES}
            className="hidden"
            data-testid="bug-report-file-input"
            onChange={handleFileChange}
            ref={fileInputRef}
            type="file"
          />
        </div>
      </Modal>

      <BugReportDiscardDialog
        body={t("report.discard.body")}
        cancelLabel={t("report.discard.cancel")}
        confirmLabel={t("report.discard.confirm")}
        onCancel={() => patch({ phase: "form" })}
        onConfirm={onClose}
        open={open && draft.phase === "discard"}
        title={t("report.discard.title")}
      />

      <BugReportLightbox
        caption={screenshot === null ? "" : `${screenshot.name} · ${screenshot.sizeLabel}`}
        closeLabel={t("report.success.close")}
        onClose={() => patch({ phase: "form" })}
        onRemove={() => {
          resetScreenshot();
          setDraft((current) => ({
            ...current,
            includesScreenshot: false,
            phase: "form",
            screenshotState: "none",
          }));
        }}
        open={open && draft.phase === "lightbox"}
        removeLabel={t("report.screenshot.remove")}
        title={t("report.screenshot.view")}
      />
    </>
  );
}
