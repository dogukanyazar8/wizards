import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminCampaignDetailView } from "@/components/admin/sections/admin-campaign-detail";
import { AdminCampaigns } from "@/components/admin/sections/admin-campaigns";
import { buildDeliveryReport } from "@/lib/admin/snapshots/campaigns";
import type { AdminCampaignDetail, AdminCampaignListItem } from "@/lib/admin/snapshots/campaigns";

function listItem(overrides: Partial<AdminCampaignListItem> = {}): AdminCampaignListItem {
  return {
    completedAt: null,
    createdAt: "2026-07-27T10:00:00.000Z",
    creator: { displayName: "Ada", id: "admin-1", username: "ada" },
    failedCount: 0,
    id: "campaign-1",
    isLate: false,
    scheduledAt: null,
    sentCount: 120,
    startedAt: null,
    status: "SENT",
    title: "Sürüm duyurusu",
    type: "SYSTEM",
    ...overrides,
  };
}

function detail(overrides: Partial<AdminCampaignDetail> = {}): AdminCampaignDetail {
  return {
    approvedAt: null,
    body: "Yeni sürüm yayında.",
    completedAt: "2026-07-27T10:05:00.000Z",
    createdAt: "2026-07-27T10:00:00.000Z",
    creator: { displayName: "Ada", id: "admin-1", username: "ada" },
    frozenAt: "2026-07-27T10:01:00.000Z",
    id: "campaign-1",
    report: buildDeliveryReport({
      countsByStatus: [
        { count: 100, status: "SENT" },
        { count: 20, status: "SKIPPED" },
        { count: 5, status: "FAILED" },
      ],
      frequencyCappedCount: 15,
      openedCount: 25,
    }),
    startedAt: "2026-07-27T10:01:00.000Z",
    status: "SENT",
    title: "Sürüm duyurusu",
    type: "SYSTEM",
    ...overrides,
  };
}

describe("delivery report", () => {
  it("divides the open rate by what was sent, not by the audience", () => {
    const report = buildDeliveryReport({
      countsByStatus: [
        { count: 100, status: "SENT" },
        { count: 20, status: "SKIPPED" },
        { count: 5, status: "FAILED" },
      ],
      frequencyCappedCount: 15,
      openedCount: 25,
    });

    assert.equal(report.targetedCount, 125);
    assert.equal(report.sentCount, 100);
    assert.equal(report.openRatePercent, 25);
    assert.equal(report.frequencyCappedCount, 15);
  });

  it("reports an unsent campaign as unmeasured rather than zero percent", () => {
    const report = buildDeliveryReport({
      countsByStatus: [{ count: 10, status: "PENDING" }],
      frequencyCappedCount: 0,
      openedCount: 0,
    });

    assert.equal(report.openRatePercent, null);
    assert.equal(report.sentCount, 0);
  });
});

describe("campaign screens", () => {
  it("flags a booked campaign whose moment has passed", () => {
    const markup = renderToStaticMarkup(
      <AdminCampaigns
        campaigns={[
          listItem({ isLate: true, scheduledAt: "2026-07-27T09:00:00.000Z", status: "DRAFT" }),
        ]}
      />,
    );

    assert.match(markup, /gecikmiş/u);
    assert.match(markup, /Planlandı/u);
  });

  it("links each campaign to its delivery report", () => {
    const markup = renderToStaticMarkup(<AdminCampaigns campaigns={[listItem()]} />);

    assert.match(markup, /\/admin\/notifications\/campaign-1/u);
  });

  it("shows the approval state in the list", () => {
    const markup = renderToStaticMarkup(
      <AdminCampaigns campaigns={[listItem({ status: "PENDING_APPROVAL" })]} />,
    );

    assert.match(markup, /Onay bekliyor/u);
  });

  it("renders every delivery bucket on the detail report", () => {
    const markup = renderToStaticMarkup(<AdminCampaignDetailView campaign={detail()} />);

    for (const label of ["Hedeflenen", "Gönderilen", "Frekans limiti", "Hata", "Açılma"]) {
      assert.match(markup, new RegExp(label, "u"));
    }

    assert.match(markup, /%25/u);
  });

  it("says the open rate is unmeasured before anything was sent", () => {
    const markup = renderToStaticMarkup(
      <AdminCampaignDetailView
        campaign={detail({
          report: buildDeliveryReport({
            countsByStatus: [{ count: 4, status: "PENDING" }],
            frequencyCappedCount: 0,
            openedCount: 0,
          }),
        })}
      />,
    );

    assert.match(markup, /veri yok/u);
  });
});
