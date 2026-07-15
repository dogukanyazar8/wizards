import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { MobileTheme } from "../src/design/themes";

type SemanticStyleTree = Record<string, unknown>;

export interface DarkScreenSemanticRoleTarget {
  readonly anchor: "1c" | "1d" | "1f" | "1g" | "2a" | "2b" | "2c" | "2d";
  readonly sourcePaths: readonly string[];
  /** Exact handoff SVG geometry; source color checks still apply to these paths. */
  readonly structuralGeometrySourcePaths?: readonly string[];
  readonly testId: string;
}

function assertStructuralGeometrySourcePaths(target: DarkScreenSemanticRoleTarget): void {
  const structuralGeometrySourcePaths = target.structuralGeometrySourcePaths ?? [];
  assert.equal(
    new Set(structuralGeometrySourcePaths).size,
    structuralGeometrySourcePaths.length,
    `${target.anchor} structural geometry source paths must be deduplicated`,
  );

  for (const sourcePath of structuralGeometrySourcePaths) {
    assert.ok(
      target.sourcePaths.includes(sourcePath),
      `${target.anchor} structural geometry source must belong to its source paths: ${sourcePath}`,
    );
  }
}

function createDarkScreenSemanticRoleTarget(
  target: DarkScreenSemanticRoleTarget,
): Readonly<DarkScreenSemanticRoleTarget> {
  const sourcePaths = [...target.sourcePaths];
  const structuralGeometrySourcePaths = target.structuralGeometrySourcePaths
    ? Object.freeze([...target.structuralGeometrySourcePaths])
    : undefined;
  assert.equal(
    new Set(sourcePaths).size,
    sourcePaths.length,
    `${target.anchor} semantic gate source paths must be deduplicated`,
  );
  assertStructuralGeometrySourcePaths(target);

  return Object.freeze({
    ...target,
    sourcePaths: Object.freeze(sourcePaths),
    ...(structuralGeometrySourcePaths === undefined ? {} : { structuralGeometrySourcePaths }),
  });
}

/**
 * These surfaces have no dark HTML frame. Their dark appearance is therefore
 * accepted through semantic role resolution, not through a fabricated pixel golden.
 */
