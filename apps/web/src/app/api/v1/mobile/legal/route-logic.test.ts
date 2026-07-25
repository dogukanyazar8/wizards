import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import { mobileLegalDocumentRoute } from "./[legalDocument]/route-logic";

const DOCUMENT_TEXT = [
  "Whispr Çerez Politikası",
  "",
  "Son Güncelleme Tarihi: 08.05.2026",
  "İletişim: support@whispr.team",
  "",
  "1. Giriş",
  "Bu politika çerez kullanımını açıklar.",
  "1.1. Kapsam",
  "- Oturum çerezleri",
  "- Tercih çerezleri",
].join("\n");

function context(params: Record<string, string>) {
  return { params: Promise.resolve(params) };
}

describe("mobile legal document route", () => {
  it("returns the same text the web serves, parsed into typed blocks", async () => {
    const response = await mobileLegalDocumentRoute(
      new Request("https://whispr.test/api/v1/mobile/legal/cookies"),
      context({ legalDocument: "cookies" }),
      { authenticate: async () => "user-1", readDocument: async () => DOCUMENT_TEXT },
    );
    const body = (await response.json()) as {
      blocks: Array<{ kind: string; text: string }>;
      id: string;
      lastUpdated: string | null;
      title: string;
    };

    assert.equal(response.status, 200);
    assert.equal(body.id, "cookies");
    assert.equal(body.title, "Çerez Politikası");
    assert.equal(body.lastUpdated, "08.05.2026");
    // The title line is dropped (the client renders its own), blank lines never
    // become blocks, and bullets arrive without their "- " marker.
    assert.deepEqual(body.blocks, [
      { kind: "meta", text: "Son Güncelleme Tarihi: 08.05.2026" },
      { kind: "meta", text: "İletişim: support@whispr.team" },
      { kind: "heading", text: "1. Giriş" },
      { kind: "paragraph", text: "Bu politika çerez kullanımını açıklar." },
      { kind: "subheading", text: "1.1. Kapsam" },
      { kind: "bullet", text: "Oturum çerezleri" },
      { kind: "bullet", text: "Tercih çerezleri" },
    ]);
  });

  it("rejects an unknown document instead of reading an arbitrary path", async () => {
    let readCalls = 0;
    const response = await mobileLegalDocumentRoute(
      new Request("https://whispr.test/api/v1/mobile/legal/../../secrets"),
      context({ legalDocument: "../../secrets" }),
      {
        authenticate: async () => "user-1",
        readDocument: async () => {
          readCalls += 1;
          return DOCUMENT_TEXT;
        },
      },
    );

    assert.equal(response.status, 400);
    assert.equal(readCalls, 0);
  });

  it("requires a session before serving the reader", async () => {
    const response = await mobileLegalDocumentRoute(
      new Request("https://whispr.test/api/v1/mobile/legal/terms"),
      context({ legalDocument: "terms" }),
      {
        authenticate: async () => {
          throw new ApiError("Unauthorized", 401);
        },
        readDocument: async () => DOCUMENT_TEXT,
      },
    );

    assert.equal(response.status, 401);
  });
});
