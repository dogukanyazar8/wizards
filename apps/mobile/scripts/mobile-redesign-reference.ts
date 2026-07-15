import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { chromium } from "@playwright/test";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(scriptDirectory, "..");
const repositoryRoot = path.resolve(mobileRoot, "..", "..");
const fontsRoot = path.join(mobileRoot, "assets", "fonts");
const fontManifestPath = path.join(fontsRoot, "manifest.json");
const handoffPath = path.join(
  repositoryRoot,
  "design_handoff_whispr_mobile",
  "Whispr Mobile Redesign.dc.html",
);

export const REFERENCE_SOURCE_DATE_EPOCH = "0";

export function getReferenceRendererViewportHeight(input: {
  readonly bodyScrollHeight: number;
  readonly documentElementScrollHeight: number;
}): number {
  return Math.max(input.bodyScrollHeight, input.documentElementScrollHeight);
}

export const REFERENCE_FONT_SPECS = [
  {
    family: "WhisprJakarta-400",
    filename: "PlusJakartaSans-Regular.ttf",
    weight: 400,
  },
  {
    family: "WhisprJakarta-500",
    filename: "PlusJakartaSans-Medium.ttf",
    weight: 500,
  },
  {
    family: "WhisprJakarta-600",
    filename: "PlusJakartaSans-SemiBold.ttf",
    weight: 600,
  },
  {
    family: "WhisprJakarta-700",
    filename: "PlusJakartaSans-Bold.ttf",
    weight: 700,
  },
  {
    family: "WhisprJakarta-800",
    filename: "PlusJakartaSans-ExtraBold.ttf",
    weight: 800,
  },
] as const;

type ReferenceFontSpec = (typeof REFERENCE_FONT_SPECS)[number];

type FontManifest = {
  files: Record<
    string,
    {
      sha256: string;
      weight: number;
    }
  >;
};

export type VendoredFontAsset = ReferenceFontSpec & {
  absolutePath: string;
  sha256: string;
};

export type ResourceTimingEntry = {
  initiatorType: string;
  name: string;
};

type ReferenceCaptureResult = {
  fontFamilies: readonly string[];
  sourceDateEpoch: typeof REFERENCE_SOURCE_DATE_EPOCH;
};

export function validateVendoredFontManifest(
  targetFontsRoot = fontsRoot,
): VendoredFontAsset[] {
  const manifest = JSON.parse(
    readFileSync(path.join(targetFontsRoot, "manifest.json"), "utf8"),
  ) as FontManifest;
  const manifestFilenames = Object.keys(manifest.files).sort();
  const expectedFilenames = REFERENCE_FONT_SPECS.map(({ filename }) => filename).sort();

  if (JSON.stringify(manifestFilenames) !== JSON.stringify(expectedFilenames)) {
    throw new Error(
      "Vendored font manifest must contain exactly the five reference font binaries.",
    );
  }

  return REFERENCE_FONT_SPECS.map((font) => {
    const manifestEntry = manifest.files[font.filename];
    if (!manifestEntry || manifestEntry.weight !== font.weight) {
      throw new Error(`Vendored font manifest entry is invalid: ${font.filename}.`);
    }

    const absolutePath = path.join(targetFontsRoot, font.filename);
    const sha256 = createHash("sha256")
      .update(readFileSync(absolutePath))
      .digest("hex");

    assertVendoredFontHash(font.filename, manifestEntry.sha256, sha256);

    return { ...font, absolutePath, sha256 };
  });
}

export function assertVendoredFontHash(
  filename: string,
  expectedSha256: string,
  actualSha256: string,
): void {
  if (actualSha256 !== expectedSha256) {
    throw new Error(
      `Vendored font SHA-256 mismatch for ${filename}: expected ${expectedSha256}, received ${actualSha256}.`,
    );
  }
}

export function buildVendoredFontFaceCss(
  fontAssets: readonly VendoredFontAsset[],
): string {
  const fontFaces = fontAssets
    .map(
      ({ family, filename, weight }) => `
@font-face {
  font-family: "${family}";
  src: url("/fonts/${filename}") format("truetype");
  font-style: normal;
  font-weight: ${weight};
  font-display: block;
}`,
    )
    .join("\n");

  const fontAssignments = REFERENCE_FONT_SPECS.map(
    ({ family, weight }) => `
[style*="font-weight:${weight}"],
[style*="font-weight: ${weight}"] {
  font-family: "${family}", sans-serif !important;
}`,
  ).join("\n");

  return `${fontFaces}

html,
body,
body * {
  font-family: "WhisprJakarta-400", sans-serif !important;
}
${fontAssignments}`;
}

export function isRemoteFontResource(
  entry: ResourceTimingEntry,
  localOrigin: string,
): boolean {
  if (entry.initiatorType !== "font") {
    return false;
  }

  try {
    return new URL(entry.name).origin !== localOrigin;
  } catch {
    return true;
  }
}

export function assertNoRemoteFontResources(
  resourceEntries: readonly ResourceTimingEntry[],
  localOrigin: string,
): void {
  const remoteFontResources = resourceEntries.filter((entry) =>
    isRemoteFontResource(entry, localOrigin),
  );
  if (remoteFontResources.length > 0) {
    throw new Error(
      `Reference capture Resource Timing reported remote fonts: ${remoteFontResources
        .map(({ name }) => name)
        .join(", ")}.`,
    );
  }
}

