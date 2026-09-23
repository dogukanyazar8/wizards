import type { Socket } from "socket.io-client";
import { SOCKET_SESSION_CHECK_UNAVAILABLE } from "./events";

/** The manager owns transport retries. Only temporary middleware refusals need
 * an explicit retry, because Socket.IO marks those sockets inactive. */
export function attachSocketLifecycle(socket: Socket, random: () => number = Math.random) {
  let stopped = false;
  let terminal = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  const schedule = () => {
    if (stopped || terminal || timer || socket.connected || socket.active) return;
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempt++, 5) * (0.5 + random()));
    timer = setTimeout(() => {
      timer = undefined;
      if (!stopped && !terminal && !socket.connected && !socket.active) socket.connect();
    }, delay);
  };
  const connected = () => {
    cancel();
    attempt = 0;
    terminal = false;
  };
  const disconnected = (reason: string) => {
    if (reason === "io server disconnect" || reason === "io client disconnect") {
      terminal = true;
      cancel();
    }
  };
  const failed = (error: Error & { data?: { code?: string } }) => {
    if (error.data?.code === SOCKET_SESSION_CHECK_UNAVAILABLE) {
      schedule();
    } else if (!socket.active) {
      terminal = true;
      cancel();
    }
  };
  socket.on("connect", connected);
  socket.on("disconnect", disconnected);
  socket.on("connect_error", failed);
  socket.connect();
  return {
    wake: schedule,
    stop() {
      stopped = true;
      cancel();
      socket.off("connect", connected);
      socket.off("disconnect", disconnected);
      socket.off("connect_error", failed);
      socket.disconnect();
    },
  };
}
