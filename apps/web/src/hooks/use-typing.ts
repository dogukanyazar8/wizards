"use client";

import { useCallback, useEffect, useState } from "react";
import { useSocket } from "./use-socket";
import type { MessageMode } from "./use-messages";

export function useTyping(conversationId: string, mode: MessageMode = "channel") {
  const socket = useSocket();
  const [typingUsers, setTypingUsers] = useState<string[]>([]);

  const startTyping = useCallback(() => {
    if (mode === "channel") {
      socket.emit("typing:start", conversationId);
      return;
    }

    socket.emit("dm:typing:start", { conversationId });
  }, [conversationId, mode, socket]);

  const stopTyping = useCallback(() => {
    if (mode === "channel") {
      socket.emit("typing:stop", conversationId);
      return;
    }

    socket.emit("dm:typing:stop", { conversationId });
  }, [conversationId, mode, socket]);

  useEffect(() => {
    if (mode === "channel") {
      const handleTypingUpdate = (data: { channelId: string; users: string[] }) => {
        if (data.channelId === conversationId) {
          setTypingUsers(data.users);
        }
      };

      socket.on("typing:update", handleTypingUpdate);
      return () => {
        socket.off("typing:update", handleTypingUpdate);
      };
    }

    const handleTypingUpdate = (data: {
      conversationId: string;
      typingUsers: Array<{ userId: string; username: string }>;
    }) => {
      if (data.conversationId === conversationId) {
        setTypingUsers(data.typingUsers.map((user) => user.username));
      }
    };

    socket.on("dm:typing:update", handleTypingUpdate);
    return () => {
      socket.off("dm:typing:update", handleTypingUpdate);
    };
  }, [conversationId, mode, socket]);

  return { typingUsers, startTyping, stopTyping };
}
