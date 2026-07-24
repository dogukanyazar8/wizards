"use client";

import {
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronDown,
  FlaskConical,
  Gamepad2,
  Globe2,
  Moon,
  ShieldCheck,
  Sun,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { AudienceSelector, type AudienceSelectorValue } from "@/components/auth/audience-selector";
import { BrandLogo } from "@/components/brand/brand-logo";
import { useI18n } from "@/components/providers/locale-provider";
import {
  DEFAULT_WIZARDS_THEME,
  WIZARDS_THEMES,
  normalizeWizardsThemeId,
  type WizardsThemeId,
} from "@/lib/appearance";
import { type AppLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";

type AuthVariant = "login" | "register";
type AudienceTone = "team" | "personal" | "gamer";
type BetaNoticeVariant = "compact" | "hero";

const LANGUAGE_OPTIONS: AppLocale[] = ["tr", "en"];
const AUDIENCES: Array<{
  icon: LucideIcon;
  key: AudienceTone;
  titleKey: string;
  descriptionKey: string;
}> = [
  {
    descriptionKey: "auth.layout.audience.personal.description",
    icon: UserRound,
    key: "personal",
    titleKey: "auth.layout.audience.personal.title",
  },
  {
    descriptionKey: "auth.layout.audience.gamer.description",
    icon: Gamepad2,
    key: "gamer",
    titleKey: "auth.layout.audience.gamer.title",
  },
  {
    descriptionKey: "auth.layout.audience.team.description",
    icon: BriefcaseBusiness,
    key: "team",
    titleKey: "auth.layout.audience.team.title",
  },
];
const AUDIENCE_ICON_CLASS: Record<AudienceTone, string> = {
  gamer: "auth-reference-icon-gamer",
  personal: "auth-reference-icon-personal",
  team: "auth-reference-icon-team",
};

const HERO_COPY_COUNT = 4;
const HERO_COPY_INTERVAL_MS = 5600;
const subscribeToHydration = () => () => {};
const getClientHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => false;

function getThemeMode(themeId: WizardsThemeId) {
  return WIZARDS_THEMES.find((theme) => theme.id === themeId)?.mode ?? "light";
}

function useAuthVariant(): AuthVariant {
  const pathname = usePathname();
  return pathname?.startsWith("/register") ? "register" : "login";
}

export { BrandLogo };

export function ThemeLanguageControls() {
  const { locale, setLocale, t } = useI18n();
  const { resolvedTheme, setTheme, theme } = useTheme();
  const languageMenuRef = useRef<HTMLDivElement | null>(null);
  const [languageOpen, setLanguageOpen] = useState(false);
  const mounted = useSyncExternalStore(
    subscribeToHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot,
  );

  useEffect(() => {
    if (!languageOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;

      if (languageMenuRef.current?.contains(target)) {
        return;
      }

      setLanguageOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLanguageOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [languageOpen]);

  const activeThemeId = mounted
    ? normalizeWizardsThemeId(theme ?? resolvedTheme)
    : DEFAULT_WIZARDS_THEME;
  const activeMode = getThemeMode(activeThemeId);

  return (
    <div className="auth-reference-controls">
      <div className="auth-reference-theme-toggle">
        <button
          className={cn("auth-reference-theme-option", activeMode === "light" && "is-active")}
          onClick={() => setTheme("theme-light")}
          type="button"
        >
          <Sun className="h-[18px] w-[18px]" />
          <span>{t("auth.controls.light")}</span>
        </button>
        <button
          className={cn("auth-reference-theme-option", activeMode === "dark" && "is-active")}
          onClick={() => setTheme("theme-dark")}
          type="button"
        >
          <Moon className="h-[18px] w-[18px]" />
          <span>{t("auth.controls.dark")}</span>
        </button>
      </div>

      <div className="relative" ref={languageMenuRef}>
        <button
          aria-expanded={languageOpen}
          className="auth-reference-language"
          onClick={() => setLanguageOpen((current) => !current)}
          type="button"
        >
          <Globe2 className="h-[19px] w-[19px]" />
          <span>{t(`appearance.language.${locale}Full`)}</span>
          <ChevronDown className={cn("h-4 w-4 transition", languageOpen && "rotate-180")} />
        </button>

        {languageOpen ? (
          <div className="auth-reference-language-menu">
            {LANGUAGE_OPTIONS.map((option) => {
              const active = locale === option;

              return (
                <button
                  className={cn("auth-reference-language-item", active && "is-active")}
                  key={option}
                  onClick={() => {
                    setLocale(option);
                    setLanguageOpen(false);
                  }}
                  type="button"
                >
                  <span>{t(`appearance.language.${option}Full`)}</span>
                  <span>{t(`appearance.language.${option}`)}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ProfileCards() {
  const { t } = useI18n();

  return (
    <div className="auth-reference-profile-cards">
      {AUDIENCES.map(({ descriptionKey, icon: Icon, key, titleKey }) => (
        <article className="auth-reference-profile-card" key={key}>
          <span className={cn("auth-reference-icon-bubble", AUDIENCE_ICON_CLASS[key])}>
            <Icon className="h-7 w-7" />
          </span>
          <h3>{t(titleKey)}</h3>
          <p>{t(descriptionKey)}</p>
        </article>
      ))}
    </div>
  );
}

function BetaNotice({ variant }: { variant: BetaNoticeVariant }) {
  const { t } = useI18n();
  const isCompact = variant === "compact";
  const titleKey = isCompact ? "auth.layout.beta.compactTitle" : "auth.layout.beta.heroTitle";
  const descriptionKey = isCompact
    ? "auth.layout.beta.compactDescription"
    : "auth.layout.beta.heroDescription";

  return (
    <aside
      className={cn("auth-reference-beta-notice", `is-${variant}`)}
      aria-label={t("auth.layout.beta.ariaLabel")}
    >
      <div className="auth-reference-beta-topline">
        <span className="auth-reference-beta-icon" aria-hidden="true">
          <FlaskConical className="h-4 w-4" />
        </span>
        <div className="auth-reference-beta-copy">
          <div className="auth-reference-beta-title-row">
            <span className="auth-reference-beta-badge">{t("auth.layout.beta.badge")}</span>
            <strong>{t(titleKey)}</strong>
          </div>
          <p>{t(descriptionKey)}</p>
        </div>
      </div>
    </aside>
  );
}

export function FooterSecurity() {
  const { t } = useI18n();

  return (
    <footer className="auth-reference-footer">
      <div className="auth-reference-security-line">
        <ShieldCheck className="h-6 w-6" />
        <span>{t("auth.layout.securityLine")}</span>
      </div>
      <div className="auth-reference-footer-row">
        <nav className="auth-reference-footer-links" aria-label="Auth footer">
          <span>{t("auth.layout.footerCopyright")}</span>
          <Link href="/privacy">{t("auth.layout.footerPrivacy")}</Link>
          <Link href="/terms">{t("auth.layout.footerTerms")}</Link>
          <Link href="/cookies">{t("auth.layout.footerCookies")}</Link>
        </nav>
        <div className="auth-reference-system-status" aria-live="polite">
          <span className="auth-reference-system-dot" aria-hidden="true">
            <CheckCircle2 className="h-3.5 w-3.5" />
          </span>
          <span>{t("auth.layout.systemStatus")}</span>
        </div>
      </div>
    </footer>
  );
}

export function HeroSection({ variant }: { variant: AuthVariant }) {
  const { t } = useI18n();
  const [copyIndex, setCopyIndex] = useState(0);

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setCopyIndex((currentIndex) => (currentIndex + 1) % HERO_COPY_COUNT);
    }, HERO_COPY_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, []);

  const copyKey = `auth.layout.heroCopy.${copyIndex}`;

  return (
    <section className="auth-reference-hero" aria-label="Whispr">
      <div className="auth-reference-copy">
        <div
          className="auth-reference-copy-frame"
          key={`${variant}-${copyIndex}`}
          aria-live="polite"
        >
          <h1>
            <span>{t(`${copyKey}.titleLineOne`)}</span>
            <span className="auth-reference-title-gradient">{t(`${copyKey}.titleLineTwo`)}</span>
          </h1>
          <p>{t(`${copyKey}.description`)}</p>
        </div>
        <BetaNotice variant="hero" />
      </div>

      <div className="auth-reference-hero-art" aria-hidden="true" />
      <ProfileCards />
    </section>
  );
}

export function AuthCard({ children, variant }: { children: ReactNode; variant: AuthVariant }) {
  const { t } = useI18n();
  const isRegister = variant === "register";
  const [selectedAudience, setSelectedAudience] = useState<AudienceSelectorValue>("individual");

  return (
    <section className="auth-reference-card" data-auth-card-variant={variant}>
      <div className="auth-reference-card-header">
        <h2>{t(isRegister ? "auth.register.title" : "auth.login.title")}</h2>
        <p>{t(isRegister ? "auth.register.description" : "auth.login.description")}</p>
      </div>

      <AudienceSelector value={selectedAudience} onChange={setSelectedAudience} />

      {!isRegister ? (
        <p className="auth-reference-user-type-note">{t("auth.layout.audience.note")}</p>
      ) : null}

      {children}
      <BetaNotice variant="compact" />
    </section>
  );
}

export function AuthScreenLayout({ children }: { children: ReactNode }) {
  const variant = useAuthVariant();

  return (
    <main className="auth-reference-page" data-auth-variant={variant}>
      <BrandLogo className="auth-reference-brand" />
      <ThemeLanguageControls />

      <div className="auth-reference-shell">
        <HeroSection variant={variant} />
        <AuthCard variant={variant}>{children}</AuthCard>
      </div>

      <FooterSecurity />
    </main>
  );
}

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: ReactNode;
  icon: LucideIcon;
  label: string;
  labelAction?: ReactNode;
  rightElement?: ReactNode;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { className, error, icon: Icon, id, label, labelAction, rightElement, ...props },
  ref,
) {
  return (
    <div className="auth-reference-field">
      <div className="auth-reference-label-row">
        <label htmlFor={id}>{label}</label>
        {labelAction}
      </div>
      <div className="auth-reference-input-wrap">
        <Icon className="auth-reference-input-icon" />
        <input
          className={cn("auth-reference-input", rightElement && "pr-12", className)}
          id={id}
          ref={ref}
          {...props}
        />
        {rightElement ? <div className="auth-reference-input-action">{rightElement}</div> : null}
      </div>
      {error ? <p className="auth-reference-field-error">{error}</p> : null}
    </div>
  );
});

export function PrimaryButton({
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={cn("auth-reference-primary-button", className)} {...props}>
      <span>{children}</span>
      <ArrowRight className="h-5 w-5" />
    </button>
  );
}

export function SecondaryButton({ children, href }: { children: ReactNode; href: string }) {
  return (
    <Link className="auth-reference-secondary-button" href={href}>
      <UserRound className="h-5 w-5" />
      <span>{children}</span>
    </Link>
  );
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" className="h-7 w-7" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.76-.07-1.49-.19-2.19H12v4.14h5.38a4.6 4.6 0 0 1-1.99 3.02v2.51h3.23c1.89-1.74 2.98-4.3 2.98-7.48Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.96-.9 6.62-2.43l-3.23-2.51c-.9.6-2.05.95-3.39.95-2.6 0-4.81-1.76-5.6-4.13H3.06v2.6A10 10 0 0 0 12 22Z"
      />
      <path fill="#FBBC05" d="M6.4 13.88a6 6 0 0 1 0-3.76v-2.6H3.06a10 10 0 0 0 0 8.96l3.34-2.6Z" />
      <path
        fill="#EA4335"
        d="M12 5.99c1.47 0 2.79.5 3.83 1.5l2.86-2.87C16.96 3.01 14.7 2 12 2a10 10 0 0 0-8.94 5.52l3.34 2.6C7.19 7.75 9.4 5.99 12 5.99Z"
      />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg aria-hidden="true" className="h-7 w-7" viewBox="0 0 24 24">
      <path fill="#F25022" d="M3 3h8.5v8.5H3z" />
      <path fill="#7FBA00" d="M12.5 3H21v8.5h-8.5z" />
      <path fill="#00A4EF" d="M3 12.5h8.5V21H3z" />
      <path fill="#FFB900" d="M12.5 12.5H21V21h-8.5z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg aria-hidden="true" className="h-7 w-7" viewBox="0 0 24 24">
      <path
        fill="currentColor"
        d="M16.7 12.8c0-2.2 1.8-3.2 1.9-3.3-1-1.5-2.6-1.7-3.2-1.7-1.4-.1-2.7.8-3.4.8-.7 0-1.8-.8-3-.8-1.5 0-2.9.9-3.7 2.2-1.6 2.8-.4 7 1.1 9.3.8 1.1 1.7 2.3 2.9 2.3 1.2 0 1.6-.8 3-.8s1.8.8 3 .8 2-.1 2.8-2.1c.9-1.3 1.3-2.6 1.3-2.7-.1-.1-2.7-1.1-2.7-4Zm-2.2-6.4c.7-.8 1.1-1.9 1-3-1 .1-2.1.7-2.8 1.5-.6.7-1.1 1.8-1 2.9 1.1.1 2.2-.5 2.8-1.4Z"
      />
    </svg>
  );
}

function DiscordIcon() {
  return (
    <svg aria-hidden="true" className="h-7 w-7" viewBox="0 0 24 24">
      <path
        fill="#5865F2"
        d="M19.7 5.6A18 18 0 0 0 15.2 4l-.2.4c1.6.4 2.3 1 2.3 1s-2.8-1.5-6.6-1.5c-3.8 0-6.6 1.5-6.6 1.5s.7-.6 2.3-1L6.2 4a18 18 0 0 0-4.5 1.6S-.7 9.2.2 16.2c0 0 2.7 3.3 6.6 3.4l.8-1.1c-1.4-.4-2-1.1-2-1.1s.3.2.8.4h.1l.2.1h.1c.7.3 1.5.5 2.5.7 1.6.3 3.5.2 5.1 0 1-.2 1.9-.4 2.6-.7h.1l.2-.1h.1c.5-.2.8-.4.8-.4s-.7.7-2.1 1.1l.8 1.1c3.9-.1 6.6-3.4 6.6-3.4.9-7-1.5-10.6-1.5-10.6ZM8.4 14.8c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Zm7.2 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Z"
      />
    </svg>
  );
}

export function SocialAuthButtons({
  disabled,
  onGoogle,
}: {
  disabled?: boolean;
  onGoogle?: () => void;
}) {
  const providers = [
    { icon: GoogleIcon, key: "google", onClick: onGoogle },
    { icon: MicrosoftIcon, key: "microsoft", onClick: undefined },
    { icon: AppleIcon, key: "apple", onClick: undefined },
    { icon: DiscordIcon, key: "discord", onClick: undefined },
  ] as const;

  return (
    <div className="auth-reference-social-grid">
      {providers.map(({ icon: Icon, key, onClick }) => (
        <button
          aria-label={key}
          className="auth-reference-social-button"
          disabled={disabled && key === "google"}
          key={key}
          onClick={onClick}
          type="button"
        >
          <Icon />
        </button>
      ))}
    </div>
  );
}
