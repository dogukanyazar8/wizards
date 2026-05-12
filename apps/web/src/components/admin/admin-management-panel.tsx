"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Ban,
  CheckCircle2,
  Loader2,
  RefreshCcw,
  Search,
  Server,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Button } from "@wizards/ui";
import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type AdminManagedUser = {
  adminRole: string | null;
  avatarUrl: string | null;
  bannedAt: string | null;
  bannedReason: string | null;
  displayName: string;
  email: string;
  emailVerified: boolean;
  id: string;
  isBanned: boolean;
  lastSession: {
    browser: string | null;
    clientType: string;
    countryCode: string | null;
    deviceType: string;
    lastSeenAt: string;
    os: string | null;
  } | null;
  metrics: {
    appSeconds: number;
    dmMessageCount: number;
    fileUploadCount: number;
    messageCount: number;
    voiceSeconds: number;
  };
  registeredAt: string;
  serverCount: number;
  status: string;
  username: string;
};

type AdminManagedServer = {
  channelCount: number;
  channels: Array<{
    id: string;
    messageCount: number;
    name: string;
    type: string;
  }>;
  createdAt: string;
  description: string | null;
  discoverable: boolean;
  id: string;
  isPublic: boolean;
  memberCount: number;
  messageCount: number;
  name: string;
  owner: {
    displayName: string;
    id: string;
    username: string;
  };
  preferredLocale: string;
  textChannelCount: number;
  voiceChannelCount: number;
};

type PaginatedResponse<T> = {
  pagination: {
    limit: number;
    page: number;
    total: number;
    totalPages: number;
  };
  users?: T[];
  servers?: T[];
};

type AdminManagementPanelProps = {
  canModerate: boolean;
};

type UserAction = {
  banned: boolean;
  user: AdminManagedUser;
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("en", { maximumFractionDigits: 0 }).format(value);
}

function formatDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.trunc(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);

  if (hours > 0) {
    return `${formatNumber(hours)}h ${minutes}m`;
  }

  return `${minutes}m`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function compact(value: string | null | undefined, fallback = "Unknown") {
  return value?.trim() ? value : fallback;
}

async function fetchJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const payload = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  if (!response.ok) {
    throw new Error(payload?.error ?? "Request failed");
  }

  return payload as T;
}

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
        status === "ONLINE"
          ? "border-[hsl(var(--success)/0.22)] bg-[hsl(var(--success)/0.12)] text-app-success"
          : status === "DND"
            ? "border-[hsl(var(--danger)/0.22)] bg-[hsl(var(--danger)/0.12)] text-app-danger"
            : status === "IDLE"
              ? "border-[hsl(var(--warning)/0.22)] bg-[hsl(var(--warning)/0.12)] text-app-warning"
              : "app-panel-soft text-app-muted",
      )}
    >
      {status}
    </span>
  );
}

