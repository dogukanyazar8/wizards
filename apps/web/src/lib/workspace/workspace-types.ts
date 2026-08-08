import type { ChannelType, ServerType } from "@wizards/db";
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
  /**
   * The server row is already loaded to derive the access level, so the two
   * columns the community gates need ride along with it. They used to cost an
   * extra `findUniqueOrThrow` each in `updateWorkspaceServer` and
   * `deleteWorkspaceServer`.
   */
  isPublic: boolean;
  memberId: string;
  ownerId: string;
  roles: RoleRecord[];
  serverId: string;
  serverName: string;
  type: ServerType;
  userId: string;
};

export type ChannelRecord = {
  categoryId: string | null;
  canAccess?: boolean;
  id: string;
  locked: boolean;
  messages?: Array<{
    author: {
      displayName: string | null;
      id: string;
      username: string;
    };
    content: string;
    createdAt: Date;
    id: string;
  }>;
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
