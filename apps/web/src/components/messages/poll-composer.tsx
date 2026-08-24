"use client";

import React, { useId, useState } from "react";
import { Plus, X } from "lucide-react";
import {
  POLL_MAX_OPTIONS,
  POLL_QUESTION_MAX_LENGTH,
  addPollOption,
  canAddPollOption,
  canRemovePollOption,
  canSubmitPoll,
  createInitialPollDraft,
  getPollOptionKey,
  removePollOption,
  setPollOption,
  toPollCreateRequest,
  type PollCreateRequest,
  type PollDraft,
  type PollDuration,
} from "@wizards/types";

import { DISPLAY_FONT } from "@/components/home/home-primitives";
import { useI18n } from "@/components/providers/locale-provider";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { MESSAGES_METRICS, hairline, pxToRem } from "@/lib/messages/metrics";
import { cn } from "@/lib/utils";

/**
 * Anket oluşturma gövdesi — SPEC-MESAJLAR §8.
 *
 * Taslağın kuralları `@wizards/types/poll` içinde ve saf: kaç seçenek
 * eklenebilir, kaçın altına inilemez, gönderilebilir mi. Bileşen o kuralları
 * **uygular**, yeniden yazmaz — iki yerde iki tanım, biri değişince diğerinin
 * sessizce yanlış kalması demek olurdu.
 *
 * Taslak modal kapanınca **atılır** (grup taslağının aksine): SPEC anket için
 * taslak koruma tarif etmiyor ve uydurulmuş bir koruma, bir sonraki anketin
 * yanlışlıkla eskisiyle başlaması demek.
 */

const { pollModal } = MESSAGES_METRICS;

const DURATION_VALUES = ["1h", "24h", "3d"] as const;

export type PollComposerProps = {
  /** Ayaktaki `{sohbet} · {n} üye oy verebilir` satırı. 1:1'de `n` = 2 (karar #12). */
  conversationName: string;
  eligibleVoterCount: number;
  isSubmitting?: boolean;
  onCancel: () => void;
  onSubmit: (request: PollCreateRequest) => void;
};

