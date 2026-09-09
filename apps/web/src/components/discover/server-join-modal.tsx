"use client";

import React, { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import type { DiscoverServer } from "@wizards/types";

import type { ServerJoinModalSlotProps } from "@/components/discover/discover-page";
import { useI18n } from "@/components/providers/locale-provider";
import { Modal } from "@/components/ui/modal";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { WindowCloseButton } from "@/components/ui/window-close-button";
import { DISCOVER_CATEGORIES } from "@/lib/discover/contracts";
import { hairline, pxToEm, pxToRem } from "@/lib/discover/metrics";
import { getServerIconToneColor } from "@/lib/servers/server-icon-tone";
import {
  applyDiscoverMembershipSuccess,
  joinDiscoverServer,
  parseInviteCode,
  redeemDiscoverInvite,
  resolveDiscoverJoinErrorMessageKey,
} from "@/lib/discover/join-client";

const JOIN_VISIBILITY_STORAGE_KEY = "wizards.discover.joinVisibility.v1";

export type ServerJoinSelection = {
  readonly code: string;
  readonly selectedServerId: string | null;
};

type JoinResult = { name: string; serverId: string };
type JoinActions = {
  joinByCode(code: string): Promise<JoinResult>;
  joinByServerId(serverId: string): Promise<JoinResult>;
};

export function createServerJoinSelection(
  serverOptions: readonly DiscoverServer[],
): ServerJoinSelection {
  return { code: "", selectedServerId: serverOptions[0]?.id ?? null };
}

export function reconcileServerJoinOptions(
  selection: ServerJoinSelection,
  serverOptions: readonly DiscoverServer[],
): ServerJoinSelection {
  if (selection.code.length > 0 || selection.selectedServerId !== null) {
    return selection;
  }

  const firstServerId = serverOptions[0]?.id;
  return firstServerId ? { code: "", selectedServerId: firstServerId } : selection;
}

export function updateServerJoinCode(
  selection: ServerJoinSelection,
  rawCode: string,
): ServerJoinSelection {
  const parsed = parseInviteCode(rawCode);
  return { code: parsed ?? rawCode, selectedServerId: null };
}

export function selectServerJoinOption(
  selection: ServerJoinSelection,
  serverId: string,
): ServerJoinSelection {
  return { code: "", selectedServerId: serverId };
}

export async function readServerJoinClipboard(
  readText: () => Promise<string>,
): Promise<{ ok: true; value: string } | { ok: false }> {
  try {
    return { ok: true, value: await readText() };
  } catch {
    return { ok: false };
  }
}

export async function submitServerJoinSelection(
  selection: ServerJoinSelection,
  actions: JoinActions,
): Promise<
  | { status: "success"; server: JoinResult }
  | { status: "error"; error: unknown }
  | { status: "invalid"; reason: "invalid-code" | "missing-selection" }
> {
  const parsedCode = selection.code.length > 0 ? parseInviteCode(selection.code) : null;
  if (selection.code.length > 0 && parsedCode === null) {
    return { reason: "invalid-code", status: "invalid" };
  }
  if (parsedCode === null && selection.selectedServerId === null) {
    return { reason: "missing-selection", status: "invalid" };
  }

  try {
    let server: JoinResult;
    if (parsedCode) {
      server = await actions.joinByCode(parsedCode);
    } else if (selection.selectedServerId) {
      server = await actions.joinByServerId(selection.selectedServerId);
    } else {
      return { reason: "missing-selection", status: "invalid" };
    }
    return { server, status: "success" };
  } catch (error) {
    return { error, status: "error" };
  }
}

function categoryTone(server: DiscoverServer) {
  return (
    DISCOVER_CATEGORIES.find((category) => category.key === server.category)?.tone ?? "primary"
  );
}

function initialVisibility() {
  try {
    return localStorage.getItem(JOIN_VISIBILITY_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

export function ServerJoinModal({
  onRequestClose,
  onServerJoined,
  serverOptions,
}: ServerJoinModalSlotProps) {
  const { locale, t } = useI18n();
  const queryClient = useQueryClient();
  const codeInputRef = useRef<HTMLInputElement>(null);
  const [selectionState, setSelection] = useState(() => createServerJoinSelection(serverOptions));
  const [clipboardDenied, setClipboardDenied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [visibleToFriends, setVisibleToFriends] = useState(initialVisibility);

  const selection = reconcileServerJoinOptions(selectionState, serverOptions);
  if (selection !== selectionState) {
    setSelection(selection);
  }

  const parsedCode = selection.code.length > 0 ? parseInviteCode(selection.code) : null;
  const invalidCode = selection.code.length > 0 && parsedCode === null;
  const canSubmit =
    !isSubmitting && !invalidCode && (parsedCode !== null || selection.selectedServerId !== null);
  const helpText = invalidCode
    ? t("discover.join.codeInvalid")
    : (submitError ?? t("discover.join.codeHelp"));

  const chooseCode = (rawCode: string) => {
    setSubmitError(null);
    setSelection((current) => updateServerJoinCode(current, rawCode));
  };

  const chooseServer = (serverId: string) => {
    setSubmitError(null);
    setSelection((current) => selectServerJoinOption(current, serverId));
  };

  const pasteCode = async () => {
    const result = await readServerJoinClipboard(() => navigator.clipboard.readText());
    if (!result.ok) {
      setClipboardDenied(true);
      return;
    }
    chooseCode(result.value);
  };

  const submit = async () => {
    if (!canSubmit) {
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);
    const result = await submitServerJoinSelection(selection, {
      joinByCode: redeemDiscoverInvite,
      joinByServerId: joinDiscoverServer,
    });
    if (result.status === "success") {
      await applyDiscoverMembershipSuccess(queryClient, result.server.serverId, true);
      onServerJoined({
        id: result.server.serverId,
        name: result.server.name,
        systemChannelId: null,
      });
      onRequestClose();
    } else if (result.status === "error") {
      const key = resolveDiscoverJoinErrorMessageKey(result.error);
      setSubmitError(t(`${key}.description`));
    }
    setIsSubmitting(false);
  };

  const changeVisibility = (checked: boolean) => {
    setVisibleToFriends(checked);
    // TODO(api): sunucu görünürlük tercihi ucu yok; ürün karşılığı gelene kadar yerel tercih.
    try {
      localStorage.setItem(JOIN_VISIBILITY_STORAGE_KEY, String(checked));
    } catch {
      // Depolama engeli modalın ana katılma işlevini bozmamalı.
    }
  };

  const moveRadio = (currentIndex: number, direction: -1 | 1) => {
    const nextIndex = (currentIndex + direction + serverOptions.length) % serverOptions.length;
    const next = serverOptions[nextIndex];
    if (next) {
      chooseServer(next.id);
      document.getElementById(`discover-join-option-${next.id}`)?.focus();
    }
  };

  return (
    <Modal
      className="max-w-[31rem] overflow-hidden rounded-[1.375rem] border border-[hsl(var(--border))] bg-[hsl(var(--surface-card))] p-0 shadow-[0_2.5rem_5.625rem_-2.5rem_hsl(var(--shadow-color))] sm:rounded-[1.375rem] sm:p-0"
      closeLabel={t("discover.join.close")}
      description={t("discover.join.subtitle")}
      hideHeader
      initialFocusRef={codeInputRef}
      onClose={onRequestClose}
      open
      overlayClassName="items-center bg-[hsl(var(--backdrop)/0.62)] p-4 backdrop-blur-none sm:p-[2.5rem]"
      title={t("discover.join.title")}
    >
      <div className="flex flex-col" data-discover-surface="">
        <header
          className="flex items-center"
          style={{
            borderBottom: `${hairline()} solid hsl(var(--border)/0.6)`,
            gap: pxToRem(12),
            padding: `${pxToRem(20)} ${pxToRem(24)} ${pxToRem(16)}`,
          }}
        >
          <span
            aria-hidden="true"
            className="grid shrink-0 place-items-center bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))]"
            style={{ borderRadius: pxToRem(13), height: pxToRem(38), width: pxToRem(38) }}
          >
            <UserPlus size={pxToEm(19)} strokeWidth={1.9} />
          </span>
          <span className="min-w-0">
            <span
              className="block text-[hsl(var(--foreground))]"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: pxToRem(17),
                fontWeight: 600,
                letterSpacing: "-0.02em",
                lineHeight: 1.2,
              }}
            >
              {t("discover.join.title")}
            </span>
            <span
              className="block text-[hsl(var(--text-muted))]"
              style={{ fontSize: pxToRem(12.5), marginTop: pxToRem(5) }}
            >
              {t("discover.join.subtitle")}
            </span>
          </span>
          <WindowCloseButton
            aria-label={t("discover.join.close")}
            className="relative ml-auto before:absolute before:-inset-1.5 before:content-['']"
            onClick={onRequestClose}
          />
        </header>

        <div
          className="flex flex-col"
          style={{ gap: pxToRem(15), padding: `${pxToRem(19)} ${pxToRem(24)}` }}
        >
          <div>
            <label
              className="block uppercase text-[hsl(var(--text-muted))]"
              htmlFor="discover-join-code"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: pxToRem(11),
                fontWeight: 600,
                letterSpacing: "0.13em",
                lineHeight: 1,
                paddingBottom: pxToRem(8),
              }}
            >
              {t("discover.join.codeLabel")}
            </label>
            <div
              className="flex items-center bg-[hsl(var(--surface-base))]"
              style={{
                border: `${hairline()} solid hsl(var(--${invalidCode ? "danger" : "primary"})/${invalidCode ? "1" : "0.4"})`,
                borderRadius: pxToRem(12),
                gap: pxToRem(9),
                height: pxToRem(42),
                paddingInline: pxToRem(13),
              }}
            >
              <span
                className="shrink-0 text-[hsl(var(--text-muted))]"
                style={{ fontFamily: "var(--font-sans)", fontSize: pxToRem(13), fontWeight: 500 }}
              >
                whispr.app/
              </span>
              <input
                aria-describedby="discover-join-code-help"
                aria-invalid={invalidCode}
                className="min-w-0 flex-1 border-0 bg-transparent text-[hsl(var(--foreground))] outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                id="discover-join-code"
                onChange={(event) => chooseCode(event.currentTarget.value)}
                placeholder={t("discover.join.codePlaceholder")}
                ref={codeInputRef}
                style={{ fontFamily: "var(--font-sans)", fontSize: pxToRem(13.5), fontWeight: 600 }}
                value={selection.code}
              />
              <button
                className="shrink-0 bg-[hsl(var(--surface-tertiary))] text-[hsl(var(--text-secondary))] disabled:cursor-not-allowed disabled:opacity-45"
                disabled={clipboardDenied}
                onClick={() => void pasteCode()}
                style={{
                  borderRadius: pxToRem(9),
                  fontFamily: "var(--font-sans)",
                  fontSize: pxToRem(11.5),
                  fontWeight: 600,
                  height: pxToRem(30),
                  paddingInline: pxToRem(12),
                }}
                type="button"
              >
                {t("discover.join.paste")}
              </button>
            </div>
            <p
              className={
                invalidCode || submitError
                  ? "text-[hsl(var(--danger))]"
                  : "text-[hsl(var(--text-muted))]"
              }
              id="discover-join-code-help"
              style={{ fontSize: pxToRem(11.5), lineHeight: 1.5, marginTop: pxToRem(8) }}
            >
              {helpText}
            </p>
            {clipboardDenied ? (
              <p
                className="text-[hsl(var(--danger))]"
                style={{ fontSize: pxToRem(11.5), marginTop: pxToRem(4) }}
              >
                {t("discover.join.clipboardDenied")}
              </p>
            ) : null}
          </div>

          {serverOptions.length > 0 ? (
            <>
              <div className="flex items-center" style={{ gap: pxToRem(11) }}>
                <span
                  aria-hidden="true"
                  className="flex-1 bg-[hsl(var(--border)/0.6)]"
                  style={{ height: hairline() }}
                />
                <span
                  className="uppercase text-[hsl(var(--text-muted))]"
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: pxToRem(10.5),
                    fontWeight: 600,
                    letterSpacing: "0.14em",
                    lineHeight: 1,
                  }}
                >
                  {t("discover.join.orFromIndex")}
                </span>
                <span
                  aria-hidden="true"
                  className="flex-1 bg-[hsl(var(--border)/0.6)]"
                  style={{ height: hairline() }}
                />
              </div>
              <div className="flex flex-col" role="radiogroup" style={{ gap: pxToRem(7) }}>
                {serverOptions.map((server, index) => {
                  const selected = selection.selectedServerId === server.id;
                  const tone = categoryTone(server);
                  const iconTone = server.iconColor ?? tone;
                  const category = server.category
                    ? t(`discover.category.${server.category}`)
                    : null;
                  return (
                    <button
                      aria-checked={selected}
                      className="flex items-center text-left transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                      id={`discover-join-option-${server.id}`}
                      key={server.id}
                      onClick={() => chooseServer(server.id)}
                      onKeyDown={(event) => {
                        if (event.key === "ArrowDown" || event.key === "ArrowRight") {
                          event.preventDefault();
                          moveRadio(index, 1);
                        } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
                          event.preventDefault();
                          moveRadio(index, -1);
                        }
                      }}
                      role="radio"
                      style={{
                        background: selected ? "hsl(var(--primary)/0.08)" : "transparent",
                        border: `${hairline()} solid ${selected ? "hsl(var(--primary)/0.45)" : "hsl(var(--border)/0.6)"}`,
                        borderRadius: pxToRem(13),
                        gap: pxToRem(11),
                        padding: `${pxToRem(10)} ${pxToRem(12)}`,
                      }}
                      tabIndex={selected ? 0 : -1}
                      type="button"
                    >
                      <span
                        aria-hidden="true"
                        className="grid shrink-0 place-items-center"
                        style={{
                          background: server.iconUrl
                            ? `center / cover no-repeat url(${JSON.stringify(server.iconUrl)})`
                            : getServerIconToneColor(iconTone, 0.14),
                          borderRadius: pxToRem(11),
                          color: server.iconUrl
                            ? "transparent"
                            : `color-mix(in srgb, ${getServerIconToneColor(iconTone)} 30%, hsl(var(--foreground)))`,
                          fontFamily: "var(--font-display)",
                          fontSize: pxToRem(13),
                          fontWeight: 600,
                          height: pxToRem(34),
                          width: pxToRem(34),
                        }}
                      >
                        {server.iconUrl ? "" : server.initials}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className="block truncate text-[hsl(var(--foreground))]"
                          style={{
                            fontFamily: "var(--font-sans)",
                            fontSize: pxToRem(13),
                            fontWeight: 600,
                            lineHeight: 1.3,
                          }}
                        >
                          {server.name}
                        </span>
                        <span
                          className="block truncate"
                          style={{
                            color:
                              "color-mix(in srgb, hsl(var(--text-muted)) 88%, hsl(var(--foreground)))",
                            fontSize: pxToRem(11.5),
                            marginTop: pxToRem(4),
                          }}
                        >
                          {category
                            ? t("discover.join.optionMeta", {
                                category,
                                count: new Intl.NumberFormat(locale).format(server.memberCount),
                              })
                            : t("discover.card.members", {
                                count: new Intl.NumberFormat(locale).format(server.memberCount),
                              })}
                        </span>
                      </span>
                      <span
                        aria-hidden="true"
                        className="grid shrink-0 place-items-center rounded-full"
                        style={{
                          background: selected ? "hsl(var(--primary))" : "transparent",
                          border: `${pxToRem(1.5)} solid ${selected ? "hsl(var(--primary))" : "hsl(var(--border))"}`,
                          height: pxToRem(20),
                          width: pxToRem(20),
                        }}
                      >
                        {selected ? (
                          <span
                            className="rounded-full bg-[hsl(var(--primary-foreground))]"
                            style={{ height: pxToRem(8), width: pxToRem(8) }}
                          />
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : null}

          <div
            className="flex items-center bg-[hsl(var(--surface-secondary)/0.8)]"
            style={{
              border: `${hairline()} solid hsl(var(--border)/0.6)`,
              borderRadius: pxToRem(13),
              gap: pxToRem(14),
              padding: `${pxToRem(11)} ${pxToRem(13)}`,
            }}
          >
            <span className="min-w-0 flex-1">
              <span
                className="block text-[hsl(var(--foreground))]"
                id="discover-join-visibility-label"
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: pxToRem(12.5),
                  fontWeight: 600,
                  lineHeight: 1.3,
                }}
              >
                {t("discover.join.visibility")}
              </span>
              <span
                className="block"
                id="discover-join-visibility-help"
                style={{
                  color: "color-mix(in srgb, hsl(var(--text-muted)) 88%, hsl(var(--foreground)))",
                  fontSize: pxToRem(11.5),
                  marginTop: pxToRem(3),
                }}
              >
                {t("discover.join.visibilityHelp")}
              </span>
            </span>
            <ToggleSwitch
              checked={visibleToFriends}
              describedById="discover-join-visibility-help"
              label={t("discover.join.visibility")}
              labelledById="discover-join-visibility-label"
              onChange={changeVisibility}
              testId="discover-join-visibility"
            />
          </div>
        </div>

        <footer
          className="flex items-center"
          style={{
            borderTop: `${hairline()} solid hsl(var(--border)/0.6)`,
            gap: pxToRem(10),
            padding: `${pxToRem(16)} ${pxToRem(24)} ${pxToRem(20)}`,
          }}
        >
          <span
            className="min-w-0 flex-1 text-[hsl(var(--text-muted))]"
            style={{ fontSize: pxToRem(12) }}
          >
            {t("discover.join.terms")}
          </span>
          <button
            className="shrink-0 border border-[hsl(var(--border))] bg-[hsl(var(--surface-card))] text-[hsl(var(--text-secondary))] transition-colors hover:bg-[var(--surface-hover)]"
            onClick={onRequestClose}
            style={{
              borderRadius: pxToRem(12),
              fontFamily: "var(--font-sans)",
              fontSize: pxToRem(13),
              fontWeight: 600,
              height: pxToRem(38),
              paddingInline: pxToRem(16),
            }}
            type="button"
          >
            {t("discover.join.cancel")}
          </button>
          <button
            className="shrink-0 text-[hsl(var(--primary-foreground))] transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
            disabled={!canSubmit}
            onClick={() => void submit()}
            style={{
              background: "color-mix(in srgb, hsl(var(--primary)) 90%, hsl(var(--shadow-color)))",
              borderRadius: pxToRem(12),
              boxShadow: `0 ${pxToRem(10)} ${pxToRem(22)} ${pxToRem(-14)} hsl(var(--primary))`,
              fontFamily: "var(--font-sans)",
              fontSize: pxToRem(13),
              fontWeight: 600,
              height: pxToRem(38),
              paddingInline: pxToRem(18),
            }}
            type="button"
          >
            {isSubmitting ? t("discover.joining") : t("discover.join.submit")}
          </button>
        </footer>
      </div>
    </Modal>
  );
}
