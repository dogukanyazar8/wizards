import { ApiError } from "@/lib/api";
import { logError } from "@/lib/logger";
import type { AppSocket } from "./context";
import type { VoiceInviteErrorPayload } from "./events";

export type DMErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "BLOCKED"
  | "RATE_LIMITED"
  | "RATE_LIMIT_UNAVAILABLE"
  | "VALIDATION_ERROR"
  | "NOT_FOUND";

const DM_ERROR_CODES = new Set<DMErrorCode>([
  "UNAUTHORIZED",
  "FORBIDDEN",
  "BLOCKED",
  "RATE_LIMITED",
  "RATE_LIMIT_UNAVAILABLE",
  "VALIDATION_ERROR",
  "NOT_FOUND",
]);

export type VoiceInviteErrorInput = {
  channelId?: string | undefined;
  code: string;
  error?: unknown;
  fallbackMessage: string;
  inviteId?: string | undefined;
  targetUserId?: string | undefined;
};

export function createDMErrorEmitter(socket: AppSocket) {
  return (code: DMErrorCode, message: string) => {
    socket.emit("dm:error", { code, message });
  };
}

export function createSocketErrorEmitter(socket: AppSocket) {
  return (code: string, fallbackMessage: string, error: unknown) => {
    if (error instanceof ApiError) {
      socket.emit("error", {
        code: error.code ?? code,
        message: error.message,
      });
      return;
    }

    logError(`[socket] ${code}`, error);
    socket.emit("error", {
      code,
      message: fallbackMessage,
    });
  };
}

export function createVoiceInviteErrorEmitter(socket: AppSocket) {
  return (input: VoiceInviteErrorInput) => {
    if (input.error instanceof ApiError) {
      const payload: VoiceInviteErrorPayload = {
        code: input.error.code ?? input.code,
        message: input.error.message,
      };
      if (input.channelId) {
        payload.channelId = input.channelId;
      }
      if (input.inviteId) {
        payload.inviteId = input.inviteId;
      }
      if (input.targetUserId) {
        payload.targetUserId = input.targetUserId;
      }
      socket.emit("voice:invite:error", payload);
      return;
    }

    if (input.error) {
      logError(`[socket] ${input.code}`, input.error);
    }

    const payload: VoiceInviteErrorPayload = {
      code: input.code,
      message: input.fallbackMessage,
    };
    if (input.channelId) {
      payload.channelId = input.channelId;
    }
    if (input.inviteId) {
      payload.inviteId = input.inviteId;
    }
    if (input.targetUserId) {
      payload.targetUserId = input.targetUserId;
    }
    socket.emit("voice:invite:error", payload);
  };
}

export function createSafeDMErrorEmitter(socket: AppSocket) {
  const emitDMError = createDMErrorEmitter(socket);

  return (code: DMErrorCode, fallbackMessage: string, error: unknown) => {
    if (error instanceof ApiError) {
      const apiCode = DM_ERROR_CODES.has(error.code as DMErrorCode)
        ? (error.code as DMErrorCode)
        : code;
      emitDMError(apiCode, error.message);
      return;
    }

    logError(`[socket] dm:${code}`, error);
    emitDMError(code, fallbackMessage);
  };
}
