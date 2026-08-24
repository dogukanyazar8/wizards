"use client";

import React, { useMemo, useState } from "react";
import { Search, Users } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { Modal } from "@/components/ui/modal";
import { useI18n } from "@/components/providers/locale-provider";
import { filterFriends } from "@/lib/friends/sort";
import { MESSAGES_METRICS, hairline, pxToRem } from "@/lib/messages/metrics";

/**
 * `Yeni mesaj` kişi seçici — SPEC-MESAJLAR §10.
 *
 * Grup modalının adım 1 kabuğunun **tek seçimli** hâli: çip yok, onay kutusu yok,
 * satıra tıklamak doğrudan sohbeti açar. Çoklu seçim kabuğunu tek kişilik bir
 * akışa uydurmak, kullanıcıya "seç, sonra onayla" diye iki adım çıkarırdı —
 * oysa burada tek adım yeter.
 *
 * Arama `filterFriends` ile: Türkçe küçültme kuralı (`I`/`ı`, `İ`/`i`) tek yerde
 * duruyor ve Arkadaşlar paneliyle aynı sonucu veriyor.
 */

const { groupModal } = MESSAGES_METRICS;

/** Seçicinin ihtiyacı olan en küçük kayıt; çağıran daha fazlasını taşıyabilir. */
export type NewMessagePickerFriend = {
  avatarUrl: string | null;
  displayName: string | null;
  id: string;
  name: string;
  username: string;
};

export type NewMessagePickerProps = {
  friends: readonly NewMessagePickerFriend[];
  onClose: () => void;
  onNewGroup: () => void;
  onSelect: (userId: string) => void;
};

export function NewMessagePickerContent({
  friends,
  onNewGroup,
  onSelect,
}: Omit<NewMessagePickerProps, "onClose">) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const visible = useMemo(() => filterFriends(friends, search), [friends, search]);

  return (
    <div data-testid="new-message-picker">
      <div
        className="flex items-center bg-[hsl(var(--surface-soft)/0.6)]"
        style={{
          border: `${hairline()} solid hsl(var(--border)/0.6)`,
          borderRadius: pxToRem(groupModal.searchRadius),
          gap: pxToRem(groupModal.searchGap),
          height: pxToRem(groupModal.searchHeight),
          padding: `0 ${pxToRem(groupModal.searchPaddingX)}`,
        }}
      >
        <Search
          aria-hidden="true"
          className="shrink-0 text-[hsl(var(--text-soft))]"
          style={{
            height: pxToRem(groupModal.searchIconSize),
            width: pxToRem(groupModal.searchIconSize),
          }}
        />
        <input
          aria-label={t("messages.groupModal.searchPlaceholder")}
          className="min-w-0 flex-1 bg-transparent text-[hsl(var(--foreground))] focus-visible:outline-hidden"
          data-testid="new-message-picker-search"
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("messages.groupModal.searchPlaceholder")}
          style={{ fontSize: pxToRem(groupModal.searchFontSize) }}
          type="search"
          value={search}
        />
      </div>

      <ul
        className="flex flex-col overflow-y-auto"
        data-testid="new-message-picker-list"
        style={{
          gap: pxToRem(groupModal.candidateRowGap),
          marginTop: pxToRem(groupModal.candidatesPaddingTop),
          maxHeight: pxToRem(groupModal.candidatesMaxHeight),
        }}
      >
        {visible.map((friend) => (
          <li key={friend.id}>
            <button
              className="flex w-full items-center text-left transition hover:bg-[hsl(var(--surface-soft)/0.7)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
              data-testid="new-message-picker-row"
              onClick={() => onSelect(friend.id)}
              style={{
                borderRadius: pxToRem(groupModal.candidateRowRadius),
                gap: pxToRem(groupModal.candidateRowGap),
                padding: `${pxToRem(groupModal.candidateRowPaddingY)} ${pxToRem(groupModal.candidateRowPaddingX)}`,
              }}
              type="button"
            >
              <Avatar
                alt={friend.displayName ?? friend.username}
                className="rounded-full"
                fallback={friend.displayName ?? friend.username}
                src={friend.avatarUrl}
                style={{
                  height: pxToRem(groupModal.candidateAvatarSize),
                  width: pxToRem(groupModal.candidateAvatarSize),
                }}
              />
              <span className="min-w-0 flex-1">
                <span
                  className="block truncate text-[hsl(var(--foreground))]"
                  style={{
                    fontSize: pxToRem(groupModal.candidateNameFontSize),
                    fontWeight: 600,
                  }}
                >
                  {friend.displayName ?? friend.username}
                </span>
                <span
                  className="block truncate text-[hsl(var(--text-secondary))]"
                  style={{ fontSize: pxToRem(groupModal.candidateStatusFontSize) }}
                >
                  @{friend.username}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <button
        className="mt-4 inline-flex items-center text-[hsl(var(--primary))] transition hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
        data-testid="new-message-picker-new-group"
        onClick={onNewGroup}
        style={{
          fontSize: pxToRem(groupModal.candidateStatusFontSize),
          fontWeight: 600,
          gap: pxToRem(groupModal.searchGap),
        }}
        type="button"
      >
        <Users aria-hidden="true" className="h-4 w-4" />
        {t("messages.empty.newGroup")}
      </button>
    </div>
  );
}

export function NewMessagePicker({ onClose, ...content }: NewMessagePickerProps) {
  const { t } = useI18n();

  return (
    <Modal className="max-w-xl" onClose={onClose} open title={t("messages.empty.newMessage")}>
      <NewMessagePickerContent {...content} />
    </Modal>
  );
}
