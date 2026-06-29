import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
import { exchangeMobileAuthHandoff } from "./mobile-auth-exchange";
import {
  createMobileAuthState,
  getMobileSessionDiagnostics,
  isMobileSessionExpired,
} from "./session-manager";
import type { MobileAuthState, MobileSessionDiagnostics } from "./session-types";
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

  const refreshSessionFromStorage = useCallback(async () => {
    setState(createMobileAuthState("checking"));

    try {
      const session = await repository.load();
      if (!session) {
        setState(createMobileAuthState("signed-out"));
        return;
      }

      if (isMobileSessionExpired(session)) {
        await repository.clear();
        setState(createMobileAuthState("signed-out"));
        return;
      }

      setState(createMobileAuthState("signed-in", session));
    } catch {
      setState(createMobileAuthState("error", null, "Oturum güvenli şekilde okunamadı."));
    }
  }, [repository]);

  const signOut = useCallback(async () => {
    await repository.clear();
    setState(createMobileAuthState("signed-out"));
  }, [repository]);

  const completeAuthHandoff = useCallback(
    async (input: { callbackPath: string; handoffToken: string }) => {
      setState(createMobileAuthState("checking", state.session));

      try {
        const exchangeClient = createMobileApiClient({
          baseUrl: runtimeConfig.apiUrl,
        });
        const session = await exchangeMobileAuthHandoff(exchangeClient, input);

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
    [repository, runtimeConfig.apiUrl, state.session],
  );

  const openWebSignIn = useCallback(async () => {
    try {
      await Linking.openURL(buildMobileWebSignInUrl(runtimeConfig.webUrl));
    } catch {
      setState((current: MobileAuthState) => ({
        ...current,
        error: "Whispr web girişi açılamadı. Lütfen bağlantını kontrol et.",
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
        getAccessToken: () => state.session?.tokens.accessToken ?? null,
      }),
    [runtimeConfig.apiUrl, state.session?.tokens.accessToken],
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
