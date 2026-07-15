import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { chromium } from "@playwright/test";

import {
  REFERENCE_FONT_SPECS,
  REFERENCE_SOURCE_DATE_EPOCH,
  createReferenceHtml,
  getReferenceRendererViewportHeight,
  startReferenceServer,
  validateVendoredFontManifest,
} from "./mobile-redesign-reference";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(scriptDirectory, "..");
const repositoryRoot = path.resolve(mobileRoot, "..", "..");
const handoffPath = path.join(
  repositoryRoot,
  "design_handoff_whispr_mobile",
  "Whispr Mobile Redesign.dc.html",
);

export const REFERENCE_DEVICE_SCALE_FACTOR = 3;
export const REFERENCE_LOGICAL_VIEWPORT = { height: 844, width: 390 } as const;
export const REFERENCE_PHYSICAL_VIEWPORT = {
  height: REFERENCE_LOGICAL_VIEWPORT.height * REFERENCE_DEVICE_SCALE_FACTOR,
  width: REFERENCE_LOGICAL_VIEWPORT.width * REFERENCE_DEVICE_SCALE_FACTOR,
} as const;

const referenceAnchors = [
  { anchor: "1a", testId: "mobile-overview-screen", theme: "light" },
  { anchor: "1b", testId: "mobile-channel-chat-screen", theme: "light" },
  { anchor: "1c", testId: "mobile-dm-inbox-screen", theme: "light" },
  { anchor: "1d", testId: "mobile-notifications-screen", theme: "light" },
  { anchor: "1e", testId: "mobile-voice-room-screen", theme: "light" },
  { anchor: "1f", testId: "mobile-settings-screen", theme: "light" },
  { anchor: "1g", testId: "mobile-server-switcher-sheet-panel", theme: "light" },
  { anchor: "1h", testId: null, theme: "light" },
  { anchor: "1i", testId: "mobile-overview-screen", theme: "dark" },
  { anchor: "1j", testId: "mobile-channel-chat-screen", theme: "dark" },
] as const;

type ReferenceAnchor = (typeof referenceAnchors)[number];

type LogicalBounds = {
  height: number;
  width: number;
  x: number;
  y: number;
};

type ComputedStyleNode = {
  border: {
    color: string;
    radius: readonly [string, string, string, string];
    style: readonly [string, string, string, string];
    width: readonly [number, number, number, number];
  };
  fill: string;
  font: {
    hash: string | null;
    letterSpacing: number;
    lineHeight: number | null;
    size: number;
    weight: string;
  };
  iconPath: string | null;
  logicalBounds: LogicalBounds;
  selector: string;
  shadow: string;
  spacing: {
    gap: number;
    margin: readonly [number, number, number, number];
    padding: readonly [number, number, number, number];
  };
  testId: string | null;
};

type NavigationMetrics = {
  miniVoiceBarToTabBarGap: number;
  tabBarHeight: number;
  tabLabel: {
    fontSize: number;
    lineHeight: number;
  };
};

type AnchorManifest = {
  anchor: string;
  frame: {
    logicalBounds: LogicalBounds;
    physicalBounds: { height: number; width: number };
    screenshotByteLength: number;
    selector: string;
  };
  navigation: NavigationMetrics | null;
  nodes: readonly ComputedStyleNode[];
  selectorToTestId: Readonly<Record<string, string | null>>;
  theme: "dark" | "light";
};

export type CanonicalReferenceManifest = {
  anchors: readonly AnchorManifest[];
  deviceScaleFactor: typeof REFERENCE_DEVICE_SCALE_FACTOR;
  logicalViewport: typeof REFERENCE_LOGICAL_VIEWPORT;
  physicalViewport: typeof REFERENCE_PHYSICAL_VIEWPORT;
  sourceDateEpoch: typeof REFERENCE_SOURCE_DATE_EPOCH;
  sourceHash: string;
  transformHash: string;
  version: 1;
};

type ExtractOptions = {
  readonly outputDirectory?: string;
};

const frameTransform = {
  border: "0",
  borderRadius: "0",
  boxShadow: "none",
} as const;

