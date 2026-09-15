import type { EmojiMartData } from "@emoji-mart/data";

export type ProfileEmojiEntry = {
  native: string;
  name: string;
  keywords: string;
  category: string;
};
export const PROFILE_EMOJI_PAGE_SIZE = 72;
export function normalizeEmojiQuery(value: string): string {
  return value
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function buildProfileEmojiCatalog(data: EmojiMartData): ProfileEmojiEntry[] {
  const entries: ProfileEmojiEntry[] = [];
  const seen = new Set<string>();
  for (const category of data.categories) {
    for (const id of category.emojis) {
      const emoji = data.emojis[id];
      if (!emoji) continue;
      const keywords = normalizeEmojiQuery([id, emoji.name, ...emoji.keywords].join(" "));
      for (const skin of emoji.skins) {
        if (seen.has(skin.native)) continue;
        seen.add(skin.native);
        entries.push({
          native: skin.native,
          name: emoji.name,
          category: category.id,
          keywords: `${keywords} ${skin.native}`,
        });
      }
    }
  }
  return entries;
}
