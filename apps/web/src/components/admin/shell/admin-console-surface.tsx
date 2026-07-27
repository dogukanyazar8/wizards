"use client";

import { useSearchParams, type ReadonlyURLSearchParams } from "next/navigation";
import type { ReactNode } from "react";

export const ADMIN_SURFACE_PARAM = "surface";
export const ADMIN_CONSOLE_SURFACE = "console";

export type AdminSurface = "app" | "console";

/**
 * The detached desktop console loads the ordinary admin route with
 * `?surface=console`. There is no second frontend: the same page drops the
 * 250px rail — the console window is one module, opened deliberately, so a
 * navigation column would only cost it width — and tightens its rows.
 *
 * Read on the client rather than in the layout because an App Router layout is
 * never handed `searchParams`. Every `/admin` route is dynamic (the layout
 * awaits the session), so this still resolves during the server render and the
 * rail does not flash in before it disappears.
 */
export function resolveAdminSurface(value: string | null | undefined): AdminSurface {
  return value === ADMIN_CONSOLE_SURFACE ? "console" : "app";
}

export function useAdminSurface(): AdminSurface {
  // The admin panels are also rendered through `renderToStaticMarkup` in the
  // component tests, where there is no app router mounted and this hook really
  // does hand back `null` despite its type. Outside a router, "app" is the
  // right answer anyway.
  const searchParams = useSearchParams() as ReadonlyURLSearchParams | null;

  return resolveAdminSurface(searchParams?.get(ADMIN_SURFACE_PARAM) ?? null);
}

/** Renders its children everywhere except inside the detached console window. */
export function AdminAppSurfaceOnly({ children }: { children: ReactNode }) {
  return useAdminSurface() === "console" ? null : <>{children}</>;
}

/**
 * Stamps the surface onto the shell root so console-only spacing is a CSS
 * concern rather than a second component tree.
 */
export function AdminSurfaceRoot({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className} data-admin-surface={useAdminSurface()}>
      {children}
    </div>
  );
}
