"use client";

import React, { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { MessageSearchHitDTO } from "@wizards/types";

import {
  MessageSearchResults,
  type SearchFilterChip,
} from "@/components/messages/message-search-results";
import { MessagesSidePanel } from "@/components/messages/messages-side-panel";
import { useI18n } from "@/components/providers/locale-provider";
import { useMessageSearch } from "@/hooks/use-message-search";
import {
  formatDateFilterLabel,
  toDateFilterRange,
  type DateFilterDraft,
} from "@/lib/messages/date-filter";
import { MESSAGES_METRICS, hairline, pxToRem } from "@/lib/messages/metrics";
import { useUiScaleStep } from "@/hooks/use-ui-scale-step";
import { selectMessagesDensity } from "@/lib/messages/density";

/**
 * Mesaj arama paneli — SPEC-MESAJLAR §6.2, karar #6.
 *
 * Bugünkü yüzen popover kalkıyor: arama artık ekranın bir sütunu ve **global**.
 * Popover'ın sorunu kapsamıydı — açık sohbetin içinde arıyordu ve "şu cümleyi
 * biri söylemişti" sorusunun cevabı çoğu zaman başka bir sohbette.
 *
 * `Kişi:` çipi 1:1 sohbette karşı tarafla **ön-dolu** gelir; kaldırılınca arama
 * bütün sohbetlere yayılır. Grupta ön-dolu gelmez, çünkü grupta "karşı taraf"
 * diye tek bir kişi yok.
 */

const { sidePanel } = MESSAGES_METRICS;
const EMPTY_DRAFT: DateFilterDraft = { from: "", to: "" };

export type MessagesSearchPanelProps = {
  onClose: () => void;
  onSelect: (hit: MessageSearchHitDTO) => void;
  overlay?: boolean;
  /** 1:1 sohbetin karşı tarafı; grupta `null` verilir. */
  personFilter?: { id: string; name: string } | null;
};

export function MessagesSearchPanel({
  onClose,
  onSelect,
  overlay = false,
  personFilter = null,
}: MessagesSearchPanelProps) {
  const { locale, t } = useI18n();
  const [query, setQuery] = useState("");
  /**
   * Ön-dolu filtre yalnız **açılışta** okunur; sonrasında kullanıcının kaldırma
   * kararı kazanır. Her render'da yeniden okunsaydı, kaldırılan çip sohbet
   * güncellendiği anda geri gelirdi. Bu yüzden başlangıç değeri durumun içine
   * dondurulmuş durumda — panel sohbet başına yeniden monte ediliyor.
   */
  const [initialPerson] = useState(personFilter);
  const [personId, setPersonId] = useState<string | null>(personFilter?.id ?? null);

  const [draft, setDraft] = useState<DateFilterDraft>(EMPTY_DRAFT);
  const [pickerOpen, setPickerOpen] = useState(false);
  const range = toDateFilterRange(draft);

  // Aralık **doğrulanmış** hâliyle sorguya giriyor: yarım bir seçim (yalnız
  // başlangıç) sorguyu hiç değiştirmiyor, yoksa kullanıcı tarihi yazarken
  // liste her tuşta daralırdı.
  const filters = useMemo(
    () => ({ from: range?.from ?? null, personId, to: range?.to ?? null }),
    [personId, range?.from, range?.to],
  );
  const scale = useUiScaleStep();
  /**
   * Sayfa boyu yoğunluktan türer: sözlük kaç satırın kaydırmasız görüneceğini
   * söylüyor, sayfa onun katı olmalı. Bire bir alınsaydı (ölçek 1'de 3) her
   * kaydırma hareketi yeni bir istek doğururdu.
   */
  const pageSize = Math.max(20, selectMessagesDensity(scale).searchResults * 3);
  const search = useMessageSearch({ filters, pageSize, query });

  const chips: SearchFilterChip[] = [];

  if (personId && initialPerson) {
    chips.push({
      active: true,
      id: "person",
      label: t("messages.panel.search.personFilter", { name: initialPerson.name }),
      onRemove: () => setPersonId(null),
    });
  }

  // `Tarih ekle`: seçili aralık varsa etiketli ve kaldırılabilir çip, yoksa
  // seçiciyi açan nötr çip.
  chips.push(
    range
      ? {
          active: false,
          id: "date",
          label: formatDateFilterLabel(draft, locale),
          onClick: () => setPickerOpen(true),
          onRemove: () => {
            setDraft(EMPTY_DRAFT);
            setPickerOpen(false);
          },
        }
      : {
          active: false,
          id: "date",
          label: t("messages.panel.search.dateFilter"),
          onClick: () => setPickerOpen((current) => !current),
        },
  );

  return (
    <MessagesSidePanel
      icon={<Search />}
      onClose={onClose}
      overlay={overlay}
      testId="messages-search-panel"
      title={t("messages.panel.search.title")}
    >
      {pickerOpen ? (
        <div
          className="shrink-0 bg-[hsl(var(--surface-soft)/0.5)]"
          data-testid="message-search-date-picker"
          style={{
            borderBottom: `${hairline()} solid hsl(var(--border)/0.5)`,
            display: "flex",
            gap: pxToRem(sidePanel.filterGap),
            padding: `0 ${pxToRem(sidePanel.searchPaddingX)} ${pxToRem(sidePanel.searchPaddingBottom)}`,
          }}
        >
          <label className="flex min-w-0 flex-1 flex-col text-[hsl(var(--text-secondary))]">
            <span style={{ fontSize: pxToRem(sidePanel.filterFontSize) }}>
              {t("messages.panel.search.dateFrom")}
            </span>
            <input
              className="min-w-0 bg-[hsl(var(--surface-card))] text-[hsl(var(--foreground))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
              data-testid="message-search-date-from"
              // `max` ters aralığı **girilmeden** engelliyor; doğrulama yine de
              // `toDateFilterRange`'de, çünkü tarayıcı desteği tekdüze değil.
              max={draft.to || undefined}
              onChange={(event) =>
                setDraft((current) => ({ ...current, from: event.target.value }))
              }
              style={{
                borderRadius: pxToRem(sidePanel.searchFieldRadius),
                fontSize: pxToRem(sidePanel.searchFieldFontSize),
                height: pxToRem(sidePanel.filterHeight),
                padding: `0 ${pxToRem(sidePanel.filterPaddingX)}`,
              }}
              type="date"
              value={draft.from}
            />
          </label>
          <label className="flex min-w-0 flex-1 flex-col text-[hsl(var(--text-secondary))]">
            <span style={{ fontSize: pxToRem(sidePanel.filterFontSize) }}>
              {t("messages.panel.search.dateTo")}
            </span>
            <input
              className="min-w-0 bg-[hsl(var(--surface-card))] text-[hsl(var(--foreground))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
              data-testid="message-search-date-to"
              min={draft.from || undefined}
              onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))}
              style={{
                borderRadius: pxToRem(sidePanel.searchFieldRadius),
                fontSize: pxToRem(sidePanel.searchFieldFontSize),
                height: pxToRem(sidePanel.filterHeight),
                padding: `0 ${pxToRem(sidePanel.filterPaddingX)}`,
              }}
              type="date"
              value={draft.to}
            />
          </label>
        </div>
      ) : null}

      <MessageSearchResults
        chips={chips}
        hasNextPage={search.hasNextPage}
        isRefreshing={search.isRefreshing}
        onChangeQuery={setQuery}
        onFetchNextPage={search.fetchNextPage}
        onSelect={onSelect}
        query={query}
        results={search.results}
        totalLabel={search.totalLabel}
      />
    </MessagesSidePanel>
  );
}
