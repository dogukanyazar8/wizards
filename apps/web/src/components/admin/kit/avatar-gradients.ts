/**
 * The one file in `components/admin/**` allowed to hold colour literals, and a
 * contract test enforces that. Identity gradients are deliberately independent
 * of the active theme: a server keeps the same colours whichever theme the
 * viewer picked, which is what makes it recognisable in a list.
 */
export const ADMIN_AVATAR_GRADIENTS: ReadonlyArray<readonly [string, string]> = [
  ["#6366f1", "#38bdf8"],
  ["#ec4899", "#f97316"],
  ["#22c55e", "#14b8a6"],
  ["#8b5cf6", "#d946ef"],
  ["#f59e0b", "#ef4444"],
  ["#0ea5e9", "#6366f1"],
  ["#14b8a6", "#84cc16"],
  ["#f43f5e", "#8b5cf6"],
];

/** Deterministic so the same id always draws the same square. */
export function getAdminAvatarGradient(seed: string) {
  let hash = 0;

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 2_147_483_647;
  }

  const [from, to] = ADMIN_AVATAR_GRADIENTS[hash % ADMIN_AVATAR_GRADIENTS.length]!;

  return `linear-gradient(135deg, ${from}, ${to})`;
}

export function getAdminAvatarInitials(name: string) {
  const words = name.trim().split(/\s+/u).filter(Boolean);

  if (words.length === 0) {
    return "?";
  }

  if (words.length === 1) {
    return words[0]!.slice(0, 2).toLocaleUpperCase("tr-TR");
  }

  return `${words[0]![0]}${words[1]![0]}`.toLocaleUpperCase("tr-TR");
}
