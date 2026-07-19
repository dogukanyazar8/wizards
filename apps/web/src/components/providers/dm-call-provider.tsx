"use client";

import { createContext, useContext, type ReactNode } from "react";

import { DmCallBar } from "@/components/dm/dm-call-bar";
import { IncomingDMCallDialog } from "@/components/dm/incoming-call-dialog";
import { useDMCallController, type DMCallActions } from "@/hooks/use-dm-call";

const DMCallContext = createContext<DMCallActions | null>(null);

/**
 * Mounts the single DM call controller and rings from anywhere in the app, so a call
 * reaches the user even when they are not on the conversation it belongs to.
 */
export function DMCallProvider({ children }: { children: ReactNode }) {
  const actions = useDMCallController();

  return (
    <DMCallContext.Provider value={actions}>
      {children}
      <DmCallBar onLeave={actions.endCall} />
      <IncomingDMCallDialog onAccept={actions.acceptCall} onDecline={actions.declineCall} />
    </DMCallContext.Provider>
  );
}

export function useDMCallActions() {
  const value = useContext(DMCallContext);

  if (!value) {
    throw new Error("useDMCallActions must be used within DMCallProvider");
  }

  return value;
}
