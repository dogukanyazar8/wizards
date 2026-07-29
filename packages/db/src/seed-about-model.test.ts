import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  NAMED_SEED_RELEASES,
  POPULAR_HELP_ARTICLES,
  SEEDED_HELP_CATEGORY_COUNTS,
  SEEDED_RELEASE_COUNT,
  buildSeedChanges,
  buildSeedHelpArticles,
  buildSeedReleases,
  withGroupPositions,
  type SeedHelpCategory,
} from "./seed-about-model";

describe("about seed shape", () => {
  it("produces exactly the 38 releases the 2b badge claims", () => {
    const releases = buildSeedReleases();

    assert.equal(releases.length, SEEDED_RELEASE_COUNT);
    assert.equal(new Set(releases.map((release) => release.version)).size, SEEDED_RELEASE_COUNT);
  });

  it("keeps the named releases newest and in descending date order", () => {
    const releases = buildSeedReleases();
    const dates = releases.map((release) => new Date(release.releasedAt).getTime());

    assert.deepEqual(
      releases.slice(0, NAMED_SEED_RELEASES.length).map((release) => release.version),
      ["0.8.15", "0.8.14", "0.8.13", "0.8.12", "0.8.11", "0.8.10", "0.7.9"],
    );

    for (let index = 1; index < dates.length; index += 1) {
      assert.ok(
        dates[index]! < dates[index - 1]!,
        `${releases[index]?.version} is not older than ${releases[index - 1]?.version}`,
      );
    }
  });

  it("writes as many change rows as the count the history row prints", () => {
    for (const release of buildSeedReleases()) {
      const expected = release.changes?.length ?? release.changeCount ?? 0;

      assert.equal(
        buildSeedChanges(release).length,
        expected,
        `${release.version} would print a count it does not have rows for`,
      );
    }
  });

  it("carries the seven-line Echo release note 2a renders", () => {
    const echo = NAMED_SEED_RELEASES[0]!;
    const changes = buildSeedChanges(echo);

    assert.equal(echo.version, "0.8.15");
    assert.equal(echo.buildNumber, 8150);
    assert.equal(changes.length, 7);
    assert.deepEqual(
      ["NEW", "IMPROVED", "FIXED"].map(
        (type) => changes.filter((change) => change.type === type).length,
      ),
      [2, 3, 2],
    );
  });

  it("restarts change positions inside each type group", () => {
    const positioned = withGroupPositions(buildSeedChanges(NAMED_SEED_RELEASES[0]!));

    assert.deepEqual(
      positioned.map((change) => `${change.type}:${change.position}`),
      ["NEW:0", "NEW:1", "IMPROVED:0", "IMPROVED:1", "IMPROVED:2", "FIXED:0", "FIXED:1"],
    );
  });

  it("produces the per-tile article counts 2e prints", () => {
    const articles = buildSeedHelpArticles();
    const counts = new Map<SeedHelpCategory, number>();

    for (const article of articles) {
      counts.set(article.category, (counts.get(article.category) ?? 0) + 1);
    }

    assert.deepEqual(Object.fromEntries(counts), SEEDED_HELP_CATEGORY_COUNTS);
    assert.equal(new Set(articles.map((article) => article.slug)).size, articles.length);
  });

  it("keeps the four popular articles at the top of their categories", () => {
    const articles = buildSeedHelpArticles();

    for (const popular of POPULAR_HELP_ARTICLES) {
      const seeded = articles.find((article) => article.slug === popular.slug);

      assert.ok(seeded, `${popular.slug} is missing from the seed`);
      assert.equal(seeded.viewCount, popular.viewCount);
      assert.equal(seeded.readMinutes, popular.readMinutes);
      assert.ok(
        articles
          .filter((article) => article.category === popular.category && article !== seeded)
          .every((article) => article.viewCount < popular.viewCount),
        `${popular.slug} is not the most-read article in its category`,
      );
    }
  });
});
