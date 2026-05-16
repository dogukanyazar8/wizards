import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import * as ts from "typescript";

const liveVoiceProviderPath = new URL("./live-voice-provider.tsx", import.meta.url);
const liveVoiceProviderSource = readFileSync(liveVoiceProviderPath, "utf8");
const liveVoiceProviderAst = ts.createSourceFile(
  "live-voice-provider.tsx",
  liveVoiceProviderSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

describe("voice provider bundle boundaries", () => {
  it("keeps the large Krisp implementation behind a dynamic import", () => {
    const staticKrispImports = liveVoiceProviderAst.statements
      .filter(ts.isImportDeclaration)
      .filter(
        (statement) =>
          ts.isStringLiteral(statement.moduleSpecifier) &&
          statement.moduleSpecifier.text === "@livekit/krisp-noise-filter",
      );

    assert.ok(staticKrispImports.length > 0, "Krisp type import should stay explicit");
    for (const importDeclaration of staticKrispImports) {
      assert.equal(
        importDeclaration.importClause?.isTypeOnly,
        true,
        "@livekit/krisp-noise-filter must not be value-imported by the voice provider",
      );
    }

    assert.match(
      liveVoiceProviderSource,
      /import\(\s*["@']@livekit\/krisp-noise-filter["@']\s*\)/,
      "Krisp should be loaded only when voice noise cancellation is checked or enabled",
    );
  });
});
