import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolve } from "node:path";
import * as rebaseline from "./rebaseline-uat-migration-history.mjs";

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

test("recognizes only the interrupted historical replay after a valid baseline", () => {
  assert.equal(typeof rebaseline.isRecoverableInterruptedBaselineHistory, "function");

  const baseline = {
    checksum: "baseline-checksum",
    finished_at: new Date("2026-07-25T07:00:00Z"),
    migration_name: "20260725000000_uat_schema_baseline",
    rolled_back_at: null,
  };
  const expectedHistorical = [
    { checksum: "first-checksum", migrationName: "20260422000000_add_fulltext_search_indexes" },
    { checksum: "second-checksum", migrationName: "20260426000000_theme_system_refresh" },
    { checksum: "third-checksum", migrationName: "20260426010000_add_user_settings_locale" },
    { checksum: "fourth-checksum", migrationName: "20260427123000_add_voice_state_heartbeat" },
  ];
  const interruptedHistory = [
    baseline,
    {
      checksum: "first-checksum",
      finished_at: new Date("2026-07-25T07:19:28Z"),
      migration_name: "20260422000000_add_fulltext_search_indexes",
      rolled_back_at: null,
    },
    {
      checksum: "second-checksum",
      finished_at: new Date("2026-07-25T07:19:28Z"),
      migration_name: "20260426000000_theme_system_refresh",
      rolled_back_at: null,
    },
    {
      checksum: "third-checksum",
      finished_at: new Date("2026-07-25T07:19:28Z"),
      migration_name: "20260426010000_add_user_settings_locale",
      rolled_back_at: null,
    },
    {
      checksum: "fourth-checksum",
      finished_at: null,
      migration_name: "20260427123000_add_voice_state_heartbeat",
      rolled_back_at: null,
    },
  ];

  assert.equal(
    rebaseline.isRecoverableInterruptedBaselineHistory(
      interruptedHistory,
      "baseline-checksum",
      expectedHistorical,
    ),
    true,
  );
  assert.equal(
    rebaseline.isRecoverableInterruptedBaselineHistory(
      [...interruptedHistory, { ...interruptedHistory[1], migration_name: "unexpected" }],
      "baseline-checksum",
      expectedHistorical,
    ),
    false,
  );
});
