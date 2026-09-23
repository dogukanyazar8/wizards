import type { AppSocketServer } from "@/lib/socket/runtime";

/**
 * What a rolling deploy owes the clients it is about to drop.
 *
 * Close the transport through Server.close(), without a terminal namespace
 * DISCONNECT packet. Clients retain their normal reconnection backoff; missed
 * events are reconciled by the client after the next authenticated connection.
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

  const closedSockets = server.sockets?.sockets.size ?? 0;

  const closed = new Promise<"drained">((resolve) => {
    server.close(() => resolve("drained"));
  });
  const timedOut = (dependencies.waitMs ?? defaultWait)(SOCKET_DRAIN_GRACE_MS).then(
    () => "timeout" as const,
  );

  const status = await Promise.race([closed, timedOut]);
  return { closedSockets, status };
}
