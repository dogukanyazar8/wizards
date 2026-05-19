import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getWhisprDesktopBeforeCloseRequestId } from "./runtime";

describe("desktop runtime helpers", () => {
  it("accepts only positive safe integer close request ids", () => {
    assert.equal(
      getWhisprDesktopBeforeCloseRequestId(
        new CustomEvent("whispr:desktop-before-close", {
          detail: { requestId: 7 },
        }),
      ),
      7,
    );
    assert.equal(
      getWhisprDesktopBeforeCloseRequestId(
        new CustomEvent("whispr:desktop-before-close", {
          detail: { requestId: 0 },
        }),
      ),
      null,
    );
    assert.equal(
      getWhisprDesktopBeforeCloseRequestId(
        new CustomEvent("whispr:desktop-before-close", {
          detail: { requestId: Number.MAX_SAFE_INTEGER + 1 },
        }),
      ),
      null,
    );
    assert.equal(getWhisprDesktopBeforeCloseRequestId(new Event("x")), null);
  });
});
