import { logError } from "@/lib/logger";
import { drainSocketServer } from "@/lib/socket/drain";
import type { AppSocketServer } from "@/lib/socket/runtime";

const DRAIN_SIGNALS = ["SIGINT", "SIGTERM"] as const;

let installed = false;

/**
 * Turns a rolling deploy into a reconnect instead of a hole.
 *
 * The platform sends SIGTERM and then kills the process; without a handler every
 * open socket died mid-connection, so clients saw a transport error rather than a
 * close and the events between their last one and the reconnect were simply lost.
 *
 * Installed once per process, and it never blocks shutdown for longer than the
 * drain grace: a deploy that cannot finish draining still has to finish.
 */
export function installSocketDrainHandlers(io: AppSocketServer): void {
  if (installed) {
    return;
  }
  installed = true;

  for (const signal of DRAIN_SIGNALS) {
    process.once(signal, () => {
      void drainSocketServer({ server: io })
        .catch((error) => {
          logError("[socket] Drain failed during shutdown", error);
          return null;
        })
        .finally(() => {
          process.exit(0);
        });
    });
  }
}
