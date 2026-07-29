import { prisma, type HelpCategory, type Prisma } from "@wizards/db";
import {
  MOBILE_HELP_ARTICLE_MAX_COUNT,
  MobileHelpArticleListResponseSchema,
  type MobileHelpArticleListResponse,
  type MobileHelpCategory,
} from "@wizards/types";

import { logError } from "@/lib/logger";

/**
 * 2e's help centre. The four category tiles print a count each, so every
 * response carries the full category breakdown regardless of which slice of
 * articles was asked for — otherwise a search would blank the tiles.
 *
 * No label crosses the wire: the tile captions are client copy.
 */

/** The four popular rows 2e shows above the category grid. */
export const MOBILE_HELP_POPULAR_COUNT = 4;
export const MOBILE_HELP_CATEGORY_PAGE_SIZE = 30;

const helpArticleSelect = {
  bodyMarkdown: true,
  category: true,
  id: true,
  readMinutes: true,
  slug: true,
  title: true,
  url: true,
  viewCount: true,
} satisfies Prisma.HelpArticleSelect;

type HelpArticleRow = Prisma.HelpArticleGetPayload<{ select: typeof helpArticleSelect }>;

const HELP_CATEGORY_TO_WIRE: Record<HelpCategory, MobileHelpCategory> = {
  ACCOUNT: "account",
  CHAT: "chat",
  MEDIA: "media",
  SERVER: "server",
};

const HELP_CATEGORY_FROM_WIRE: Record<MobileHelpCategory, HelpCategory> = {
  account: "ACCOUNT",
  chat: "CHAT",
  media: "MEDIA",
  server: "SERVER",
};

/** Fixed order so the grid does not reshuffle when a count changes. */
const HELP_CATEGORY_ORDER: HelpCategory[] = ["ACCOUNT", "CHAT", "MEDIA", "SERVER"];

export function toHelpCategoryColumn(category: MobileHelpCategory): HelpCategory {
  return HELP_CATEGORY_FROM_WIRE[category];
}

function toMobileHelpArticle(row: HelpArticleRow) {
  return {
    category: HELP_CATEGORY_TO_WIRE[row.category],
    // An article with no stored body opens `url` in a browser instead of the
    // in-app reader; the client needs to know which before it navigates.
    hasBody: typeof row.bodyMarkdown === "string" && row.bodyMarkdown.trim().length > 0,
    id: row.id,
    readMinutes: row.readMinutes,
    slug: row.slug,
    title: row.title,
    url: row.url,
    views: row.viewCount,
  };
}

const PUBLISHED_ONLY = { publishedAt: { not: null } } satisfies Prisma.HelpArticleWhereInput;

export type MobileHelpServiceDependencies = {
  countByCategory: () => Promise<Array<{ _count: number; category: HelpCategory }>>;
  findArticles: (
    args: Prisma.HelpArticleFindManyArgs & { select: typeof helpArticleSelect },
  ) => Promise<HelpArticleRow[]>;
  incrementViewCount: (slug: string) => Promise<unknown>;
  logError: typeof logError;
};

const defaultDependencies: MobileHelpServiceDependencies = {
  countByCategory: async () => {
    const groups = await prisma.helpArticle.groupBy({
      by: ["category"],
      _count: { _all: true },
      where: PUBLISHED_ONLY,
    });

    return groups.map((group) => ({ _count: group._count._all, category: group.category }));
  },
  findArticles: (args) => prisma.helpArticle.findMany(args) as unknown as Promise<HelpArticleRow[]>,
  incrementViewCount: (slug) =>
    prisma.helpArticle.update({ data: { viewCount: { increment: 1 } }, where: { slug } }),
  logError,
};

async function buildCategoryCounts(dependencies: MobileHelpServiceDependencies) {
  const groups = await dependencies.countByCategory();
  const counts = new Map(groups.map((group) => [group.category, group._count]));

  return HELP_CATEGORY_ORDER.map((category) => ({
    articleCount: counts.get(category) ?? 0,
    key: HELP_CATEGORY_TO_WIRE[category],
  }));
}

export type ListMobileHelpArticlesInput = {
  category?: MobileHelpCategory;
  limit?: number;
  popular?: boolean;
};

export async function listMobileHelpArticles(
  { category, limit, popular }: ListMobileHelpArticlesInput = {},
  dependencies: MobileHelpServiceDependencies = defaultDependencies,
): Promise<MobileHelpArticleListResponse> {
  const take = Math.min(
    Math.max(
      Math.trunc(limit ?? (popular ? MOBILE_HELP_POPULAR_COUNT : MOBILE_HELP_CATEGORY_PAGE_SIZE)),
      1,
    ),
    MOBILE_HELP_ARTICLE_MAX_COUNT,
  );

  const [rows, categories] = await Promise.all([
    dependencies.findArticles({
      orderBy: popular
        ? [{ viewCount: "desc" }, { position: "asc" }]
        : [{ position: "asc" }, { title: "asc" }],
      select: helpArticleSelect,
      take,
      where: {
        ...PUBLISHED_ONLY,
        ...(category ? { category: toHelpCategoryColumn(category) } : {}),
      },
    }),
    buildCategoryCounts(dependencies),
  ]);

  return MobileHelpArticleListResponseSchema.parse({
    articles: rows.map(toMobileHelpArticle),
    categories,
  });
}

export async function searchMobileHelpArticles(
  query: string,
  dependencies: MobileHelpServiceDependencies = defaultDependencies,
): Promise<MobileHelpArticleListResponse> {
  const trimmed = query.trim();

  const [rows, categories] = await Promise.all([
    dependencies.findArticles({
      orderBy: [{ viewCount: "desc" }, { position: "asc" }],
      select: helpArticleSelect,
      take: MOBILE_HELP_CATEGORY_PAGE_SIZE,
      where: {
        ...PUBLISHED_ONLY,
        title: { contains: trimmed, mode: "insensitive" },
      },
    }),
    buildCategoryCounts(dependencies),
  ]);

  // No match is an answer, not an error: 2e turns an empty list into the
  // "Bunu bulamadık — ekibe yaz" row rather than a failure state.
  return MobileHelpArticleListResponseSchema.parse({
    articles: rows.map(toMobileHelpArticle),
    categories,
  });
}

/**
 * Best effort by design. The counter feeds the "EN ÇOK OKUNANLAR" ordering, and
 * losing one increment is worth far less than failing the navigation that
 * triggered it.
 */
export async function recordMobileHelpArticleView(
  slug: string,
  dependencies: MobileHelpServiceDependencies = defaultDependencies,
): Promise<{ ok: true }> {
  try {
    await dependencies.incrementViewCount(slug);
  } catch (error) {
    dependencies.logError(`[help-service] view count failed for ${slug}`, error);
  }

  return { ok: true };
}
