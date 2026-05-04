import { prisma } from "@wizards/db";
import { normalizeAppLocale, type AppLocale } from "@/lib/locale";

async function upsertUserSettingsLocale(userId: string, locale: AppLocale) {
  await prisma.userSettings.upsert({
    where: { userId },
    create: { userId, locale },
    update: { locale },
  });
}

export async function persistUserLocale(userId: string, rawLocale: string | null | undefined) {
  const locale = normalizeAppLocale(rawLocale);

  await prisma.user.update({
    where: { id: userId },
    data: { locale },
  });

  await upsertUserSettingsLocale(userId, locale);

  return locale;
}