export function assertAllVendoredFontsLoaded(
  fontChecks: readonly { family: string; loaded: boolean }[],
): void {
  const unloadedFamilies = fontChecks
    .filter(({ loaded }) => !loaded)
    .map(({ family }) => family);
  if (unloadedFamilies.length > 0) {
    throw new Error(
      `Vendored reference fonts failed document.fonts.check(): ${unloadedFamilies.join(", ")}.`,
    );
  }
}

export function assertVendoredTextFamilies(fontFamilies: readonly string[]): void {
  const unexpectedFamilies = fontFamilies.filter(
    (fontFamily) => !/\bWhisprJakarta-(400|500|600|700|800)\b/.test(fontFamily),
  );

  if (unexpectedFamilies.length > 0) {
    throw new Error(
      `Mapped text resolved outside a vendored font family: ${unexpectedFamilies.join(", ")}.`,
    );
  }
}

function disableGoogleFontsImport(handoffHtml: string): string {
  return handoffHtml.replace(
    /<link\b[^>]*(?:fonts\.googleapis\.com|fonts\.gstatic\.com)[^>]*>\s*/gi,
    "",
  );
}

export function createReferenceHtml(fontAssets: readonly VendoredFontAsset[]): string {
  const handoffHtml = disableGoogleFontsImport(readFileSync(handoffPath, "utf8"));
  const fontCss = buildVendoredFontFaceCss(fontAssets);

  if (/fonts\.(?:googleapis|gstatic)\.com/i.test(handoffHtml)) {
    throw new Error("Reference capture did not remove the canonical Google Fonts import.");
  }

  if (!/<\/head>/i.test(handoffHtml)) {
    throw new Error("Canonical handoff must include a head element for vendored font rules.");
  }

  return handoffHtml.replace(
    /<\/head>/i,
    `<style id="whispr-vendored-fonts">${fontCss}</style></head>`,
  );
}

export type ReferenceCaptureServer = {
  close: () => Promise<void>;
  origin: string;
};

export async function startReferenceServer(
  referenceHtml: string,
  fontAssets: readonly VendoredFontAsset[],
): Promise<ReferenceCaptureServer> {
  const fontBuffers = new Map<string, Buffer>(
    fontAssets.map((font) => [font.filename, readFileSync(font.absolutePath)]),
  );
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;

    if (pathname === "/") {
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": "text/html; charset=utf-8",
      });
      response.end(referenceHtml);
      return;
    }

    const fontFilename = pathname.startsWith("/fonts/")
      ? decodeURIComponent(pathname.slice("/fonts/".length))
      : undefined;
    const fontBuffer = fontFilename ? fontBuffers.get(fontFilename) : undefined;
    if (fontBuffer) {
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": "font/ttf",
      });
      response.end(fontBuffer);
      return;
    }

    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    throw new Error("Reference capture server did not bind to a TCP port.");
  }

  return {
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
    origin: `http://127.0.0.1:${address.port}`,
  };
}

export async function verifyReferenceCaptureFonts(): Promise<ReferenceCaptureResult> {
  process.env.SOURCE_DATE_EPOCH = REFERENCE_SOURCE_DATE_EPOCH;
  const fontAssets = validateVendoredFontManifest();
  const server = await startReferenceServer(createReferenceHtml(fontAssets), fontAssets);
  const remoteFontRequests: string[] = [];
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.route("**/*", async (route) => {
      const request = route.request();
      const requestUrl = new URL(request.url());
      if (requestUrl.origin !== server.origin) {
        if (request.resourceType() === "font") {
          remoteFontRequests.push(request.url());
        }
        await route.abort();
        return;
      }

      await route.continue();
    });
    await page.goto(server.origin, { waitUntil: "networkidle" });

    const validation = await page.evaluate(async (fontSpecs) => {
      await document.fonts.ready;
      await Promise.all(
        fontSpecs.map(({ family, weight }) =>
          document.fonts.load(`${weight} 16px "${family}"`),
        ),
      );

      const textFamilies: string[] = [];
      const textNodes = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let textNode = textNodes.nextNode();
      while (textNode) {
        if (textNode.textContent?.trim() && textNode.parentElement) {
          textFamilies.push(getComputedStyle(textNode.parentElement).fontFamily);
        }
        textNode = textNodes.nextNode();
      }

      return {
        fontChecks: fontSpecs.map(({ family, weight }) => ({
          family,
          loaded: document.fonts.check(`${weight} 16px "${family}"`),
        })),
        resourceEntries: performance
          .getEntriesByType("resource")
          .map((entry) => {
            const resourceEntry = entry as PerformanceResourceTiming;
            return {
              initiatorType: resourceEntry.initiatorType,
              name: resourceEntry.name,
            };
          }),
        textFamilies,
      };
    }, REFERENCE_FONT_SPECS);

    if (remoteFontRequests.length > 0) {
      throw new Error(
        `Reference capture blocked remote font requests: ${remoteFontRequests.join(", ")}.`,
      );
    }

    assertAllVendoredFontsLoaded(validation.fontChecks);
    assertNoRemoteFontResources(validation.resourceEntries, server.origin);

    assertVendoredTextFamilies(validation.textFamilies);
    await context.close();

    return {
      fontFamilies: validation.textFamilies,
      sourceDateEpoch: REFERENCE_SOURCE_DATE_EPOCH,
    };
  } finally {
    await browser.close();
    await server.close();
  }
}

const invokedAsScript =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedAsScript) {
  verifyReferenceCaptureFonts()
    .then(({ fontFamilies, sourceDateEpoch }) => {
      console.log(
        JSON.stringify({
          fontFamiliesVerified: fontFamilies.length,
          sourceDateEpoch,
        }),
      );
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
