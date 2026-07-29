import type { AppSocketServer } from "@/lib/socket/runtime";

/**
 * What a rolling deploy owes the clients it is about to drop.
 *
 * Without this the process died mid-connection: every socket saw a transport
 * error instead of a close, reconnected into the *old* pod's dying socket, and
 * the gap between the last event it received and the first after reconnect was
 * silent data loss. Telling them to reconnect first is what turns a deploy into a
 * reconnect rather than a hole.
 */
export const SOCKET_DRAIN_GRACE_MS = 5_000;

export type SocketDrainResult = {
  readonly closedSockets: number;
  readonly status: "drained" | "no-server" | "timeout";
};

export type SocketDrainDependencies = {
  readonly now?: () => number;
  readonly server:
    | (Pick<AppSocketServer, "close"> & {
        readonly sockets?: { readonly sockets: Map<string, { disconnect(close: boolean): void }> };
      })
    | null;
  readonly waitMs?: (ms: number) => Promise<void>;
};

const defaultWait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function drainSocketServer(
  dependencies: SocketDrainDependencies,
): Promise<SocketDrainResult> {
  const server = dependencies.server;
  if (!server) {
    return { closedSockets: 0, status: "no-server" };
  }

  const connected = server.sockets?.sockets;
  let closedSockets = 0;

  if (connected) {
    for (const socket of connected.values()) {
      // `true` closes the underlying transport: the client sees a clean close and
      // reconnects on its own backoff instead of waiting for a timeout.
      socket.disconnect(true);
      closedSockets += 1;
    }
  }

  const closed = new Promise<"drained">((resolve) => {
    server.close(() => resolve("drained"));
  });
  const timedOut = (dependencies.waitMs ?? defaultWait)(SOCKET_DRAIN_GRACE_MS).then(
    () => "timeout" as const,
  );

  const status = await Promise.race([closed, timedOut]);
  return { closedSockets, status };
}
