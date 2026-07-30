import { prisma, type HelpCategory, type Prisma } from "@wizards/db";

import { ApiError } from "@/lib/api";

const adminHelpArticleSelect = {
  bodyMarkdown: true,
  category: true,
  createdAt: true,
  id: true,
  position: true,
  publishedAt: true,
  readMinutes: true,
  slug: true,
  title: true,
  updatedAt: true,
  url: true,
  viewCount: true,
} satisfies Prisma.HelpArticleSelect;

type AdminHelpArticleRow = Prisma.HelpArticleGetPayload<{
  select: typeof adminHelpArticleSelect;
}>;

export type AdminHelpArticleInput = {
  bodyMarkdown?: string | null | undefined;
  category: HelpCategory;
  position: number;
  published: boolean;
  readMinutes: number;
  slug: string;
  title: string;
  url: string;
};

export type AdminHelpArticlePatchInput = {
  [Key in keyof AdminHelpArticleInput]?: AdminHelpArticleInput[Key] | undefined;
};

function toAdminHelpArticle(row: AdminHelpArticleRow) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    publishedAt: row.publishedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listAdminHelpArticles() {
  const rows = await prisma.helpArticle.findMany({
    orderBy: [{ category: "asc" }, { position: "asc" }, { title: "asc" }],
    select: adminHelpArticleSelect,
  });

  return { articles: rows.map(toAdminHelpArticle) };
}

export async function getAdminHelpArticle(articleId: string) {
  const row = await prisma.helpArticle.findUnique({
    select: adminHelpArticleSelect,
    where: { id: articleId },
  });

  if (!row) {
    throw new ApiError("Help article not found", 404, "HELP_ARTICLE_NOT_FOUND");
  }

  return { article: toAdminHelpArticle(row) };
}

export async function createAdminHelpArticle(input: AdminHelpArticleInput) {
  const row = await prisma.helpArticle.create({
    data: {
      bodyMarkdown: input.bodyMarkdown ?? null,
      category: input.category,
      position: input.position,
      publishedAt: input.published ? new Date() : null,
      readMinutes: input.readMinutes,
      slug: input.slug,
      title: input.title,
      url: input.url,
    },
    select: adminHelpArticleSelect,
  });

  return { article: toAdminHelpArticle(row) };
}

export async function updateAdminHelpArticle(articleId: string, input: AdminHelpArticlePatchInput) {
  const row = await prisma.$transaction(async (transaction) => {
    const existing = await transaction.helpArticle.findUnique({
      select: { publishedAt: true },
      where: { id: articleId },
    });

    if (!existing) {
      throw new ApiError("Help article not found", 404, "HELP_ARTICLE_NOT_FOUND");
    }

    return transaction.helpArticle.update({
      data: {
        ...(input.bodyMarkdown === undefined ? {} : { bodyMarkdown: input.bodyMarkdown }),
        ...(input.category === undefined ? {} : { category: input.category }),
        ...(input.position === undefined ? {} : { position: input.position }),
        ...(input.published === undefined
          ? {}
          : { publishedAt: input.published ? (existing.publishedAt ?? new Date()) : null }),
        ...(input.readMinutes === undefined ? {} : { readMinutes: input.readMinutes }),
        ...(input.slug === undefined ? {} : { slug: input.slug }),
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.url === undefined ? {} : { url: input.url }),
      },
      select: adminHelpArticleSelect,
      where: { id: articleId },
    });
  });

  return { article: toAdminHelpArticle(row) };
}

export async function deleteAdminHelpArticle(articleId: string) {
  const existing = await prisma.helpArticle.findUnique({
    select: { id: true },
    where: { id: articleId },
  });

  if (!existing) {
    throw new ApiError("Help article not found", 404, "HELP_ARTICLE_NOT_FOUND");
  }

  await prisma.helpArticle.delete({ where: { id: articleId } });

  return { deleted: true as const };
}