export const DARK_SCREEN_SEMANTIC_ROLE_TARGETS: readonly DarkScreenSemanticRoleTarget[] = Object.freeze([
  createDarkScreenSemanticRoleTarget({
    anchor: "1c",
    testId: "mobile-dm-inbox-screen",
    sourcePaths: [
      "src/app/screens/dm-screen.tsx",
      "src/app/screens/dm-screen.styles.ts",
      "src/app/screens/dm-inbox.tsx",
      "src/app/screens/dm-conversation-screen.tsx",
      "src/app/styles/shared-styles.ts",
    ],
  }),
  createDarkScreenSemanticRoleTarget({
    anchor: "1d",
    testId: "mobile-notifications-screen",
    sourcePaths: [
      "src/app/screens/notifications-screen.tsx",
      "src/app/screens/notifications-screen.styles.ts",
      "src/app/styles/shared-styles.ts",
    ],
  }),
  createDarkScreenSemanticRoleTarget({
    anchor: "1f",
    testId: "mobile-settings-screen",
    sourcePaths: [
      "src/app/screens/settings-screen.tsx",
      "src/app/screens/settings-screen.styles.ts",
      "src/app/styles/shared-styles.ts",
    ],
  }),
  createDarkScreenSemanticRoleTarget({
    anchor: "1g",
    testId: "mobile-server-switcher-sheet-panel",
    sourcePaths: [
      "src/app/components/kit/bottom-sheet.tsx",
      "src/app/components/kit/bottom-sheet.styles.ts",
    ],
  }),
  createDarkScreenSemanticRoleTarget({
    anchor: "2a",
    testId: "mobile-auth-welcome-screen",
    sourcePaths: [
      "src/app/screens/auth/auth-welcome-screen.tsx",
      "src/app/screens/auth/auth-welcome-screen.styles.ts",
      "src/app/screens/auth/auth-welcome-brand-mark.tsx",
      "src/app/components/kit/auth/auth-screen-background.tsx",
      "src/app/components/kit/auth/auth-primary-button.tsx",
      "src/app/components/kit/auth/auth-secondary-button.tsx",
    ],
    structuralGeometrySourcePaths: ["src/app/screens/auth/auth-welcome-brand-mark.tsx"],
  }),
  createDarkScreenSemanticRoleTarget({
    anchor: "2b",
    testId: "mobile-auth-login-screen",
    sourcePaths: [
      "src/app/screens/auth/auth-login-screen.tsx",
      "src/app/screens/auth/auth-login-screen.styles.ts",
      "src/app/components/kit/auth/auth-screen-background.tsx",
      "src/app/components/kit/auth/auth-top-bar.tsx",
      "src/app/components/kit/auth/auth-eyebrow-header.tsx",
      "src/app/components/kit/auth/auth-text-field.tsx",
      "src/app/components/kit/auth/auth-profile-type-selector.tsx",
      "src/app/components/kit/auth/auth-checkbox.tsx",
      "src/app/components/kit/auth/auth-primary-button.tsx",
      "src/app/components/kit/auth/auth-secondary-button.tsx",
    ],
  }),
  createDarkScreenSemanticRoleTarget({
    anchor: "2c",
    testId: "mobile-auth-register-screen",
    sourcePaths: [
      "src/app/screens/auth/auth-register-screen.tsx",
      "src/app/screens/auth/auth-register-screen.styles.ts",
      "src/app/components/kit/auth/auth-screen-background.tsx",
      "src/app/components/kit/auth/auth-top-bar.tsx",
      "src/app/components/kit/auth/auth-eyebrow-header.tsx",
      "src/app/components/kit/auth/auth-text-field.tsx",
      "src/app/components/kit/auth/auth-profile-type-selector.tsx",
      "src/app/components/kit/auth/auth-password-strength-row.tsx",
      "src/app/components/kit/auth/auth-checkbox.tsx",
      "src/app/components/kit/auth/auth-primary-button.tsx",
    ],
  }),
  createDarkScreenSemanticRoleTarget({
    anchor: "2d",
    testId: "mobile-auth-forgot-password-screen",
    sourcePaths: [
      "src/app/screens/auth/auth-forgot-password-screen.tsx",
      "src/app/screens/auth/auth-forgot-password-screen.styles.ts",
      "src/app/components/kit/auth/auth-screen-background.tsx",
      "src/app/components/kit/auth/auth-top-bar.tsx",
      "src/app/components/kit/auth/auth-eyebrow-header.tsx",
      "src/app/components/kit/auth/auth-text-field.tsx",
      "src/app/components/kit/auth/auth-info-banner.tsx",
      "src/app/components/kit/auth/auth-primary-button.tsx",
    ],
  }),
]);

const RAW_COLOR = /#[0-9a-f]{3,8}\b|\brgba?\(/i;
const COLOR_STYLE_KEY = /(?:color|fill|stroke)$/i;
const MEASURE_STYLE_KEY_SOURCE = "border(?:Bottom|End|Left|Right|Start|Top)?Width|border(?:Bottom|End|Left|Right|Start|Top)?(?:Left|Right)?Radius|bottom|elevation|fontSize|gap|height|left|letterSpacing|lineHeight|margin(?:Bottom|End|Horizontal|Left|Right|Start|Top|Vertical)?|maxHeight|maxWidth|minHeight|minWidth|opacity|padding(?:Bottom|End|Horizontal|Left|Right|Start|Top|Vertical)?|right|shadowOpacity|shadowRadius|top|width|zIndex|flexBasis";
const MEASURE_STYLE_KEY = new RegExp(`^(?:${MEASURE_STYLE_KEY_SOURCE})$`);
const RAW_MEASURE_DECLARATION = new RegExp(
  `\\b(${MEASURE_STYLE_KEY_SOURCE})\\s*:\\s*(-?\\d+(?:\\.\\d+)?)\\b`,
  "g",
);

