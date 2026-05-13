import type { HandlerContext } from "../context";
import { registerChannelHandlers } from "./channel";
import { registerDMHandlers } from "./dm";
import { registerMessageHandlers } from "./message";
import { registerPresenceHandlers } from "./presence";
import { registerTypingHandlers } from "./typing";
import { registerVoiceHandlers } from "./voice";

export type SocketHandlerRegistration = {
  cleanup?: () => Promise<void>;
  stopDMTyping?: (conversationId: string) => Promise<void>;
};

export function composeSocketHandlerRegistration(
  registrations: readonly SocketHandlerRegistration[],
  options: {
    stopDMTyping?: (conversationId: string) => Promise<void>;
  } = {},
): SocketHandlerRegistration {
  let cleanupPromise: Promise<void> | null = null;

  const registration: SocketHandlerRegistration = {
    cleanup() {
      cleanupPromise ??= (async () => {
        for (const childRegistration of registrations) {
          await childRegistration.cleanup?.();
        }
      })().catch((error: unknown) => {
        cleanupPromise = null;
        throw error;
      });

      return cleanupPromise;
    },
  };

  if (options.stopDMTyping) {
    registration.stopDMTyping = options.stopDMTyping;
  }

  return registration;
}

export function registerSocketHandlers(ctx: HandlerContext): SocketHandlerRegistration {
  const typingRegistration = registerTypingHandlers(ctx);
  const dmRegistration = registerDMHandlers(
    ctx,
    typingRegistration.stopDMTyping ? { stopDMTyping: typingRegistration.stopDMTyping } : {},
  );
  const registrations = [
    registerChannelHandlers(ctx),
    typingRegistration,
    registerPresenceHandlers(ctx),
    registerVoiceHandlers(ctx),
    registerMessageHandlers(ctx),
    dmRegistration,
  ];

  return composeSocketHandlerRegistration(
    registrations,
    typingRegistration.stopDMTyping ? { stopDMTyping: typingRegistration.stopDMTyping } : {},
  );
}
