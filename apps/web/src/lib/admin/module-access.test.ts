import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiError } from "@/lib/api";
import { requireAdminModule, type AdminModuleAccessDependencies } from "@/lib/admin/module-access";

const admin = { email: "ada@test.dev", id: "user-1", role: "ADMIN", username: "ada" } as const;

function harness(overrides: Partial<AdminModuleAccessDependencies> = {}) {
  const redirects: string[] = [];

  const dependencies: AdminModuleAccessDependencies = {
    redirect: (href: string) => {
      redirects.push(href);
      throw new Error("NEXT_REDIRECT");
    },
    requireAdminCapability: async () => admin,
    ...overrides,
  };

  return { dependencies, redirects };
}

describe("admin module access", () => {
  it("returns the admin when the role holds the capability", async () => {
    const { dependencies, redirects } = harness();

    assert.deepEqual(await requireAdminModule("user.read", dependencies), admin);
    assert.deepEqual(redirects, []);
  });

  it("sends a role without the capability back to a module it can open", async () => {
    const { dependencies, redirects } = harness({
      requireAdminCapability: async () => {
        throw new ApiError("Forbidden", 403);
      },
    });

    await assert.rejects(() => requireAdminModule("user.read", dependencies), /NEXT_REDIRECT/u);
    assert.deepEqual(redirects, ["/admin"]);
  });

  it("leaves the console entirely when the overview itself is refused", async () => {
    const { dependencies, redirects } = harness({
      requireAdminCapability: async () => {
        throw new ApiError("Forbidden", 403);
      },
    });

    await assert.rejects(
      () => requireAdminModule("dashboard.read", dependencies),
      /NEXT_REDIRECT/u,
    );
    assert.deepEqual(redirects, ["/channels"], "redirecting to /admin would loop");
  });

  it("rethrows anything that is not a role refusal", async () => {
    const { dependencies, redirects } = harness({
      requireAdminCapability: async () => {
        throw new ApiError("Unauthorized", 401);
      },
    });

    await assert.rejects(() => requireAdminModule("audit.read", dependencies), /Unauthorized/u);
    assert.deepEqual(redirects, []);
  });
});
