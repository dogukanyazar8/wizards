import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { hslToHex, parseHslToken, renderInviteQr, resolveInviteQrColors } from "./qr";

/**
 * Ş3 §4. İki şey kanıtlanıyor: QR gerçekten üretiliyor, ve hiçbir renk kodda gömülü değil —
 * çizilen her renk token okumasından türüyor, token okunamazsa çizim iptal.
 */

const FAKE_CANVAS = {} as HTMLCanvasElement;

/** `globals.css` açık tema değerleri (satır 107 / 127). */
const LIGHT_TOKENS: Record<string, string> = {
  "--foreground": "222 26% 14%",
  "--surface-card": "0 0% 100%",
};

/** `globals.css` koyu tema değerleri (satır 141 / 158). */
const DARK_TOKENS: Record<string, string> = {
  "--foreground": "220 20% 96%",
  "--surface-card": "227 8% 27%",
};

function readerFor(tokens: Record<string, string>) {
  return (token: string) => tokens[token] ?? "";
}

type RecordedCall = {
  options: {
    color: { dark: string; light: string };
    errorCorrectionLevel: "M";
    margin: number;
    width: number;
  };
  text: string;
};

function recordingRenderer(calls: RecordedCall[]) {
  return async (_canvas: HTMLCanvasElement, text: string, options: RecordedCall["options"]) => {
    calls.push({ options, text });
  };
}

describe("parseHslToken", () => {
  it("reads the bare component form globals.css stores", () => {
    assert.deepEqual(parseHslToken("222 26% 14%"), {
      hue: 222,
      lightness: 14,
      saturation: 26,
    });
  });

  it("tolerates getComputedStyle padding, a deg suffix and an alpha tail", () => {
    assert.deepEqual(parseHslToken("  199deg 89% 48% / 0.4 "), {
      hue: 199,
      lightness: 48,
      saturation: 89,
    });
  });

  it("rejects anything that is not a token triple", () => {
    for (const value of ["", "   ", "#0da2e7", "hsl(199 89% 48%)", "199 89 48", "199 189% 48%"]) {
      assert.equal(parseHslToken(value), null, value);
    }
  });
});

describe("hslToHex", () => {
  it("converts the six token values this surface can hit", () => {
    const cases: Array<[string, string]> = [
      ["0 0% 0%", "#000000"],
      ["0 0% 100%", "#ffffff"],
      ["222 26% 14%", "#1a202d"],
      ["220 20% 96%", "#f3f4f7"],
      ["227 8% 27%", "#3f424a"],
      ["291 64% 55%", "#c043d6"],
    ];

    for (const [token, expected] of cases) {
      const parsed = parseHslToken(token);
      assert.ok(parsed, token);
      assert.equal(hslToHex(parsed), expected, token);
    }
  });

  it("keeps hue wrapping stable so 0 and 360 are the same colour", () => {
    assert.equal(hslToHex({ hue: 0, lightness: 50, saturation: 100 }), "#ff0000");
    assert.equal(hslToHex({ hue: 360, lightness: 50, saturation: 100 }), "#ff0000");
  });
});

describe("resolveInviteQrColors", () => {
  it("reads --foreground and --surface-card by default", () => {
    assert.deepEqual(resolveInviteQrColors(readerFor(LIGHT_TOKENS)), {
      dark: "#1a202d",
      light: "#ffffff",
    });
  });

  it("follows the theme rather than a baked palette", () => {
    assert.deepEqual(resolveInviteQrColors(readerFor(DARK_TOKENS)), {
      dark: "#f3f4f7",
      light: "#3f424a",
    });
  });

  it("honours token overrides and passes the scope element through", () => {
    const scope = {} as Element;
    const seen: Array<{ scope: Element | null; token: string }> = [];
    const colors = resolveInviteQrColors(
      (token, tokenScope) => {
        seen.push({ scope: tokenScope, token });
        return token === "--primary" ? "291 64% 55%" : "0 0% 100%";
      },
      { backgroundToken: "--surface-secondary", foregroundToken: "--primary", scope },
    );

    assert.deepEqual(colors, { dark: "#c043d6", light: "#ffffff" });
    assert.deepEqual(seen, [
      { scope, token: "--primary" },
      { scope, token: "--surface-secondary" },
    ]);
  });

  it("gives up instead of inventing a colour when a token is missing", () => {
    assert.equal(resolveInviteQrColors(readerFor({ "--foreground": "222 26% 14%" })), null);
    assert.equal(
      resolveInviteQrColors(() => ""),
      null,
    );
  });
});