function normalizeColor(value: string): string {
  return value.replaceAll(" ", "").toLowerCase();
}

function collectThemeRoles(value: unknown, path = "theme", roles = new Map<string, string[]>()) {
  if (typeof value === "string") {
    const key = `string:${normalizeColor(value)}`;
    roles.set(key, [...(roles.get(key) ?? []), path]);
    return roles;
  }

  if (typeof value === "number") {
    const key = `number:${value}`;
    roles.set(key, [...(roles.get(key) ?? []), path]);
    return roles;
  }

  if (!value || typeof value !== "object") {
    return roles;
  }

  for (const [key, child] of Object.entries(value)) {
    collectThemeRoles(child, `${path}.${key}`, roles);
  }

  return roles;
}

function isColorValue(key: string, value: unknown): value is string {
  return typeof value === "string" && COLOR_STYLE_KEY.test(key) && RAW_COLOR.test(value);
}

function isConcreteMeasure(key: string, value: unknown): value is number {
  return typeof value === "number" && MEASURE_STYLE_KEY.test(key);
}

function findMissingRole(
  roles: ReadonlyMap<string, readonly string[]>,
  treePath: string,
  value: string | number,
): string | undefined {
  const roleKey = typeof value === "string" ? `string:${normalizeColor(value)}` : `number:${value}`;
  const matchedRoles = roles.get(roleKey);
  return matchedRoles?.length
    ? undefined
    : `${treePath} uses ${JSON.stringify(value)} without a semantic theme role`;
}

function visitStyleTree(
  value: unknown,
  roles: ReadonlyMap<string, readonly string[]>,
  path: string,
  missingRoles: string[],
): void {
  if (!value || typeof value !== "object") {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (isColorValue(key, child) || isConcreteMeasure(key, child)) {
      const missingRole = findMissingRole(roles, childPath, child);
      if (missingRole) {
        missingRoles.push(missingRole);
      }
      continue;
    }

    visitStyleTree(child, roles, childPath, missingRoles);
  }
}

export function assertSemanticStyleTree(
  target: DarkScreenSemanticRoleTarget,
  styles: SemanticStyleTree,
  theme: MobileTheme,
): void {
  assert.equal(theme.dark, true, `${target.anchor} semantic gate requires darkTheme`);
  const missingRoles: string[] = [];
  visitStyleTree(styles, collectThemeRoles(theme), `${target.anchor}:${target.testId}`, missingRoles);
  assert.deepEqual(missingRoles, [], missingRoles.join("\n"));
}

/** Reject direct color literals in the owning screen tree before runtime style resolution can mask them. */
export function assertSemanticStyleSource(
  target: DarkScreenSemanticRoleTarget,
  theme: MobileTheme,
): void {
  assertStructuralGeometrySourcePaths(target);
  const roles = collectThemeRoles(theme);
  const missingRoles: string[] = [];

  for (const sourcePath of target.sourcePaths) {
    const absolutePath = join(process.cwd(), sourcePath);
    assert.ok(existsSync(absolutePath), `${target.anchor} source is missing: ${sourcePath}`);
    const source = readFileSync(absolutePath, "utf8");
    assert.doesNotMatch(
      source,
      RAW_COLOR,
      `${relative(process.cwd(), absolutePath)} contains a raw presentation color`,
    );

    if (target.structuralGeometrySourcePaths?.includes(sourcePath)) {
      continue;
    }

    for (const match of source.matchAll(RAW_MEASURE_DECLARATION)) {
      const styleKey = match[1];
      const rawValue = match[2];
      if (!styleKey || !rawValue) {
        continue;
      }

      const line = source.slice(0, match.index).split("\n").length;
      const missingRole = findMissingRole(roles, `${sourcePath}:${line}:${styleKey}`, Number(rawValue));
      if (missingRole) {
        missingRoles.push(missingRole);
      }
    }
  }

  assert.deepEqual(missingRoles, [], missingRoles.join("\n"));
}
