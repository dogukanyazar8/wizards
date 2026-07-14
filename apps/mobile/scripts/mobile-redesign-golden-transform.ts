import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { chromium } from "@playwright/test";

import {
  REFERENCE_FONT_SPECS,
  REFERENCE_SOURCE_DATE_EPOCH,
  createReferenceHtml,
  startReferenceServer,
  validateVendoredFontManifest,
} from "./mobile-redesign-reference";
import {
  REFERENCE_DEVICE_SCALE_FACTOR,
  REFERENCE_LOGICAL_VIEWPORT,
  REFERENCE_PHYSICAL_VIEWPORT,
  assertReferenceFrameGeometry,
  getReferenceFrameSelector,
} from "./mobile-redesign-extract";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(scriptDirectory, "..");
const repositoryRoot = path.resolve(mobileRoot, "..", "..");
const handoffPath = path.join(
  repositoryRoot,
  "design_handoff_whispr_mobile",
  "Whispr Mobile Redesign.dc.html",
);
const defaultOutputDirectory = path.join(
  mobileRoot,
  "visual-baselines",
  "whispr-mobile-redesign",
  "v1",
);

const referenceAnchors = [
  { anchor: "1a", theme: "light" },
  { anchor: "1b", theme: "light" },
  { anchor: "1c", theme: "light" },
  { anchor: "1d", theme: "light" },
  { anchor: "1e", theme: "light" },
  { anchor: "1f", theme: "light" },
  { anchor: "1g", theme: "light" },
  { anchor: "1h", theme: "light" },
  { anchor: "1i", theme: "dark" },
  { anchor: "1j", theme: "dark" },
] as const;

const RAW_COLOR_PATTERN = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi;

// This is the finite inline-color vocabulary of the canonical handoff frames.
// Adding a new handoff color without classifying it is intentionally a hard failure.
const auditedRawColors = new Set([
  "#131529", "#1b8a55", "#1c1f3a", "#1e2235", "#22a366", "#22c55e", "#232644",
  "#23264400", "#2a2d55", "#2b2f52", "#2b7ac7", "#34d399", "#3a2e1b", "#3b3f73",
  "#3f38c9", "#4f46e5", "#6b7194", "#6d66f0", "#6e7398", "#8a46c7", "#8a46e5",
  "#8a90b0", "#9aa0bc", "#9ba1c7", "#a5a8f5", "#b7bcd6", "#c6cade", "#c77a2b",
  "#c7c9fa", "#dde0ee", "#dde0f5", "#dfe2fc", "#e05252", "#e0f0fa", "#e4e6f2",
  "#e7e9f4", "#e8b36a", "#e8f8ee", "#ebedf7", "#eceefa", "#eeddf5", "#eef0fe",
  "#f0f1f8", "#f3e8fa", "#f3f4fc", "#f6f7fb", "#fce9e9", "#fdebd7", "#fff",
  "#fff3d6", "#ffffff", "rgba(0,0,0,.35)", "rgba(109,102,240,.4)",
  "rgba(224,82,82,.4)", "rgba(255,255,255,.04)", "rgba(255,255,255,.05)",
  "rgba(255,255,255,.1)", "rgba(255,255,255,.12)", "rgba(255,255,255,.15)",
  "rgba(30,34,53,.04)", "rgba(30,34,53,.08)", "rgba(30,34,53,.2)",
  "rgba(30,34,53,.25)", "rgba(52,211,153,.12)", "rgba(52,211,153,.15)",
  "rgba(52,211,153,.2)", "rgba(79,70,229,.35)",
]);

type Theme = "dark" | "light";
type ColorKind =
  | "active-tab-control"
  | "avatar-initial"
  | "border"
  | "elevation"
  | "icon"
  | "primary-control"
  | "surface"
  | "text";

export type AuditedColorMapping = {
  color: string;
  context: string;
  kind: ColorKind;
  role: string;
  theme: Theme;
};

