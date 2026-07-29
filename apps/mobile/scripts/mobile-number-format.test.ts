import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatMobileBytes, formatMobileCompactCount } from "../src/locale/mobile-number-format";

describe("mobile about number formatting", () => {
  it("prints the handoff's byte sizes with the locale's decimal separator", () => {
    // §3.4: "48,2 MB" / "18,4 MB / 48,2 MB · yaklaşık 12 sn".
    assert.equal(formatMobileBytes(50_541_363, "tr"), "48,2 MB");
    assert.equal(formatMobileBytes(50_541_363, "en"), "48.2 MB");
    assert.equal(formatMobileBytes(19_293_798, "tr"), "18,4 MB");
    // §3.6: "46,8 MB".
    assert.equal(formatMobileBytes(49_073_356, "tr"), "46,8 MB");
  });

  it("drops fractions where they would claim precision the unit lacks", () => {
    assert.equal(formatMobileBytes(900, "tr"), "900 B");
    assert.equal(formatMobileBytes(2_048, "tr"), "2 KB");
    // Above 100 of a unit the tenth is noise, not information.
    assert.equal(formatMobileBytes(1024 * 1024 * 512, "tr"), "512 MB");
    assert.equal(formatMobileBytes(1024 * 1024 * 1024 * 2.5, "en"), "2.5 GB");
  });

  it("treats an unreadable size as zero instead of inventing one", () => {
    assert.equal(formatMobileBytes(Number.NaN, "tr"), "0 B");
    assert.equal(formatMobileBytes(-1, "tr"), "0 B");
    assert.equal(formatMobileBytes(0, "en"), "0 B");
  });

  it("prints the handoff's compact counts per locale", () => {
    // §3.2/§3.12: "12,4B üye", "1,2B çevrimiçi", "768 paket".
    assert.equal(formatMobileCompactCount(12_400, "tr"), "12,4B");
    assert.equal(formatMobileCompactCount(12_400, "en"), "12.4K");
    assert.equal(formatMobileCompactCount(1_200, "tr"), "1,2B");
    assert.equal(formatMobileCompactCount(1_200, "en"), "1.2K");
    // §3.10: "24B görüntüleme" / "9B görüntüleme".
    assert.equal(formatMobileCompactCount(24_000, "tr"), "24B");
    assert.equal(formatMobileCompactCount(9_000, "en"), "9K");
  });

  it("leaves counts below a thousand alone and climbs past the first suffix", () => {
    assert.equal(formatMobileCompactCount(768, "tr"), "768");
    assert.equal(formatMobileCompactCount(0, "en"), "0");
    assert.equal(formatMobileCompactCount(124_000, "tr"), "124B");
    assert.equal(formatMobileCompactCount(2_400_000, "tr"), "2,4Mn");
    assert.equal(formatMobileCompactCount(2_400_000, "en"), "2.4M");
    assert.equal(formatMobileCompactCount(3_100_000_000, "en"), "3.1B");
  });

  it("keeps a negative count readable rather than dropping its sign", () => {
    assert.equal(formatMobileCompactCount(-1_500, "tr"), "-1,5B");
    assert.equal(formatMobileCompactCount(Number.POSITIVE_INFINITY, "tr"), "0");
  });
});
