import type { ChannelType } from "@wizards/db";
import type { WorkspaceAccessLevel } from "@wizards/types";

export type RoleRecord = {
  color: number;
  id: string;
  isDefault?: boolean | null;
  managed?: boolean | null;
  mentionable?: boolean | null;
  name: string;
  permissions: bigint;
  position?: number | null;
};

export type AccessContext = {
  accessLevel: WorkspaceAccessLevel;
  memberId: string;
  ownerId: string;
  roles: RoleRecord[];
  serverId: string;
  serverName: string;
  userId: string;
};

export type ChannelRecord = {
  categoryId: string | null;
  canAccess?: boolean;
  id: string;
  locked: boolean;
  name: string;
  permissionOverrides?: Array<{
    allow: bigint;
    deny: bigint;
    targetId: string;
    targetType: "ROLE" | "USER";
  }>;
  position: number;
  readOnly?: boolean;
  topic: string | null;
  type: ChannelType;
};
