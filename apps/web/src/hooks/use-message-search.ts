"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MessageSearchHitDTO, MessageSearchPage } from "@wizards/types";

import { searchDmMessagesGlobal, type GlobalSearchInput } from "@/lib/messages/screen-client";

/**
 * Mesaj arama paneli durumu — SPEC-MESAJLAR §6.2, karar #6.
 *
 * Üç kural buraya alındı çünkü üçü de panelin çiziminden bağımsız ve üçü de
 * yanlış yapılırsa aynı belirtiyi verir (zıplayan liste):
 *
 * 1. **300ms debounce, 2 karakter tabanı.** Her tuşta sorgu atmak sunucuya
 *    kelimenin her ön ekini sordurur; tek harflik sorgu da zaten her şeyi eşler.
 * 2. **Önceki sonuçlar kaybolmaz.** Sorgu değişince liste boşaltılsaydı, yazmayı
 *    sürdüren kullanıcının altındaki liste her harfte silinip yeniden kurulurdu.
 *    Onun yerine `isRefreshing` ile soluklaşır.
 * 3. **Son istek kazanır.** Sıra numarası, sunucudan gelen sırayla gönderim
 *    sırasının aynı olmadığı durumda geç yanıtı eler.
 *
 * Sonuçlar **anahtarlarıyla** saklanıyor (`key`): girdi değişince eski sayfa
 * kendiliğinden geçersiz sayılıyor. Alternatif, girdi değişiminde bir efektten
 * `setState` çağırmaktı — bu hem fazladan bir render turu doğurur hem de React'in
 * "efektte senkron setState" uyarısına girer.
 */

export const MESSAGE_SEARCH_DEBOUNCE_MS = 300;
export const MESSAGE_SEARCH_MIN_QUERY_LENGTH = 2;

export type MessageSearchFilters = {
  from?: string | null;
  personId?: string | null;
  to?: string | null;
};

export type UseMessageSearchOptions = {
  filters: MessageSearchFilters;
  /**
   * Sayfa başına sonuç. Yoğunluk sözlüğü kaç satırın **kaydırmasız** görüneceğini
   * söylüyor; sayfa o sayının katı olmalı, yoksa her kaydırma hareketi yeni bir
   * istek doğurur. Taban 20: küçük ölçekte bile bir sayfa bir ekranı aşmalı.
   */
  pageSize?: number;
  query: string;
};

export type UseMessageSearchResult = {
  error: boolean;
  /** Kaydırma sonunda çağrılır; sonraki sayfa yoksa hiçbir şey yapmaz. */
  fetchNextPage: () => void;
  hasNextPage: boolean;
  /** İlk yükleme (elde hiç sonuç yokken). */
  isLoading: boolean;
  /** Yeni sorgu uçuşta ama elde eski sonuçlar var. */
  isRefreshing: boolean;
  results: MessageSearchHitDTO[];
  totalLabel: number | null;
};

type SearchState = {
  error: boolean;
  /** Bu sonuçların ait olduğu girdi; farklıysa sonuçlar bayattır. */
  key: string;
  pages: MessageSearchPage[];
  pending: boolean;
};

const IDLE: SearchState = { error: false, key: "", pages: [], pending: false };

function isQueryReady(query: string): boolean {
  return Array.from(query.trim()).length >= MESSAGE_SEARCH_MIN_QUERY_LENGTH;
}

export function useMessageSearch({
  filters,
  pageSize,
  query,
}: UseMessageSearchOptions): UseMessageSearchResult {
  const [state, setState] = useState<SearchState>(IDLE);
  const seqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  // Filtre nesnesi her render'da yeni; alanlarına göre sabitlenmezse debounce
  // etkisi her render'da sıfırlanır ve sorgu hiç atılmaz.
  const personId = filters.personId ?? null;
  const from = filters.from ?? null;
  const to = filters.to ?? null;
  const trimmedQuery = query.trim();
  const ready = isQueryReady(query);
  const key = ready ? JSON.stringify([trimmedQuery, personId, from, to, pageSize]) : "";

  const baseInput = useMemo<GlobalSearchInput>(
    () => ({
      query: trimmedQuery,
      ...(personId ? { personId } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(pageSize ? { limit: pageSize } : {}),
    }),
    [from, pageSize, personId, to, trimmedQuery],
  );

  useEffect(() => {
    if (!ready) {
      return;
    }

    seqRef.current += 1;
    const seq = seqRef.current;

    const timeoutId = window.setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      void searchDmMessagesGlobal(baseInput, controller.signal)
        .then((result) => {
          if (seq !== seqRef.current) {
            return;
          }

          setState({ error: false, key, pages: [result], pending: false });
        })
        .catch(() => {
          if (seq !== seqRef.current) {
            return;
          }

          setState((current) => ({ ...current, error: true, pending: false }));
        });
    }, MESSAGE_SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [baseInput, key, ready]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  // Anahtar tutmuyorsa eldeki sayfalar önceki sorguya ait; onları **sonuç**
  // saymıyoruz ama listede tutmaya devam ediyoruz (kural 2), o yüzden ayrım
  // burada: `fresh` sonucu belirler, `carried` görünen listeyi.
  const fresh = state.key === key && key !== "";
  const carried = state.pages.flatMap((page) => page.results);
  const results = ready ? carried : [];
  const nextCursor = fresh ? (state.pages[state.pages.length - 1]?.nextCursor ?? null) : null;
  const pendingNow = ready && !fresh;

  const fetchNextPage = useCallback(() => {
    if (!nextCursor || state.pending) {
      return;
    }

    setState((current) => ({ ...current, pending: true }));
    seqRef.current += 1;
    const seq = seqRef.current;

    void searchDmMessagesGlobal({ ...baseInput, cursor: nextCursor })
      .then((result) => {
        if (seq !== seqRef.current) {
          return;
        }

        setState((current) => ({
          ...current,
          pages: [...current.pages, result],
          pending: false,
        }));
      })
      .catch(() => {
        if (seq !== seqRef.current) {
          return;
        }

        setState((current) => ({ ...current, error: true, pending: false }));
      });
  }, [baseInput, nextCursor, state.pending]);

  return {
    error: state.error,
    fetchNextPage,
    hasNextPage: nextCursor !== null,
    isLoading: (pendingNow || state.pending) && results.length === 0,
    isRefreshing: (pendingNow || state.pending) && results.length > 0,
    results,
    totalLabel: fresh ? (state.pages[0]?.totalLabel ?? null) : null,
  };
}
