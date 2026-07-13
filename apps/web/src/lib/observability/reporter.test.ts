import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  clearErrorReporter,
  registerErrorReporter,
  reportError,
} from "./reporter";

describe("observability reporter", () => {
  beforeEach(() => {
    clearErrorReporter();
  });

  it("kayıtlı reporter'a scope ve hatayı iletir", () => {
    const calls: Array<{ scope: string; error: unknown }> = [];
    registerErrorReporter((scope, error) => {
      calls.push({ scope, error });
    });

    const failure = new Error("boom");
    reportError("[test] scope", failure);

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.scope, "[test] scope");
    assert.equal(calls[0]?.error, failure);
  });

  it("reporter yokken sessizce no-op kalır", () => {
    assert.doesNotThrow(() => reportError("[test] scope", new Error("boom")));
  });

  it("reporter'ın kendi hatası çağıranı asla kırmaz", () => {
    registerErrorReporter(() => {
      throw new Error("reporter down");
    });
    assert.doesNotThrow(() => reportError("[test] scope", new Error("boom")));
  });
});
