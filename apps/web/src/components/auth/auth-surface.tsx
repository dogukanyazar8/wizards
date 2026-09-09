"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { AuthSurface } from "@/lib/auth/metrics";

/**
 * Yüzey bağlamı — SPEC-GIRIS-KAYIT §5 ölçek kademesi.
 *
 * Masaüstünde tipografi ve kolonlar bir kademe küçülür. Bileşenlerin içine `if (isDesktop)`
 * yazmak yerine tek anahtar taşınır: kök `buildAuthCssVars(surface)` ile değişkenleri basar,
 * bileşenler yalnız sınıf kullanır. Ş7 masaüstü kabuğunu bu sağlayıcıyla sarar.
 */

const AuthSurfaceContext = createContext<AuthSurface>("web");

export function AuthSurfaceProvider({
  children,
  surface,
}: {
  children: ReactNode;
  surface: AuthSurface;
}) {
  return <AuthSurfaceContext.Provider value={surface}>{children}</AuthSurfaceContext.Provider>;
}

export function useAuthSurface(): AuthSurface {
  return useContext(AuthSurfaceContext);
}
