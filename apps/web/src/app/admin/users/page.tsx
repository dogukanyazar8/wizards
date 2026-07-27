import type { UserStatus } from "@wizards/db";
import { AdminUsers, type AdminUsersFilters } from "@/components/admin/sections/admin-users";
import { adminRoleHasCapability, requireAdminCapability } from "@/lib/admin/capabilities";
import { listAdminUsers, parseAdminBoolean } from "@/lib/admin/management";

const USER_STATUSES = new Set<UserStatus>(["ONLINE", "IDLE", "DND", "OFFLINE", "INVISIBLE"]);

type AdminUsersPageProps = {
  searchParams?: Promise<AdminUsersFilters & { page?: string }>;
};

function parseStatus(value: string | undefined): UserStatus | "ALL" {
  return value && USER_STATUSES.has(value as UserStatus) ? (value as UserStatus) : "ALL";
}

export default async function AdminUsersPage({ searchParams }: AdminUsersPageProps) {
  const params = await searchParams;
  const query = params?.query?.slice(0, 120);
  const filters: AdminUsersFilters = {
    ...(params?.banned === "true" || params?.banned === "false" ? { banned: params.banned } : {}),
    ...(query ? { query } : {}),
    status: parseStatus(params?.status),
    ...(params?.verified === "true" || params?.verified === "false"
      ? { verified: params.verified }
      : {}),
  };
  const [admin, result] = await Promise.all([
    requireAdminCapability("user.read"),
    listAdminUsers({
      banned: parseAdminBoolean(filters.banned ?? null),
      ...(params?.page ? { page: params.page } : {}),
      ...(filters.query ? { query: filters.query } : {}),
      status: filters.status ?? "ALL",
      verified: parseAdminBoolean(filters.verified ?? null),
    }),
  ]);

  return (
    <AdminUsers
      canBan={adminRoleHasCapability(admin.role, "user.ban")}
      filters={filters}
      result={result}
    />
  );
}
