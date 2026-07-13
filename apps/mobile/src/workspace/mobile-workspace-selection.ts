export function resolveMobileWorkspaceServerSelection(
  currentServerId: string | null,
  servers: readonly { readonly id: string }[],
): string | null {
  if (currentServerId && servers.some((server) => server.id === currentServerId)) {
    return currentServerId;
  }

  return servers[0]?.id ?? null;
}
