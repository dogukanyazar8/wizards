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

  it("revokes mobile push registration before clearing local session state on sign-out", () => {
    const source = readFileSync(authContextPath, "utf8");
    const signOutStart = source.indexOf("const signOut = useCallback(async () => {");
    const signOutEnd = source.indexOf("const getAccessToken = useCallback", signOutStart);
    const signOutSource = source.slice(signOutStart, signOutEnd);

    const pushRevokeIndex = signOutSource.indexOf("await revokeMobilePushToken(");
    const authRevokeIndex = signOutSource.indexOf("await revokeMobileAuthSession(");
    const clearIndex = signOutSource.indexOf("await repository.clear();");
    const signedOutCommitIndex = signOutSource.indexOf('commitAuthState(createMobileAuthState("signed-out"));');

    assert.equal(pushRevokeIndex > -1, true);
    assert.equal(authRevokeIndex > -1, true);
    assert.equal(clearIndex > -1, true);
    assert.equal(signedOutCommitIndex > -1, true);
    assert.equal(pushRevokeIndex < authRevokeIndex, true);
    assert.equal(authRevokeIndex < clearIndex, true);
    assert.equal(clearIndex < signedOutCommitIndex, true);
  });
});
