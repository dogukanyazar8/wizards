import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseJsonBody } from "@/lib/api";
import {
  mobileTwoFactorConfirmRoute,
  mobileTwoFactorDisableRoute,
  mobileTwoFactorSetupRoute,
} from "./route-logic";

const setup = {
  manualEntryKey: "ABCDEFGHIJKLMNOP",
  otpauthUri: "otpauth://totp/Whispr:test",
  qrCodeDataUrl: "data:image/png;base64,QUJDRA==",
  success: true as const,
};
function request(method: string, body?: unknown) {
  return new Request("https://whispr.test/2fa", {
    ...(body ? { body: JSON.stringify(body) } : {}),
    headers: { "content-type": "application/json" },
    method,
  });
}
function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    authenticate: async () => "user-1",
    confirm: async () => ({ recoveryCodes: ["RECOVERY-CODE"], success: true as const }),
    disable: async () => ({ success: true as const }),
    enforceRateLimit: async () => undefined,
    parseBody: parseJsonBody,
    setup: async () => setup,
    ...overrides,
  };
}

describe("mobile two-factor routes", () => {
  it("returns validated setup and confirmation payloads", async () => {
    assert.deepEqual(
      await (await mobileTwoFactorSetupRoute(request("POST"), dependencies())).json(),
      {
        manualEntryKey: setup.manualEntryKey,
        otpauthUri: setup.otpauthUri,
        qrCodeDataUrl: setup.qrCodeDataUrl,
      },
    );
    assert.deepEqual(
      await (
        await mobileTwoFactorConfirmRoute(request("POST", { code: "123456" }), dependencies())
      ).json(),
      { recoveryCodes: ["RECOVERY-CODE"] },
    );
  });
  it("requires password and code to disable and maps failures to bounded codes", async () => {
    const invalid = await mobileTwoFactorDisableRoute(
      request("DELETE", { code: "123456", password: "wrong" }),
      dependencies({
        disable: async () => ({ error: "invalid_code", success: false as const }),
      }),
    );
    assert.equal(invalid.status, 400);
    assert.deepEqual(await invalid.json(), {
      code: "INVALID_CODE",
      error: "Invalid two-factor code",
    });
  });
  it("maps replay-store outages to a bounded unavailable response", async () => {
    const unavailable = await mobileTwoFactorConfirmRoute(
      request("POST", { code: "123456" }),
      dependencies({
        confirm: async () => ({
          error: "verification_unavailable",
          success: false as const,
        }),
      }),
    );
    assert.equal(unavailable.status, 503);
    assert.deepEqual(await unavailable.json(), {
      code: "TWO_FACTOR_UNAVAILABLE",
      error: "Two-factor verification is temporarily unavailable",
    });
  });
  it("authenticates before applying the named route limit", async () => {
    const calls: string[] = [];
    await mobileTwoFactorSetupRoute(
      request("POST"),
      dependencies({
        authenticate: async () => {
          calls.push("auth");
          return "user-1";
        },
        enforceRateLimit: async (_id: string, action: string) => {
          calls.push(action);
        },
      }),
    );
    assert.deepEqual(calls, ["auth", "mobile:account:two-factor"]);
  });
});
