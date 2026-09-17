import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isExplicitE2ETestMode } from "@/lib/e2e/mode";
import { CSP_NONCE_HEADER } from "@/lib/request-context";

/**
 * Ekran paylaşımı Ş0.3 — gerçek-medya desen sayfası.
 *
 * Yalnız e2e test modunda vardır; üretimde 404. Playwright `chromium-real-media` projesinin desen
 * grubu bu sekmeyi `--auto-select-tab-capture-source-by-title="Whispr screen pattern"` ile yakalar
 * ve izleyen tarafta `<video>`'dan örneklenen piksellerle iki şeyi ölçer:
 *
 * 1. **İkili saat şeridi** (üstte 24 kare, her biri 40×40 px): `performance.now()` milisaniyesinin
 *    düşük 24 biti, MSB solda; 1 = beyaz, 0 = siyah. OCR yok — alıcı kare merkezlerini okuyup
 *    sayıyı geri kurar, `performance.timeOrigin` ile duvar saatine çevirir → glass-to-glass gecikme.
 * 2. **Yüksek kontrast metin ızgarası** (12/16/24 px): statik bölge, gri ton SSIM için referans.
 *
 * Geometri sözleşmesi `apps/web/e2e/fixtures/screen-share.ts` ile paylaşılır ve
 * `scripts/playwright-real-media-config.test.mjs` iki tarafı aynı sayıya kilitler.
 */
const CLOCK_STRIP_BITS = 24;
const CLOCK_STRIP_CELL_PX = 40;
const CLOCK_STRIP_CANVAS_ID = "whispr-screen-pattern-clock";
const TEXT_GRID_FONT_SIZES_PX = [12, 16, 24] as const;
const TEXT_GRID_ROWS = 6;
const TEXT_GRID_SAMPLE = "Whispr 0123456789 ABCDEFGHIJKLM nopqrstuvwxyz ĞÜŞİÖÇ ğüşıöç %&@#";

const isPatternPageEnabled = isExplicitE2ETestMode({
  allowProductionBuild: process.env.NEXT_PUBLIC_E2E_ALLOW_PRODUCTION_BUILD,
  nodeEnv: process.env.NODE_ENV,
  testMode: process.env.NEXT_PUBLIC_E2E_TEST_MODE,
});

export const metadata: Metadata = {
  description: "Whispr screen share real-media test pattern",
  robots: { follow: false, index: false },
  // The root layout's title template would flatten this to "Whispr"; tab capture matches the
  // exact title, so it is declared absolute.
  title: { absolute: "Whispr screen pattern" },
};

/*
 * Static, module-owned script: no request or user text is interpolated. It runs on every
 * animation frame so a sampled frame is never more than one paint behind the clock.
 */
const CLOCK_STRIP_SCRIPT = `(() => {
  const canvas = document.getElementById(${JSON.stringify(CLOCK_STRIP_CANVAS_ID)});
  if (!(canvas instanceof HTMLCanvasElement)) return;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) return;
  const bits = ${CLOCK_STRIP_BITS};
  const cell = ${CLOCK_STRIP_CELL_PX};
  const modulo = 2 ** bits;
  const paint = () => {
    const ms = Math.floor(performance.now()) % modulo;
    for (let index = 0; index < bits; index += 1) {
      const bit = (ms >>> (bits - 1 - index)) & 1;
      context.fillStyle = bit ? "#ffffff" : "#000000";
      context.fillRect(index * cell, 0, cell, cell);
    }
    window.__whisprScreenPatternLastMs = ms;
    window.requestAnimationFrame(paint);
  };
  window.__whisprScreenPatternClock = { bits, cell, modulo };
  paint();
})();`;

export default async function ScreenPatternPage() {
  if (!isPatternPageEnabled) {
    notFound();
  }

  // Production CSP is nonce + `strict-dynamic`; the inline clock script must carry the nonce.
  const nonce = (await headers()).get(CSP_NONCE_HEADER) ?? undefined;
  const stripWidth = CLOCK_STRIP_BITS * CLOCK_STRIP_CELL_PX;

  return (
    <main
      data-testid="e2e-screen-pattern"
      style={{
        background: "#ffffff",
        color: "#000000",
        fontFamily: "monospace",
        inset: 0,
        margin: 0,
        overflow: "hidden",
        padding: 0,
        position: "fixed",
      }}
    >
      <canvas
        data-testid="e2e-screen-pattern-clock"
        height={CLOCK_STRIP_CELL_PX}
        id={CLOCK_STRIP_CANVAS_ID}
        style={{
          display: "block",
          height: CLOCK_STRIP_CELL_PX,
          left: 0,
          position: "absolute",
          top: 0,
          width: stripWidth,
        }}
        width={stripWidth}
      />
      <section
        data-testid="e2e-screen-pattern-text"
        style={{
          left: 0,
          position: "absolute",
          right: 0,
          top: CLOCK_STRIP_CELL_PX + 8,
        }}
      >
        {TEXT_GRID_FONT_SIZES_PX.map((fontSize) => (
          <div
            data-testid={`e2e-screen-pattern-text-${fontSize}`}
            key={fontSize}
            style={{ fontSize, lineHeight: 1.25, padding: "4px 8px", whiteSpace: "nowrap" }}
          >
            {Array.from({ length: TEXT_GRID_ROWS }, (_, row) => (
              <div key={row}>
                {`${String(fontSize).padStart(2, "0")}px r${row} ${TEXT_GRID_SAMPLE} ${TEXT_GRID_SAMPLE}`}
              </div>
            ))}
          </div>
        ))}
      </section>
      {/* nosemgrep: typescript.react.security.no-dangerously-set-inner-html */}
      <script dangerouslySetInnerHTML={{ __html: CLOCK_STRIP_SCRIPT }} nonce={nonce} />
    </main>
  );
}