export function PollComposer({
  conversationName,
  eligibleVoterCount,
  isSubmitting = false,
  onCancel,
  onSubmit,
}: PollComposerProps) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<PollDraft>(() => createInitialPollDraft());
  const questionId = useId();
  const reasonId = useId();
  const multiLabelId = useId();
  const anonymousLabelId = useId();
  const durationLabelId = useId();

  const submittable = canSubmitPoll(draft);
  const questionLength = Array.from(draft.question).length;
  // Sayaç yalnız sona yaklaşınca görünür: her zaman duran bir sayaç, kimsenin
  // yaklaşmadığı bir sınırı sürekli hatırlatır.
  const showCounter = questionLength > POLL_QUESTION_MAX_LENGTH - 50;

  const durationOptions = DURATION_VALUES.map((value) => ({
    label: t(
      value === "1h"
        ? "messages.pollModal.duration1h"
        : value === "24h"
          ? "messages.pollModal.duration24h"
          : "messages.pollModal.duration3d",
    ),
    value,
  }));

  return (
    <div data-testid="poll-composer">
      <label
        className={cn("block text-[hsl(var(--text-secondary))]", DISPLAY_FONT)}
        htmlFor={questionId}
        style={{ fontSize: pxToRem(pollModal.optionsHintFontSize), fontWeight: 600 }}
      >
        {t("messages.pollModal.question")}
      </label>
      <input
        className="w-full bg-[hsl(var(--surface-soft)/0.6)] text-[hsl(var(--foreground))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
        data-testid="poll-composer-question"
        id={questionId}
        maxLength={POLL_QUESTION_MAX_LENGTH}
        onChange={(event) => setDraft((current) => ({ ...current, question: event.target.value }))}
        style={{
          border: `${hairline()} solid hsl(var(--border)/0.6)`,
          borderRadius: pxToRem(pollModal.questionFieldRadius),
          fontSize: pxToRem(pollModal.questionFieldFontSize),
          height: pxToRem(pollModal.questionFieldHeight),
          marginTop: pxToRem(pollModal.questionFieldMarginTop),
          padding: `0 ${pxToRem(pollModal.questionFieldPaddingX)}`,
        }}
        type="text"
        value={draft.question}
      />
      {showCounter ? (
        <p
          className="text-right text-[hsl(var(--text-secondary))]"
          data-testid="poll-composer-question-counter"
          style={{ fontSize: pxToRem(pollModal.optionsHintFontSize) }}
        >
          {questionLength}/{POLL_QUESTION_MAX_LENGTH}
        </p>
      ) : null}

      <div
        className="flex items-center"
        style={{
          gap: pxToRem(pollModal.optionsHeaderGap),
          marginTop: pxToRem(pollModal.optionsHeaderMarginTop),
        }}
      >
        <span
          className={cn("text-[hsl(var(--text-secondary))]", DISPLAY_FONT)}
          style={{ fontSize: pxToRem(pollModal.optionsHintFontSize), fontWeight: 600 }}
        >
          {t("messages.pollModal.options")}
        </span>
        <span
          className="ml-auto text-[hsl(var(--text-soft))]"
          style={{ fontSize: pxToRem(pollModal.optionsHintFontSize) }}
        >
          {t("messages.pollModal.optionsMax", { count: POLL_MAX_OPTIONS })}
        </span>
      </div>

      <div
        className="flex flex-col"
        style={{
          gap: pxToRem(pollModal.optionsGap),
          marginTop: pxToRem(pollModal.optionsMarginTop),
        }}
      >
        {draft.options.map((option, index) => (
          <div
            className="flex items-center bg-[hsl(var(--surface-soft)/0.6)]"
            data-testid="poll-composer-option"
            key={index}
            style={{
              border: `${hairline()} solid hsl(var(--border)/0.6)`,
              borderRadius: pxToRem(pollModal.optionRadius),
              gap: pxToRem(pollModal.optionGap),
              height: pxToRem(pollModal.optionHeight),
              paddingLeft: pxToRem(pollModal.optionPaddingLeft),
              paddingRight: pxToRem(pollModal.optionPaddingRight),
            }}
          >
            <span
              aria-hidden="true"
              className={cn(
                "grid shrink-0 place-items-center bg-[hsl(var(--surface-tertiary))] text-[hsl(var(--text-secondary))]",
                DISPLAY_FONT,
              )}
              style={{
                borderRadius: pxToRem(pollModal.optionKeyRadius),
                fontSize: pxToRem(pollModal.optionKeyFontSize),
                fontWeight: 600,
                height: pxToRem(pollModal.optionKeySize),
                width: pxToRem(pollModal.optionKeySize),
              }}
            >
              {getPollOptionKey(index)}
            </span>
            <input
              aria-label={`${t("messages.pollModal.options")} ${getPollOptionKey(index)}`}
              className="min-w-0 flex-1 bg-transparent text-[hsl(var(--foreground))] focus-visible:outline-hidden"
              onChange={(event) =>
                setDraft((current) => setPollOption(current, index, event.target.value))
              }
              style={{ fontSize: pxToRem(pollModal.optionInputFontSize) }}
              type="text"
              value={option}
            />
            {/*
              İkiye inince kaldırma **çizilmez**, pasif bırakılmaz: pasif bir
              çöp kutusu "bir şey yanlış" der, oysa doğru olan taban sayıdır.
            */}
            {canRemovePollOption(draft) ? (
              <button
                aria-label={t("messages.pollModal.removeOption")}
                className="grid shrink-0 place-items-center text-[hsl(var(--text-soft))] transition hover:bg-[hsl(var(--danger)/0.12)] hover:text-[hsl(var(--danger))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                data-testid="poll-composer-remove-option"
                onClick={() => setDraft((current) => removePollOption(current, index))}
                style={{
                  borderRadius: pxToRem(pollModal.optionRemoveRadius),
                  height: pxToRem(pollModal.optionRemoveSize),
                  width: pxToRem(pollModal.optionRemoveSize),
                }}
                type="button"
              >
                <X
                  aria-hidden="true"
                  style={{
                    height: pxToRem(pollModal.optionRemoveIconSize),
                    width: pxToRem(pollModal.optionRemoveIconSize),
                  }}
                />
              </button>
            ) : null}
          </div>
        ))}
      </div>

      <button
        className="flex w-full items-center justify-center border-dashed text-[hsl(var(--primary))] transition hover:bg-[hsl(var(--primary)/0.08)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:cursor-not-allowed disabled:opacity-45"
        data-testid="poll-composer-add-option"
        disabled={!canAddPollOption(draft)}
        onClick={() => setDraft((current) => addPollOption(current))}
        style={{
          borderRadius: pxToRem(pollModal.addOptionRadius),
          borderStyle: "dashed",
          borderWidth: hairline(),
          fontSize: pxToRem(pollModal.addOptionFontSize),
          fontWeight: 600,
          gap: pxToRem(pollModal.addOptionGap),
          height: pxToRem(pollModal.addOptionHeight),
          marginTop: pxToRem(pollModal.optionsGap),
        }}
        type="button"
      >
        <Plus
          aria-hidden="true"
          style={{
            height: pxToRem(pollModal.addOptionIconSize),
            width: pxToRem(pollModal.addOptionIconSize),
          }}
        />
        {t("messages.pollModal.addOption")}
      </button>

      <div
        className="flex flex-col"
        style={{
          borderTop: `${hairline()} solid hsl(var(--border)/0.5)`,
          gap: pxToRem(pollModal.settingsGap),
          marginTop: pxToRem(pollModal.settingsMarginTop),
          paddingTop: pxToRem(pollModal.settingsPaddingTop),
        }}
      >
        <div className="flex items-center" style={{ gap: pxToRem(pollModal.settingRowGap) }}>
          <span
            className="min-w-0 flex-1 text-[hsl(var(--foreground))]"
            id={multiLabelId}
            style={{
              fontSize: pxToRem(pollModal.settingLabelFontSize),
              fontWeight: 600,
              lineHeight: pollModal.settingLabelLineHeight,
            }}
          >
            {t("messages.pollModal.multi")}
          </span>
          <ToggleSwitch
            checked={draft.multi}
            label={t("messages.pollModal.multi")}
            labelledById={multiLabelId}
            onChange={(checked) => setDraft((current) => ({ ...current, multi: checked }))}
            testId="poll-composer-multi"
          />
        </div>

        <div className="flex items-center" style={{ gap: pxToRem(pollModal.settingRowGap) }}>
          <span
            className="min-w-0 flex-1 text-[hsl(var(--foreground))]"
            id={anonymousLabelId}
            style={{
              fontSize: pxToRem(pollModal.settingLabelFontSize),
              fontWeight: 600,
              lineHeight: pollModal.settingLabelLineHeight,
            }}
          >
            {t("messages.pollModal.anonymous")}
          </span>
          <ToggleSwitch
            checked={draft.anonymous}
            label={t("messages.pollModal.anonymous")}
            labelledById={anonymousLabelId}
            onChange={(checked) => setDraft((current) => ({ ...current, anonymous: checked }))}
            testId="poll-composer-anonymous"
          />
        </div>

        <div className="flex items-center" style={{ gap: pxToRem(pollModal.settingRowGap) }}>
          <span
            className="min-w-0 flex-1 text-[hsl(var(--foreground))]"
            id={durationLabelId}
            style={{
              fontSize: pxToRem(pollModal.settingLabelFontSize),
              fontWeight: 600,
              lineHeight: pollModal.settingLabelLineHeight,
            }}
          >
            {t("messages.pollModal.duration")}
          </span>
          <SegmentedControl<PollDuration>
            labelledById={durationLabelId}
            onChange={(duration) => setDraft((current) => ({ ...current, duration }))}
            options={durationOptions}
            testId="poll-composer-duration"
            value={draft.duration}
          />
        </div>
      </div>

      <div
        className="flex items-center"
        style={{
          gap: pxToRem(pollModal.settingRowGap),
          marginTop: pxToRem(pollModal.settingsMarginTop),
        }}
      >
        <span
          className="min-w-0 flex-1 text-[hsl(var(--text-secondary))]"
          data-testid="poll-composer-footer-hint"
          style={{ fontSize: pxToRem(pollModal.optionsHintFontSize) }}
        >
          {t("messages.pollModal.footerHint")}
        </span>
        <span className="sr-only" id={reasonId}>
          {t("messages.pollModal.disabledReason")}
        </span>
        <button
          className="shrink-0 text-[hsl(var(--text-secondary))] transition hover:text-[hsl(var(--foreground))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          data-testid="poll-composer-cancel"
          onClick={onCancel}
          style={{ fontSize: pxToRem(pollModal.settingLabelFontSize), fontWeight: 600 }}
          type="button"
        >
          {t("messages.pollModal.cancel")}
        </button>
        <button
          // Pasif düğme **nedenini** taşır: `aria-describedby` olmasaydı ekran
          // okuyucu yalnız "pasif" der, neyin eksik olduğunu söylemezdi.
          aria-describedby={submittable ? undefined : reasonId}
          aria-disabled={!submittable}
          className="shrink-0 bg-[hsl(var(--primary))] text-white transition hover:bg-[hsl(var(--primary)/0.9)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:cursor-not-allowed disabled:opacity-45"
          data-testid="poll-composer-submit"
          disabled={!submittable || isSubmitting}
          onClick={() => onSubmit(toPollCreateRequest(draft))}
          style={{
            borderRadius: pxToRem(pollModal.questionFieldRadius),
            fontSize: pxToRem(pollModal.settingLabelFontSize),
            fontWeight: 600,
            height: pxToRem(pollModal.optionHeight),
            padding: `0 ${pxToRem(pollModal.questionFieldPaddingX)}`,
          }}
          type="button"
        >
          {t("messages.pollModal.submit")}
        </button>
      </div>

      <p
        className="text-[hsl(var(--text-soft))]"
        data-testid="poll-composer-subtitle"
        style={{
          fontSize: pxToRem(pollModal.optionsHintFontSize),
          marginTop: pxToRem(pollModal.optionsGap),
        }}
      >
        {t("messages.pollModal.subtitle", {
          count: eligibleVoterCount,
          name: conversationName,
        })}
      </p>
    </div>
  );
}
