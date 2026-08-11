/**
 * Grup sohbetleri 2a–2f, Faz 3 §B3. The single rule that turns a set of member
 * names into a group's display name.
 *
 * §4.4 is the reason this is not a helper beside whichever surface needed it
 * first: 2c's live hint ("Boş bırakırsan grup adı … olur") and the title every
 * other surface derives for a group whose `name` is null have to be the same
 * string. Two implementations mean the hint promises one name and the header
 * shows another.
 *
 * Leaf module — imports nothing from the package, so a client that holds only
 * this file can still build the name.
 */

/** The two locales the app ships; the last separator is the only difference. */
export type GroupNameLocale = "en" | "tr";

const GROUP_NAME_LAST_SEPARATOR: Readonly<Record<GroupNameLocale, string>> = {
  en: " and ",
  tr: " ve ",
};

const GROUP_NAME_LIST_SEPARATOR = ", ";

/**
 * `Atakan, UAT Test ve DY`. Blank entries are dropped rather than rendered as an
 * empty slot, which is what a member whose display name is missing would
 * otherwise produce ("Atakan,  ve DY").
 *
 * No cap and no ellipsis: §11.0.6 puts clamping on the renderer ("tek satır +
 * sondan …"), so truncating here would give the header and the hint two
 * different strings again — the exact failure this function exists to prevent.
 *
 * Returns `""` for an empty list; the caller owns the fallback, because what an
 * empty group should be called differs per surface.
 */
export function buildGroupNameFromMembers(
  memberNames: readonly string[],
  locale: GroupNameLocale,
): string {
  const names = memberNames.map((name) => name.trim()).filter((name) => name.length > 0);

  if (names.length === 0) {
    return "";
  }

  if (names.length === 1) {
    return names[0] ?? "";
  }

  const head = names.slice(0, -1).join(GROUP_NAME_LIST_SEPARATOR);
  const tail = names[names.length - 1] ?? "";

  return `${head}${GROUP_NAME_LAST_SEPARATOR[locale]}${tail}`;
}
