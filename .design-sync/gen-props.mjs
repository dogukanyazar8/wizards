// Fills cfg.dtsPropsFor for components the converter could not extract props for.
// The web app declares most props as inline anonymous object types
// (`function Card({ a, b }: { a: string })`), which the converter's named-interface
// extractor skips — so resolve them through the checker instead, off the .d.ts
// tree emitted by tsconfig.emit.json.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const repo = resolve(import.meta.dirname, "..");
const require_ = createRequire(join(repo, ".ds-sync/noop.js"));
const { Project } = require_("ts-morph");

const typesRoot = join(repo, ".design-sync/.cache/types");
const project = new Project({
  skipAddingFilesFromTsConfig: true,
  compilerOptions: { skipLibCheck: true, strict: false, jsx: 4 },
});
project.addSourceFilesAtPaths([`${typesRoot}/**/*.d.ts`, `!${typesRoot}/**/node_modules/**`]);
const reactTypes = join(repo, "apps/web/node_modules/@types/react/index.d.ts");
project.addSourceFileAtPath(reactTypes);

// tsc keeps the .design-sync/ path segment in the output tree, and fast-glob
// skips dot-directories — so the barrel has to be added by hand.
const entry = project.addSourceFileAtPath(join(typesRoot, ".design-sync/ds-entry.d.ts"));
if (!entry) throw new Error("ds-entry.d.ts missing — run the tsc emit step first");

// Component type -> its props object type. Handles plain function components,
// forwardRef/memo wrappers, and React.ComponentType aliases uniformly by asking
// the checker for call signatures and taking the first parameter.
function propsTypeOf(type) {
  const sigs = type.getCallSignatures();
  if (sigs.length) return sigs[0].getParameters()[0]?.getTypeAtLocation(sigs[0].getDeclaration());
  // forwardRef/memo: the props live in the type argument of the exotic component.
  for (const arg of type.getTypeArguments()) {
    const inner = propsTypeOf(arg);
    if (inner) return inner;
  }
  const props = type.getProperty("propTypes");
  return props ? undefined : undefined;
}

const RESERVED = new Set(["ref", "key"]);

function bodyFor(name) {
  const decl = entry.getExportedDeclarations().get(name)?.[0];
  if (!decl) return null;
  const propsType = propsTypeOf(decl.getType());
  if (!propsType) return null;
  const lines = [];
  let inheritedDom = 0;
  for (const prop of propsType.getProperties()) {
    const pName = prop.getName();
    if (RESERVED.has(pName) || pName.startsWith("__")) continue;
    const d = prop.getDeclarations()[0];
    if (!d) continue;
    // Props declared in @types/react are the DOM attribute bag the component
    // spreads through — hundreds of entries that drown the real API.
    if (d.getSourceFile().getFilePath().includes("node_modules")) {
      inheritedDom += 1;
      continue;
    }
    let text;
    try {
      text = prop.getTypeAtLocation(d).getText(d).replace(/\s+/g, " ");
    } catch {
      continue;
    }
    // Import-qualified type names (import("…/foo").Bar) don't resolve in the
    // emitted per-component .d.ts — degrade to the structural escape hatch.
    if (/import\(/.test(text)) text = "unknown";
    if (text.length > 220) text = "unknown";
    const optional = prop.isOptional?.() ?? false;
    const key = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(pName) ? pName : JSON.stringify(pName);
    lines.push(`  ${key}${optional ? "?" : ""}: ${text};`);
  }
  if (!lines.length && !inheritedDom) return null;
  if (inheritedDom) {
    lines.push(
      `  /** Plus the standard DOM attributes for this element (${inheritedDom} inherited: className, onClick, disabled, …). */`,
      "  [prop: string]: unknown;",
    );
  }
  return lines.join("\n");
}

const cfgPath = join(repo, ".design-sync/config.json");
const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
const names = Object.keys(cfg.componentSrcMap ?? {});

const out = { ...(cfg.dtsPropsFor ?? {}) };
let filled = 0;
let empty = 0;
for (const name of names) {
  if (out[name]) continue;
  const body = bodyFor(name);
  if (!body) {
    empty += 1;
    continue;
  }
  out[name] = body;
  filled += 1;
}

cfg.dtsPropsFor = Object.fromEntries(Object.entries(out).sort());
writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n");
console.log(`dtsPropsFor: ${filled} filled, ${empty} without resolvable props (no-prop components)`);
