/** Settings overlays keep the user in their voice context; only real server/DM navigation returns. */
export function shouldShowVoiceReminder(
  pathname: string,
  voice: { serverId: string | null; channelId: string | null },
): boolean {
  if (!voice.serverId || !voice.channelId) return false;
  const [, root, rawServerId] = pathname.split("/");
  if (root !== "channels" || !rawServerId) return false;
  let serverId = rawServerId;
  try {
    serverId = decodeURIComponent(rawServerId);
  } catch {
    /* Invalid URL is not a matching server. */
  }
  return serverId === "@me" || serverId !== voice.serverId;
}
