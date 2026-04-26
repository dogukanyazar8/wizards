"use client";

import { useCallback, useEffect, useState } from "react";
import { useSocket } from "./use-socket";

export function useTyping(channelId: string) {
  const socket = useSocket();
  const [typingUsers, setTypingUsers] = useState<string[]>([]);

  const startTyping = useCallback(() => {
    socket.emit("typing:start", channelId);
  }, [channelId, socket]);

  const stopTyping = useCallback(() => {
    socket.emit("typing:stop", channelId);
  }, [channelId, socket]);

  useEffect(() => {
    const handleTypingUpdate = (data: { channelId: string; users: string[] }) => {
      if (data.channelId === channelId) {
        setTypingUsers(data.users);
      }
    };

    socket.on("typing:update", handleTypingUpdate);
    return () => {
      socket.off("typing:update", handleTypingUpdate);
    };
  }, [channelId, socket]);

  return { typingUsers, startTyping, stopTyping };
}
