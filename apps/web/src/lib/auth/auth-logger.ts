import { AuthError, type NextAuthConfig } from "next-auth";
import { errors } from "jose";
import { logError, logWarning } from "@/lib/logger";

export const authLogger = {
  error(error) {
    const authError = error instanceof AuthError ? error : null;
    const cause = authError?.cause?.err;
    if (
      authError?.type === "JWTSessionError" &&
      cause instanceof errors.JWTExpired &&
      cause.claim === "exp"
    ) {
      // An expired session is anonymous. Auth.js still removes its cookies;
      // logging the exception would disclose its decrypted JWT payload.
      return;
    }
    // Allowlist diagnostics instead of passing AuthError/cause to a logger:
    // upstream attaches decrypted claims, provider responses and credentials.
    logError("[auth]", {
      type: authError?.type ?? "UnknownError",
      ...(cause instanceof errors.JOSEError ? { code: cause.code } : {}),
    });
  },
  warn(code) {
    logWarning("[auth]", { code });
  },
  debug(_message: string, _metadata?: unknown) {
    // Auth.js debug metadata can contain tokens even with debug: false when a
    // custom logger is configured. Never forward that metadata.
  },
} satisfies NonNullable<NextAuthConfig["logger"]>;
