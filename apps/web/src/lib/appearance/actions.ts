"use server";

import { auth, unstable_update } from "@/auth";
import {
  normalizeWizardsThemeId,
  type WizardsThemeId,
} from "@/lib/appearance";
import { Prisma, prisma } from "@wizards/db";

type ThemeActionResult = {
  error?: string;
  success: boolean;
  theme?: WizardsThemeId;
};

function isMissingUserSettingsThemeColumn(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2022" &&
    error.message.includes("UserSettings.theme")
  );
}

export async function updateThemePreferenceAction(
  rawTheme: string,
): Promise<ThemeActionResult> {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      error: "auth.login.signInUnavailable",
      success: false,
    };
  }

  const theme = normalizeWizardsThemeId(rawTheme);

  await prisma.user.update({
    where: { id: session.user.id },
    data: { theme },
  });

  try {
    await prisma.userSettings.upsert({
      where: { userId: session.user.id },
      create: {
        theme,
        userId: session.user.id,
      },
      update: { theme },
    });
  } catch (error) {
    if (!isMissingUserSettingsThemeColumn(error)) {
      throw error;
    }
  }

  await unstable_update({
    user: {
      ...session.user,
      theme,
    },
  });

  return {
    success: true,
    theme,
  };
}
