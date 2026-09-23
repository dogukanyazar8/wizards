import type { Socket } from "socket.io-client";
import type {
  AcknowledgedClientToServerEvents,
  ClientToServerEvents,
  MessageSendAck,
  ServerToClientEvents,
} from "@/lib/socket/events";

type SendPayload = Omit<Parameters<ClientToServerEvents["message:send"]>[0], "channelId"> & {
  clientNonce: string;
};
type SendResult = MessageSendAck | { ok: false; message?: undefined };

/** A nonce owns one current attempt. Echoes, retries and unmount retire earlier callbacks. */
export function createMessageSendTracker(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
) {
  const attempts = new Map<string, symbol>();
  const acknowledgedSocket = socket as Socket<
    ServerToClientEvents,
    AcknowledgedClientToServerEvents
  >;
  return {
    confirm(nonce: string) {
      attempts.delete(nonce);
    },
    dispose() {
      attempts.clear();
    },
    send(
      mode: "channel" | "dm",
      conversationId: string,
      payload: SendPayload,
      onResult: (result: SendResult) => void,
    ) {
      const attempt = Symbol();
      attempts.set(payload.clientNonce, attempt);
      const complete = (error: Error | null, ack?: MessageSendAck) => {
        if (attempts.get(payload.clientNonce) !== attempt) return;
        attempts.delete(payload.clientNonce);
        onResult(error || !ack ? { ok: false } : ack);
      };
      if (mode === "channel") {
        acknowledgedSocket
          .timeout(10_000)
          .emit("message:send", { ...payload, channelId: conversationId }, complete);
      } else {
        acknowledgedSocket
          .timeout(10_000)
          .emit("dm:message:send", { ...payload, conversationId }, complete);
      }
    },
  };
}
