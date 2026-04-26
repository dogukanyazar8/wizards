import { ArrowLeft, Palette } from "lucide-react";
import Link from "next/link";
import { ThemeSessionSync } from "@/components/theme/theme-session-sync";
import { requireAuth } from "@/lib/auth/utils";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAuth();

  return (
    <main className="app-shell min-h-screen px-4 py-6 md:px-6 lg:px-8">
      <ThemeSessionSync preferredTheme={session.user.theme} />

      <div className="mx-auto grid w-full max-w-7xl gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="app-panel h-fit rounded-[32px] border p-5">
          <Link
            className="app-panel-soft text-app-foreground inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition hover:opacity-90"
            href="/channels"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Channels
          </Link>

          <div className="mt-8">
            <p className="text-app-soft text-xs font-semibold uppercase tracking-[0.24em]">
              Settings
            </p>
            <h1 className="text-app-foreground mt-3 text-2xl font-semibold">
              Appearance
            </h1>
            <p className="text-app-muted mt-2 text-sm leading-7">
              Tune the active theme and layout density for your workspace.
            </p>
          </div>

          <nav className="mt-8">
            <Link
              className="app-panel-soft text-app-foreground flex items-center gap-3 rounded-[22px] border px-4 py-3 text-sm font-semibold"
              href="/settings/appearance"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[hsl(var(--primary)/0.14)] text-[hsl(var(--primary))]">
                <Palette className="h-4 w-4" />
              </span>
              Appearance
            </Link>
          </nav>
        </aside>

        <section className="min-w-0">{children}</section>
      </div>
    </main>
  );
}
