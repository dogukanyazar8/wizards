import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatAdminBytes,
  formatAdminDuration,
  formatAdminInt,
  formatAdminNumber,
  formatAdminPercent,
} from "@/components/admin/format/admin-format";

describe("admin number formatting", () => {
  it("groups thousands the Turkish way", () => {
    assert.equal(formatAdminInt(1204), "1.204");
    assert.equal(formatAdminInt(247912), "247.912");
    assert.equal(formatAdminInt(0), "0");
  });

  it("abbreviates large counts with a decimal comma", () => {
    assert.equal(formatAdminNumber(4210000), "4,21M");
    assert.equal(formatAdminNumber(918000), "918K");
    assert.equal(formatAdminNumber(86420), "86.420");
    assert.equal(formatAdminNumber(1500), "1.500");
  });

  it("writes percentages with the sign in front", () => {
    assert.equal(formatAdminPercent(4.2), "%4,2");
    assert.equal(formatAdminPercent(-2.3), "−%2,3");
    assert.equal(formatAdminPercent(0), "%0");
    assert.equal(formatAdminPercent(7.1, { signed: true }), "+%7,1");
  });

  it("keeps byte sizes readable at every scale", () => {
    assert.equal(formatAdminBytes(0), "0 B");
    assert.equal(formatAdminBytes(1024), "1 KB");
    assert.equal(formatAdminBytes(47063114547527), "42,8 TB");
  });

  it("renders durations as hours and minutes", () => {
    assert.equal(formatAdminDuration(0), "0 dk");
    assert.equal(formatAdminDuration(90), "1 dk");
    assert.equal(formatAdminDuration(3600), "1 sa");
    assert.equal(formatAdminDuration(5400), "1 sa 30 dk");
  });

  it("never leaks an English separator into a formatted value", () => {
    for (const value of [1204, 4210000, 918000, 42]) {
      assert.doesNotMatch(formatAdminNumber(value), /,\d{3}\b/u);
    }
  });
});
