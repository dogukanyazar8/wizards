import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState, Linking, Platform, type AppStateStatus } from "react-native";
import * as WebBrowser from "expo-web-browser";
import {
  createMobileApiClient,
  MobileApiError,
  type MobileApiClient,
} from "../api/mobile-api-client";
import { setMobileCrashReportTokenReader } from "../feedback/mobile-crash-report-bridge";
import { revokeMobilePushToken } from "../notifications/mobile-notification-client";
import { getMobileRuntimeConfig, type MobileEnvironmentConfig } from "../config/environment";
import {
  buildMobileWebRegisterUrl,
  buildMobileWebSignInUrl,
  buildMobileWebSocialSignInUrl,
  parseMobileDeepLink,
} from "../deep-link/mobile-deep-links";
import type { MobileAuthLiveSocialProviderId } from "./mobile-auth-social-config";
import { runMobileSocialAuthSession } from "./mobile-social-auth-session";
import {
  assessMobileDeviceIntegrity,
  createMobileDeviceIntegritySignal,
  type MobileDeviceIntegrityDetector,
  type MobileDeviceIntegrityStatus,
  type MobileSecuritySignalLogger,
} from "../security/mobile-device-integrity";
import {
  assessMobileAppLockAvailability,
  runMobileAppLockAuthentication,
  shouldArmMobileAppLock,
  type MobileAppLockAvailability,
  type MobileAppLockStatus,
  type MobileBiometricAuthenticator,
} from "../security/mobile-app-lock";
import { activeMobileCopy } from "../locale/mobile-locale-preferences";
import { mobileSecureSessionRepository } from "./expo-secure-session-store";
import type { MobileAppLockPreferenceStore } from "./mobile-app-lock-preference-store";
import { mobileGoogleNativeSignInClient } from "./mobile-google-signin-client";
import {
  runMobileGoogleNativeSignIn,
  type MobileGoogleNativeSignInClient,
  type MobileGoogleNativeSignInFailureReason,
} from "./mobile-google-native-sign-in";
import { addMobileGoogleSignInFallbackBreadcrumb } from "../observability/mobile-sentry";
import {
  exchangeMobileAuthHandoff,
  refreshMobileAuthSession,
  registerMobileWithPassword,
  requestMobilePasswordReset,
  requestMobileVerificationEmail,
  revokeMobileAuthSession,
  signInMobileWithGoogleIdToken,
  signInMobileWithPassword,
} from "./mobile-auth-exchange";
import { getMobilePasswordSignInFailure } from "./mobile-auth-error-mapping";
import {
  createMobileAuthState,
  getMobileSessionDiagnostics,
  isMobileSessionExpired,
  replaceMobileSessionUser,
  shouldRefreshMobileSession,
} from "./session-manager";
import type {
  MobileAuthState,
  MobileSessionDiagnostics,
  MobileSessionSnapshot,
  MobileSessionUser,
} from "./session-types";
import type { MobileSessionRepository } from "./session-store";

const appLockCopy = activeMobileCopy;

/** Enough to cover a retried hand-off without growing the map unbounded. */
const MAX_TRACKED_HANDOFF_EXCHANGES = 8;

/**
 * The refresh call is not user-blocking and it runs while the app is still
 * painting its first frame, so it gets a longer budget than the shared client's
 * 12s: a cold API container regularly needs more than that, and an abort here
 * used to cost the user their session.
 */
const SESSION_REFRESH_TIMEOUT_MS = 30_000;

/**
 * A failed refresh no longer ends the session, so every subsequent API call
 * would otherwise retry it. Back off between attempts so a server outage cannot
 * burn the refresh rate limit.
 */
const SESSION_REFRESH_RETRY_COOLDOWN_MS = 15_000;

/**
 * Only the API can end a session. A rejected refresh token (401) means the
 * server has forgotten this session and the stored credentials are worthless.
 * Everything else — timeout, offline, 5xx, rate limit — is transient and must
 * leave the stored credentials untouched, otherwise a flaky network signs the
 * user out permanently.
 */
