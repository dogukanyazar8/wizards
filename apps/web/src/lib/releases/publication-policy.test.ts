import assert from "node:assert/strict";
import { test } from "node:test";
import { assertPublicationAdvance } from "./publication-policy";

const input = { version: "1.3.0", baselineSha: "a".repeat(40) };
test("publication requires current baseline and strictly increasing version", () => {
  assert.doesNotThrow(() =>
    assertPublicationAdvance(input, { version: "1.2.0", sourceSha: input.baselineSha }),
  );
  assert.throws(
    () => assertPublicationAdvance(input, { version: "1.3.1", sourceSha: input.baselineSha }),
    /increase/u,
  );
  assert.throws(
    () => assertPublicationAdvance(input, { version: "1.3.0", sourceSha: input.baselineSha }),
    /increase/u,
  );
  assert.throws(
    () => assertPublicationAdvance(input, { version: "1.2.0", sourceSha: "b".repeat(40) }),
    /baseline/u,
  );
  assert.throws(() => assertPublicationAdvance(input, null), /baseline/u);
  assert.doesNotThrow(() => assertPublicationAdvance({ ...input, baselineSha: null }, null));
});
