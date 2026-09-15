import { prisma } from "@wizards/db";
import { hashGoogleReauthToken } from "@/lib/account/email-change-service";
import { getRequestLocale } from "@/lib/locale/server";
import { translate } from "@/lib/locale";
import { startEmailChangeGoogleAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};

export default async function EmailChangeGooglePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; result?: string }>;
}) {
  const params = await searchParams;
  const locale = await getRequestLocale();
  const t = (key: string) => translate(locale, key);
  const pending =
    params.token && /^[A-Za-z0-9_-]{43}$/.test(params.token)
      ? await prisma.emailChangeChallenge.findUnique({
          where: { oauthTokenHash: hashGoogleReauthToken(params.token) },
        })
      : null;
  const active = pending && pending.expiresAt > new Date() && !pending.oauthVerifiedAt;
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 p-6">
      <h1 className="text-xl font-semibold">{t("settings.contact.emailTitle")}</h1>
      {active ? (
        <form action={startEmailChangeGoogleAction} className="space-y-4">
          <p>{t("settings.contact.googlePurpose")}</p>
          <p className="break-all font-semibold">{pending.newEmail}</p>
          <input type="hidden" name="token" value={params.token} />
          <button className="rounded-lg bg-primary px-4 py-2 text-primary-foreground" type="submit">
            {t("settings.contact.googleVerify")}
          </button>
        </form>
      ) : (
        <p role="status">
          {t(
            params.result === "success"
              ? "settings.contact.googleDone"
              : "settings.contact.googleFailed",
          )}
        </p>
      )}
    </main>
  );
}
