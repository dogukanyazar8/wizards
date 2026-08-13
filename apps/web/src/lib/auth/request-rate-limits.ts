import { logError } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { getRedisRate } from "@/lib/redis";
import {
  createNetworkRateLimitIdentity,
  createSubjectRateLimitIdentity,
  type ClientIpHeaderSource,
} from "@/lib/security/client-ip";

export type AuthRequestRateLimitDependencies = {
  checkRateLimit: typeof checkRateLimit;
  getRedisRate: typeof getRedisRate;
  logError: typeof logError;
};

const defaultDependencies: AuthRequestRateLimitDependencies = {
  checkRateLimit,
  getRedisRate,
  logError,
};

type RateLimitRule = {
  key: string;
  limit: number;
  windowSeconds: number;
};

function createLayeredRules(input: {
  headers: ClientIpHeaderSource;
  limit: {
    network: number;
    subject: number;
  };
  scope: string;
  subject: {
    namespace: string;
    value: string;
  };
  windowSeconds: number;
}): RateLimitRule[] {
  const networkIdentity = createNetworkRateLimitIdentity({
    headers: input.headers,
  });
  const subjectIdentity = createSubjectRateLimitIdentity(
    input.subject.namespace,
    input.subject.value,
  );

  return [
    {
      key: `rate:auth:${input.scope}:network:${networkIdentity}`,
      limit: input.limit.network,
      windowSeconds: input.windowSeconds,
    },
    {
      key: `rate:auth:${input.scope}:subject:${subjectIdentity}`,
      limit: input.limit.subject,
      windowSeconds: input.windowSeconds,
    },
  ];
}

async function checkRules(
  scope: string,
  rules: RateLimitRule[],
  dependencies: AuthRequestRateLimitDependencies,
) {
  try {
    const redis = dependencies.getRedisRate();
    const results = await Promise.all(
      rules.map(({ key, limit, windowSeconds }) =>
        dependencies.checkRateLimit(redis, key, limit, windowSeconds),
      ),
    );
    return results.every(Boolean);
  } catch (error) {
    dependencies.logError(`[auth-rate-limit] ${scope} unavailable`, error);
    return false;
  }
}

async function checkCooldown(
  scope: string,
  key: string,
  dependencies: AuthRequestRateLimitDependencies,
) {
  try {
    return await dependencies.checkRateLimit(dependencies.getRedisRate(), key, 1, 60);
  } catch (error) {
    dependencies.logError(`[auth-rate-limit] ${scope} unavailable`, error);
    return false;
  }
}

function createCooldownKey(input: {
  headers: ClientIpHeaderSource;
  scope: string;
  subject: {
    namespace: string;
    value: string;
  };
}) {
  const networkIdentity = createNetworkRateLimitIdentity({
    headers: input.headers,
  });
  return `rate:auth:${input.scope}:cooldown:${createSubjectRateLimitIdentity(
    `${input.subject.namespace}-cooldown`,
    `${input.subject.value}\0${networkIdentity}`,
  )}`;
}

export function checkLoginRequestRateLimit(
  input: {
    email: string;
    headers: ClientIpHeaderSource;
  },
  dependencies: AuthRequestRateLimitDependencies = defaultDependencies,
) {
  const email = input.email.trim().toLowerCase();
  return checkRules(
    "login",
    createLayeredRules({
      headers: input.headers,
      limit: { network: 30, subject: 5 },
      scope: "login",
      subject: { namespace: "email", value: email },
      windowSeconds: 15 * 60,
    }),
    dependencies,
  );
}

export function checkRegistrationRequestRateLimit(
  input: {
    email: string;
    headers: ClientIpHeaderSource;
  },
  dependencies: AuthRequestRateLimitDependencies = defaultDependencies,
) {
  const email = input.email.trim().toLowerCase();
  return checkRules(
    "registration",
    createLayeredRules({
      headers: input.headers,
      limit: { network: 10, subject: 5 },
      scope: "registration",
      subject: { namespace: "email", value: email },
      windowSeconds: 60 * 60,
    }),
    dependencies,
  );
}

export function checkPasswordResetConsumeRateLimit(
  input: {
    headers: ClientIpHeaderSource;
    token: string;
  },
  dependencies: AuthRequestRateLimitDependencies = defaultDependencies,
) {
  return checkRules(
    "password-reset-consume",
    createLayeredRules({
      headers: input.headers,
      limit: { network: 10, subject: 5 },
      scope: "password-reset-consume",
      subject: { namespace: "password-reset-token", value: input.token },
      windowSeconds: 60 * 60,
    }),
    dependencies,
  );
}

export async function checkPasswordResetRequestRateLimit(
  input: {
    email: string;
    headers: ClientIpHeaderSource;
  },
  dependencies: AuthRequestRateLimitDependencies = defaultDependencies,
) {
  const subject = {
    namespace: "email",
    value: input.email.trim().toLowerCase(),
  };
  const scope = "password-reset-request";
  if (
    !(await checkCooldown(
      scope,
      createCooldownKey({ headers: input.headers, scope, subject }),
      dependencies,
    ))
  ) {
    return false;
  }

  return checkRules(
    scope,
    createLayeredRules({
      headers: input.headers,
      limit: { network: 10, subject: 5 },
      scope,
      subject,
      windowSeconds: 60 * 60,
    }),
    dependencies,
  );
}

export async function checkVerificationResendRequestRateLimit(
  input: {
    email: string;
    headers: ClientIpHeaderSource;
  },
  dependencies: AuthRequestRateLimitDependencies = defaultDependencies,
) {
  const subject = {
    namespace: "email",
    value: input.email.trim().toLowerCase(),
  };
  const scope = "verification-resend";
  if (
    !(await checkCooldown(
      scope,
      createCooldownKey({ headers: input.headers, scope, subject }),
      dependencies,
    ))
  ) {
    return false;
  }

  return checkRules(
    scope,
    createLayeredRules({
      headers: input.headers,
      limit: { network: 5, subject: 5 },
      scope,
      subject,
      windowSeconds: 60 * 60,
    }),
    dependencies,
  );
}

export function checkVerificationSendRequestRateLimit(
  input: {
    headers: ClientIpHeaderSource;
    userId: string;
  },
  dependencies: AuthRequestRateLimitDependencies = defaultDependencies,
) {
  return checkRules(
    "verification-send",
    createLayeredRules({
      headers: input.headers,
      limit: { network: 20, subject: 5 },
      scope: "verification-send",
      subject: { namespace: "user", value: input.userId },
      windowSeconds: 60 * 60,
    }),
    dependencies,
  );
}
