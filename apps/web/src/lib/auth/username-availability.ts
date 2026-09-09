import { prisma } from "@wizards/db";
import { UsernameSchema } from "@wizards/types";

import { buildUsernameCandidate, normalizeUsername } from "@/lib/auth/username";

/**
 * SPEC-GIRIS-KAYIT §10 ve §7/4 — "alan bırakıldığında sunucuya sorulur, alınmışsa durum 4
 * gösterilir ve üç öneri sunulur".
 *
 * Öneriler ürün kuralına uyar (paket kararı K8: `a-zA-Z0-9_`, nokta yok), bu yüzden tasarımın
 * `ada.dev` örneği yerine `ada_dev` biçimli adaylar üretilir. Etiketlerin görünümü değişmez,
 * yalnız içerikleri kurala uyar.
 */

export const USERNAME_SUGGESTION_COUNT = 3;

const SUGGESTION_SUFFIXES = ["_dev", "_42", "_app", "_hq", "_1", "_2", "_x"];

export type UsernameAvailability = {
  available: boolean;
  suggestions: string[];
  /** Girdi ürün kuralına uymuyorsa `false`; ekran alanı kendi doğrulamasıyla işaretler. */
  valid: boolean;
};

export type UsernameAvailabilityDependencies = {
  findTaken: (candidates: string[]) => Promise<string[]>;
};

const defaultDependencies: UsernameAvailabilityDependencies = {
  async findTaken(candidates) {
    if (candidates.length === 0) {
      return [];
    }

    const rows = await prisma.user.findMany({
      select: { username: true },
      where: { username: { in: candidates } },
    });

    return rows.map((row) => row.username);
  },
};

function buildCandidates(username: string): string[] {
  const base = normalizeUsername(username) || username;
  const candidates: string[] = [];

  for (const suffix of SUGGESTION_SUFFIXES) {
    const candidate = buildUsernameCandidate(base, suffix);

    if (candidate && !candidates.includes(candidate) && candidate !== username) {
      candidates.push(candidate);
    }
  }

  return candidates;
}

export async function checkUsernameAvailability(
  rawUsername: string,
  overrides: Partial<UsernameAvailabilityDependencies> = {},
): Promise<UsernameAvailability> {
  const dependencies = { ...defaultDependencies, ...overrides };
  const username = rawUsername.trim();
  const parsed = UsernameSchema.safeParse(username);

  if (!parsed.success) {
    return { available: false, suggestions: [], valid: false };
  }

  const candidates = buildCandidates(parsed.data);
  const taken = new Set(await dependencies.findTaken([parsed.data, ...candidates]));

  if (!taken.has(parsed.data)) {
    return { available: true, suggestions: [], valid: true };
  }

  const suggestions = candidates
    .filter((candidate) => !taken.has(candidate))
    .slice(0, USERNAME_SUGGESTION_COUNT);

  return { available: false, suggestions, valid: true };
}
