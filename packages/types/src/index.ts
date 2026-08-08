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

export * from "./auth";
export * from "./badges";
export * from "./group-dm";
export * from "./group-dm-selection";
export * from "./workspace";
export * from "./messages";
export * from "./mobile";
export * from "./mobile-admin";
export * from "./mobile-feedback";
export * from "./mobile-workspace-management";
export * from "./mobile-social";
export * from "./server-profile-presentation";
export * from "./socket";
export * from "./voice-mini";
