import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EMAIL_BRAND_GRADIENT,
  EMAIL_BRAND_GRADIENT_FALLBACK,
  EMAIL_BREAKPOINT,
  EMAIL_CARD_WIDTH,
  EMAIL_COLORS,
  EMAIL_FONTS,
  EMAIL_MARK,
  EMAIL_MAX_BYTES,
  EMAIL_RADIUS,
  EMAIL_TYPE,
} from "@/lib/email/email-theme";

/** SPEC §1 tablosu — token adı değil, **değer** kümesi denetlenir. */
const SPEC_HEXES = [
  "#5966F2",
  "#4C59E0",
  "#11151D",
  "#1A202D",
  "#515C70",
  "#778092",
  "#8B93A5",
  "#CED4DE",
  "#E3E6EE",
  "#F9FAFB",
  "#F2F4F7",
  "#FFFFFF",
  "#B4761A",
];

describe("e-posta tema tokenları", () => {
  it("SPEC §1'deki her hex tam olarak bir kez tanımlıdır", () => {
    const values = Object.values(EMAIL_COLORS);

    assert.deepEqual([...values].sort(), [...SPEC_HEXES].sort());
    assert.equal(new Set(values).size, values.length, "aynı hex iki token adıyla tanımlanmış");
  });

  it("yazı tipi yığınları SPEC'teki sırayı korur", () => {
    assert.equal(EMAIL_FONTS.heading, "'Outfit','Trebuchet MS',Tahoma,Arial,sans-serif");
    assert.equal(EMAIL_FONTS.body, "'Figtree',Arial,Helvetica,sans-serif");
  });

  it("hiçbir rol daktilo font kullanmaz", () => {
    for (const [role, spec] of Object.entries(EMAIL_TYPE)) {
      assert.doesNotMatch(spec.fontFamily, /monospace|courier/i, `${role} daktilo font kullanıyor`);
    }
  });

  it("başlık ve kod rolleri Outfit, kalan roller Figtree yığınını kullanır", () => {
    const headingRoles = ["brandName", "heading", "code"];

    for (const [role, spec] of Object.entries(EMAIL_TYPE)) {
      assert.equal(
        spec.fontFamily,
        headingRoles.includes(role) ? EMAIL_FONTS.heading : EMAIL_FONTS.body,
        `${role} yanlış yığını kullanıyor`,
      );
    }
  });

  it("SPEC §2 ölçüleri birebir", () => {
    assert.equal(EMAIL_TYPE.heading.fontSize, "25px");
    assert.equal(EMAIL_TYPE.heading.lineHeight, "31px");
    assert.equal(EMAIL_TYPE.heading.letterSpacing, "-0.5px");
    assert.equal(EMAIL_TYPE.code.fontSize, "34px");
    assert.equal(EMAIL_TYPE.code.letterSpacing, "11px");
    assert.equal(EMAIL_TYPE.body.fontSize, "14.5px");
    assert.equal(EMAIL_TYPE.body.lineHeight, "23px");
    assert.equal(EMAIL_TYPE.eyebrow.letterSpacing, "1.7px");
    assert.equal(EMAIL_TYPE.bandLabel.letterSpacing, "1.5px");
    assert.equal(EMAIL_TYPE.metaLabel.letterSpacing, "1.3px");
  });

  it("marka işareti oranları korunur", () => {
    assert.deepEqual([...EMAIL_MARK.barHeights], [12, 18, 24, 17, 13]);
    assert.equal(EMAIL_MARK.innerHeight, Math.max(...EMAIL_MARK.barHeights));
    assert.equal(EMAIL_MARK.size, 36);
    assert.equal(EMAIL_MARK.barWidth, 3);
    assert.equal(EMAIL_MARK.barGap, 3);
    assert.equal(EMAIL_MARK.barRadius, 2);
    assert.match(EMAIL_BRAND_GRADIENT, /^linear-gradient\(145deg,#7C70FF,#5B62FF 46%,#2F6DFF\)$/);
    assert.equal(EMAIL_BRAND_GRADIENT_FALLBACK, "#5B62FF");
  });

  it("yarıçap, genişlik ve boyut sınırları SPEC'e uyar", () => {
    assert.deepEqual(EMAIL_RADIUS, { card: 16, box: 14, button: 12, mark: 10 });
    assert.equal(EMAIL_CARD_WIDTH, 600);
    assert.equal(EMAIL_BREAKPOINT, 520);
    assert.equal(EMAIL_MAX_BYTES, 15 * 1024);
  });
});
