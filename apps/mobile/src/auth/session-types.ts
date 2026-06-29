export const MOBILE_SESSION_SCHEMA_VERSION = 1;

export type MobileSessionTokenType = "Bearer";

export interface MobileSessionUser {
  avatarUrl: string | null;
  displayName: string | null;
  id: string;
  username: string;
}

export interface MobileSessionTokens {
  accessToken: string;
  expiresAt: number;
  issuedAt: number;
  refreshToken: string | null;
  scopes: readonly string[];
  tokenType: MobileSessionTokenType;
}

export interface MobileSessionSnapshot {
  lastValidatedAt: number;
  schemaVersion: typeof MOBILE_SESSION_SCHEMA_VERSION;
  tokens: MobileSessionTokens;
  user: MobileSessionUser;
}

export type MobileAuthStatus = "checking" | "signed-out" | "signed-in" | "error";

export interface MobileAuthState {
  error: string | null;
  session: MobileSessionSnapshot | null;
  status: MobileAuthStatus;
}

export interface MobileSessionDiagnostics {
  hasRefreshToken: boolean;
  hasSession: boolean;
  isExpired: boolean;
  scopeCount: number;
  secondsUntilExpiry: number | null;
  status: MobileAuthStatus;
}
