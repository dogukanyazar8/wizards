"use client";

import { createContext, useContext } from "react";

import type { AccountSettingsState } from "@/lib/account/actions";

/**
 * Hesabım bölümünün ortak zemini — Ş7.
 *
 * Özel bloklar satır motorundan yalnız `{ data, row }` alır (Ş6 §7): sözlük **dize** taşır ve
 * bir hesap nesnesi taşıyamaz. Hero'nun fotoğraf akışı ise `AccountSettingsState`'in kendisini
 * istiyor (`ProfileAvatarField` onu alıyor ve güncellenmiş hâlini geri veriyor).
 *
 * Bu yüzden ikinci bir kanal var ve **yalnız** Hesabım bölümünü sarıyor: bloklar sağlayıcı
 * yokken de çizilebilsin diye varsayılan boş. Sağlayıcı olmadan hero fotoğraf düğmesini
 * `disabled` çizer — yükleyecek bir hesabı yokken düğmenin çalışıyormuş gibi durması yalan
 * olurdu.
 */

export type AccountSurfaceValue = {
  readonly account: AccountSettingsState | null;
  readonly onAccountUpdated: (next: AccountSettingsState) => void;
  readonly uploadthingEnabled: boolean;
};

const EMPTY_SURFACE: AccountSurfaceValue = {
  account: null,
  onAccountUpdated: () => {},
  uploadthingEnabled: false,
};

export const AccountSurfaceContext = createContext<AccountSurfaceValue>(EMPTY_SURFACE);

export function useAccountSurface(): AccountSurfaceValue {
  return useContext(AccountSurfaceContext);
}
