"use server";

import { auth, unstable_update } from "@/auth";
import { normalizeAppLocale, type AppLocale } from "@/lib/locale";
import { persistUserLocale } from "@/lib/locale/persistence";

type LocaleActionResult = {
  error?: string;
  locale?: AppLocale;
  success: boolean;
};

export async function updateLocalePreferenceAction(
  rawLocale: string,
): Promise<LocaleActionResult> {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      error: "auth.login.signInUnavailable",
      success: false,
    };
  }

  const locale = await persistUserLocale(session.user.id, rawLocale);

  await unstable_update({
    user: {
      ...session.user,
      locale,
    },
  });

  return {
    locale: normalizeAppLocale(locale),
    success: true,
  };
}