type NormalizedColor = AuditedColorMapping & { color: string };

export type NormalizedGoldenManifest = {
  anchors: readonly {
    anchor: string;
    physicalBounds: { height: number; width: number };
    theme: Theme;
  }[];
  deviceScaleFactor: typeof REFERENCE_DEVICE_SCALE_FACTOR;
  exclusions: {
    deviceFrame: "removed";
    statusBar: "hidden";
    successSpreadRing: "removed";
  };
  logicalViewport: typeof REFERENCE_LOGICAL_VIEWPORT;
  physicalViewport: typeof REFERENCE_PHYSICAL_VIEWPORT;
  sourceDateEpoch: typeof REFERENCE_SOURCE_DATE_EPOCH;
  sourceHash: string;
  substitutions: readonly {
    from: string;
    role: string;
    theme: Theme;
    to: string;
  }[];
  transformHash: string;
  version: 1;
};

function normalizeToken(value: string): string {
  const compact = value.toLowerCase().replace(/\s+/g, "");
  const rgb = compact.match(/^rgb\((\d+),(\d+),(\d+)\)$/);
  const canonical = rgb
    ? `#${rgb.slice(1).map((channel) => Number(channel).toString(16).padStart(2, "0")).join("")}`
    : compact;
  return canonical.replace(/,0\./g, ",.");
}

function displayColor(value: string): string {
  const normalized = normalizeToken(value);
  if (normalized === "#fff") {
    return "#FFFFFF";
  }
  return normalized.startsWith("#") ? normalized.toUpperCase() : normalized;
}

function isLightSurface(context: string): boolean {
  return ["#ffffff", "#f6f7fb", "#e8f8ee", "#fce9e9"].includes(normalizeToken(context));
}

export function assertExactlyOneAuditedMapping<T>(mappings: readonly T[]): asserts mappings is readonly [T] {
  if (mappings.length !== 1) {
    throw new Error(
      `Each inline color requires exactly one audited semantic-role mapping; received ${mappings.length}.`,
    );
  }
}

function parseHex(color: string): [number, number, number] {
  const normalized = displayColor(color);
  if (!/^#[0-9A-F]{6}$/.test(normalized)) {
    throw new Error(`Contrast requires an opaque hexadecimal color; received ${color}.`);
  }
  return [
    Number.parseInt(normalized.slice(1, 3), 16),
    Number.parseInt(normalized.slice(3, 5), 16),
    Number.parseInt(normalized.slice(5, 7), 16),
  ];
}

