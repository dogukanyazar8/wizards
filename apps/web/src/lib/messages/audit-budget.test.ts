import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MESSAGES_AUDIT_BUDGET,
  MESSAGES_AUDIT_SCOPE,
  collectMessagesAuditFiles,
  measureMessagesAudit,
} from "./audit-budget";

describe("Mesajlar denetim bütçesi", () => {
  it("her kapsam için bir bütçe satırı vardır", () => {
    for (const scope of MESSAGES_AUDIT_SCOPE) {
      assert.ok(MESSAGES_AUDIT_BUDGET[scope], `${scope} bütçesi yok`);
    }

    assert.equal(Object.keys(MESSAGES_AUDIT_BUDGET).length, MESSAGES_AUDIT_SCOPE.length);
  });

  it("paketle doğan klasörler ilk günden temizdir", () => {
    for (const scope of ["components/messages", "lib/messages"] as const) {
      assert.deepEqual(
        { copy: MESSAGES_AUDIT_BUDGET[scope].copy, token: MESSAGES_AUDIT_BUDGET[scope].token },
        { copy: 0, token: 0 },
        `${scope} yeni bir klasör; borç taşıyamaz`,
      );
    }
  });

  for (const scope of MESSAGES_AUDIT_SCOPE) {
    it(`${scope} bütçeyi aşmaz`, () => {
      const measured = measureMessagesAudit(scope);
      const budget = MESSAGES_AUDIT_BUDGET[scope];

      assert.ok(
        measured.token <= budget.token,
        `${scope} token borcu büyüdü: ${measured.token} > ${budget.token}\n${measured.offenders
          .filter((entry) => entry.startsWith("token "))
          .join("\n")}`,
      );
      assert.ok(
        measured.copy <= budget.copy,
        `${scope} metin borcu büyüdü: ${measured.copy} > ${budget.copy}\n${measured.offenders
          .filter((entry) => entry.startsWith("copy "))
          .join("\n")}`,
      );
    });

    /**
     * Bütçe yalnız tavan olsaydı, borç kapandıktan sonra da eski sayı orada kalır ve bir sonraki
     * sapmaya yer açardı. Fazlalık da hata sayılır: düzelten, bütçeyi de düşürmek zorunda.
     */
    it(`${scope} bütçesi gerçekten harcanmış`, () => {
      const measured = measureMessagesAudit(scope);
      const budget = MESSAGES_AUDIT_BUDGET[scope];

      assert.equal(
        measured.token,
        budget.token,
        `${scope} token borcu azalmış; bütçeyi ${measured.token} yap.`,
      );
      assert.equal(
        measured.copy,
        budget.copy,
        `${scope} metin borcu azalmış; bütçeyi ${measured.copy} yap.`,
      );
    });
  }

  it("kapsam gerçek dosyalara denk gelir", () => {
    const total = MESSAGES_AUDIT_SCOPE.flatMap((scope) => collectMessagesAuditFiles(scope));

    assert.ok(total.length > 20, "kapsam beklenenden az dosya topluyor");
    assert.ok(
      total.every((path) => !path.endsWith(".test.ts") && !path.endsWith(".test.tsx")),
      "testler kapsam dışıdır",
    );
  });
});
