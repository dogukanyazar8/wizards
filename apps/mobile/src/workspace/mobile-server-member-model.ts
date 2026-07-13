import type { MobileServerMember, MobileServerMembersResponse } from "@wizards/types";

export type MobileServerMemberListRow =
  | { id: "present" | "offline"; kind: "header" }
  | { id: string; kind: "member"; member: MobileServerMember };

export function buildMobileServerMemberRows(
  pages: readonly MobileServerMembersResponse[],
): readonly MobileServerMemberListRow[] {
  const seenMemberIds = new Set<string>();
  const present: MobileServerMember[] = [];
  const offline: MobileServerMember[] = [];

  for (const page of pages) {
    for (const member of page.members) {
      if (seenMemberIds.has(member.id)) {
        continue;
      }

      seenMemberIds.add(member.id);
      if (member.status === "OFFLINE") {
        offline.push(member);
      } else {
        present.push(member);
      }
    }
  }

  const rows: MobileServerMemberListRow[] = [];

  if (present.length > 0) {
    rows.push({ id: "present", kind: "header" });
    rows.push(...present.map((member) => ({ id: member.id, kind: "member" as const, member })));
  }

  if (offline.length > 0) {
    rows.push({ id: "offline", kind: "header" });
    rows.push(...offline.map((member) => ({ id: member.id, kind: "member" as const, member })));
  }

  return rows;
}

export function buildNextMobileMemberRoleIds(input: {
  assigned: boolean;
  currentRoleIds: readonly string[];
  roleId: string;
}): readonly string[] {
  const currentRoleIds = [...input.currentRoleIds];

  if (input.assigned) {
    return currentRoleIds.includes(input.roleId) ? currentRoleIds : [...currentRoleIds, input.roleId];
  }

  return currentRoleIds.filter((roleId) => roleId !== input.roleId);
}
