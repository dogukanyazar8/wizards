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

export function registerSocketHandlers(ctx: HandlerContext): SocketHandlerRegistration {
  const typingRegistration = registerTypingHandlers(ctx);
  const dmRegistration = registerDMHandlers(
    ctx,
    typingRegistration.stopDMTyping
      ? { stopDMTyping: typingRegistration.stopDMTyping }
      : {},
  );
  const registrations = [
    registerChannelHandlers(ctx),
    typingRegistration,
    registerPresenceHandlers(ctx),
    registerVoiceHandlers(ctx),
    registerMessageHandlers(ctx),
    dmRegistration,
  ];

  const registration: SocketHandlerRegistration = {
    async cleanup() {
      for (const registration of registrations) {
        await registration.cleanup?.();
      }
    },
  };

  if (typingRegistration.stopDMTyping) {
    registration.stopDMTyping = typingRegistration.stopDMTyping;
  }

  return registration;
}
