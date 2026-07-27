import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadAdminActivitySnapshot } from "@/lib/admin/snapshots/activity";
import { loadAdminOverviewSnapshot } from "@/lib/admin/snapshots/overview";
import { loadAdminServersSnapshot } from "@/lib/admin/snapshots/servers";
import {
  createSnapshotTestClient,
  SNAPSHOT_FIXTURE_DAYS,
  SNAPSHOT_FIXTURE_NOW,
} from "@/lib/admin/snapshots/snapshot-test-fixture";
import { AdminOverview } from "./admin-overview";

async function loadOverviewFixture() {
  const { client } = createSnapshotTestClient();
  const input = { days: SNAPSHOT_FIXTURE_DAYS, now: SNAPSHOT_FIXTURE_NOW };
  const [activity, overview, servers] = await Promise.all([
    loadAdminActivitySnapshot(input, client),
    loadAdminOverviewSnapshot(input, client),
    loadAdminServersSnapshot(input, client),
  ]);

  return { activity, overview, servers };
}

const MODERATION_SUMMARY = {
  averageFirstResponseMs: 26 * 60_000,
  inReviewCount: 3,
  openCount: 7,
  resolvedThisWeek: 12,
};

async function renderOverview(canExportActivity: boolean, moderation?: typeof MODERATION_SUMMARY) {
  const { activity, overview, servers } = await loadOverviewFixture();

  return renderToStaticMarkup(
    <AdminOverview
      activity={activity}
      {...(moderation ? { moderation } : {})}
      canExportActivity={canExportActivity}
      overview={overview}
      servers={servers}
    />,
  );
}

describe("admin overview", () => {
  it("renders the handoff's overview content from its own snapshot slices", async () => {
    const markup = await renderOverview(true);

    for (const label of [
      "Genel Bakış",
      "7g",
      "14g",
      "30g",
      "90g",
      "Kayıtlı Kullanıcı",
      "Doğrulanmış Kullanıcı",
      "Toplam Mesaj",
      "Toplam Sunucu",
      "En Aktif Sunucular",
      "Şu Anda Canlı",
      "Platform Dağılımı",
      "UNKNOWN",
      "768 B",
      "Whispr HQ",
      "Ada",
    ]) {
      assert.match(markup, new RegExp(label, "u"));
    }

    assert.match(markup, /Rapor İndir/u);
    assert.match(markup, /\/api\/v1\/admin\/reports\/activity\.csv\?days=7/u);
    assert.doesNotMatch(markup, /Moderasyon Özeti/u);
  });

  it("keeps export hidden without export.activity", async () => {
    const markup = await renderOverview(false);

    assert.doesNotMatch(markup, /Rapor İndir/u);
  });

  it("shows a stable UNKNOWN bucket and clear empty state without platform data", async () => {
    const { activity, overview, servers } = await loadOverviewFixture();
    const markup = renderToStaticMarkup(
      <AdminOverview
        activity={{ ...activity, breakdowns: { ...activity.breakdowns, clients: [] } }}
        canExportActivity={false}
        overview={overview}
        servers={servers}
      />,
    );

    assert.match(markup, /UNKNOWN/u);
    assert.match(markup, /title="UNKNOWN: 0"/u);
    assert.match(markup, /Platform verisi yok/u);
  });
});

describe("overview moderation summary", () => {
  it("shows the queue summary to a role that may open the queue", async () => {
    const markup = await renderOverview(false, MODERATION_SUMMARY);

    assert.match(markup, /Moderasyon Özeti/u);
    assert.match(markup, /Ort\. ilk yanıt/u);
    assert.match(markup, /26 dk/u);
    assert.match(markup, /\/admin\/moderation/u);
  });

  it("hides it entirely from a role that cannot read cases", async () => {
    const markup = await renderOverview(false);

    assert.doesNotMatch(markup, /Moderasyon Özeti/u);
  });
});
