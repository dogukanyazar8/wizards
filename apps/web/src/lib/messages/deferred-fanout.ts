import { logError } from "@/lib/logger";

/**
 * Work the author must not wait for.
 *
 * A send used to answer only once the fan-out had finished: two presence lookups,
 * a permission filter across every active member, then the emits. None of that is
 * the sender's business — their message is durable the moment the transaction
 * commits, and the recipients' copies are already guaranteed by the notification
 * outbox written inside it. Holding the ack behind the fan-out only made the
 * sender's tick wait for other people's screens. A device baseline measured that
 * ack at 809ms p50.
 *
 * Fire-and-forget with two rules: a failure is logged rather than lost, and a
 * rejection can never escape as an unhandled one — this runs after the response
 * has gone, where nothing is left to catch it.
 */
export function deferMessageFanout(
  label: string,
  task: () => Promise<unknown>,
  onError: (scope: string, error: unknown) => void = logError,
): Promise<void> {
  let started: Promise<unknown>;

  try {
    started = Promise.resolve(task());
  } catch (error) {
    // A synchronous throw inside the task is still the task failing.
    onError(label, error);
    return Promise.resolve();
  }

  return started.then(
    () => undefined,
    (error: unknown) => {
      onError(label, error);
    },
  );
}
