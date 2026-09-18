import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { runInNewContext } from "node:vm";

const workflow = readFileSync(
  new URL("../../.github/workflows/ci.yml", import.meta.url),
  "utf8",
).replaceAll("\r\n", "\n");
const jobs = Object.fromEntries(
  [...workflow.matchAll(/^  ([\w-]+):\n([\s\S]*?)(?=^  [\w-]+:|$(?![\s\S]))/gm)].map((match) => [
    match[1],
    match[2],
  ]),
);
const required = [
  "quality",
  "web-tests",
  "mobile-quality",
  "secret-scan",
  "actionlint",
  "semgrep",
  "typescript-native-shadow",
  "e2e-smoke",
  "e2e-cross-browser",
  "e2e-a11y",
  "e2e-visual",
  "desktop-ops",
];

test("independent checks start without waiting for the aggregate Verify gate", () => {
  const dependencies = jobs.verify.match(/    needs:\n([\s\S]*?)    steps:/)?.[1];
  assert.ok(dependencies);
  assert.deepEqual(
    [...dependencies.matchAll(/- ([\w-]+)/g)].map((match) => match[1]).sort(),
    [...required, "node22-compatibility"].sort(),
  );
  for (const id of required) {
    assert.ok(jobs[id], `missing ${id}`);
    assert.doesNotMatch(jobs[id], /^    needs:/m, `${id} must start independently`);
    assert.match(jobs.verify, new RegExp(`\\b${id}\\b`));
  }
  assert.match(jobs.verify, /name: Verify/);
  assert.match(jobs.verify, /if: \$\{\{ always\(\) \}\}/);
});

test("aggregate gate rejects failures, cancellation, missing results and unexpected skips", () => {
  const requiredExpression = jobs.verify.match(/NODE22_REQUIRED: (.+)/)?.[1];
  const compatibilityExpression = jobs["node22-compatibility"].match(/^    if: (.+)$/m)?.[1];
  assert.ok(requiredExpression && compatibilityExpression);
  for (const event of ["push", "pull_request", "schedule", "workflow_dispatch"]) {
    assert.equal(evaluate(requiredExpression, event), evaluate(compatibilityExpression, event));
  }
  const script = jobs.verify?.match(
    /node --input-type=module <<'NODE'\n([\s\S]*?)\n          NODE/,
  )?.[1];
  assert.ok(script, "Verify must validate dependency results");
  const baseline = Object.fromEntries(
    [...required, "node22-compatibility"].map((id) => [id, { result: "success" }]),
  );
  const run = (results, node22Required = "false") =>
    spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      env: {
        ...process.env,
        REQUIRED_RESULTS: JSON.stringify(results),
        NODE22_REQUIRED: node22Required,
      },
      encoding: "utf8",
    }).status;
  assert.equal(run(baseline), 0);
  assert.equal(run({ ...baseline, "node22-compatibility": { result: "skipped" } }), 0);
  assert.notEqual(run({ ...baseline, "node22-compatibility": { result: "skipped" } }, "true"), 0);
  for (const id of required) {
    for (const result of ["failure", "cancelled", "skipped"]) {
      assert.notEqual(run({ ...baseline, [id]: { result } }), 0, `${id}: ${result}`);
    }
    const missing = { ...baseline };
    delete missing[id];
    assert.notEqual(run(missing), 0, `${id}: missing`);
  }
});

function evaluate(expression, event, scope, shard = 1) {
  return runInNewContext(expression.replace(/^\$\{\{\s*|\s*\}\}$/g, ""), {
    github: { event_name: event, ref: "refs/heads/main" },
    inputs: { e2e_scope: scope },
    matrix: { shard },
    fromJSON: JSON.parse,
    startsWith: (value, prefix) => value.startsWith(prefix),
  });
}

test("Chromium selections preserve event coverage with one build per normal suite", () => {
  const steps = [
    ...jobs["e2e-smoke"].matchAll(
      /- name: (Run Playwright[^\n]*)\n        if: ([^\n]+)\n        run: ([^\n]+)/g,
    ),
  ];
  const cases = [
    ["pull_request", undefined, ["api", "smoke"]],
    ["push", undefined, ["api", "smoke", "realtime", "voice"]],
    ["workflow_dispatch", "api", ["api"]],
    ["workflow_dispatch", "smoke", ["api", "smoke"]],
    ["workflow_dispatch", "realtime", ["api", "realtime", "voice"]],
    ["workflow_dispatch", "full", []],
    ["schedule", undefined, []],
  ];
  for (const [event, scope, expected] of cases) {
    const selected = steps.filter(([, , condition]) => evaluate(condition, event, scope));
    assert.equal(selected.length, 1, `${event}/${scope}: one Chromium invocation`);
    assert.deepEqual(
      [...selected[0][3].matchAll(/e2e\/specs\/(\w+)/g)].map((match) => match[1]),
      expected,
    );
    assert.match(selected[0][3], /pnpm --filter @wizards\/web e2e(?: |$)/);
  }
});

test("only the full suite is sharded; real media runs once in an isolated build", () => {
  const job = jobs["e2e-smoke"];
  const expression = job.match(/^        shard: (.+)$/m)?.[1];
  assert.ok(expression, "matrix must select the shard count by event");
  for (const [event, scope, expected] of [
    ["push", undefined, [1]],
    ["pull_request", undefined, [1]],
    ["workflow_dispatch", "realtime", [1]],
    ["workflow_dispatch", "full", [1, 2]],
    ["schedule", undefined, [1, 2]],
  ]) {
    assert.deepEqual(Array.from(evaluate(expression, event, scope)), expected);
  }
  assert.match(job, /fail-fast: false/);
  assert.match(job, /e2e --shard=\$\{\{ matrix\.shard \}\}\/2/);
  for (const name of ["Start LiveKit for real-media tests", "Run screen share real-media tests"]) {
    const condition = job.match(new RegExp(`- name: ${name}\n        if: ([^\n]+)`))?.[1];
    assert.ok(condition);
    assert.equal(evaluate(condition, "schedule", undefined, 2), false);
    assert.equal(evaluate(condition, "schedule", undefined, 1), true);
    assert.equal(evaluate(condition, "pull_request", undefined), false);
  }
  assert.match(job, /name: playwright-report-\$\{\{ matrix\.shard \}\}/);
});

test("Rust audit cache stores the versioned tool without caching audit success", () => {
  const job = jobs["desktop-ops"];
  assert.match(
    job,
    /key: cargo-audit-ubuntu-24\.04-\$\{\{ runner\.arch \}\}-\$\{\{ env\.CARGO_AUDIT_VERSION \}\}/,
  );
  assert.match(job, /--root "\$CARGO_AUDIT_ROOT"/);
  assert.match(job, /"\$CARGO_AUDIT_ROOT\/bin\/cargo-audit" audit --file Cargo\.lock/);
  assert.doesNotMatch(job, /restore-keys:/);
});
