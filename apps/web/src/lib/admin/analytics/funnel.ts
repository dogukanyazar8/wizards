import type { AnalyticsClientType } from "@wizards/db";

export type FunnelStepId = "signup" | "email_verified" | "first_session" | "first_message";

export type FunnelStep = {
  count: number;
  /**
   * False for the steps that happen before any client identifies itself. A
   * platform filter cannot narrow them, and quietly showing the same number
   * under a platform chip would read as "every signup came from Mobile".
   */
  platformSplittable: boolean;
  step: FunnelStepId;
};

export type FunnelInput = {
  emailVerifiedCount: number;
  firstMessageCountByPlatform: Partial<Record<AnalyticsClientType, number>> & { ALL: number };
  firstSessionCountByPlatform: Partial<Record<AnalyticsClientType, number>> & { ALL: number };
  signupCount: number;
};

export type FunnelPlatform = AnalyticsClientType | "ALL";

/**
 * Signup and email verification are recorded before a session exists, so they
 * carry no platform. The two later steps do, and only those react to the chip.
 */
export function buildFunnel(input: FunnelInput, platform: FunnelPlatform = "ALL"): FunnelStep[] {
  const readPlatform = (counts: Partial<Record<AnalyticsClientType, number>> & { ALL: number }) =>
    platform === "ALL" ? counts.ALL : (counts[platform] ?? 0);

  return [
    { count: input.signupCount, platformSplittable: false, step: "signup" },
    { count: input.emailVerifiedCount, platformSplittable: false, step: "email_verified" },
    {
      count: readPlatform(input.firstSessionCountByPlatform),
      platformSplittable: true,
      step: "first_session",
    },
    {
      count: readPlatform(input.firstMessageCountByPlatform),
      platformSplittable: true,
      step: "first_message",
    },
  ];
}

export function getFunnelConversionPercent(step: FunnelStep, previous: FunnelStep | undefined) {
  if (!previous || previous.count === 0) {
    return null;
  }

  return Math.round((step.count / previous.count) * 1000) / 10;
}
