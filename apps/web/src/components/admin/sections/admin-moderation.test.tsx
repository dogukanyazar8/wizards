import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminCaseFile } from "@/components/admin/sections/admin-case-file";
import {
  AdminModerationQueue,
  formatFirstResponse,
} from "@/components/admin/sections/admin-moderation-queue";

const NOW = new Date("2026-07-27T12:00:00.000Z");

const stats = {
  averageFirstResponseMs: 45 * 60_000,
  inReviewCount: 2,
  openCount: 5,
  resolvedThisWeek: 9,
};

function queueResult(overrides: Partial<{ firstSeenAt: string | null; openedAt: string }> = {}) {
  return {
    cases: [
      {
        assignee: null,
        firstSeenAt: null,
        id: "case-1",
        lastReason: "HARASSMENT" as const,
        lastReportedAt: "2026-07-27T11:30:00.000Z",
        openedAt: "2026-07-27T11:00:00.000Z",
        priority: "HIGH" as const,
        publicNumber: 42,
        reportCount: 3,
        status: "OPEN" as const,
        subjectDeleted: false,
        subjectHandle: "bora",
        ...overrides,
      },
    ],
    pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
  };
}

describe("moderation queue", () => {
  it("shows the case number, subject and report count with claim and review actions", () => {
    const markup = renderToStaticMarkup(
      <AdminModerationQueue canAct now={NOW} result={queueResult()} scope="active" stats={stats} />,
    );

    for (const label of ["MOD-42", "@bora", "3 bildirdi", "Üstlen", "İncele", "Taciz"]) {
      assert.match(markup, new RegExp(label.replace("@", "@"), "u"));
    }

    assert.match(markup, /\/admin\/moderation\/case-1/u);
  });

  it("calls out a case that has waited longer than a day for a first look", () => {
    const markup = renderToStaticMarkup(
      <AdminModerationQueue
        canAct
        now={NOW}
        result={queueResult({ openedAt: "2026-07-25T11:00:00.000Z" })}
        scope="active"
        stats={stats}
      />,
    );

    assert.match(markup, /24 saati aştı/u);
  });

  it("hides the claim action from a role that may only read cases", () => {
    const markup = renderToStaticMarkup(
      <AdminModerationQueue
        canAct={false}
        now={NOW}
        result={queueResult()}
        scope="active"
        stats={stats}
      />,
    );

    assert.doesNotMatch(markup, /Üstlen/u);
    assert.match(markup, /İncele/u);
  });

  it("greets an empty queue without inventing numbers", () => {
    const markup = renderToStaticMarkup(
      <AdminModerationQueue
        canAct
        now={NOW}
        result={{ cases: [], pagination: { page: 1, pageSize: 25, total: 0, totalPages: 1 } }}
        scope="active"
        stats={{ ...stats, openCount: 0 }}
      />,
    );

    assert.match(markup, /Kuyruk temiz/u);
    assert.doesNotMatch(markup, /MOD-/u);
  });

  it("reports an unmeasured response time as a dash", () => {
    assert.equal(formatFirstResponse(null), "—");
    assert.equal(formatFirstResponse(45 * 60_000), "45 dk");
    assert.equal(formatFirstResponse(3 * 60 * 60_000), "3 sa");
  });
});

const caseFile = {
  assignee: { displayName: "Ada", id: "admin-1", username: "ada" },
  firstSeenAt: "2026-07-27T11:20:00.000Z",
  id: "case-1",
  openedAt: "2026-07-27T11:00:00.000Z",
  priority: "HIGH" as const,
  publicNumber: 42,
  reportCount: 2,
  resolution: null,
  resolvedAt: null,
  status: "IN_REVIEW" as const,
  subject: {
    createdAt: "2026-05-27T11:00:00.000Z",
    emailVerified: true,
    id: "user-2",
    isBanned: false,
    priorCaseCount: 1,
    serverCount: 4,
  },
  subjectDeleted: false,
  subjectHandle: "bora",
  timeline: [
    {
      actor: { displayName: "Cem", id: "user-9", username: "cem" },
      body: "Sürekli mesaj atıyor.",
      createdAt: "2026-07-27T11:00:00.000Z",
      id: "report:report-1",
      kind: "REPORT_ADDED" as const,
      reason: "HARASSMENT" as string | null,
    },
    {
      actor: { displayName: "Ada", id: "admin-1", username: "ada" },
      body: null,
      createdAt: "2026-07-27T11:20:00.000Z",
      id: "event:event-1",
      kind: "ASSIGNED" as const,
      reason: null,
    },
  ],
};

describe("moderation case file", () => {
  it("renders one timeline with the subject context panel", () => {
    const markup = renderToStaticMarkup(<AdminCaseFile canAct caseFile={caseFile} now={NOW} />);

    for (const label of ["MOD-42", "Bildirim", "Üstlenildi", "Hesap yaşı", "Geçmiş vaka"]) {
      assert.match(markup, new RegExp(label, "u"));
    }

    // Evidence cards belong to D2; the D1 file must not promise them.
    assert.doesNotMatch(markup, /Delil/u);
    assert.doesNotMatch(markup, /Mesaj sil/u);
  });

  it("marks a deleted subject instead of showing empty account facts", () => {
    const markup = renderToStaticMarkup(
      <AdminCaseFile
        canAct
        caseFile={{ ...caseFile, subject: null, subjectDeleted: true }}
        now={NOW}
      />,
    );

    assert.match(markup, /Hesap silinmiş/u);
    assert.doesNotMatch(markup, /Hesap yaşı/u);
  });

  it("drops the decision panel once the case is resolved", () => {
    const markup = renderToStaticMarkup(
      <AdminCaseFile
        canAct
        caseFile={{
          ...caseFile,
          resolution: "Uyarı verildi.",
          resolvedAt: "2026-07-27T12:00:00.000Z",
          status: "ACTIONED" as const,
        }}
        now={NOW}
      />,
    );

    assert.match(markup, /Uyarı verildi\./u);
    assert.doesNotMatch(markup, /Karar<\/p>/u);
  });
});