export function getReferenceFrameSelector(anchor: string): string {
  const escapedAnchor = anchor.replace(/^([0-9])/, (_, digit: string) => `\\3${digit} `);
  return `#${escapedAnchor} > div[style*="width:390px"][style*="height:844px"]`;
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function readPngDimensions(image: Buffer): { height: number; width: number } {
  const pngSignature = "89504e470d0a1a0a";
  if (image.subarray(0, 8).toString("hex") !== pngSignature) {
    throw new Error("Reference frame capture did not produce a PNG.");
  }

  return { height: image.readUInt32BE(20), width: image.readUInt32BE(16) };
}

export function assertReferenceFrameGeometry(input: {
  readonly afterTransform: { height: number; width: number };
  readonly anchor: string;
  readonly beforeTransform: { height: number; width: number };
  readonly selectorCount: number;
}): void {
  if (input.selectorCount !== 1) {
    throw new Error(
      `Canonical frame selector must match exactly once for ${input.anchor}; received ${input.selectorCount}.`,
    );
  }
  if (
    input.beforeTransform.width !== REFERENCE_LOGICAL_VIEWPORT.width + 2 ||
    input.beforeTransform.height !== REFERENCE_LOGICAL_VIEWPORT.height + 2
  ) {
    throw new Error(
      `Canonical frame border box must be 392x846 for ${input.anchor}; received ${input.beforeTransform.width}x${input.beforeTransform.height}.`,
    );
  }
  if (
    input.afterTransform.width !== REFERENCE_LOGICAL_VIEWPORT.width ||
    input.afterTransform.height !== REFERENCE_LOGICAL_VIEWPORT.height
  ) {
    throw new Error(
      `Canonical frame content box must be 390x844 for ${input.anchor}; received ${input.afterTransform.width}x${input.afterTransform.height}.`,
    );
  }
}

function parseOutputDirectory(): string | undefined {
  const outputIndex = process.argv.indexOf("--output");
  if (outputIndex === -1) {
    return undefined;
  }
  const outputDirectory = process.argv[outputIndex + 1];
  if (!outputDirectory) {
    throw new Error("Use --output <directory> to write reference captures.");
  }
  return path.resolve(outputDirectory);
}

export async function extractCanonicalReferenceManifest(
  options: ExtractOptions = {},
): Promise<CanonicalReferenceManifest> {
  process.env.SOURCE_DATE_EPOCH = REFERENCE_SOURCE_DATE_EPOCH;
  const source = readFileSync(handoffPath);
  const fontAssets = validateVendoredFontManifest();
  const fontHashes = Object.fromEntries(fontAssets.map(({ family, sha256: hash }) => [family, hash]));
  const server = await startReferenceServer(createReferenceHtml(fontAssets), fontAssets);
  const browser = await chromium.launch({ headless: true });
  const capturedImages = new Map<string, Buffer>();

  try {
    const context = await browser.newContext({
      deviceScaleFactor: REFERENCE_DEVICE_SCALE_FACTOR,
      // Render at the capture frame's height first, then expand to the canonical document.
      // This keeps every frame on one unscrolled compositor surface without a fixed ceiling.
      viewport: { height: REFERENCE_LOGICAL_VIEWPORT.height, width: 500 },
    });
    const page = await context.newPage();
    await page.route("**/*", async (route) => {
      const requestUrl = new URL(route.request().url());
      if (requestUrl.origin !== server.origin) {
        await route.abort();
        return;
      }
      await route.continue();
    });
    await page.goto(server.origin, { waitUntil: "networkidle" });
    await page.evaluate("globalThis.__name = function(value) { return value; };");
    await page.evaluate(async (fontSpecs) => {
      await document.fonts.ready;
      await Promise.all(
        fontSpecs.map(({ family, weight }) => document.fonts.load(`${weight} 16px "${family}"`)),
      );
    }, REFERENCE_FONT_SPECS);
    await page.setViewportSize({
      height: getReferenceRendererViewportHeight(
        await page.evaluate(() => ({
          bodyScrollHeight: document.body.scrollHeight,
          documentElementScrollHeight: document.documentElement.scrollHeight,
        })),
      ),
      width: 500,
    });

    const anchors: AnchorManifest[] = [];
    for (const definition of referenceAnchors) {
      const selector = getReferenceFrameSelector(definition.anchor);
      const frame = page.locator(selector);
      const selectorCount = await frame.count();
      const frameHandle = selectorCount === 1 ? await frame.elementHandle() : null;
      if (selectorCount === 1 && !frameHandle) {
        throw new Error(`Canonical frame detached before capture for ${definition.anchor}.`);
      }
      const beforeTransform =
        frameHandle
          ? await frameHandle.evaluate((element) => {
              const rect = element.getBoundingClientRect();
              return { height: rect.height, width: rect.width };
            })
          : { height: 0, width: 0 };

      if (frameHandle) {
        await frameHandle.evaluate((element, transform) => {
          const htmlElement = element as HTMLElement;
          htmlElement.style.setProperty("border", transform.border);
          htmlElement.style.setProperty("border-radius", transform.borderRadius);
          htmlElement.style.setProperty("box-shadow", transform.boxShadow);
        }, frameTransform);
      }

      const afterTransform =
        frameHandle
          ? await frameHandle.evaluate((element) => {
              const rect = element.getBoundingClientRect();
              return { height: rect.height, width: rect.width };
            })
          : { height: 0, width: 0 };
      assertReferenceFrameGeometry({
        afterTransform,
        anchor: definition.anchor,
        beforeTransform,
        selectorCount,
      });

      if (!frameHandle) {
        throw new Error(`Canonical frame is missing for ${definition.anchor}.`);
      }
      const captureBounds = await frameHandle.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { height: rect.height, width: rect.width, x: rect.x, y: rect.y };
      });
      const image = await page.screenshot({ clip: captureBounds, scale: "device" });
      const physicalBounds = readPngDimensions(image);
      if (
        physicalBounds.width !== REFERENCE_PHYSICAL_VIEWPORT.width ||
        physicalBounds.height !== REFERENCE_PHYSICAL_VIEWPORT.height
      ) {
        throw new Error(
          `Canonical element capture must be 1170x2532 for ${definition.anchor}; received ${physicalBounds.width}x${physicalBounds.height}.`,
        );
      }
      capturedImages.set(definition.anchor, image);

      const extracted = await frameHandle.evaluate(
        (element, input) => {
          const root = element as HTMLElement;
          const rootRect = root.getBoundingClientRect();

          const toNumber = (value: string): number => {
            const parsed = Number.parseFloat(value);
            return Number.isFinite(parsed) ? parsed : 0;
          };
          const boundsFor = (target: Element) => {
            const rect = target.getBoundingClientRect();
            return {
              height: rect.height,
              width: rect.width,
              x: rect.left - rootRect.left,
              y: rect.top - rootRect.top,
            };
          };
          const selectorFor = (target: Element): string => {
            if (target === root) {
              return input.frameSelector;
            }
            const parts: string[] = [];
            let current: Element | null = target;
            while (current && current !== root) {
              const parent: Element | null = current.parentElement;
              if (!parent) {
                break;
              }
              const siblings: Element[] = Array.from(parent.children).filter(
                (sibling) => sibling.tagName === current?.tagName,
              );
              const position = siblings.indexOf(current) + 1;
              parts.unshift(`${current.tagName.toLowerCase()}:nth-of-type(${position})`);
              current = parent;
            }
            return `${input.frameSelector} > ${parts.join(" > ")}`;
          };
          const usedLineHeight = (target: Element, style: CSSStyleDeclaration): number | null => {
            if (!target.textContent?.trim()) {
              return null;
            }
            const declared = Number.parseFloat(style.lineHeight);
            if (Number.isFinite(declared)) {
              return declared;
            }
            const range = document.createRange();
            range.selectNodeContents(target);
            const heights = Array.from(range.getClientRects())
              .map((rect) => rect.height)
              .filter((height) => height > 0);
            return heights.length > 0 ? Math.max(...heights) : null;
          };
          const iconPathFor = (target: Element): string | null => {
            const svg = target instanceof SVGElement ? target : target.querySelector(":scope > svg");
            if (!svg) {
              return null;
            }
            const pathData = Array.from(svg.querySelectorAll("path"))
              .map((path) => path.getAttribute("d"))
              .filter((value): value is string => Boolean(value));
            return pathData.length > 0 ? pathData.join(" ") : null;
          };

          const nodes = [root, ...Array.from(root.querySelectorAll("*"))].map((target) => {
            const style = getComputedStyle(target);
            const family = Object.keys(input.fontHashes).find((candidate) =>
              style.fontFamily.includes(candidate),
            );
            return {
              border: {
                color: style.borderTopColor,
                radius: [
                  style.borderTopLeftRadius,
                  style.borderTopRightRadius,
                  style.borderBottomRightRadius,
                  style.borderBottomLeftRadius,
                ] as [string, string, string, string],
                style: [
                  style.borderTopStyle,
                  style.borderRightStyle,
                  style.borderBottomStyle,
                  style.borderLeftStyle,
                ] as [string, string, string, string],
                width: [
                  toNumber(style.borderTopWidth),
                  toNumber(style.borderRightWidth),
                  toNumber(style.borderBottomWidth),
                  toNumber(style.borderLeftWidth),
                ] as [number, number, number, number],
              },
              fill: style.backgroundColor,
              font: {
                hash: family ? (input.fontHashes[family] ?? null) : null,
                letterSpacing: toNumber(style.letterSpacing),
                lineHeight: usedLineHeight(target, style),
                size: toNumber(style.fontSize),
                weight: style.fontWeight,
              },
              iconPath: iconPathFor(target),
              logicalBounds: boundsFor(target),
              selector: selectorFor(target),
              shadow: style.boxShadow,
              spacing: {
                gap: toNumber(style.gap),
                margin: [
                  toNumber(style.marginTop),
                  toNumber(style.marginRight),
                  toNumber(style.marginBottom),
                  toNumber(style.marginLeft),
                ] as [number, number, number, number],
                padding: [
                  toNumber(style.paddingTop),
                  toNumber(style.paddingRight),
                  toNumber(style.paddingBottom),
                  toNumber(style.paddingLeft),
                ] as [number, number, number, number],
              },
              testId: target === root ? input.testId : null,
            };
          });

          const miniVoiceBar = root.querySelector('div[style*="bottom:104px"]');
          const tabBar = root.querySelector(
            'div[style*="bottom:18px"][style*="border-radius:26px"]',
          );
          const tabLabel = tabBar?.querySelector(":scope > div > span");
          const miniBounds = miniVoiceBar ? boundsFor(miniVoiceBar) : null;
          const tabBounds = tabBar ? boundsFor(tabBar) : null;
          const tabLabelStyle = tabLabel ? getComputedStyle(tabLabel) : null;
          const tabLabelLineHeight = tabLabel && tabLabelStyle ? usedLineHeight(tabLabel, tabLabelStyle) : null;
          const navigation =
            miniBounds && tabBounds && tabLabelStyle && tabLabelLineHeight !== null
              ? {
                  miniVoiceBarToTabBarGap: tabBounds.y - (miniBounds.y + miniBounds.height),
                  tabBarHeight: tabBounds.height,
                  tabLabel: {
                    fontSize: toNumber(tabLabelStyle.fontSize),
                    lineHeight: tabLabelLineHeight,
                  },
                }
              : null;

          return {
            frame: { logicalBounds: boundsFor(root) },
            navigation,
            nodes,
          };
        },
        {
          fontHashes,
          frameSelector: selector,
          testId: definition.testId,
        },
      );

      anchors.push({
        anchor: definition.anchor,
        frame: {
          ...extracted.frame,
          physicalBounds,
          screenshotByteLength: image.byteLength,
          selector,
        },
        navigation: extracted.navigation,
        nodes: extracted.nodes,
        selectorToTestId: { [selector]: definition.testId },
        theme: definition.theme,
      });
    }

    await context.close();
    const manifest: CanonicalReferenceManifest = {
      anchors,
      deviceScaleFactor: REFERENCE_DEVICE_SCALE_FACTOR,
      logicalViewport: REFERENCE_LOGICAL_VIEWPORT,
      physicalViewport: REFERENCE_PHYSICAL_VIEWPORT,
      sourceDateEpoch: REFERENCE_SOURCE_DATE_EPOCH,
      sourceHash: sha256(source),
      transformHash: sha256(JSON.stringify(frameTransform)),
      version: 1,
    };

    if (options.outputDirectory) {
      await mkdir(options.outputDirectory, { recursive: true });
      await Promise.all(
        anchors.map(async ({ anchor }) => {
          const image = capturedImages.get(anchor);
          if (!image) {
            throw new Error(`Reference capture image missing for ${anchor}.`);
          }
          await writeFile(path.join(options.outputDirectory ?? "", `${anchor}.png`), image);
        }),
      );
      await writeFile(
        path.join(options.outputDirectory, "computed-style-manifest.json"),
        `${JSON.stringify(manifest, null, 2)}\n`,
      );
    }

    return manifest;
  } finally {
    await browser.close();
    await server.close();
  }
}

const invokedAsScript =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedAsScript) {
  const outputDirectory = parseOutputDirectory();
  extractCanonicalReferenceManifest(outputDirectory ? { outputDirectory } : {})
    .then((manifest) => {
      console.log(
        JSON.stringify({
          anchors: manifest.anchors.length,
          sourceHash: manifest.sourceHash,
          transformHash: manifest.transformHash,
        }),
      );
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
