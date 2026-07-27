// ruleid: whispr.admin.require-capability
import { requireAdminUser } from "@/lib/admin/access";

// ok: whispr.admin.require-capability
import { requireAdminCapability } from "@/lib/admin/capabilities";

export async function unsafeAdminEntryPoint() {
  return requireAdminUser();
}

export async function safeAdminEntryPoint() {
  return requireAdminCapability("user.read");
}