function isMobileSessionRejected(error: unknown): boolean {
  return error instanceof MobileApiError && error.status === 401;
}

/**
 * The browser fallback is deliberately silent for the user, which also hid the
 * cause from us: an APK built without the Google client id looks exactly like a
 * device without Play services. Log it loudly in development and leave a Sentry
 * breadcrumb everywhere else.
 */
function reportMobileGoogleSignInFallback(failure: {
  detail?: string;
  reason: MobileGoogleNativeSignInFailureReason;
}) {
  if (__DEV__) {
    console.warn(
      `[whispr] native Google sign-in unavailable (${failure.reason}); falling back to the browser hand-off.` +
        (failure.detail ? ` ${failure.detail}` : ""),
    );
  }

  addMobileGoogleSignInFallbackBreadcrumb(failure);
}

// disableDeviceFallback stays false so the OS device-passcode fallback is always
// offered; combined with the on-screen sign-out escape the user can never be trapped.
const APP_LOCK_PROMPT_OPTIONS = {
  cancelLabel: appLockCopy.appLockCancelAction,
  disableDeviceFallback: false,
  fallbackLabel: "",
  promptMessage: appLockCopy.appLockScreenTitle,
} as const;

export type MobileSocialSignInResult =
  | { readonly ok: true; readonly via: "external-browser" | "in-app" | "native" }
  | { readonly ok: false; readonly reason: "cancelled" | "failed" };

export interface MobileAuthContextValue extends MobileAuthState {
  apiClient: MobileApiClient;
  appLockAvailability: MobileAppLockAvailability;
  appLockEnabled: boolean;
  appLockLocked: boolean;
  appLockStatus: MobileAppLockStatus;
  completeAuthHandoff(input: { callbackPath: string; handoffToken: string }): Promise<boolean>;
  deviceIntegrityStatus: MobileDeviceIntegrityStatus;
  deviceIntegrityWarningVisible: boolean;
  diagnostics: MobileSessionDiagnostics;
  dismissDeviceIntegrityWarning(): void;
  getAccessToken(): Promise<string | null>;
  openWebRegister(): Promise<void>;
  openWebSignIn(): Promise<void>;
  startSocialSignIn(provider: MobileAuthLiveSocialProviderId): Promise<MobileSocialSignInResult>;
  registerWithPassword(input: {
    confirmPassword: string;
    email: string;
    password: string;
    username: string;
  }): Promise<{ email: string; ok: true } | { message: string; ok: false }>;
  requestPasswordReset(input: {
    email: string;
  }): Promise<
    { email: string; ok: true; resetLinkTtlMinutes?: number } | { message: string; ok: false }
  >;
  requestVerificationEmail(input: {
    email: string;
  }): Promise<{ email: string; ok: true } | { message: string; ok: false }>;
  refreshSessionFromStorage(): Promise<void>;
  replaceSessionUser(user: MobileSessionUser): Promise<boolean>;
  retryAppLockUnlock(): Promise<boolean>;
  setAppLockEnabled(enabled: boolean): Promise<void>;
  signInWithPassword(input: {
    email: string;
    password: string;
    twoFactorCode?: string;
  }): Promise<{ ok: true } | { message: string; ok: false; requiresTwoFactor: boolean }>;
  signOut(): Promise<void>;
}

interface MobileAuthProviderProps {
  appLockPreferenceStore: MobileAppLockPreferenceStore;
  biometricAuthenticator: MobileBiometricAuthenticator;
  children: ReactNode;
  deviceIntegrityDetector: MobileDeviceIntegrityDetector;
  googleSignInClient?: MobileGoogleNativeSignInClient | null;
  repository?: MobileSessionRepository;
  runtimeConfig?: MobileEnvironmentConfig;
  securitySignalLogger: MobileSecuritySignalLogger;
}

