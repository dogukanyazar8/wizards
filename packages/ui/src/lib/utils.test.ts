import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cn } from "./utils";

describe("cn", () => {
  it("combines strings, arrays, and conditional class maps", () => {
    assert.equal(
      cn("inline-flex", ["items-center", "gap-2"], {
        "cursor-not-allowed": false,
        "opacity-50": true,
      }),
      "inline-flex items-center gap-2 opacity-50",
    );
  });

  it("keeps only the winning Tailwind utility from conflicting groups", () => {
    assert.equal(cn("px-2 py-1 text-sm", "px-4 text-lg"), "py-1 px-4 text-lg");
    assert.equal(cn("bg-red-500 hover:bg-red-600", "bg-blue-500"), "hover:bg-red-600 bg-blue-500");
  });

  it("ignores empty and falsey class inputs without introducing whitespace", () => {
    assert.equal(cn(undefined, null, false, "", 0), "");
    assert.equal(cn("button", undefined, { active: false, disabled: true }), "button disabled");
  });
});
