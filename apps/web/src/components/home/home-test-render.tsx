import React, { type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LocaleProvider } from "@/components/providers/locale-provider";
import { TR_MESSAGES } from "@/lib/locale/messages/tr";

/**
 * Ana Sayfa 1a testlerinin ortak render kabuğu — `08-faz7` §1.
 *
 * Faz 7'den sonra kartların metni sözlükten geliyor, yani her biri `useI18n()` çağırıyor ve
 * sağlayıcısız render edilemiyor. Testler **Türkçe** sözlükle koşuyor: doğrulanan şey SPEC
 * metinleridir, ve o metinler `tr.ts`in kendisidir.
 *
 * `renderToStaticMarkup` efekt çalıştırmaz; `initialMessages` sağlayıcıya senkron verildiği için
 * ilk render zaten çevrilmiş çıkar.
 */
export function renderWithLocale(node: ReactNode): string {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={TR_MESSAGES}>
      {node}
    </LocaleProvider>,
  );
}
