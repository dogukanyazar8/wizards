import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolve } from "node:path";

const script = readFileSync(
  resolve(import.meta.dirname, "rebaseline-uat-migration-history.mjs"),
  "utf8",
);

test("UAT migration rebaseline is confirmation-gated and changes only metadata", () => {
  assert.match(script, /PRISMA_UAT_REBASELINE_CONFIRM/);
  assert.match(script, /LOCK TABLE public\."_prisma_migrations" IN ACCESS EXCLUSIVE MODE/);
  assert.match(script, /DELETE FROM public\."_prisma_migrations"/);
  assert.match(script, /INSERT INTO public\."_prisma_migrations"/);
  assert.match(script, /isCurrentBaseline/);
  assert.doesNotMatch(script, /migrate", "resolve"/);
  assert.doesNotMatch(script, /migrate", "deploy"/);
  assert.doesNotMatch(script, /migrate", "reset"/);
  assert.doesNotMatch(script, /db", "push"/);
});
