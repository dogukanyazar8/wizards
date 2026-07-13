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
import { createMobileApiClient, type MobileApiClient } from "../api/mobile-api-client";
import { revokeMobilePushToken } from "../notifications/mobile-notification-client";
import { getMobileRuntimeConfig, type MobileEnvironmentConfig } from "../config/environment";
import { buildMobileWebRegisterUrl, buildMobileWebSignInUrl } from "../deep-link/mobile-deep-links";
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
import {
  exchangeMobileAuthHandoff,
  refreshMobileAuthSession,
  registerMobileWithPassword,
  requestMobilePasswordReset,
  requestMobileVerificationEmail,
  revokeMobileAuthSession,
  signInMobileWithPassword,
} from "./mobile-auth-exchange";
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

// disableDeviceFallback stays false so the OS device-passcode fallback is always
// offered; combined with the on-screen sign-out escape the user can never be trapped.
const APP_LOCK_PROMPT_OPTIONS = {
  cancelLabel: appLockCopy.appLockCancelAction,
  disableDeviceFallback: false,
  fallbackLabel: "",
  promptMessage: appLockCopy.appLockScreenTitle,
} as const;

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
  registerWithPassword(input: {
    confirmPassword: string;
    email: string;
    password: string;
    username: string;
  }): Promise<{ email: string; ok: true } | { message: string; ok: false }>;
  requestPasswordReset(input: {
    email: string;
  }): Promise<{ email: string; ok: true } | { message: string; ok: false }>;
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
  }): Promise<{ ok: true } | { message: string; ok: false }>;
  signOut(): Promise<void>;
}

interface MobileAuthProviderProps {
  appLockPreferenceStore: MobileAppLockPreferenceStore;
  biometricAuthenticator: MobileBiometricAuthenticator;
  children: ReactNode;
  deviceIntegrityDetector: MobileDeviceIntegrityDetector;
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

  const refreshSessionWithServer = useCallback(
    async (session: MobileSessionSnapshot) => {
      const refreshToken = session.tokens.refreshToken;
      if (!refreshToken) {
        return null;
      }

      if (!refreshPromiseRef.current) {
        refreshPromiseRef.current = refreshMobileAuthSession(createUnauthenticatedClient(), {
          refreshToken,
        })
          .then(async (refreshedSession) => {
            await repository.save(refreshedSession);
            commitAuthState(createMobileAuthState("signed-in", refreshedSession));
            return refreshedSession;
          })
          .catch(async () => {
            if (isMobileSessionExpired(session)) {
              await repository.clear();
              commitAuthState(createMobileAuthState("signed-out"));
            }

            return null;
          })
          .finally(() => {
            refreshPromiseRef.current = null;
          });
      }

      return refreshPromiseRef.current;
    },
    [createUnauthenticatedClient, repository],
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
      return refreshedSession ?? (isMobileSessionExpired(session) ? null : session);
    },
    [refreshSessionWithServer],
  );

  const refreshSessionFromStorage = useCallback(async () => {
    commitAuthState(createMobileAuthState("checking"));

    try {
      const session = await repository.load();
      if (!session) {
        commitAuthState(createMobileAuthState("signed-out"));
        return;
      }

      const freshSession = await ensureFreshSession(session);
      if (!freshSession) {
        await repository.clear();
        commitAuthState(createMobileAuthState("signed-out"));
        return;
      }

      commitAuthState(createMobileAuthState("signed-in", freshSession));
    } catch {
      commitAuthState(createMobileAuthState("error", null, "Oturum guvenli sekilde okunamadi."));
    }
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

  const completeAuthHandoff = useCallback(
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

  const signInWithPassword = useCallback(
    async (input: { email: string; password: string }) => {
      try {
        const session = await signInMobileWithPassword(createUnauthenticatedClient(), input);
        await repository.save(session);
        commitAuthState(createMobileAuthState("signed-in", session));
        return { ok: true } as const;
      } catch {
        commitAuthState(createMobileAuthState("signed-out", null, "Giris tamamlanamadi."));
        return {
          message: "E-posta veya sifre hatali ya da hesap dogrulanmamis olabilir.",
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
        commitAuthState(createMobileAuthState("signed-out", null, "Hesap olusturulamadi."));
        return {
          message:
            "Hesap olusturulamadi. Bilgileri, kullanici adini ve e-posta durumunu kontrol et.",
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
        return {
          email: response.email,
          ok: true,
        } as const;
      } catch {
        commitAuthState(
          createMobileAuthState("signed-out", null, "Sifre sifirlama baslatilamadi."),
        );
        return {
          message: "Sifre sifirlama su anda baslatilamadi. Biraz sonra tekrar dene.",
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
          createMobileAuthState("signed-out", null, "Dogrulama e-postasi gonderilemedi."),
        );
        return {
          message: "Dogrulama e-postasi su anda gonderilemedi. Biraz sonra tekrar dene.",
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