function luminance(color: string): number {
  const [red, green, blue] = parseHex(color).map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

export function assertMinimumContrast(input: {
  background: string;
  foreground: string;
  minimumRatio: number;
}): void {
  const foreground = luminance(input.foreground);
  const background = luminance(input.background);
  const ratio = (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  if (ratio < input.minimumRatio) {
    throw new Error(
      `Normalized role/context contrast ${ratio.toFixed(2)}:1 is below ${input.minimumRatio}:1 for ${input.foreground} on ${input.background}.`,
    );
  }
}

export function normalizeAccessibleColor(input: {
  color: string;
  context: string;
  kind: ColorKind;
  theme: Theme;
}): NormalizedColor {
  const raw = normalizeToken(input.color);
  if (!auditedRawColors.has(raw)) {
    throw new Error(`Inline color ${input.color} has no audited semantic-role mapping.`);
  }

  const mappings: NormalizedColor[] = [];
  const unchanged = (role: string): void => {
    mappings.push({ ...input, color: displayColor(input.color), role });
  };

  if (input.kind === "active-tab-control" && raw === "#4f46e5") {
    unchanged("accent.default.activeTab");
  } else if (input.kind === "avatar-initial") {
    const avatarInitials: Record<string, string> = {
      "#4f46e5": "#4F46E5",
      "#8a46c7": "#8A46C7",
      "#8a46e5": "#8A46C7",
      "#1b8a55": "#187A4C",
    };
    const normalized = avatarInitials[raw];
    if (normalized) {
      mappings.push({ ...input, color: normalized, role: "avatar.initial" });
    } else {
      unchanged("avatar.decorative");
    }
  } else if (input.kind === "text" && input.theme === "light" && isLightSurface(input.context)) {
    const substitutions: Record<string, { color: string; role: string }> = {
      "#1b8a55": { color: "#187A4C", role: "text.success" },
      "#22a366": { color: "#187A4C", role: "text.success" },
      "#6b7194": { color: "#62688B", role: "text.secondary" },
      "#8a90b0": { color: "#676D90", role: "text.muted" },
      "#9aa0bc": { color: "#676D90", role: "text.muted" },
      "#e05252": { color: "#C94343", role: "text.danger" },
    };
    const substitution = substitutions[raw];
    if (substitution) {
      mappings.push({ ...input, ...substitution });
    } else {
      unchanged("text.canonical");
    }
  } else if (input.kind === "text" && input.theme === "dark" && raw === "#6e7398") {
    mappings.push({ ...input, color: "#8288AD", role: "text.muted" });
  } else if (input.kind === "primary-control" && input.theme === "dark" && raw === "#6d66f0") {
    mappings.push({ ...input, color: "#6B63EC", role: "accent.action" });
  } else {
    const roleByKind: Record<Exclude<ColorKind, "active-tab-control" | "avatar-initial" | "primary-control" | "text">, string> = {
      border: "border.decorative",
      elevation: "elevation.audited",
      icon: "icon.nonText",
      surface: "surface.semantic",
    };
    unchanged(roleByKind[input.kind as keyof typeof roleByKind] ?? "text.canonical");
  }

  assertExactlyOneAuditedMapping(mappings);
  const mapping = mappings[0];
  if (!mapping) {
    throw new Error("Audited semantic-role mapping unexpectedly resolved to no result.");
  }
  return mapping;
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function readPngDimensions(image: Buffer): { height: number; width: number } {
  if (image.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error("Normalized golden capture did not produce a PNG.");
  }
  return { height: image.readUInt32BE(20), width: image.readUInt32BE(16) };
}

function parseOutputDirectory(): string {
  const outputIndex = process.argv.indexOf("--output");
  if (outputIndex === -1) {
    return defaultOutputDirectory;
  }
  const outputDirectory = process.argv[outputIndex + 1];
  if (!outputDirectory) {
    throw new Error("Use --output <directory> to write normalized golden captures.");
  }
  return path.resolve(outputDirectory);
}

export async function generateNormalizedGoldens(options: {
  outputDirectory?: string;
} = {}): Promise<NormalizedGoldenManifest> {
  process.env.SOURCE_DATE_EPOCH = REFERENCE_SOURCE_DATE_EPOCH;
  const source = readFileSync(handoffPath);
  const fontAssets = validateVendoredFontManifest();
  const server = await startReferenceServer(createReferenceHtml(fontAssets), fontAssets);
  const browser = await chromium.launch({ headless: true });
  const substitutions = new Map<string, { from: string; role: string; theme: Theme; to: string }>();
  const targetDirectory = options.outputDirectory ?? defaultOutputDirectory;

  try {
    const context = await browser.newContext({
      deviceScaleFactor: REFERENCE_DEVICE_SCALE_FACTOR,
      viewport: { height: 10_000, width: 500 },
    });
    const page = await context.newPage();
    await page.route("**/*", async (route) => {
      if (new URL(route.request().url()).origin !== server.origin) {
        await route.abort();
        return;
      }
      await route.continue();
    });
    await page.goto(server.origin, { waitUntil: "networkidle" });
    await page.evaluate("globalThis.__name = function(value) { return value; };");
    await page.evaluate(async (fontSpecs) => {
      await document.fonts.ready;
      await Promise.all(fontSpecs.map(({ family, weight }) => document.fonts.load(`${weight} 16px \"${family}\"`)));
    }, REFERENCE_FONT_SPECS);

    const captured = await Promise.all(referenceAnchors.map(async (definition) => {
      const selector = getReferenceFrameSelector(definition.anchor);
      const frame = page.locator(selector);
      const selectorCount = await frame.count();
      const handle = selectorCount === 1 ? await frame.elementHandle() : null;
      if (!handle) {
        throw new Error(`Canonical frame is missing for ${definition.anchor}.`);
      }
      const beforeTransform = await handle.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { height: rect.height, width: rect.width };
      });

      const audit = await handle.evaluate((element, input) => {
        type Mapping = { from: string; role: string; theme: Theme; to: string };
        const root = element as HTMLElement;
        const rawPattern = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi;
        const { anchor, auditedColors, theme } = input;
        const audited = new Set(auditedColors);
        const normalize = (value: string): string => {
          const compact = value.toLowerCase().replace(/\s+/g, "");
          const rgb = compact.match(/^rgb\((\d+),(\d+),(\d+)\)$/);
          const canonical = rgb ? `#${rgb.slice(1).map((channel) => Number(channel).toString(16).padStart(2, "0")).join("")}` : compact;
          return canonical.replace(/,0\./g, ",.");
        };
        const display = (value: string): string => normalize(value) === "#fff" ? "#FFFFFF" : normalize(value).startsWith("#") ? normalize(value).toUpperCase() : normalize(value);
        const rgbToHex = (value: string): string | null => {
          const match = value.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/i);
          if (!match || (match[4] !== undefined && Number(match[4]) < 1)) return null;
          return `#${[match[1], match[2], match[3]].map((channel) => Number(channel).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
        };
        const surfaceFor = (target: Element): string => {
          let current: Element | null = target;
          while (current && current !== root.parentElement) {
            const background = rgbToHex(getComputedStyle(current).backgroundColor);
            if (background) return background;
            current = current.parentElement;
          }
          return theme === "light" ? "#F6F7FB" : "#131529";
        };
        const hasWhiteNormalText = (target: Element): boolean => Array.from(target.querySelectorAll("*")).some((child) => {
          if (!child.textContent?.trim()) return false;
          const style = getComputedStyle(child);
          return rgbToHex(style.color) === "#FFFFFF" && Number.parseFloat(style.fontSize) < 18;
        });
        const isAvatarInitial = (target: Element, color: string): boolean => {
          const text = target.textContent?.trim() ?? "";
          return text.length > 0 && text.length <= 2 && ["#4f46e5", "#8a46c7", "#8a46e5", "#1b8a55"].includes(normalize(color));
        };
        const resolve = (color: string, kind: ColorKind, target: Element): Mapping => {
          const raw = normalize(color);
          if (!audited.has(raw)) throw new Error(`Inline color ${color} has no audited semantic-role mapping.`);
          const context = surfaceFor(target);
          const candidates: Mapping[] = [];
          const unchanged = (role: string) => candidates.push({ from: display(color), role, theme, to: display(color) });
          if (kind === "active-tab-control" && raw === "#4f46e5") unchanged("accent.default.activeTab");
          else if (kind === "avatar-initial") {
            const values: Record<string, string> = { "#4f46e5": "#4F46E5", "#8a46c7": "#8A46C7", "#8a46e5": "#8A46C7", "#1b8a55": "#187A4C" };
            candidates.push({ from: display(color), role: "avatar.initial", theme, to: values[raw] ?? display(color) });
          } else if (kind === "text" && theme === "light" && ["#FFFFFF", "#F6F7FB", "#E8F8EE", "#FCE9E9"].includes(context)) {
            const values: Record<string, [string, string]> = { "#1b8a55": ["#187A4C", "text.success"], "#22a366": ["#187A4C", "text.success"], "#6b7194": ["#62688B", "text.secondary"], "#8a90b0": ["#676D90", "text.muted"], "#9aa0bc": ["#676D90", "text.muted"], "#e05252": ["#C94343", "text.danger"] };
            const value = values[raw];
            value ? candidates.push({ from: display(color), role: value[1], theme, to: value[0] }) : unchanged("text.canonical");
          } else if (kind === "text" && theme === "dark" && raw === "#6e7398") candidates.push({ from: display(color), role: "text.muted", theme, to: "#8288AD" });
          else if (kind === "primary-control" && theme === "dark" && raw === "#6d66f0") candidates.push({ from: display(color), role: "accent.action", theme, to: "#6B63EC" });
          else unchanged(kind === "icon" ? "icon.nonText" : kind === "border" ? "border.decorative" : kind === "elevation" ? "elevation.audited" : kind === "surface" ? "surface.semantic" : "text.canonical");
          if (candidates.length !== 1) throw new Error(`Inline color ${color} requires exactly one audited semantic-role mapping; received ${candidates.length}.`);
          const mapping = candidates[0];
          if (!mapping) throw new Error("Audited semantic-role mapping unexpectedly resolved to no result.");
          return mapping;
        };
        const mappings: Mapping[] = [];
        const record = (mapping: Mapping) => { mappings.push(mapping); return mapping.to; };
        const replace = (value: string, kind: ColorKind, target: Element) => value.replace(rawPattern, (color) => record(resolve(color, kind, target)));

        root.style.setProperty("border", "0");
        root.style.setProperty("border-radius", "0");
        root.style.setProperty("box-shadow", "none");
        const statusBar = root.firstElementChild as HTMLElement | null;
        if (!statusBar) throw new Error("Canonical frame must include a drawn status bar to exclude.");
        statusBar.style.setProperty("visibility", "hidden");
        const successRings = Array.from(root.querySelectorAll<HTMLElement>("[style*='rgba(52,211,153,.2)']"));
        const expectedSuccessRings = anchor === "1e" ? 1 : 0;
        if (successRings.length !== expectedSuccessRings) {
          throw new Error(`Expected ${expectedSuccessRings} CSS-only success spread rings for ${anchor}; received ${successRings.length}.`);
        }
        for (const ring of successRings) ring.style.setProperty("box-shadow", "none");

        for (const target of [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))]) {
          if (target.closest("[style*='visibility: hidden']")) continue;
          for (const property of Array.from(target.style)) {
            const value = target.style.getPropertyValue(property);
            if (!rawPattern.test(value)) continue;
            rawPattern.lastIndex = 0;
            const raw = normalize(value.match(rawPattern)?.[0] ?? "");
            rawPattern.lastIndex = 0;
            const kind: ColorKind = property === "color"
              ? (raw === "#4f46e5" && target.style.background.includes("#EEF0FE") ? "active-tab-control" : isAvatarInitial(target, raw) ? "avatar-initial" : "text")
              : property === "background" || property === "background-color"
                ? (raw === "#6d66f0" && hasWhiteNormalText(target) ? "primary-control" : "surface")
                : property.startsWith("border") ? "border"
                  : property === "box-shadow" ? "elevation" : "surface";
            target.style.setProperty(property, replace(value, kind, target));
          }
          for (const attribute of ["fill", "stroke"]) {
            const value = target.getAttribute(attribute);
            if (value && rawPattern.test(value)) {
              rawPattern.lastIndex = 0;
              target.setAttribute(attribute, replace(value, "icon", target));
            }
            rawPattern.lastIndex = 0;
          }
        }

        const hex = (value: string): [number, number, number] | null => {
          const normalized = rgbToHex(value);
          if (!normalized) return null;
          return [Number.parseInt(normalized.slice(1, 3), 16), Number.parseInt(normalized.slice(3, 5), 16), Number.parseInt(normalized.slice(5, 7), 16)];
        };
        const contrast = (foreground: string, background: string): number | null => {
          const toLum = (value: string) => {
            const channels = hex(value);
            if (!channels) return null;
            const [red, green, blue] = channels.map((channel) => { const c = channel / 255; return c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; }) as [number, number, number];
            return red * .2126 + green * .7152 + blue * .0722;
          };
          const a = toLum(foreground); const b = toLum(background);
          return a === null || b === null ? null : (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
        };
        for (const target of [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))]) {
          if (target.closest("[style*='visibility: hidden']") || !Array.from(target.childNodes).some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())) continue;
          const ratio = contrast(getComputedStyle(target).color, surfaceFor(target));
          if (ratio !== null) {
            const style = getComputedStyle(target);
            const minimum = Number.parseFloat(style.fontSize) >= 18 && Number.parseInt(style.fontWeight, 10) >= 700 ? 3 : 4.5;
            if (ratio < minimum) throw new Error(`Normalized role/context contrast ${ratio.toFixed(2)}:1 is below ${minimum}:1 for ${target.textContent?.trim()}.`);
          }
        }
        return mappings;
      }, { anchor: definition.anchor, auditedColors: [...auditedRawColors], theme: definition.theme });

      const afterTransform = await handle.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { height: rect.height, width: rect.width };
      });
      assertReferenceFrameGeometry({ afterTransform, anchor: definition.anchor, beforeTransform, selectorCount });
      const captureBounds = await handle.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { height: rect.height, width: rect.width, x: rect.x, y: rect.y };
      });
      const image = await page.screenshot({ clip: captureBounds, scale: "device" });
      const physicalBounds = readPngDimensions(image);
      if (physicalBounds.width !== REFERENCE_PHYSICAL_VIEWPORT.width || physicalBounds.height !== REFERENCE_PHYSICAL_VIEWPORT.height) {
        throw new Error(`Normalized golden must be 1170x2532 for ${definition.anchor}; received ${physicalBounds.width}x${physicalBounds.height}.`);
      }
      return { definition, image, mappings: audit, physicalBounds };
    }));

    await mkdir(targetDirectory, { recursive: true });
    for (const entry of captured) {
      await writeFile(path.join(targetDirectory, `${entry.definition.anchor}.png`), entry.image);
      for (const mapping of entry.mappings) {
        if (mapping.from !== mapping.to) substitutions.set(`${mapping.theme}:${mapping.from}:${mapping.to}:${mapping.role}`, mapping);
      }
    }
    const manifest: NormalizedGoldenManifest = {
      anchors: captured.map(({ definition, physicalBounds }) => ({ anchor: definition.anchor, physicalBounds, theme: definition.theme })),
      deviceScaleFactor: REFERENCE_DEVICE_SCALE_FACTOR,
      exclusions: { deviceFrame: "removed", statusBar: "hidden", successSpreadRing: "removed" },
      logicalViewport: REFERENCE_LOGICAL_VIEWPORT,
      physicalViewport: REFERENCE_PHYSICAL_VIEWPORT,
      sourceDateEpoch: REFERENCE_SOURCE_DATE_EPOCH,
      sourceHash: sha256(source),
      substitutions: [...substitutions.values()].sort((left, right) => left.role.localeCompare(right.role)),
      transformHash: sha256(readFileSync(fileURLToPath(import.meta.url))),
      version: 1,
    };
    await writeFile(path.join(targetDirectory, "normalized-golden-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    await context.close();
    return manifest;
  } finally {
    await browser.close();
    await server.close();
  }
}

const invokedAsScript = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) {
  generateNormalizedGoldens({ outputDirectory: parseOutputDirectory() })
    .then((manifest) => console.log(JSON.stringify({ anchors: manifest.anchors.length, output: parseOutputDirectory(), version: manifest.version })))
    .catch((error: unknown) => { console.error(error); process.exitCode = 1; });
}
