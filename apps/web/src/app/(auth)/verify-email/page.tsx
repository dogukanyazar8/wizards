import { ArrowRight, CheckCircle2, Clock3, MailWarning, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { getServerTranslator } from "@/lib/locale/server";
import { verifyEmailToken, type EmailVerificationResult } from "@/lib/auth/email-verification";

export const dynamic = "force-dynamic";

type VerifyEmailPageProps = {
  searchParams: Promise<{
    token?: string | string[];
  }>;
};

type VerifyEmailViewModel = {
  bodyKey: string;
  ctaHref: string;
  ctaKey: string;
  icon: typeof CheckCircle2;
  tone: "danger" | "success" | "warning";
  titleKey: string;
};

function getToken(searchToken: string | string[] | undefined) {
  if (typeof searchToken === "string") {
    return searchToken;
  }

  return "";
}

function getViewModel(result: EmailVerificationResult): VerifyEmailViewModel {
  if (result.status === "verified") {
    return {
      bodyKey: "auth.verifyEmail.successBody",
      ctaHref: "/login",
      ctaKey: "auth.verifyEmail.loginCta",
      icon: CheckCircle2,
      titleKey: "auth.verifyEmail.successTitle",
      tone: "success",
    };
  }

  if (result.status === "expired") {
    return {
      bodyKey: "auth.verifyEmail.expiredBody",
      ctaHref: "/login",
      ctaKey: "auth.verifyEmail.resendCta",
      icon: Clock3,
      titleKey: "auth.verifyEmail.expiredTitle",
      tone: "warning",
    };
  }

  return {
    bodyKey: "auth.verifyEmail.invalidBody",
    ctaHref: "/login",
    ctaKey: "auth.verifyEmail.resendCta",
    icon: MailWarning,
    titleKey: "auth.verifyEmail.invalidTitle",
    tone: "danger",
  };
}

function getToneClasses(tone: VerifyEmailViewModel["tone"]) {
  if (tone === "success") {
    return {
      badge:
        "border-[hsl(var(--success)/0.28)] bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))]",
      panel:
        "border-[hsl(var(--success)/0.28)] bg-[linear-gradient(135deg,hsl(var(--success)/0.13),hsl(var(--surface-card)/0.58))]",
    };
  }

  if (tone === "warning") {
    return {
      badge:
        "border-[hsl(var(--warning)/0.3)] bg-[hsl(var(--warning)/0.13)] text-[hsl(var(--warning))]",
      panel:
        "border-[hsl(var(--warning)/0.3)] bg-[linear-gradient(135deg,hsl(var(--warning)/0.13),hsl(var(--surface-card)/0.58))]",
    };
  }

  return {
    badge:
      "border-[hsl(var(--danger)/0.28)] bg-[hsl(var(--danger)/0.12)] text-[hsl(var(--danger))]",
    panel:
      "border-[hsl(var(--danger)/0.28)] bg-[linear-gradient(135deg,hsl(var(--danger)/0.12),hsl(var(--surface-card)/0.58))]",
  };
}

export default async function VerifyEmailPage({ searchParams }: VerifyEmailPageProps) {
  const { t } = await getServerTranslator();
  const { token } = await searchParams;
  const rawToken = getToken(token);

  let result: EmailVerificationResult;
  try {
    result = await verifyEmailToken(rawToken);
  } catch {
    result = { status: "invalid" };
  }

  const viewModel = getViewModel(result);
  const toneClasses = getToneClasses(viewModel.tone);
  const Icon = viewModel.icon;

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="app-badge-accent inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em]">
          <ShieldAlert className="h-3.5 w-3.5" />
          {t("auth.verifyEmail.badge")}
        </div>
        <div>
          <h1 className="text-app-foreground text-4xl font-semibold tracking-tight">
            {t(viewModel.titleKey)}
          </h1>
          <p className="text-app-muted mt-3 text-sm leading-7">{t(viewModel.bodyKey)}</p>
        </div>
      </div>

      <section
        className={`rounded-[30px] border p-5 shadow-[0_24px_60px_hsl(var(--shadow-color)/0.08)] ${toneClasses.panel}`}
      >
        <div className="flex items-start gap-4">
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border ${toneClasses.badge}`}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-app-foreground text-sm font-semibold">
              {t("auth.verifyEmail.nextStepTitle")}
            </p>
            <p className="text-app-muted mt-2 text-sm leading-7">
              {t("auth.verifyEmail.nextStepBody")}
            </p>
          </div>
        </div>
      </section>

      <Link
        href={viewModel.ctaHref}
        className="app-button-primary inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold transition"
      >
        {t(viewModel.ctaKey)}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
