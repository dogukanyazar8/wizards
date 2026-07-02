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
import { Linking } from "react-native";
import { createMobileApiClient, type MobileApiClient } from "../api/mobile-api-client";
import { revokeMobilePushToken } from "../notifications/mobile-notification-client";
import {
  getMobileRuntimeConfig,
  type MobileEnvironmentConfig,
} from "../config/environment";
import {
  buildMobileWebRegisterUrl,
  buildMobileWebSignInUrl,
} from "../deep-link/mobile-deep-links";
import { mobileSecureSessionRepository } from "./expo-secure-session-store";
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
  shouldRefreshMobileSession,
} from "./session-manager";
import type {
  MobileAuthState,
  MobileSessionDiagnostics,
  MobileSessionSnapshot,
} from "./session-types";
import type { MobileSessionRepository } from "./session-store";

interface MobileAuthContextValue extends MobileAuthState {
  apiClient: MobileApiClient;
  completeAuthHandoff(input: { callbackPath: string; handoffToken: string }): Promise<boolean>;
  diagnostics: MobileSessionDiagnostics;
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
  signInWithPassword(input: {
    email: string;
    password: string;
  }): Promise<{ ok: true } | { message: string; ok: false }>;
  signOut(): Promise<void>;
}

interface MobileAuthProviderProps {
  children: ReactNode;
  repository?: MobileSessionRepository;
  runtimeConfig?: MobileEnvironmentConfig;
}

const MobileAuthContext = createContext<MobileAuthContextValue | null>(null);

export function MobileAuthProvider({
  children,
  repository = mobileSecureSessionRepository,
  runtimeConfig = getMobileRuntimeConfig(),
}: MobileAuthProviderProps) {
  const [state, setState] = useState<MobileAuthState>(() => createMobileAuthState("checking"));
  const refreshPromiseRef = useRef<Promise<MobileSessionSnapshot | null> | null>(null);
  const stateRef = useRef(state);

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
        commitAuthState(createMobileAuthState("signed-out", null, "Sifre sifirlama baslatilamadi."));
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
        const response = await requestMobileVerificationEmail(
          createUnauthenticatedClient(),
          {
            ...input,
            locale: "tr",
          },
        );
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

  const value = useMemo<MobileAuthContextValue>(
    () => ({
      ...state,
      apiClient,
      completeAuthHandoff,
      diagnostics,
      getAccessToken,
      openWebRegister,
      openWebSignIn,
      registerWithPassword,
      requestPasswordReset,
      requestVerificationEmail,
      refreshSessionFromStorage,
      signInWithPassword,
      signOut,
    }),
    [
      apiClient,
      completeAuthHandoff,
      diagnostics,
      getAccessToken,
      openWebRegister,
      openWebSignIn,
      registerWithPassword,
      requestPasswordReset,
      requestVerificationEmail,
      refreshSessionFromStorage,
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