const MobileAuthContext = createContext<MobileAuthContextValue | null>(null);

export function MobileAuthProvider({
  appLockPreferenceStore,
  biometricAuthenticator,
  children,
  deviceIntegrityDetector,
  googleSignInClient = mobileGoogleNativeSignInClient,
  repository = mobileSecureSessionRepository,
  runtimeConfig = getMobileRuntimeConfig(),
  securitySignalLogger,
}: MobileAuthProviderProps) {
  const [state, setState] = useState<MobileAuthState>(() => createMobileAuthState("checking"));
  const [deviceIntegrityStatus, setDeviceIntegrityStatus] =
    useState<MobileDeviceIntegrityStatus>("checking");
  const [deviceIntegrityWarningDismissed, setDeviceIntegrityWarningDismissed] = useState(false);
  const [appLockStatus, setAppLockStatus] = useState<MobileAppLockStatus>("idle");
  const [appLockEnabled, setAppLockEnabledState] = useState(false);
  const [appLockAvailability, setAppLockAvailability] =
    useState<MobileAppLockAvailability>("unknown");
  const deviceIntegrityCheckStartedRef = useRef(false);
  const refreshPromiseRef = useRef<Promise<MobileSessionSnapshot | null> | null>(null);
  const refreshCooldownUntilRef = useRef(0);
  const stateRef = useRef(state);
  const appLockEnabledRef = useRef(false);
  const appLockColdArmedRef = useRef(false);
  const appLockUnlockPromiseRef = useRef<Promise<boolean> | null>(null);

  const commitAuthState = useCallback((nextState: MobileAuthState) => {
    stateRef.current = nextState;
    setState(nextState);
  }, []);

  const commitAuthStateFromCurrent = useCallback(
    (update: (current: MobileAuthState) => MobileAuthState) => {
      const nextState = update(stateRef.current);
      commitAuthState(nextState);
    },
    [commitAuthState],
  );

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const dismissDeviceIntegrityWarning = useCallback(() => {
    setDeviceIntegrityWarningDismissed(true);
  }, []);

  useEffect(() => {
    if (deviceIntegrityCheckStartedRef.current) {
      return;
    }

    deviceIntegrityCheckStartedRef.current = true;
    let active = true;

    void assessMobileDeviceIntegrity(deviceIntegrityDetector).then((result) => {
      if (!active) {
        return;
      }

      setDeviceIntegrityStatus(result.status);
      const platform = Platform.OS === "android" || Platform.OS === "ios" ? Platform.OS : "other";
      const signal = createMobileDeviceIntegritySignal(result, platform);
      if (!signal) {
        return;
      }

      try {
        securitySignalLogger.log(signal);
      } catch {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[mobile-security] device integrity signal logger unavailable");
        }
      }
    });

    return () => {
      active = false;
    };
  }, [deviceIntegrityDetector, securitySignalLogger]);

  useEffect(() => {
    appLockEnabledRef.current = appLockEnabled;
  }, [appLockEnabled]);

  useEffect(() => {
    let active = true;
    void appLockPreferenceStore.load().then((enabled) => {
      if (active) {
        setAppLockEnabledState(enabled);
      }
    });

    return () => {
      active = false;
    };
  }, [appLockPreferenceStore]);

  // Re-evaluates the gate. Availability failures fail OPEN (never "locked") so a
  // missing or broken biometric sensor can never trap a signed-in user.
  const armAppLock = useCallback(async () => {
    if (stateRef.current.status !== "signed-in" || !appLockEnabledRef.current) {
      setAppLockStatus("idle");
      return;
    }

    setAppLockStatus("checking");
    const availability = await assessMobileAppLockAvailability(biometricAuthenticator);
    setAppLockAvailability(availability);

    if (stateRef.current.status !== "signed-in" || !appLockEnabledRef.current) {
      setAppLockStatus("idle");
      return;
    }

    setAppLockStatus(
      shouldArmMobileAppLock({ availability, preferenceEnabled: true, signedIn: true })
        ? "locked"
        : "unavailable",
    );
  }, [biometricAuthenticator]);

  // Cold-start / post-login trigger. Arms once when the app becomes eligible and
  // resets when the user is no longer signed in or disables the lock.
  useEffect(() => {
    if (state.status === "signed-in" && appLockEnabled) {
      if (!appLockColdArmedRef.current) {
        appLockColdArmedRef.current = true;
        void armAppLock();
      }
      return;
    }

    appLockColdArmedRef.current = false;
    setAppLockStatus("idle");
  }, [appLockEnabled, armAppLock, state.status]);

  // Foreground trigger: re-lock when the app returns to the active state, not on
  // every screen transition.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next === "active") {
        void armAppLock();
      }
    });

    return () => subscription.remove();
  }, [armAppLock]);

  const retryAppLockUnlock = useCallback(async () => {
    if (appLockUnlockPromiseRef.current) {
      return appLockUnlockPromiseRef.current;
    }

    const unlockPromise = runMobileAppLockAuthentication(
      biometricAuthenticator,
      APP_LOCK_PROMPT_OPTIONS,
    );
    appLockUnlockPromiseRef.current = unlockPromise;

    try {
      const unlocked = await unlockPromise;

      if (unlocked && stateRef.current.status === "signed-in" && appLockEnabledRef.current) {
        setAppLockStatus("unlocked");
      }

      return unlocked;
    } finally {
      if (appLockUnlockPromiseRef.current === unlockPromise) {
        appLockUnlockPromiseRef.current = null;
      }
    }
  }, [biometricAuthenticator]);

  const setAppLockEnabled = useCallback(
    async (enabled: boolean) => {
      await appLockPreferenceStore.save(enabled);
      setAppLockEnabledState(enabled);
      if (!enabled) {
        appLockColdArmedRef.current = false;
        setAppLockStatus("idle");
      }
    },
    [appLockPreferenceStore],
  );

  const createUnauthenticatedClient = useCallback(
    () =>
      createMobileApiClient({
        baseUrl: runtimeConfig.apiUrl,
      }),
    [runtimeConfig.apiUrl],
  );

  // Session refresh needs its own client: the shared offline guard rejects the
  // POST before it is ever sent, which turned "no signal right now" into "signed
  // out for good". Let the request reach the network and fail honestly instead.
  const createSessionRefreshClient = useCallback(
    () =>
      createMobileApiClient({
        baseUrl: runtimeConfig.apiUrl,
        getNetworkStatus: () => "unknown",
        timeoutMs: SESSION_REFRESH_TIMEOUT_MS,
      }),
    [runtimeConfig.apiUrl],
  );

  const refreshSessionWithServer = useCallback(
    async (session: MobileSessionSnapshot) => {
      const refreshToken = session.tokens.refreshToken;
      if (!refreshToken) {
        return null;
      }

      if (Date.now() < refreshCooldownUntilRef.current) {
        return null;
      }

      if (!refreshPromiseRef.current) {
        refreshPromiseRef.current = refreshMobileAuthSession(createSessionRefreshClient(), {
          refreshToken,
        })
          .then(async (refreshedSession) => {
            refreshCooldownUntilRef.current = 0;
            await repository.save(refreshedSession);
            commitAuthState(createMobileAuthState("signed-in", refreshedSession));
            return refreshedSession;
          })
          .catch(async (error: unknown) => {
            if (isMobileSessionRejected(error)) {
              await repository.clear();
              commitAuthState(createMobileAuthState("signed-out"));
              return null;
            }

            refreshCooldownUntilRef.current = Date.now() + SESSION_REFRESH_RETRY_COOLDOWN_MS;
            return null;
          })
          .finally(() => {
            refreshPromiseRef.current = null;
          });
      }

      return refreshPromiseRef.current;
    },
    [commitAuthState, createSessionRefreshClient, repository],
  );

  const ensureFreshSession = useCallback(
    async (session: MobileSessionSnapshot | null) => {
      if (!session) {
        return null;
      }

      if (!shouldRefreshMobileSession(session) && !isMobileSessionExpired(session)) {
        return session;
      }

      const refreshedSession = await refreshSessionWithServer(session);
      if (refreshedSession) {
        return refreshedSession;
      }

      // The refresh did not go through. If the server rejected the token the
      // catch above already signed the user out and the ref is empty; otherwise
      // the stored session survives, its access token goes stale, requests fail
      // with 401 and the next call retries once the cooldown lapses.
      return stateRef.current.session;
    },
    [refreshSessionWithServer],
  );

  const refreshSessionFromStorage = useCallback(async () => {
    commitAuthState(createMobileAuthState("checking"));

    let session: MobileSessionSnapshot | null;
    try {
      session = await repository.load();
    } catch {
      commitAuthState(createMobileAuthState("error", null, activeMobileCopy.authSessionReadFailed));
      return;
    }

    if (!session) {
      commitAuthState(createMobileAuthState("signed-out"));
      return;
    }

    // Trust the stored snapshot and render the app immediately, then refresh
    // behind it. A cold start no longer waits on the network to decide whether
    // the user is signed in, and only a rejected refresh token can undo this.
    commitAuthState(createMobileAuthState("signed-in", session));
    await ensureFreshSession(session);
  }, [commitAuthState, ensureFreshSession, repository]);

  const signOut = useCallback(async () => {
    const session = stateRef.current.session ?? (await repository.load());
    if (session?.tokens.accessToken) {
      try {
        await revokeMobilePushToken(
          createMobileApiClient({
            baseUrl: runtimeConfig.apiUrl,
            getAccessToken: () => session.tokens.accessToken,
          }),
        );
      } catch {
        // Notification unregister is best-effort. The server-side token is TTL-bound.
      }
    }

    if (session?.tokens.refreshToken) {
      try {
        await revokeMobileAuthSession(createUnauthenticatedClient(), {
          refreshToken: session.tokens.refreshToken,
        });
      } catch {
        // Local sign-out must always complete. The server-side token stays bounded by TTL.
      }
    }

    refreshCooldownUntilRef.current = 0;
    await repository.clear();
    commitAuthState(createMobileAuthState("signed-out"));
  }, [commitAuthState, createUnauthenticatedClient, repository, runtimeConfig.apiUrl]);

  const getAccessToken = useCallback(async () => {
    const session = await ensureFreshSession(stateRef.current.session);
    return session?.tokens.accessToken ?? null;
  }, [ensureFreshSession]);

  const replaceSessionUser = useCallback(
    async (user: MobileSessionUser): Promise<boolean> => {
      const current = stateRef.current;
      if (current.status !== "signed-in" || !current.session) {
        return false;
      }

      const nextSession = replaceMobileSessionUser(current.session, user);
      if (!nextSession) {
        return false;
      }

      try {
        await repository.save(nextSession);
      } catch {
        return false;
      }

      if (stateRef.current.status !== "signed-in" || stateRef.current.session !== current.session) {
        return false;
      }

      commitAuthState(createMobileAuthState("signed-in", nextSession));
      return true;
    },
    [commitAuthState, repository],
  );

  // The in-app auth session and the OS deep-link listener can both surface the
  // same `whispr://oauth/<token>` URL. The token is single-use server side, so
  // the second exchange would fail and stomp a healthy session with an error.
  const handoffExchangesRef = useRef(new Map<string, Promise<boolean>>());

  const exchangeAuthHandoff = useCallback(
    async (input: { callbackPath: string; handoffToken: string }) => {
      commitAuthState(createMobileAuthState("checking", stateRef.current.session));

      try {
        const session = await exchangeMobileAuthHandoff(createUnauthenticatedClient(), input);

        await repository.save(session);
        commitAuthState(createMobileAuthState("signed-in", session));
        return true;
      } catch {
        commitAuthStateFromCurrent((current: MobileAuthState) => ({
          ...current,
          error:
            "Mobil giris tamamlanamadi. Baglanti suresi dolmus olabilir; web girisini tekrar ac.",
          status: current.session ? "signed-in" : "error",
        }));
        return false;
      }
    },
    [commitAuthState, commitAuthStateFromCurrent, createUnauthenticatedClient, repository],
  );

  const completeAuthHandoff = useCallback(
    async (input: { callbackPath: string; handoffToken: string }) => {
      const pendingExchange = handoffExchangesRef.current.get(input.handoffToken);
      if (pendingExchange) {
        return pendingExchange;
      }

      const exchange = exchangeAuthHandoff(input);
      handoffExchangesRef.current.set(input.handoffToken, exchange);

      if (handoffExchangesRef.current.size > MAX_TRACKED_HANDOFF_EXCHANGES) {
        const oldestToken = handoffExchangesRef.current.keys().next().value;
        if (oldestToken !== undefined) {
          handoffExchangesRef.current.delete(oldestToken);
        }
      }

      return exchange;
    },
    [exchangeAuthHandoff],
  );

  const signInWithPassword = useCallback(
    async (input: { email: string; password: string; twoFactorCode?: string }) => {
      try {
        const session = await signInMobileWithPassword(createUnauthenticatedClient(), {
          ...input,
        });
        await repository.save(session);
        commitAuthState(createMobileAuthState("signed-in", session));
        return { ok: true } as const;
      } catch (error) {
        commitAuthState(createMobileAuthState("signed-out", null, "Giris tamamlanamadi."));
        return {
          ...getMobilePasswordSignInFailure(error),
          ok: false,
        } as const;
      }
    },
    [commitAuthState, createUnauthenticatedClient, repository],
  );

  const registerWithPassword = useCallback(
    async (input: {
      confirmPassword: string;
      email: string;
      password: string;
      username: string;
    }) => {
      try {
        const response = await registerMobileWithPassword(createUnauthenticatedClient(), {
          ...input,
          locale: "tr",
        });
        commitAuthState(createMobileAuthState("signed-out"));
        return {
          email: response.email,
          ok: true,
        } as const;
      } catch {
        commitAuthState(
          createMobileAuthState("signed-out", null, activeMobileCopy.authRegisterFailedTitle),
        );
        return {
          message: activeMobileCopy.authRegisterFailed,
          ok: false,
        } as const;
      }
    },
    [commitAuthState, createUnauthenticatedClient],
  );

  const requestPasswordReset = useCallback(
    async (input: { email: string }) => {
      try {
        const response = await requestMobilePasswordReset(createUnauthenticatedClient(), {
          ...input,
          locale: "tr",
        });
        commitAuthState(createMobileAuthState("signed-out"));
        return response.resetLinkTtlMinutes === undefined
          ? ({
              email: response.email,
              ok: true,
            } as const)
          : ({
              email: response.email,
              ok: true,
              resetLinkTtlMinutes: response.resetLinkTtlMinutes,
            } as const);
      } catch {
        commitAuthState(
          createMobileAuthState("signed-out", null, activeMobileCopy.authPasswordResetFailedTitle),
        );
        return {
          message: activeMobileCopy.authPasswordResetFailed,
          ok: false,
        } as const;
      }
    },
    [commitAuthState, createUnauthenticatedClient],
  );

  const requestVerificationEmail = useCallback(
    async (input: { email: string }) => {
      try {
        const response = await requestMobileVerificationEmail(createUnauthenticatedClient(), {
          ...input,
          locale: "tr",
        });
        commitAuthState(createMobileAuthState("signed-out"));
        return {
          email: response.email,
          ok: true,
        } as const;
      } catch {
        commitAuthState(
          createMobileAuthState(
            "signed-out",
            null,
            activeMobileCopy.authVerificationEmailFailedTitle,
          ),
        );
        return {
          message: activeMobileCopy.authVerificationEmailFailed,
          ok: false,
        } as const;
      }
    },
    [commitAuthState, createUnauthenticatedClient],
  );

  const openWebSignIn = useCallback(async () => {
    try {
      await Linking.openURL(buildMobileWebSignInUrl(runtimeConfig.webUrl));
    } catch {
      commitAuthStateFromCurrent((current: MobileAuthState) => ({
        ...current,
        error: "Whispr web girisi acilamadi. Lutfen baglantini kontrol et.",
      }));
    }
  }, [commitAuthStateFromCurrent, runtimeConfig.webUrl]);

  // Preferred path: Google's own account sheet, fully on device. Only the ID
  // token leaves the sheet, and the API verifies it against Google's JWKS before
  // a Whispr session exists. No browser, no OAuth code, no client secret.
  const startNativeGoogleSignIn =
    useCallback(async (): Promise<MobileSocialSignInResult | null> => {
      const outcome = await runMobileGoogleNativeSignIn({
        client: googleSignInClient,
        onFailure: reportMobileGoogleSignInFallback,
        webClientId: runtimeConfig.googleWebClientId,
      });

      if (outcome.type === "cancelled") {
        return { ok: false, reason: "cancelled" } as const;
      }

      if (outcome.type === "failed") {
        // Native path is not usable on this device/build: let the caller fall
        // back to the browser hand-off instead of failing the sign-in.
        return null;
      }

      commitAuthState(createMobileAuthState("checking", stateRef.current.session));

      try {
        const session = await signInMobileWithGoogleIdToken(createUnauthenticatedClient(), {
          idToken: outcome.idToken,
        });

        await repository.save(session);
        commitAuthState(createMobileAuthState("signed-in", session));
        return { ok: true, via: "native" } as const;
      } catch {
        commitAuthStateFromCurrent((current: MobileAuthState) => ({
          ...current,
          error: activeMobileCopy.authSocialSignInFailed,
          status: current.session ? "signed-in" : "signed-out",
        }));
        return { ok: false, reason: "failed" } as const;
      }
    }, [
      commitAuthState,
      commitAuthStateFromCurrent,
      createUnauthenticatedClient,
      googleSignInClient,
      repository,
      runtimeConfig.googleWebClientId,
    ]);

  const startSocialSignIn = useCallback(
    async (provider: MobileAuthLiveSocialProviderId): Promise<MobileSocialSignInResult> => {
      const nativeResult = await startNativeGoogleSignIn();
      if (nativeResult) {
        return nativeResult;
      }

      const startUrl = buildMobileWebSocialSignInUrl(runtimeConfig.webUrl, provider);
      const outcome = await runMobileSocialAuthSession({
        openAuthSession: (url, redirectUrl) =>
          WebBrowser.openAuthSessionAsync(url, redirectUrl, {
            createTask: false,
            preferEphemeralSession: true,
            showInRecents: false,
          }),
        parseDeepLink: (url) => parseMobileDeepLink(url, { webUrl: runtimeConfig.webUrl }),
        startUrl,
      });

      if (outcome.type === "cancelled") {
        return { ok: false, reason: "cancelled" } as const;
      }

      if (outcome.type === "completed") {
        const completed = await completeAuthHandoff({
          callbackPath: outcome.callbackPath,
          handoffToken: outcome.handoffToken,
        });

        return completed
          ? ({ ok: true, via: "in-app" } as const)
          : ({ ok: false, reason: "failed" } as const);
      }

      if (outcome.reason === "invalid-callback") {
        commitAuthStateFromCurrent((current: MobileAuthState) => ({
          ...current,
          error: activeMobileCopy.authSocialSignInFailed,
        }));
        return { ok: false, reason: "failed" } as const;
      }

      try {
        await Linking.openURL(startUrl);
        return { ok: true, via: "external-browser" } as const;
      } catch {
        commitAuthStateFromCurrent((current: MobileAuthState) => ({
          ...current,
          error: activeMobileCopy.authSocialSignInFailed,
        }));
        return { ok: false, reason: "failed" } as const;
      }
    },
    [
      commitAuthStateFromCurrent,
      completeAuthHandoff,
      runtimeConfig.webUrl,
      startNativeGoogleSignIn,
    ],
  );

  const openWebRegister = useCallback(async () => {
    try {
      await Linking.openURL(buildMobileWebRegisterUrl(runtimeConfig.webUrl));
    } catch {
      commitAuthStateFromCurrent((current: MobileAuthState) => ({
        ...current,
        error: "Whispr kayit ekrani acilamadi. Lutfen baglantini kontrol et.",
      }));
    }
  }, [commitAuthStateFromCurrent, runtimeConfig.webUrl]);

  useEffect(() => {
    void refreshSessionFromStorage();
  }, [refreshSessionFromStorage]);

  const apiClient = useMemo(
    () =>
      createMobileApiClient({
        baseUrl: runtimeConfig.apiUrl,
        getAccessToken,
      }),
    [getAccessToken, runtimeConfig.apiUrl],
  );

  // The crash boundaries sit above this provider, so a report sent from the
  // fallback screen has no context to read a token from.
  //
  // Deliberately not cleared on unmount: a caught render error unmounts this
  // whole subtree, so the one moment the reader is needed is the moment the
  // provider is already gone. The closure keeps answering from the last known
  // session, which is the honest answer — a signed-out one returns null and the
  // crash screen says so.
  useEffect(() => {
    setMobileCrashReportTokenReader(getAccessToken);
  }, [getAccessToken]);

  const diagnostics = useMemo(() => getMobileSessionDiagnostics(state), [state]);
  const deviceIntegrityWarningVisible =
    deviceIntegrityStatus === "compromised" && !deviceIntegrityWarningDismissed;
  const appLockLocked = appLockStatus === "locked";

  const value = useMemo<MobileAuthContextValue>(
    () => ({
      ...state,
      apiClient,
      appLockAvailability,
      appLockEnabled,
      appLockLocked,
      appLockStatus,
      completeAuthHandoff,
      deviceIntegrityStatus,
      deviceIntegrityWarningVisible,
      diagnostics,
      dismissDeviceIntegrityWarning,
      getAccessToken,
      openWebRegister,
      openWebSignIn,
      registerWithPassword,
      requestPasswordReset,
      requestVerificationEmail,
      refreshSessionFromStorage,
      replaceSessionUser,
      retryAppLockUnlock,
      setAppLockEnabled,
      signInWithPassword,
      signOut,
      startSocialSignIn,
    }),
    [
      apiClient,
      appLockAvailability,
      appLockEnabled,
      appLockLocked,
      appLockStatus,
      completeAuthHandoff,
      deviceIntegrityStatus,
      deviceIntegrityWarningVisible,
      diagnostics,
      dismissDeviceIntegrityWarning,
      getAccessToken,
      openWebRegister,
      openWebSignIn,
      registerWithPassword,
      requestPasswordReset,
      requestVerificationEmail,
      refreshSessionFromStorage,
      replaceSessionUser,
      retryAppLockUnlock,
      setAppLockEnabled,
      signInWithPassword,
      signOut,
      startSocialSignIn,
      state,
    ],
  );

  return <MobileAuthContext.Provider value={value}>{children}</MobileAuthContext.Provider>;
}

export function useMobileAuth() {
  const value = useContext(MobileAuthContext);
  if (!value) {
    throw new Error("useMobileAuth must be used inside MobileAuthProvider.");
  }

  return value;
}
