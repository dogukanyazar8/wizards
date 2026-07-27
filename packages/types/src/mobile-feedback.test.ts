import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MobileFeedbackSubmitRequestSchema as IndexedSubmitSchema } from "./index";
import {
  ADMIN_FEEDBACK_PAGE_SIZE,
  AdminFeedbackUpdateRequestSchema,
  AdminRoadmapCreateRequestSchema,
  AdminRoadmapUpdateRequestSchema,
  MOBILE_FEEDBACK_ATTACHMENT_MAX_COUNT,
  MOBILE_FEEDBACK_MESSAGE_MAX_LENGTH,
  FEEDBACK_PREVIEW_MAX_LENGTH,
  MOBILE_FEEDBACK_LIST_MAX_COUNT,
  MobileFeedbackDiagnosticsSchema,
  MobileFeedbackListItemSchema,
  MobileFeedbackListResponseSchema,
  MobileFeedbackSubmitRequestSchema,
  MobileRoadmapItemSchema,
  MobileRoadmapVoteRequestSchema,
  formatFeedbackPublicNumber,
} from "./mobile-feedback";
import { assertAccepts, assertRejects } from "./schema-test-helpers";

const diagnostics = {
  appVersion: "1.4.0",
  deviceModel: "Pixel 8",
  locale: "tr",
  osName: "Android",
  osVersion: "15",
  recentFaults: [{ at: "2026-07-26T10:00:00.000Z", kind: "network", reference: "WB-N-1A2B3C" }],
  theme: "light",
};

const submission = {
  attachmentClaimIds: ["upload-1"],
  diagnostics,
  message: "Sunucu seçici sheet'e arama eklenirse harika olur.",
  rating: "GOOD",
  topic: "SUGGESTION",
};

