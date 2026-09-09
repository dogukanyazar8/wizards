import { prisma } from "@wizards/db";

/**
 * SPEC-GIRIS-KAYIT §7/10 — `Hesap askıya alındı` bloğu ve `Referans · WSP-40219` satırı.
 *
 * Askı verisi üründe **var**: `User.isBanned` / `bannedAt` / `bannedReason`. Kısa referans
 * numarası için ayrı bir kolon **yok**; tasarımın `WSP-40219` biçimi moderasyon vakasının
 * kimliğinden türetiliyor. Vaka yoksa referans da yok — uydurulmuş bir numara göstermek
 * destek ekibini boş bir aramaya gönderir, o yüzden bant gizlenir.
 */

const REFERENCE_PREFIX = "WSP";
const REFERENCE_LENGTH = 8;

export type AccountSuspension = {
  bannedAt: Date | null;
  reason: string | null;
  /** `WSP-3F9A1C04` gibi; vaka bulunamazsa `null`. */
  reference: string | null;
};

export function formatSuspensionReference(caseId: string | null | undefined): string | null {
  const normalized = (caseId ?? "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();

  if (normalized.length < REFERENCE_LENGTH) {
    return null;
  }

  return `${REFERENCE_PREFIX}-${normalized.slice(0, REFERENCE_LENGTH)}`;
}

export type AccountSuspensionDependencies = {
  findLatestCaseId: (userId: string) => Promise<string | null>;
};

const defaultDependencies: AccountSuspensionDependencies = {
  findLatestCaseId: async (userId) => {
    const moderationCase = await prisma.moderationCase.findFirst({
      orderBy: { openedAt: "desc" },
      select: { id: true },
      where: { subjectId: userId },
    });

    return moderationCase?.id ?? null;
  },
};

export async function resolveAccountSuspension(
  user: { bannedAt?: Date | null; bannedReason?: string | null; id: string },
  overrides: Partial<AccountSuspensionDependencies> = {},
): Promise<AccountSuspension> {
  const dependencies = { ...defaultDependencies, ...overrides };
  const caseId = await dependencies.findLatestCaseId(user.id).catch(() => null);

  return {
    bannedAt: user.bannedAt ?? null,
    reason: user.bannedReason ?? null,
    reference: formatSuspensionReference(caseId),
  };
}
