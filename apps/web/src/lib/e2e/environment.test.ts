import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatE2EEnvironmentValidation,
  validateE2EEnvironment,
  validateSafeE2EDatabaseUrl,
  validateSafeE2ERedisUrl,
} from "./environment";

const safeEnv = {
  APP_URL: "http://127.0.0.1:3000",
  AUTH_URL: "http://127.0.0.1:3000",
  DATABASE_URL: "postgresql://wizards:wizards@localhost:5432/whispr_e2e",
  E2E_BASE_URL: "http://127.0.0.1:3000",
  E2E_DATABASE_URL: "postgresql://wizards:wizards@localhost:5432/whispr_e2e",
  E2E_TEST_MODE: "true",
  E2E_TEST_PASSWORD: "local-e2e-password",
  NEXTAUTH_URL: "http://127.0.0.1:3000",
  REDIS_URL: "redis://localhost:6379",
} as const;

describe("E2E environment preflight", () => {
  it("accepts isolated local Playwright configuration", () => {
    const validation = validateE2EEnvironment(safeEnv);

    assert.equal(validation.ok, true);
    assert.deepEqual(validation.errors, []);
    assert.equal(validation.summary.databaseTarget, "postgresql://localhost:5432/whispr_e2e");
    assert.equal(validation.summary.redisTarget, "redis://localhost:6379");
  });

  it("fails fast when required isolation and password values are missing", () => {
    const validation = validateE2EEnvironment({});

    assert.equal(validation.ok, false);
    assert.match(
      validation.errors.map((issue) => issue.code).join(","),
      /e2e_test_mode_required/,
    );
    assert.match(
      validation.errors.map((issue) => issue.code).join(","),
      /database_url_required/,
    );
    assert.match(
      validation.errors.map((issue) => issue.code).join(","),
      /e2e_password_required/,
    );
  });

  it("rejects production mode even with a test-looking database", () => {
    const validation = validateE2EEnvironment({
      ...safeEnv,
      NODE_ENV: "production",
    });

    assert.equal(validation.ok, false);
    assert.match(
      validation.errors.map((issue) => issue.code).join(","),
      /node_env_production/,
    );
  });

  it("rejects managed or remote database hosts", () => {
    const errors = validateSafeE2EDatabaseUrl(
      "postgresql://wizards:wizards@railway.internal:5432/whispr_e2e",
      safeEnv,
    );

    assert.equal(errors.some((issue) => issue.code === "database_url_not_safe"), true);
  });

  it("rejects non-test database names", () => {
    const errors = validateSafeE2EDatabaseUrl(
      "postgresql://wizards:wizards@localhost:5432/whispr",
      safeEnv,
    );

    assert.equal(errors.some((issue) => issue.code === "database_name_not_test_like"), true);
  });

  it("warns, but does not fail, when Redis is omitted", () => {
    const envWithoutRedis = { ...safeEnv, REDIS_URL: undefined };
    const validation = validateE2EEnvironment(envWithoutRedis);

    assert.equal(validation.ok, true);
    assert.equal(validation.warnings.some((issue) => issue.code === "redis_url_missing"), true);
  });

  it("rejects remote app URLs for session-helper based E2E runs", () => {
    const validation = validateE2EEnvironment({
      ...safeEnv,
      E2E_BASE_URL: "https://uat.whispr.team",
    });

    assert.equal(validation.ok, false);
    assert.equal(validation.errors.some((issue) => issue.code === "e2e_base_url_not_loopback"), true);
  });

  it("rejects unsafe Redis targets when Redis is configured", () => {
    const errors = validateSafeE2ERedisUrl("redis://redis.railway.internal:6379", safeEnv);

    assert.equal(errors.some((issue) => issue.code === "redis_url_not_safe"), true);
  });

  it("formats actionable diagnostics without leaking secrets", () => {
    const validation = validateE2EEnvironment({
      ...safeEnv,
      E2E_TEST_PASSWORD: "super-secret-local-password",
      E2E_BASE_URL: "https://uat.whispr.team",
    });
    const report = formatE2EEnvironmentValidation(validation);

    assert.match(report, /E2E environment preflight failed/);
    assert.doesNotMatch(report, /super-secret-local-password/);
    assert.match(report, /PowerShell quick start/);
  });
});
