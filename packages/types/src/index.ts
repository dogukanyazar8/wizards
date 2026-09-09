import { z } from "zod";

export interface HealthCheck {
  status: "ok";
  timestamp: string;
}

export const HealthCheckSchema = z.object({
  status: z.literal("ok"),
  timestamp: z.string().datetime(),
});

export type HealthCheckInput = z.infer<typeof HealthCheckSchema>;

export * from "./account-preferences";
export * from "./app-downloads";
export * from "./account-date-time";
export * from "./account-privacy";
export * from "./auth";
export * from "./auth-password-policy";
export * from "./auth-sessions";
export * from "./badges";
export * from "./bug-report";
export * from "./group-call";
export * from "./group-dm";
export * from "./group-dm-selection";
export * from "./group-dm-settings";
export * from "./group-invite";
export * from "./group-name";
export * from "./workspace";
export * from "./messages";
export * from "./messages-screen";
export * from "./mentions-screen";
export * from "./events-screen";
export * from "./discover-screen";
export * from "./poll";
export * from "./voice-message";
export * from "./mobile";
export * from "./mobile-admin";
export * from "./mobile-feedback";
export * from "./mobile-workspace-management";
export * from "./mobile-social";
export * from "./server-profile-presentation";
export * from "./server-icon";
export * from "./settings";
export * from "./socket";
export * from "./splash";
export * from "./voice-mini";
export * from "./voice-media-policy";
