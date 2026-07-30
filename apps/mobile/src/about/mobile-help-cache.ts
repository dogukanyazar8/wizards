import AsyncStorage from "@react-native-async-storage/async-storage";
import { MobileHelpArticleSchema, type MobileHelpArticle } from "@wizards/types";

export const MOBILE_HELP_CACHE_KEY = "whispr.help.recentArticles";
export const MOBILE_HELP_CACHE_LIMIT = 10;

export type CachedMobileHelpArticle = MobileHelpArticle;

export interface MobileHelpCacheStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

function parseCachedArticle(value: unknown): CachedMobileHelpArticle | null {
  const article = MobileHelpArticleSchema.safeParse(value);

  if (!article.success || !/^https?:\/\//i.test(article.data.url)) {
    return null;
  }

  return article.data;
}

export async function readCachedMobileHelpArticles(
  storage: MobileHelpCacheStorage = AsyncStorage,
): Promise<readonly CachedMobileHelpArticle[]> {
  try {
    const raw = await storage.getItem(MOBILE_HELP_CACHE_KEY);
    if (raw === null) {
      return [];
    }

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(parseCachedArticle)
      .filter((entry): entry is CachedMobileHelpArticle => entry !== null)
      .slice(0, MOBILE_HELP_CACHE_LIMIT);
  } catch {
    return [];
  }
}

export async function cacheMobileHelpArticle(
  article: MobileHelpArticle,
  storage: MobileHelpCacheStorage = AsyncStorage,
): Promise<void> {
  try {
    const current = await readCachedMobileHelpArticles(storage);
    const next = [article, ...current.filter((entry) => entry.slug !== article.slug)].slice(
      0,
      MOBILE_HELP_CACHE_LIMIT,
    );

    await storage.setItem(MOBILE_HELP_CACHE_KEY, JSON.stringify(next));
  } catch {
    // Help caching is best effort: storage failure must never block opening an article.
  }
}
