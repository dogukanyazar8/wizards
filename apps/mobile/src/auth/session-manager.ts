import {
  MOBILE_SESSION_SCHEMA_VERSION,
  type MobileAuthState,
  type MobileAuthStatus,
  type MobileSessionDiagnostics,
  type MobileSessionSnapshot,
  type MobileSessionTokens,
  type MobileSessionUser,
} from "./session-types";

const MAX_TOKEN_LENGTH = 8192;
const MIN_TOKEN_LENGTH = 16;
const MAX_SCOPE_COUNT = 50;
const EXPIRY_SKEW_MS = 30_000;
const REFRESH_WINDOW_MS = 5 * 60_000;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeNullableString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeAvatarUrl(value: unknown): string | null {
  const normalized = normalizeNullableString(value);
  if (!normalized) {
    return null;
  }

  try {
    const url = new URL(normalized);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function isValidMobileSecretToken(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  const trimmed = value.trim();
  return (
    trimmed === value &&
    trimmed.length >= MIN_TOKEN_LENGTH &&
    trimmed.length <= MAX_TOKEN_LENGTH &&
    !/\s/.test(trimmed)
  );
}

export function normalizeMobileSessionUser(value: unknown): MobileSessionUser | null {
  if (!isPlainObject(value) || !isNonEmptyString(value.id) || !isNonEmptyString(value.username)) {
    return null;
  }

  return {
    avatarUrl: normalizeAvatarUrl(value.avatarUrl),
    displayName: normalizeNullableString(value.displayName),
    id: value.id.trim(),
    username: value.username.trim(),
  };
}

export function normalizeMobileSessionTokens(value: unknown): MobileSessionTokens | null {
  if (!isPlainObject(value) || !isValidMobileSecretToken(value.accessToken)) {
    return null;
  }

  if (value.tokenType !== "Bearer") {
    return null;
  }

  if (typeof value.expiresAt !== "number" || !Number.isFinite(value.expiresAt)) {
    return null;
  }

  if (typeof value.issuedAt !== "number" || !Number.isFinite(value.issuedAt)) {
    return null;
  }

  const refreshToken =
    value.refreshToken === null || value.refreshToken === undefined
      ? null
      : isValidMobileSecretToken(value.refreshToken)
        ? value.refreshToken
        : null;

  const scopes = Array.isArray(value.scopes)
    ? value.scopes
        .filter((scope): scope is string => typeof scope === "string" && scope.trim().length > 0)
        .map((scope) => scope.trim())
        .slice(0, MAX_SCOPE_COUNT)
    : [];

  return {
    accessToken: value.accessToken,
    expiresAt: Math.trunc(value.expiresAt),
    issuedAt: Math.trunc(value.issuedAt),
    refreshToken,
    scopes,
    tokenType: "Bearer",
  };
}

export function normalizeMobileSessionSnapshot(value: unknown): MobileSessionSnapshot | null {
  if (!isPlainObject(value) || value.schemaVersion !== MOBILE_SESSION_SCHEMA_VERSION) {
    return null;
  }

  if (typeof value.lastValidatedAt !== "number" || !Number.isFinite(value.lastValidatedAt)) {
    return null;
  }

  const user = normalizeMobileSessionUser(value.user);
  const tokens = normalizeMobileSessionTokens(value.tokens);

  if (!user || !tokens) {
    return null;
  }

  return {
    lastValidatedAt: Math.trunc(value.lastValidatedAt),
    schemaVersion: MOBILE_SESSION_SCHEMA_VERSION,
    tokens,
    user,
  };
}

export function isMobileSessionExpired(
  session: MobileSessionSnapshot,
  nowMs = Date.now(),
  skewMs = EXPIRY_SKEW_MS,
): boolean {
  return nowMs + skewMs >= session.tokens.expiresAt;
}

export function shouldRefreshMobileSession(
  session: MobileSessionSnapshot,
  nowMs = Date.now(),
  refreshWindowMs = REFRESH_WINDOW_MS,
): boolean {
  if (!session.tokens.refreshToken) {
    return false;
  }

  return nowMs + refreshWindowMs >= session.tokens.expiresAt;
}

export function createMobileAuthState(
  status: MobileAuthStatus,
  session: MobileSessionSnapshot | null = null,
  error: string | null = null,
): MobileAuthState {
  return {
    error,
    session,
    status,
  };
}

export function getMobileSessionDiagnostics(
  state: MobileAuthState,
  nowMs = Date.now(),
): MobileSessionDiagnostics {
  const expiresAt = state.session?.tokens.expiresAt ?? null;

  return {
    hasRefreshToken: Boolean(state.session?.tokens.refreshToken),
    hasSession: Boolean(state.session),
    isExpired: state.session ? isMobileSessionExpired(state.session, nowMs) : false,
    scopeCount: state.session?.tokens.scopes.length ?? 0,
    secondsUntilExpiry: expiresAt ? Math.max(0, Math.floor((expiresAt - nowMs) / 1000)) : null,
    status: state.status,
  };
}