export function AdminManagementPanel({ canModerate }: AdminManagementPanelProps) {
  const [activeTab, setActiveTab] = useState<"servers" | "users">("users");
  const [userQuery, setUserQuery] = useState("");
  const [userStatus, setUserStatus] = useState("ALL");
  const [userBanned, setUserBanned] = useState("ALL");
  const [serverQuery, setServerQuery] = useState("");
  const [users, setUsers] = useState<AdminManagedUser[]>([]);
  const [servers, setServers] = useState<AdminManagedServer[]>([]);
  const [userTotal, setUserTotal] = useState(0);
  const [serverTotal, setServerTotal] = useState(0);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingServers, setLoadingServers] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<UserAction | null>(null);
  const [reason, setReason] = useState("");
  const [savingAction, setSavingAction] = useState(false);

  const userParams = useMemo(() => {
    const params = new URLSearchParams({
      limit: "20",
      page: "1",
      query: userQuery,
      status: userStatus,
    });

    if (userBanned !== "ALL") {
      params.set("banned", userBanned);
    }

    return params.toString();
  }, [userBanned, userQuery, userStatus]);

  const serverParams = useMemo(() => {
    const params = new URLSearchParams({
      limit: "20",
      page: "1",
      query: serverQuery,
    });

    return params.toString();
  }, [serverQuery]);

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    setError(null);

    try {
      const payload = await fetchJson<PaginatedResponse<AdminManagedUser>>(
        `/api/v1/admin/users?${userParams}`,
      );

      setUsers(payload.users ?? []);
      setUserTotal(payload.pagination.total);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Users could not be loaded.");
    } finally {
      setLoadingUsers(false);
    }
  }, [userParams]);

  const loadServers = useCallback(async () => {
    setLoadingServers(true);
    setError(null);

    try {
      const payload = await fetchJson<PaginatedResponse<AdminManagedServer>>(
        `/api/v1/admin/servers?${serverParams}`,
      );

      setServers(payload.servers ?? []);
      setServerTotal(payload.pagination.total);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Servers could not be loaded.",
      );
    } finally {
      setLoadingServers(false);
    }
  }, [serverParams]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadUsers();
    }, 220);

    return () => window.clearTimeout(timeout);
  }, [loadUsers]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadServers();
    }, 220);

    return () => window.clearTimeout(timeout);
  }, [loadServers]);

  const submitAction = async () => {
    if (!action) {
      return;
    }

    setSavingAction(true);
    setError(null);

    try {
      await fetchJson(`/api/v1/admin/users/${action.user.id}`, {
        body: JSON.stringify({
          isBanned: action.banned,
          reason,
        }),
        method: "PATCH",
      });
      setAction(null);
      setReason("");
      await loadUsers();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "User update failed.");
    } finally {
      setSavingAction(false);
    }
  };

  return (
    <section className="app-panel min-w-0 rounded-[28px] border p-5 sm:p-6" id="management">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="app-panel-soft flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-[hsl(var(--primary))]">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-app-foreground text-xl font-semibold">Operations</h2>
            <p className="text-app-muted mt-1 text-sm leading-6">
              Search users and servers, review last activity, and apply audited moderation actions.
            </p>
          </div>
        </div>
        <div className="flex rounded-2xl border border-[hsl(var(--border)/0.64)] bg-[hsl(var(--surface-soft)/0.42)] p-1">
          <button
            className={cn(
              "inline-flex min-h-9 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition",
              activeTab === "users"
                ? "bg-[hsl(var(--surface-card)/0.9)] text-app-foreground"
                : "text-app-muted",
            )}
            onClick={() => setActiveTab("users")}
            type="button"
          >
            <Users className="h-4 w-4" />
            Users
          </button>
          <button
            className={cn(
              "inline-flex min-h-9 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition",
              activeTab === "servers"
                ? "bg-[hsl(var(--surface-card)/0.9)] text-app-foreground"
                : "text-app-muted",
            )}
            onClick={() => setActiveTab("servers")}
            type="button"
          >
            <Server className="h-4 w-4" />
            Servers
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl border border-[hsl(var(--danger)/0.26)] bg-[hsl(var(--danger)/0.12)] px-4 py-3 text-sm text-app-danger">
          {error}
        </div>
      ) : null}

      {activeTab === "users" ? (
        <div className="mt-5">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_160px_auto]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-app-soft" />
              <Input
                className="pl-10"
                onChange={(event) => setUserQuery(event.target.value)}
                placeholder="Search name, username or email"
                value={userQuery}
              />
            </label>
            <select
              className="app-input h-11 rounded-2xl border px-4 text-sm outline-none"
              onChange={(event) => setUserStatus(event.target.value)}
              value={userStatus}
            >
              <option value="ALL">All statuses</option>
              <option value="ONLINE">Online</option>
              <option value="IDLE">Idle</option>
              <option value="DND">DND</option>
              <option value="OFFLINE">Offline</option>
              <option value="INVISIBLE">Invisible</option>
            </select>
            <select
              className="app-input h-11 rounded-2xl border px-4 text-sm outline-none"
              onChange={(event) => setUserBanned(event.target.value)}
              value={userBanned}
            >
              <option value="ALL">All users</option>
              <option value="false">Active</option>
              <option value="true">Banned</option>
            </select>
            <Button onClick={loadUsers} type="button" variant="outline">
              <RefreshCcw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 text-sm">
            <p className="text-app-muted">{formatNumber(userTotal)} users matched.</p>
            {loadingUsers ? (
              <span className="inline-flex items-center gap-2 text-app-muted">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading
              </span>
            ) : null}
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[980px] border-separate border-spacing-y-2 text-left text-sm">
              <thead className="text-app-soft">
                <tr>
                  <th className="px-3 py-2 font-medium">User</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Last client</th>
                  <th className="px-3 py-2 font-medium">30d activity</th>
                  <th className="px-3 py-2 font-medium">Servers</th>
                  <th className="px-3 py-2 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr className="app-panel-soft rounded-2xl" key={user.id}>
                    <td className="rounded-l-2xl border-y border-l border-[hsl(var(--border)/0.58)] px-3 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar
                          alt={user.displayName}
                          className="h-10 w-10"
                          fallback={user.username}
                          src={user.avatarUrl}
                        />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-app-foreground">
                            {user.displayName}
                          </p>
                          <p className="truncate text-xs text-app-soft">{user.email}</p>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {user.adminRole ? (
                              <span className="rounded-full bg-[hsl(var(--primary)/0.12)] px-2 py-0.5 text-[11px] font-semibold text-app-accent">
                                {user.adminRole}
                              </span>
                            ) : null}
                            {user.emailVerified ? (
                              <span className="rounded-full bg-[hsl(var(--success)/0.12)] px-2 py-0.5 text-[11px] font-semibold text-app-success">
                                Verified
                              </span>
                            ) : null}
                            {user.isBanned ? (
                              <span className="rounded-full bg-[hsl(var(--danger)/0.12)] px-2 py-0.5 text-[11px] font-semibold text-app-danger">
                                Banned
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="border-y border-[hsl(var(--border)/0.58)] px-3 py-3">
                      <StatusPill status={user.status} />
                    </td>
                    <td className="border-y border-[hsl(var(--border)/0.58)] px-3 py-3 text-app-muted">
                      <p>{user.lastSession?.clientType ?? "No session"}</p>
                      <p className="text-xs text-app-soft">
                        {user.lastSession
                          ? `${compact(user.lastSession.os)} / ${compact(user.lastSession.browser)}`
                          : "No device"}
                      </p>
                    </td>
                    <td className="border-y border-[hsl(var(--border)/0.58)] px-3 py-3 text-app-muted">
                      <p>{formatDuration(user.metrics.appSeconds)} app</p>
                      <p className="text-xs text-app-soft">
                        {formatNumber(user.metrics.messageCount + user.metrics.dmMessageCount)}{" "}
                        messages / {formatDuration(user.metrics.voiceSeconds)} voice
                      </p>
                    </td>
                    <td className="border-y border-[hsl(var(--border)/0.58)] px-3 py-3 text-app-muted">
                      {formatNumber(user.serverCount)}
                    </td>
                    <td className="rounded-r-2xl border-y border-r border-[hsl(var(--border)/0.58)] px-3 py-3 text-right">
                      <Button
                        disabled={!canModerate}
                        onClick={() => {
                          setReason("");
                          setAction({ banned: !user.isBanned, user });
                        }}
                        size="sm"
                        type="button"
                        variant={user.isBanned ? "outline" : "default"}
                      >
                        {user.isBanned ? (
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                        ) : (
                          <Ban className="mr-2 h-4 w-4" />
                        )}
                        {user.isBanned ? "Unban" : "Ban"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="mt-5">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-app-soft" />
              <Input
                className="pl-10"
                onChange={(event) => setServerQuery(event.target.value)}
                placeholder="Search server name, description or invite"
                value={serverQuery}
              />
            </label>
            <Button onClick={loadServers} type="button" variant="outline">
              <RefreshCcw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 text-sm">
            <p className="text-app-muted">{formatNumber(serverTotal)} servers matched.</p>
            {loadingServers ? (
              <span className="inline-flex items-center gap-2 text-app-muted">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading
              </span>
            ) : null}
          </div>

          <div className="mt-4 grid gap-3">
            {servers.map((server) => (
              <article className="app-panel-soft rounded-2xl border p-4" key={server.id}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold text-app-foreground">
                      {server.name}
                    </h3>
                    <p className="text-app-muted mt-1 line-clamp-2 text-sm">
                      {server.description ?? "No server description."}
                    </p>
                    <p className="text-app-soft mt-2 text-xs">
                      Owner: {server.owner.displayName} / Created {formatDate(server.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-[hsl(var(--primary)/0.12)] px-2.5 py-1 text-xs font-semibold text-app-accent">
                      {formatNumber(server.memberCount)} members
                    </span>
                    <span className="rounded-full bg-[hsl(var(--surface-card)/0.68)] px-2.5 py-1 text-xs font-semibold text-app-muted">
                      {server.isPublic ? "Public" : "Private"}
                    </span>
                    {server.discoverable ? (
                      <span className="rounded-full bg-[hsl(var(--success)/0.12)] px-2.5 py-1 text-xs font-semibold text-app-success">
                        Discoverable
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  <div className="rounded-2xl bg-[hsl(var(--surface-card)/0.55)] p-3">
                    <p className="text-app-soft text-xs">Channels</p>
                    <p className="text-app-foreground mt-1 font-semibold">
                      {formatNumber(server.channelCount)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-[hsl(var(--surface-card)/0.55)] p-3">
                    <p className="text-app-soft text-xs">Text</p>
                    <p className="text-app-foreground mt-1 font-semibold">
                      {formatNumber(server.textChannelCount)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-[hsl(var(--surface-card)/0.55)] p-3">
                    <p className="text-app-soft text-xs">Voice</p>
                    <p className="text-app-foreground mt-1 font-semibold">
                      {formatNumber(server.voiceChannelCount)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-[hsl(var(--surface-card)/0.55)] p-3">
                    <p className="text-app-soft text-xs">Messages</p>
                    <p className="text-app-foreground mt-1 font-semibold">
                      {formatNumber(server.messageCount)}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {server.channels.map((channel) => (
                    <span
                      className="rounded-full border border-[hsl(var(--border)/0.58)] bg-[hsl(var(--surface-card)/0.52)] px-2.5 py-1 text-xs text-app-muted"
                      key={channel.id}
                    >
                      #{channel.name} / {channel.type} / {formatNumber(channel.messageCount)}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      <Modal
        description={
          action?.banned
            ? "The user will be banned, active app sessions will be closed, and the action will be written to the admin audit trail."
            : "The user will be unbanned and the action will be written to the admin audit trail."
        }
        onClose={() => {
          if (!savingAction) {
            setAction(null);
          }
        }}
        open={Boolean(action)}
        title={action?.banned ? "Ban user" : "Unban user"}
      >
        {action ? (
          <div className="space-y-4">
            <div className="app-panel-soft flex items-center gap-3 rounded-2xl border p-3">
              <Avatar
                alt={action.user.displayName}
                className="h-10 w-10"
                fallback={action.user.username}
                src={action.user.avatarUrl}
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-app-foreground">
                  {action.user.displayName}
                </p>
                <p className="truncate text-xs text-app-soft">{action.user.email}</p>
              </div>
            </div>
            <Textarea
              disabled={savingAction}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Reason"
              value={reason}
            />
            <div className="flex justify-end gap-3">
              <Button
                disabled={savingAction}
                onClick={() => setAction(null)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button disabled={savingAction} onClick={submitAction} type="button">
                {savingAction ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {action.banned ? "Ban user" : "Unban user"}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </section>
  );
}
