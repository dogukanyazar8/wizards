"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { Smile } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { WindowCloseButton } from "@/components/ui/window-close-button";
import { SettingSelect } from "../rows/setting-select";
import { SettingActionButton } from "../rows/setting-actions";
import { useI18n } from "@/components/providers/locale-provider";
import { useSettingValue, useSettingsRowRuntime } from "@/lib/settings/use-setting-value";
import { SETTINGS_METRICS, hairline, pxToRem } from "@/lib/settings/metrics";
import {
  appendProfileStatusEmoji,
  PROFILE_STATUS_EMOJI_MAX_LENGTH,
  PROFILE_STATUS_MAX_LENGTH,
} from "@wizards/types";
import {
  loadProfileEmojiCatalog,
  getCachedProfileEmojiCatalog,
  normalizeEmojiQuery,
  PROFILE_EMOJI_PAGE_SIZE,
  type ProfileEmojiEntry,
} from "@/lib/settings/profile-emoji-catalog";
import type { SettingsRowLabelIds } from "../rows/settings-row";

const { input, action } = SETTINGS_METRICS.controls;
const buttonClass =
  "border border-[hsl(var(--border))] bg-[hsl(var(--surface-soft))] hover:bg-[var(--surface-hover)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:cursor-not-allowed disabled:opacity-50";
const buttonStyle: React.CSSProperties = {
  borderRadius: pxToRem(action.radius),
  minHeight: pxToRem(action.height),
  padding: `0 ${pxToRem(action.paddingX)}`,
  fontSize: pxToRem(action.fontSize),
  fontWeight: action.weight,
};

