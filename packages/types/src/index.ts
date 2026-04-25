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
export * from "./workspace";
export * from "./messages";
