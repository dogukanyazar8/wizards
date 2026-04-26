import { Prisma, prisma } from "@wizards/db";
import { normalizeAppLocale, type AppLocale } from "@/lib/locale";

function isMissingUserSettingsLocaleColumn(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2010" || error.code === "P2022") &&
    error.message.includes("UserSettings")
  );
}

async function ensureUserSettingsLocaleColumn() {
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "locale" TEXT NOT NULL DEFAULT \'en\'',
  );
}

async function upsertUserSettingsLocale(userId: string, locale: AppLocale) {
  const settingsId = crypto.randomUUID();

  await prisma.$executeRawUnsafe(
    `
      INSERT INTO "UserSettings" ("id", "userId", "locale")
      VALUES ($1, $2, $3)
      ON CONFLICT ("userId") DO UPDATE SET "locale" = EXCLUDED."locale"
    `,
    settingsId,
    userId,
    locale,
  );
}

export async function persistUserLocale(userId: string, rawLocale: string | null | undefined) {
  const locale = normalizeAppLocale(rawLocale);

  await prisma.user.update({
    where: { id: userId },
    data: { locale },
  });

  try {
    await ensureUserSettingsLocaleColumn();
    await upsertUserSettingsLocale(userId, locale);
  } catch (error) {
    if (!isMissingUserSettingsLocaleColumn(error)) {
      throw error;
    }
  }

  return locale;
}