export function ProfileEmojiBlock({
  labelledById,
  describedById,
}: Partial<SettingsRowLabelIds> = {}) {
  const { t } = useI18n();
  const emoji = useSettingValue<string>("pe", "");
  const status = useSettingValue<string>("ps", "");
  const runtime = useSettingsRowRuntime();
  const disabled = Boolean(runtime.disabledRows?.ps || runtime.disabledRows?.pe);
  const [open, setOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const prefetch = () => {
    void loadProfileEmojiCatalog().catch(() => {
      /* Opening presents the retry action. */
    });
  };

  return (
    <>
      <div
        data-block="profileEmoji"
        data-focus-surface
        className="flex min-w-0 items-center overflow-hidden bg-[hsl(var(--surface-base))] focus-within:ring-2 focus-within:ring-[hsl(var(--ring))]"
        style={{
          border: `${hairline()} solid hsl(var(--border) / ${input.borderAlpha})`,
          borderRadius: pxToRem(input.radius),
          width: pxToRem(input.width),
          opacity: disabled ? 0.55 : 1,
        }}
      >
        <button
          disabled={disabled}
          aria-label={t("settings.profile.chooseEmoji")}
          aria-haspopup="dialog"
          aria-expanded={open && !disabled}
          className="grid shrink-0 place-items-center border-r border-[hsl(var(--border))] px-2 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--ring))]"
          style={{
            minHeight: pxToRem(input.fontSize * input.lineHeight + input.paddingY * 2),
            minWidth: pxToRem(36),
          }}
          data-testid="profile-status-emoji"
          type="button"
          onPointerEnter={prefetch}
          onFocus={prefetch}
          onClick={() => setOpen(true)}
        >
          <Smile aria-hidden="true" size={16} />
        </button>
        {emoji.value ? (
          <span
            className="max-w-24 shrink-0 truncate pl-2"
            data-testid="profile-status-emojis"
            title={emoji.value}
          >
            {emoji.value}
          </span>
        ) : null}
        <input
          type="text"
          disabled={disabled}
          aria-labelledby={labelledById}
          aria-describedby={describedById}
          aria-label={labelledById ? undefined : t("settings.row.ps.title")}
          data-testid="setting-input-ps"
          maxLength={PROFILE_STATUS_MAX_LENGTH}
          className="min-w-0 flex-1 bg-transparent text-[hsl(var(--foreground))] outline-hidden"
          value={status.value}
          onChange={(event) => status.setValue(event.target.value)}
          style={{
            fontSize: pxToRem(input.fontSize),
            fontWeight: input.weight,
            lineHeight: input.lineHeight,
            padding: `${pxToRem(input.paddingY)} ${pxToRem(input.paddingX)}`,
          }}
        />
      </div>
      <Modal
        open={open && !disabled}
        onClose={() => setOpen(false)}
        overlayClassName="z-[110] backdrop-blur-none"
        className="max-w-sm p-0 backdrop-blur-none sm:p-0"
        hideHeader
        initialFocusRef={searchRef}
        style={{
          background: "hsl(var(--surface-base))",
          border: `${hairline()} solid hsl(var(--border))`,
          borderRadius: pxToRem(SETTINGS_METRICS.window.radius),
        }}
        title={t("settings.profile.chooseEmoji")}
        closeLabel={t("common.close")}
      >
        {open && !disabled ? (
          <ProfileEmojiPicker
            selected={emoji.value}
            onChange={emoji.setValue}
            onClose={() => setOpen(false)}
            searchRef={searchRef}
          />
        ) : null}
      </Modal>
    </>
  );
}

function ProfileEmojiPicker({
  selected,
  onChange,
  onClose,
  searchRef,
}: {
  selected: string;
  onChange: (value: string) => void;
  onClose: () => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
}) {
  const { t } = useI18n();
  const [entries, setEntries] = useState<ProfileEmojiEntry[] | null>(getCachedProfileEmojiCatalog);
  const categoryLabelId = useId();
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(0);
  useEffect(() => {
    let active = true;
    void loadProfileEmojiCatalog()
      .then((data) => {
        if (active) setEntries(data);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  const categories = useMemo(
    () => [...new Set(entries?.map((entry) => entry.category))],
    [entries],
  );
  const filtered = useMemo(() => {
    const needle = normalizeEmojiQuery(query.trim());
    return (
      entries?.filter(
        (entry) =>
          (!category || entry.category === category) &&
          (!needle || entry.keywords.includes(needle)),
      ) ?? []
    );
  }, [entries, category, query]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PROFILE_EMOJI_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const selections = useMemo(
    () =>
      Array.from(
        new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(selected),
        (part) => part.segment,
      ),
    [selected],
  );

  return (
    <div data-testid="profile-status-emoji-picker" className="text-[hsl(var(--foreground))]">
      <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-4 py-3">
        <span
          aria-hidden="true"
          style={{
            fontSize: pxToRem(SETTINGS_METRICS.nav.titleFontSize),
            fontWeight: SETTINGS_METRICS.nav.titleWeight,
          }}
        >
          {t("settings.profile.chooseEmoji")}
        </span>
        <WindowCloseButton aria-label={t("common.close")} onClick={onClose} />
      </div>
      <div className="space-y-3 p-4">
        <input
          ref={searchRef}
          type="search"
          aria-label={t("settings.profile.emojiSearch")}
          placeholder={t("settings.profile.emojiSearch")}
          className="w-full border border-[hsl(var(--border))] bg-[hsl(var(--surface-soft))] outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          style={{
            borderRadius: pxToRem(input.radius),
            padding: `${pxToRem(input.paddingY)} ${pxToRem(input.paddingX)}`,
            fontSize: pxToRem(input.fontSize),
            fontWeight: input.weight,
          }}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(0);
          }}
        />
        {selections.length > 0 ? (
          <div
            className="flex max-h-20 flex-wrap gap-1 overflow-y-auto"
            aria-label={t("settings.profile.selectedEmojis")}
          >
            {selections.map((native, index) => (
              <button
                key={`${index}:${native}`}
                type="button"
                className={buttonClass}
                style={buttonStyle}
                aria-label={`${t("settings.profile.removeEmoji")}: ${native}`}
                onClick={() =>
                  onChange(selections.filter((_, position) => position !== index).join(""))
                }
              >
                {native} ×
              </button>
            ))}
          </div>
        ) : null}
        {failed ? (
          <div role="alert" className="text-sm">
            {t("settings.profile.emojiLoadError")}{" "}
            <button
              className={buttonClass}
              style={buttonStyle}
              type="button"
              onClick={() => {
                setFailed(false);
                setAttempt((value) => value + 1);
              }}
            >
              {t("common.retry")}
            </button>
          </div>
        ) : !entries ? (
          <div role="status" className="py-6 text-sm">
            {t("settings.profile.emojiLoading")}
          </div>
        ) : (
          <>
            <span className="sr-only" id={categoryLabelId}>
              {t("settings.profile.emojiCategory")}
            </span>
            <SettingSelect
              width={352}
              labelledById={categoryLabelId}
              options={[
                { label: t("settings.profile.emojiAll") },
                ...categories.map((id) => ({ label: t(`settings.profile.emojiCategory.${id}`) })),
              ]}
              value={categories.indexOf(category) + 1}
              open={categoryOpen}
              onOpenChange={setCategoryOpen}
              onChange={(index) => {
                setCategory(categories[index - 1] ?? "");
                setPage(0);
              }}
            />
            <div
              className="grid grid-cols-8 gap-1 overflow-y-auto overscroll-contain p-1"
              style={{ height: "min(32dvh, 18rem)", alignContent: "start" }}
              data-testid="profile-status-emoji-grid"
            >
              {filtered
                .slice(
                  currentPage * PROFILE_EMOJI_PAGE_SIZE,
                  (currentPage + 1) * PROFILE_EMOJI_PAGE_SIZE,
                )
                .map((entry) => (
                  <button
                    key={entry.native}
                    type="button"
                    aria-label={entry.native}
                    title={entry.name}
                    disabled={
                      selected.length + entry.native.length > PROFILE_STATUS_EMOJI_MAX_LENGTH
                    }
                    className="grid h-9 place-items-center rounded-lg text-xl hover:bg-[hsl(var(--surface-soft))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--ring))] disabled:opacity-35"
                    onClick={() => onChange(appendProfileStatusEmoji(selected, entry.native))}
                  >
                    {entry.native}
                  </button>
                ))}
            </div>
            {!filtered.length ? (
              <p role="status" className="text-sm">
                {t("settings.profile.emojiEmpty")}
              </p>
            ) : null}
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                className={buttonClass}
                style={buttonStyle}
                disabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
              >
                {t("settings.profile.emojiPrevious")}
              </button>
              <span aria-live="polite" className="text-sm">
                {currentPage + 1} / {pageCount}
              </span>
              <button
                type="button"
                className={buttonClass}
                style={buttonStyle}
                disabled={currentPage + 1 >= pageCount}
                onClick={() => setPage(currentPage + 1)}
              >
                {t("settings.profile.emojiNext")}
              </button>
            </div>
          </>
        )}
        <p className="text-xs text-app-muted">
          {t("settings.profile.emojiLength", {
            current: selected.length,
            max: PROFILE_STATUS_EMOJI_MAX_LENGTH,
          })}
        </p>
      </div>
      <div className="flex justify-end gap-2 border-t border-[hsl(var(--border))] bg-[hsl(var(--surface-soft))] px-4 py-3">
        {selected ? (
          <button
            type="button"
            className={buttonClass}
            style={buttonStyle}
            data-testid="profile-status-emoji-remove"
            onClick={() => onChange("")}
          >
            {t("settings.profile.removeEmojis")}
          </button>
        ) : null}
        <SettingActionButton
          testId="profile-status-emoji-done"
          entry={{ label: t("settings.profile.emojiDone"), onClick: onClose }}
        />
      </div>
    </div>
  );
}