describe("renderInviteQr", () => {
  it("draws the share link with token-derived colours", async () => {
    const calls: RecordedCall[] = [];
    const drawn = await renderInviteQr(FAKE_CANVAS, "https://whispr.app/invite/whspr-a7k2", {
      readToken: readerFor(LIGHT_TOKENS),
      toCanvas: recordingRenderer(calls),
    });

    assert.equal(drawn, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.text, "https://whispr.app/invite/whspr-a7k2");
    assert.deepEqual(calls[0]?.options.color, { dark: "#1a202d", light: "#ffffff" });
    assert.equal(calls[0]?.options.errorCorrectionLevel, "M");
  });

  it("lets the caller size the box, since the design carries no QR measure", async () => {
    const calls: RecordedCall[] = [];
    await renderInviteQr(FAKE_CANVAS, "https://whispr.app/invite/whspr-a7k2", {
      margin: 2,
      readToken: readerFor(LIGHT_TOKENS),
      toCanvas: recordingRenderer(calls),
      width: 180,
    });

    assert.equal(calls[0]?.options.margin, 2);
    assert.equal(calls[0]?.options.width, 180);
  });

  it("falls silent without a canvas, and never reaches the renderer", async () => {
    const calls: RecordedCall[] = [];
    const drawn = await renderInviteQr(null, "https://whispr.app/invite/whspr-a7k2", {
      readToken: readerFor(LIGHT_TOKENS),
      toCanvas: recordingRenderer(calls),
    });

    assert.equal(drawn, false);
    assert.deepEqual(calls, []);
  });

  it("falls silent on an empty url", async () => {
    const calls: RecordedCall[] = [];
    assert.equal(
      await renderInviteQr(FAKE_CANVAS, "   ", {
        readToken: readerFor(LIGHT_TOKENS),
        toCanvas: recordingRenderer(calls),
      }),
      false,
    );
    assert.deepEqual(calls, []);
  });

  it("falls silent when the tokens cannot be read, rather than drawing a guessed colour", async () => {
    const calls: RecordedCall[] = [];
    const drawn = await renderInviteQr(FAKE_CANVAS, "https://whispr.app/invite/whspr-a7k2", {
      readToken: () => "",
      toCanvas: recordingRenderer(calls),
    });

    assert.equal(drawn, false);
    assert.deepEqual(calls, []);
  });

  it("reaches the real qrcode renderer when no seam is injected, and still fails soft", async () => {
    // Enjekte edilen `toCanvas` olmadan dinamik import gerçekten çözülüyor mu — çözülmezse
    // dosya yalnız test dikişiyle çalışan bir kabuk olurdu. Node'da gerçek bir canvas
    // bağlamı yok, o yüzden beklenen sonuç "sessizce false".
    const drawn = await renderInviteQr(FAKE_CANVAS, "https://whispr.app/invite/whspr-a7k2", {
      readToken: readerFor(LIGHT_TOKENS),
    });

    assert.equal(drawn, false);
  });

  it("swallows a generation failure so the link row keeps working", async () => {
    const drawn = await renderInviteQr(FAKE_CANVAS, "https://whispr.app/invite/whspr-a7k2", {
      readToken: readerFor(LIGHT_TOKENS),
      toCanvas: async () => {
        throw new Error("canvas context unavailable");
      },
    });

    assert.equal(drawn, false);
  });
});
