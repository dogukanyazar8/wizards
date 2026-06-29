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
import {
  getMobileRuntimeConfig,
  type MobileEnvironmentConfig,
} from "../config/environment";
import { buildMobileWebSignInUrl } from "../deep-link/mobile-deep-links";
import { mobileSecureSessionRepository } from "./expo-secure-session-store";
import {
  exchangeMobileAuthHandoff,
  refreshMobileAuthSession,
  revokeMobileAuthSession,
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
  openWebSignIn(): Promise<void>;
  refreshSessionFromStorage(): Promise<void>;
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
            setState(createMobileAuthState("signed-in", refreshedSession));
            return refreshedSession;
          })
          .catch(async () => {
            if (isMobileSessionExpired(session)) {
              await repository.clear();
              setState(createMobileAuthState("signed-out"));
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
    setState(createMobileAuthState("checking"));

    try {
      const session = await repository.load();
      if (!session) {
        setState(createMobileAuthState("signed-out"));
        return;
      }

      const freshSession = await ensureFreshSession(session);
      if (!freshSession) {
        await repository.clear();
        setState(createMobileAuthState("signed-out"));
        return;
      }

      setState(createMobileAuthState("signed-in", freshSession));
    } catch {
      setState(createMobileAuthState("error", null, "Oturum guvenli sekilde okunamadi."));
    }
  }, [ensureFreshSession, repository]);

  const signOut = useCallback(async () => {
    const session = stateRef.current.session ?? (await repository.load());
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
    setState(createMobileAuthState("signed-out"));
  }, [createUnauthenticatedClient, repository]);

  const completeAuthHandoff = useCallback(
    async (input: { callbackPath: string; handoffToken: string }) => {
      setState(createMobileAuthState("checking", state.session));

      try {
        const session = await exchangeMobileAuthHandoff(createUnauthenticatedClient(), input);

        await repository.save(session);
        setState(createMobileAuthState("signed-in", session));
        return true;
      } catch {
        setState((current: MobileAuthState) => ({
          ...current,
          error:
            "Mobil giris tamamlanamadi. Baglanti suresi dolmus olabilir; web girisini tekrar ac.",
          status: current.session ? "signed-in" : "error",
        }));
        return false;
      }
    },
    [createUnauthenticatedClient, repository, state.session],
  );

  const openWebSignIn = useCallback(async () => {
    try {
      await Linking.openURL(buildMobileWebSignInUrl(runtimeConfig.webUrl));
    } catch {
      setState((current: MobileAuthState) => ({
        ...current,
        error: "Whispr web girisi acilamadi. Lutfen baglantini kontrol et.",
      }));
    }
  }, [runtimeConfig.webUrl]);

  useEffect(() => {
    void refreshSessionFromStorage();
  }, [refreshSessionFromStorage]);

  const apiClient = useMemo(
    () =>
      createMobileApiClient({
        baseUrl: runtimeConfig.apiUrl,
        getAccessToken: async () => {
          const session = await ensureFreshSession(stateRef.current.session);
          return session?.tokens.accessToken ?? null;
        },
      }),
    [ensureFreshSession, runtimeConfig.apiUrl],
  );

  const diagnostics = useMemo(() => getMobileSessionDiagnostics(state), [state]);

  const value = useMemo<MobileAuthContextValue>(
    () => ({
      ...state,
      apiClient,
      completeAuthHandoff,
      diagnostics,
      openWebSignIn,
      refreshSessionFromStorage,
      signOut,
    }),
    [
      apiClient,
      completeAuthHandoff,
      diagnostics,
      openWebSignIn,
      refreshSessionFromStorage,
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
