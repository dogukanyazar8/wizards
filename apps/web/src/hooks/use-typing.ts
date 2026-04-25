"use client";

import { useEffect, useState } from "react";
import { useSocket } from "./use-socket";

export function useTyping(channelId: string) {
  const socket = useSocket();
  const [typingUsers, setTypingUsers] = useState<string[]>([]);

  const startTyping = () => {
    socket.emit("typing:start", channelId);
  };

  const stopTyping = () => {
    socket.emit("typing:stop", channelId);
  };

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
