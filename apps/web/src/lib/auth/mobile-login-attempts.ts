import { createHash } from "node:crypto";

import { createAttemptTracker, type AttemptStore } from "./attempt-tracker";

const MOBILE_LOGIN_ATTEMPT_WINDOW_SECONDS = 15 * 60;
const MOBILE_LOGIN_FREE_FAILURES = 4;
const MOBILE_LOGIN_INITIAL_BACKOFF_MS = 30 * 1_000;
const MOBILE_LOGIN_MAX_BACKOFF_MS = 15 * 60 * 1_000;

const mobileLoginAttemptTracker = createAttemptTracker({
  freeFailures: MOBILE_LOGIN_FREE_FAILURES,
  initialBackoffMs: MOBILE_LOGIN_INITIAL_BACKOFF_MS,
  keyPrefix: "rate:mobile-login:account",
  maxBackoffMs: MOBILE_LOGIN_MAX_BACKOFF_MS,
  windowSeconds: MOBILE_LOGIN_ATTEMPT_WINDOW_SECONDS,
});

function getMobileLoginAccountIdentifier(email: string) {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("base64url");
}

export function getMobileLoginAttemptKey(email: string) {
  return mobileLoginAttemptTracker.getKey(getMobileLoginAccountIdentifier(email));
}

export function assertMobileLoginAttemptAllowed(args: {
  email: string;
  nowMs: number;
  store: AttemptStore;
}) {
  return mobileLoginAttemptTracker.assertAllowed({
    identifier: getMobileLoginAccountIdentifier(args.email),
    nowMs: args.nowMs,
    store: args.store,
  });
}

export function recordMobileLoginAttemptFailure(args: {
  email: string;
  nowMs: number;
  store: AttemptStore;
}) {
  return mobileLoginAttemptTracker.recordFailure({
    identifier: getMobileLoginAccountIdentifier(args.email),
    nowMs: args.nowMs,
    store: args.store,
  });
}

export function resetMobileLoginAttemptFailures(args: {
  email: string;
  store: AttemptStore;
}) {
  return mobileLoginAttemptTracker.resetFailures({
    identifier: getMobileLoginAccountIdentifier(args.email),
    store: args.store,
  });
}
