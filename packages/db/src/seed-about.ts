import { prisma } from "./index";
import {
  SEEDED_HELP_CATEGORY_COUNTS,
  buildSeedChanges,
  buildSeedHelpArticles,
  buildSeedReleases,
  helpArticleUrl,
  withGroupPositions,
  type SeedHelpArticle,
  type SeedRelease,
} from "./seed-about-model";

/**
 * Writes the "Hakkında" seed.
 *
 * The screens are not developable against an empty table: 2b prints a `38`
 * badge and pages twenty at a time, and 2e prints a per-category count on each
 * tile. Those numbers come from the database, so the seed has to produce them.
 *
 * Everything here is idempotent — keyed on `version` and `slug` — so a repeated
 * run updates rows instead of stacking duplicates.
 */

async function upsertRelease(release: SeedRelease) {
  const releasedAt = new Date(release.releasedAt);
  const data = {
    buildNumber: release.buildNumber ?? null,
    channel: "STABLE" as const,
    codename: release.codename ?? null,
    highlight: release.highlight ?? null,
    mandatory: false,
    publishedAt: releasedAt,
    releasedAt,
    sizeBytes: release.sizeBytes === undefined ? null : BigInt(release.sizeBytes),
    summary: release.summary ?? null,
  };

  const row = await prisma.release.upsert({
    create: { ...data, version: release.version },
    select: { id: true },
    update: data,
    where: {
      product_channel_version: { product: "MOBILE", channel: "STABLE", version: release.version },
    },
  });

  // The change list is authored as a whole, so replacing it is what keeps a
  // reseed from appending a second copy of every line.
  await prisma.releaseChange.deleteMany({ where: { releaseId: row.id } });

  const changes = withGroupPositions(buildSeedChanges(release));

  if (changes.length > 0) {
    await prisma.releaseChange.createMany({
      data: changes.map((change) => ({
        detail: change.detail ?? null,
        position: change.position,
        releaseId: row.id,
        title: change.title,
        type: change.type,
      })),
    });
  }
}

async function upsertHelpArticle(article: SeedHelpArticle) {
  const data = {
    // Every second article keeps its body empty so the "opens in a browser"
    // path is reachable in development too.
    bodyMarkdown: article.position % 2 === 0 ? `# ${article.title}\n\nHazırlanıyor.` : null,
    category: article.category,
    position: article.position,
    publishedAt: new Date("2026-07-01T09:00:00.000Z"),
    readMinutes: article.readMinutes,
    title: article.title,
    url: helpArticleUrl(article.slug),
    viewCount: article.viewCount,
  };

  await prisma.helpArticle.upsert({
    create: { ...data, slug: article.slug },
    select: { id: true },
    update: data,
    where: { slug: article.slug },
  });
}

export async function seedAboutContent() {
  const releases = buildSeedReleases();

  for (const release of releases) {
    await upsertRelease(release);
  }

  const articles = buildSeedHelpArticles();

  for (const article of articles) {
    await upsertHelpArticle(article);
  }

  console.log(
    `About seed complete: ${releases.length} releases, ${articles.length} help articles ` +
      `(${Object.entries(SEEDED_HELP_CATEGORY_COUNTS)
        .map(([category, count]) => `${category} ${count}`)
        .join(", ")})`,
  );
}
