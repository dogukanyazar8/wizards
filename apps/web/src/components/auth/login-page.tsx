"use client";

import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect } from "react";
import { BrandLogo } from "@/components/auth/auth-screen";
import { ThemeToggle } from "@/components/auth/theme-toggle";
import { FloatZone } from "@/components/marketing/float-zone";
import { HeroHeading } from "@/components/marketing/hero-heading";
import { useI18n } from "@/components/providers/locale-provider";
import { AuroraBackground } from "@/components/scene/aurora-background";
import { DotGrid } from "@/components/scene/dot-grid";
import { cn } from "@/lib/utils";

function AuthFooter({ className }: { className?: string }) {
  const { t } = useI18n();

  return (
    <footer className={cn("modern-auth-footer", className)}>
      <nav aria-label={t("auth.layout.footerPrivacy")}>
        <span>{t("auth.layout.footerCopyright")}</span>
        <i aria-hidden="true" />
        <Link href="/privacy">{t("auth.layout.footerPrivacy")}</Link>
        <i aria-hidden="true" />
        <Link href="/terms">{t("auth.layout.footerTerms")}</Link>
        <i aria-hidden="true" />
        <Link href="/cookies">{t("auth.layout.footerCookies")}</Link>
      </nav>
      <div className="modern-auth-status" aria-label={t("auth.layout.systemStatus")}>
        <span aria-hidden="true">
          <CheckCircle2 className="h-3.5 w-3.5" />
        </span>
        <strong>{t("auth.layout.systemStatus")}</strong>
      </div>
    </footer>
  );
}

export function LoginPage({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.body.classList.add("modern-login-active");

    return () => document.body.classList.remove("modern-login-active");
  }, []);

  return (
    <main className="modern-login-page">
      <DotGrid />
      <AuroraBackground />
      <section className="modern-login-left-panel">
        <BrandLogo className="modern-login-brand" />
        <HeroHeading />
        <FloatZone />
        <AuthFooter />
      </section>
      <section className="modern-login-right-panel">
        <ThemeToggle />
        {children}
        <AuthFooter className="is-mobile" />
      </section>
    </main>
  );
}
