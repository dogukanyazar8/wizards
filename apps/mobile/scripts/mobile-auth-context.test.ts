import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const authContextPath = join(process.cwd(), "src", "auth", "mobile-auth-context.tsx");

describe("mobile auth context", () => {
  it("commits auth state to the token ref before React effects can run bootstrap", () => {
    const source = readFileSync(authContextPath, "utf8");

    assert.match(
      source,
      /const commitAuthState = useCallback\(\(nextState: MobileAuthState\) => \{\s+stateRef\.current = nextState;\s+setState\(nextState\);/s,
    );
  });

  it("keeps auth transitions behind the synchronous commit helper", () => {
    const source = readFileSync(authContextPath, "utf8");
    const setStateCalls = [...source.matchAll(/\bsetState\(/g)];

    assert.equal(setStateCalls.length, 1);
    assert.doesNotMatch(source, /\bsetState\(createMobileAuthState\(/);
    assert.doesNotMatch(source, /\bsetState\(\(current/);
  });
});