describe("mobile feedback contracts", () => {
  it("is reachable from the package index", () => {
    assert.equal(MobileFeedbackSubmitRequestSchema, IndexedSubmitSchema);
  });

  it("accepts a complete submission and rejects unknown keys", () => {
    assertAccepts(MobileFeedbackSubmitRequestSchema, submission);
    assertRejects(MobileFeedbackSubmitRequestSchema, { ...submission, serverId: "server-1" });
  });

  it("keeps the message inside the counter the form shows", () => {
    assertAccepts(MobileFeedbackSubmitRequestSchema, {
      ...submission,
      message: "a".repeat(MOBILE_FEEDBACK_MESSAGE_MAX_LENGTH),
    });
    assertRejects(MobileFeedbackSubmitRequestSchema, {
      ...submission,
      message: "a".repeat(MOBILE_FEEDBACK_MESSAGE_MAX_LENGTH + 1),
    });
    // Whitespace is not a message: an empty Gönder must stay impossible server-side too.
    assertRejects(MobileFeedbackSubmitRequestSchema, { ...submission, message: "   " });
  });

  it("caps screenshots at the three the form allows", () => {
    assertAccepts(MobileFeedbackSubmitRequestSchema, {
      ...submission,
      attachmentClaimIds: ["a", "b", "c"],
    });
    assertRejects(MobileFeedbackSubmitRequestSchema, {
      ...submission,
      attachmentClaimIds: ["a", "b", "c", "d"],
    });
    assert.equal(MOBILE_FEEDBACK_ATTACHMENT_MAX_COUNT, 3);
  });

  it("pins the diagnostics payload to exactly what the sheet promises", () => {
    assertAccepts(MobileFeedbackDiagnosticsSchema, diagnostics);
    // A newer client must not smuggle a field the user was never shown.
    assertRejects(MobileFeedbackDiagnosticsSchema, { ...diagnostics, email: "a@b.test" });
    assertRejects(MobileFeedbackDiagnosticsSchema, {
      ...diagnostics,
      recentFaults: Array.from({ length: 6 }, () => diagnostics.recentFaults[0]),
    });
    // The boundary never exposes raw error text, so neither does this contract.
    assertRejects(MobileFeedbackDiagnosticsSchema, {
      ...diagnostics,
      recentFaults: [{ ...diagnostics.recentFaults[0], message: "TypeError: boom" }],
    });
    assertAccepts(MobileFeedbackSubmitRequestSchema, { ...submission, diagnostics: null });
  });

  it("carries the roadmap flags the 4b card renders", () => {
    const roadmapItem = {
      description: null,
      id: "item-1",
      isOwnSuggestion: true,
      status: "IN_PROGRESS",
      title: "Sunucu içi arama",
      updatedAt: "2026-07-24T09:00:00.000Z",
      versionLabel: null,
      voteCount: 128,
      votedByViewer: true,
    };
    const item = assertAccepts(MobileRoadmapItemSchema, roadmapItem);

    assert.equal(item.isOwnSuggestion, true);
    assert.equal(item.voteCount, 128);
    // The row says "3 gün önce güncellendi"; without the timestamp it cannot.
    assert.equal(item.updatedAt, "2026-07-24T09:00:00.000Z");
    assertRejects(MobileRoadmapItemSchema, { ...roadmapItem, updatedAt: undefined });
  });

  it("carries an optional bounded version label through roadmap contracts", () => {
    const roadmapItem = {
      description: null,
      id: "item-versioned",
      isOwnSuggestion: false,
      status: "IN_PROGRESS",
      title: "Sunucu içi arama",
      updatedAt: "2026-07-24T09:00:00.000Z",
      versionLabel: "v1.9",
      voteCount: 128,
      votedByViewer: false,
    };

    assert.equal(assertAccepts(MobileRoadmapItemSchema, roadmapItem).versionLabel, "v1.9");
    assert.equal(
      assertAccepts(MobileRoadmapItemSchema, { ...roadmapItem, versionLabel: null }).versionLabel,
      null,
    );
    assertRejects(MobileRoadmapItemSchema, { ...roadmapItem, versionLabel: "v".repeat(25) });

    assert.equal(
      assertAccepts(AdminRoadmapCreateRequestSchema, {
        title: "Sunucu içi arama",
        versionLabel: "  v1.9  ",
      }).versionLabel,
      "v1.9",
    );
    assertAccepts(AdminRoadmapUpdateRequestSchema, { versionLabel: null });
    assertRejects(AdminRoadmapCreateRequestSchema, {
      title: "Sunucu içi arama",
      versionLabel: " ",
    });
  });

  it("lists the viewer's own reports as previews, never whole messages", () => {
    const listItem = {
      createdAt: "2026-07-20T08:00:00.000Z",
      id: "feedback-1",
      preview: "Sesli kanalda mikrofon simgesi geç güncelleniyor.",
      publicNumber: 1284,
      rating: "OKAY",
      status: "PLANNED",
      statusChangedAt: "2026-07-24T09:00:00.000Z",
      topic: "BUG",
      versionLabel: null,
    };
    const parsed = assertAccepts(MobileFeedbackListItemSchema, listItem);

    assert.equal(parsed.publicNumber, 1284);
    // A status that never moved is legitimate; a still-REVIEWING row has no date.
    assertAccepts(MobileFeedbackListItemSchema, { ...listItem, statusChangedAt: null });
    assert.equal(
      assertAccepts(MobileFeedbackListItemSchema, { ...listItem, versionLabel: "v1.8.4" })
        .versionLabel,
      "v1.8.4",
    );
    // Diagnostics and attachments belong to the detail view, not to a list row.
    assertRejects(MobileFeedbackListItemSchema, { ...listItem, diagnostics: null });
    assertRejects(MobileFeedbackListItemSchema, {
      ...listItem,
      preview: "a".repeat(FEEDBACK_PREVIEW_MAX_LENGTH + 1),
    });

    assertAccepts(MobileFeedbackListResponseSchema, { items: [listItem] });
    assertRejects(MobileFeedbackListResponseSchema, {
      items: Array.from({ length: MOBILE_FEEDBACK_LIST_MAX_COUNT + 1 }, () => listItem),
    });
  });

  it("votes by end state, not by delta", () => {
    assertAccepts(MobileRoadmapVoteRequestSchema, { voted: true });
    assertRejects(MobileRoadmapVoteRequestSchema, { delta: 1 });
  });

  it("requires an admin update to actually change something", () => {
    assertAccepts(AdminFeedbackUpdateRequestSchema, { status: "PLANNED" });
    assertAccepts(AdminFeedbackUpdateRequestSchema, { roadmapItemId: null });
    assertRejects(AdminFeedbackUpdateRequestSchema, {});
    assertRejects(AdminRoadmapUpdateRequestSchema, {});
    assertAccepts(AdminRoadmapCreateRequestSchema, { title: "Sesli mesajlar" });
    assertRejects(AdminRoadmapCreateRequestSchema, { title: "" });
  });

  it("formats the tracking number the same way everywhere", () => {
    assert.equal(formatFeedbackPublicNumber(1284), "WSP-1284");
    assert.equal(formatFeedbackPublicNumber(1), "WSP-1");
    assert.equal(ADMIN_FEEDBACK_PAGE_SIZE, 20);
  });
});
