export type ShellRouteContext = {
  readonly channelId: string | null;
  readonly pathname: string;
  readonly serverId: string | null;
};

export function resolveShellRouteContext(
  current: ShellRouteContext,
  lastWorkspaceRoute: ShellRouteContext,
): ShellRouteContext {
  const settingsRoute =
    current.pathname === "/settings" || current.pathname.startsWith("/settings/");

  return settingsRoute ? lastWorkspaceRoute : current;
}
