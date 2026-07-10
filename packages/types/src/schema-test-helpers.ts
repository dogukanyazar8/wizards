import assert from "node:assert/strict";

import type { ZodTypeAny } from "zod";

export type SchemaBehaviorCase = {
  invalid: unknown;
  schema: ZodTypeAny;
  valid: unknown;
};

function isSchemaExport(value: unknown): value is ZodTypeAny {
  return (
    typeof value === "object" &&
    value !== null &&
    "safeParse" in value &&
    typeof value.safeParse === "function"
  );
}

export function assertAccepts(schema: ZodTypeAny, value: unknown) {
  const result = schema.safeParse(value);
  assert.equal(result.success, true, result.success ? undefined : result.error.message);
  return result.success ? result.data : undefined;
}

export function assertRejects(
  schema: ZodTypeAny,
  value: unknown,
  expectedPath?: Array<number | string>,
) {
  const result = schema.safeParse(value);
  assert.equal(result.success, false, "Expected schema input to be rejected.");
  if (!result.success && expectedPath) {
    assert.ok(
      result.error.issues.some(
        (issue) =>
          issue.path.length === expectedPath.length &&
          issue.path.every((segment, index) => segment === expectedPath[index]),
      ),
      `Expected an issue at ${expectedPath.join(".")}.`,
    );
  }
}

export function assertSchemaBehaviorCoverage(
  moduleExports: Record<string, unknown>,
  cases: Record<string, SchemaBehaviorCase>,
) {
  const schemaExportNames = Object.entries(moduleExports)
    .filter(([name, value]) => name.endsWith("Schema") && isSchemaExport(value))
    .map(([name]) => name)
    .sort();

  assert.deepEqual(Object.keys(cases).sort(), schemaExportNames);

  for (const [name, behavior] of Object.entries(cases)) {
    assert.equal(behavior.schema, moduleExports[name], `${name} is mapped to the wrong schema.`);

    const accepted = behavior.schema.safeParse(behavior.valid);
    assert.equal(accepted.success, true, `${name} rejected its valid fixture.`);

    const rejected = behavior.schema.safeParse(behavior.invalid);
    assert.equal(rejected.success, false, `${name} accepted its invalid fixture.`);
  }
}
