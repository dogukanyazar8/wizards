import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canBootstrapAdminFromEnvironment,
  isProductionAdminBootstrapEnvironment,
} from "./access";

describe("admin bootstrap access", () => {
  it("allows environment bootstrap only outside production environments", () => {
    assert.equal(
      canBootstrapAdminFromEnvironment("owner@example.com", {
        NODE_ENV: "development",
        WHISPR_ADMIN_EMAILS: "owner@example.com",
      }),
      true,
    );

    assert.equal(
      canBootstrapAdminFromEnvironment("owner@example.com", {
        NODE_ENV: "production",
        WHISPR_ADMIN_EMAILS: "owner@example.com",
      }),
      false,
    );

    assert.equal(
      canBootstrapAdminFromEnvironment("owner@example.com", {
        NODE_ENV: "test",
        RAILWAY_ENVIRONMENT_NAME: "production",
        WHISPR_ADMIN_EMAILS: "owner@example.com",
      }),
      false,
    );
  });

  it("does not bootstrap users that are not explicitly listed", () => {
    assert.equal(
      canBootstrapAdminFromEnvironment("member@example.com", {
        NODE_ENV: "development",
        WHISPR_ADMIN_EMAILS: "owner@example.com",
      }),
      false,
    );
  });

  it("detects production through NODE_ENV or Railway environment name", () => {
    assert.equal(
      isProductionAdminBootstrapEnvironment({ NODE_ENV: "production" }),
      true,
    );
    assert.equal(
      isProductionAdminBootstrapEnvironment({
        NODE_ENV: "test",
        RAILWAY_ENVIRONMENT_NAME: "production",
      }),
      true,
    );
    assert.equal(
      isProductionAdminBootstrapEnvironment({ NODE_ENV: "test" }),
      false,
    );
  });
});
