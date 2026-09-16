"use client";

import type { ReactNode } from "react";

import {
  AuthDescription,
  AuthTitle,
  BrandLogo,
  ThemeLanguageControls,
} from "@/components/auth/auth-screen";
import { useAuthSurface } from "@/components/auth/auth-surface";
import { AuthSurfaceGate } from "@/components/auth/auth-surface-gate";
import { buildAuthCssVars } from "@/lib/auth/css-vars";

type OAuthHandoffLayoutProps = {
  title: string;
  description: string;
  children?: ReactNode;
};

function OAuthHandoffCard({ title, description, children }: OAuthHandoffLayoutProps) {
  const surface = useAuthSurface();
  return (
    <div
      className="auth-page px-5 py-8"
      data-auth-surface=""
      style={{ ...buildAuthCssVars(surface), fontFamily: "var(--font-sans), sans-serif" }}
    >
      <main className="auth-status-card auth-handoff-card relative m-auto flex flex-col gap-[var(--auth-title-gap)] text-center">
        <div className="flex justify-end">
          <ThemeLanguageControls />
        </div>
        <BrandLogo className="justify-center" interactive={false} />
        <div>
          <AuthTitle>{title}</AuthTitle>
          <AuthDescription>{description}</AuthDescription>
        </div>
        {children ? (
          <div className="flex flex-col gap-[var(--auth-title-gap)]">{children}</div>
        ) : null}
      </main>
    </div>
  );
}

/** Handoff pages share auth tokens without the full sign-in form or marketing panel. */
export function OAuthHandoffLayout(props: OAuthHandoffLayoutProps) {
  return (
    <AuthSurfaceGate>
      <OAuthHandoffCard {...props} />
    </AuthSurfaceGate>
  );
}
