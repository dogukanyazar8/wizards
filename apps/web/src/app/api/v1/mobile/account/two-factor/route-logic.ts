import {
  MobileTwoFactorConfirmRequestSchema,
  MobileTwoFactorConfirmResponseSchema,
  MobileTwoFactorDisableRequestSchema,
  MobileTwoFactorDisableResponseSchema,
  MobileTwoFactorSetupResponseSchema,
} from "@wizards/types";

import { enforceApiRateLimit, type ApiRateLimitAction } from "@/lib/api-rate-limit";
import { ApiError, jsonError, parseJsonBody } from "@/lib/api";
import { requireMobileApiUserId } from "@/lib/auth/api";
import {
  confirmTwoFactorSetup,
  disableTwoFactor,
  startTwoFactorSetup,
  type ConfirmTwoFactorSetupResult,
  type StartTwoFactorSetupResult,
  type TwoFactorFailureResult,
  type TwoFactorSuccessResult,
} from "@/lib/auth/two-factor";

type DisableResult = TwoFactorSuccessResult | TwoFactorFailureResult;

export type MobileTwoFactorRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  confirm(input: { code: string; userId: string }): Promise<ConfirmTwoFactorSetupResult>;
  disable(input: { code: string; password: string; userId: string }): Promise<DisableResult>;
  enforceRateLimit(userId: string, action: ApiRateLimitAction): Promise<void>;
  parseBody: typeof parseJsonBody;
  setup(userId: string): Promise<StartTwoFactorSetupResult>;
};

const defaultDependencies: MobileTwoFactorRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  confirm: confirmTwoFactorSetup,
  disable: disableTwoFactor,
  enforceRateLimit: enforceApiRateLimit,
  parseBody: (request, schema) => parseJsonBody(request, schema),
  setup: startTwoFactorSetup,
};

function unwrapTwoFactorResult<T extends { success: boolean }>(
  result: T,
): Extract<T, { success: true }> {
  if (result.success) {
    return result as Extract<T, { success: true }>;
  }

  const failure = result as unknown as TwoFactorFailureResult;
  switch (failure.error) {
    case "invalid_credentials":
      throw new ApiError("Invalid credentials", 401, "INVALID_CREDENTIALS");
    case "invalid_code":
      throw new ApiError("Invalid two-factor code", 400, "INVALID_CODE");
    case "not_found":
      throw new ApiError("Account not found", 404, "USER_NOT_FOUND");
    case "rate_limited":
      throw new ApiError("Too many attempts", 429, "RATE_LIMITED");
    case "already_enabled":
      throw new ApiError("Two-factor authentication is already enabled", 409, "ALREADY_ENABLED");
    case "not_enabled":
      throw new ApiError("Two-factor authentication is not enabled", 409, "NOT_ENABLED");
    case "setup_required":
      throw new ApiError("Two-factor setup is required", 409, "SETUP_REQUIRED");
  }
}

async function authorize(request: Request, dependencies: MobileTwoFactorRouteDependencies) {
  const userId = await dependencies.authenticate(request);
  await dependencies.enforceRateLimit(userId, "mobile:account:two-factor");
  return userId;
}

export async function mobileTwoFactorSetupRoute(
  request: Request,
  dependencies: MobileTwoFactorRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await authorize(request, dependencies);
    const result = unwrapTwoFactorResult(await dependencies.setup(userId));
    return Response.json(
      MobileTwoFactorSetupResponseSchema.parse({
        manualEntryKey: result.manualEntryKey,
        otpauthUri: result.otpauthUri,
        qrCodeDataUrl: result.qrCodeDataUrl,
      }),
    );
  } catch (error) {
    return jsonError(error);
  }
}

export async function mobileTwoFactorConfirmRoute(
  request: Request,
  dependencies: MobileTwoFactorRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await authorize(request, dependencies);
    const { code } = await dependencies.parseBody(request, MobileTwoFactorConfirmRequestSchema);
    const result = unwrapTwoFactorResult(await dependencies.confirm({ code, userId }));
    return Response.json(
      MobileTwoFactorConfirmResponseSchema.parse({ recoveryCodes: result.recoveryCodes }),
    );
  } catch (error) {
    return jsonError(error);
  }
}

export async function mobileTwoFactorDisableRoute(
  request: Request,
  dependencies: MobileTwoFactorRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await authorize(request, dependencies);
    const input = await dependencies.parseBody(request, MobileTwoFactorDisableRequestSchema);
    unwrapTwoFactorResult(await dependencies.disable({ ...input, userId }));
    return Response.json(MobileTwoFactorDisableResponseSchema.parse({ success: true }));
  } catch (error) {
    return jsonError(error);
  }
}
