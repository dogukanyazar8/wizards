import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MobileAdminCaseListResponseSchema as IndexedListSchema } from "./index";
import {
  MOBILE_ADMIN_EVIDENCE_MAX_COUNT,
  MOBILE_ADMIN_QUEUE_MAX_COUNT,
  MobileAdminCaseClaimResponseSchema,
  MobileAdminCaseDetailResponseSchema,
  MobileAdminCaseDismissResponseSchema,
  MobileAdminCaseEscalateResponseSchema,
  MobileAdminCaseListResponseSchema,
  MobileAdminCaseSummarySchema,
} from "./mobile-admin";
import { assertAccepts, assertRejects } from "./schema-test-helpers";

const summary = {
  assigneeHandle: null,
  caseId: "case-1",
  openedAt: "2026-07-27T10:00:00.000Z",
  priority: "URGENT",
  publicNumber: 42,
  reportCount: 3,
  status: "OPEN",
  subjectHandle: "spammer",
};

describe("mobile admin case schemas", () => {
  it("accepts the triage queue payload the mobile endpoint returns", () => {
    const parsed = assertAccepts(MobileAdminCaseListResponseSchema, { cases: [summary] });

    assert.equal(parsed.cases[0]?.publicNumber, 42);
    assert.equal(parsed.cases[0]?.priority, "URGENT");
  });

  it("is re-exported from the package index", () => {
    assertAccepts(IndexedListSchema, { cases: [] });
  });

  it("rejects an unknown priority and an over-long queue", () => {
    assertRejects(MobileAdminCaseSummarySchema, { ...summary, priority: "CRITICAL" }, ["priority"]);
    assertRejects(MobileAdminCaseListResponseSchema, {
      cases: Array.from({ length: MOBILE_ADMIN_QUEUE_MAX_COUNT + 1 }, () => summary),
    });
  });

  /**
   * The phone renders evidence as a snapshot preview. Anything richer would mean
   * the triage surface had started reading live private conversations.
   */
  it("accepts a case file with evidence previews and reports", () => {
    const parsed = assertAccepts(MobileAdminCaseDetailResponseSchema, {
      case: {
        ...summary,
        evidence: [{ evidenceId: "evidence-1", preview: "spam link", scope: "channel" }],
        reports: [
          {
            createdAt: "2026-07-27T09:00:00.000Z",
            details: null,
            reason: "SPAM",
            reportId: "report-1",
          },
        ],
      },
    });

    assert.equal(parsed.case.evidence[0]?.scope, "channel");
    assert.equal(parsed.case.reports[0]?.reason, "SPAM");
    assertRejects(MobileAdminCaseDetailResponseSchema, {
      case: {
        ...summary,
        evidence: Array.from({ length: MOBILE_ADMIN_EVIDENCE_MAX_COUNT + 1 }, () => ({
          evidenceId: "evidence-1",
          preview: "",
          scope: null,
        })),
        reports: [],
      },
    });
  });

  it("pins the three triage action responses", () => {
    assertAccepts(MobileAdminCaseClaimResponseSchema, { caseId: "case-1", claimed: true });
    assertRejects(MobileAdminCaseClaimResponseSchema, { caseId: "case-1", claimed: false });
    assertAccepts(MobileAdminCaseDismissResponseSchema, {
      caseId: "case-1",
      status: "DISMISSED",
    });
    // Escalation has exactly one outcome; anything else means the contract moved.
    assertAccepts(MobileAdminCaseEscalateResponseSchema, {
      caseId: "case-1",
      priority: "URGENT",
    });
    assertRejects(MobileAdminCaseEscalateResponseSchema, { caseId: "case-1", priority: "HIGH" });
  });
});
