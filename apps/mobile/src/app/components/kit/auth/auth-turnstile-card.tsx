import { useEffect, useRef, useState, type ComponentProps } from "react";
import { Text, View } from "react-native";
import { WebView } from "react-native-webview";

import type { MobileTheme } from "../../../../design/themes";
import { getMobileRuntimeConfig } from "../../../../config/environment";
import { activeMobileCopy } from "../../../../locale/mobile-locale-preferences";
import { useThemedStyles } from "../../../providers/mobile-theme-provider";

export type MobileAuthTurnstileAction = "login" | "register";

export interface AuthTurnstileCardProps {
  readonly action: MobileAuthTurnstileAction;
  readonly onVerify: (token: string | null) => void;
  readonly testID?: string;
}

const TURNSTILE_CHALLENGE_ORIGIN = "https://challenges.cloudflare.com";
const TURNSTILE_MAX_MESSAGE_LENGTH = 4096;
const TURNSTILE_MAX_TOKEN_LENGTH = 2048;

function toScriptLiteral(value: string) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function buildTurnstileDocument(siteKey: string, action: MobileAuthTurnstileAction) {
  const serializedAction = toScriptLiteral(action);
  const serializedSiteKey = toScriptLiteral(siteKey);

  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1" /><script src="${TURNSTILE_CHALLENGE_ORIGIN}/turnstile/v0/api.js?render=explicit" async defer></script></head><body><div id="turnstile"></div><script>const send=(type,token)=>window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({type,token}));const siteKey=${serializedSiteKey};const action=${serializedAction};window.addEventListener("load",()=>{if(!window.turnstile){send("error");return;}try{window.turnstile.render("#turnstile",{sitekey:siteKey,action,callback:(token)=>send("success",token),"error-callback":()=>send("error"),"expired-callback":()=>send("expired")});}catch(_error){send("error");}});</script></body></html>`;
}

function isValidTurnstileToken(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= TURNSTILE_MAX_TOKEN_LENGTH &&
    value === value.trim()
  );
}

type TurnstileMessage =
  | { readonly token: string; readonly type: "success" }
  | { readonly type: "error" | "expired" };

function parseTurnstileMessage(data: unknown): TurnstileMessage | null {
  if (typeof data !== "string" || data.length > TURNSTILE_MAX_MESSAGE_LENGTH) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(data);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    const message = parsed as { token?: unknown; type?: unknown };
    if (message.type === "success" && isValidTurnstileToken(message.token)) {
      return { token: message.token, type: "success" };
    }

    if (message.type === "error" || message.type === "expired") {
      return { type: message.type };
    }
  } catch {
    return null;
  }

  return null;
}

function getTurnstileSiteKey() {
  try {
    return getMobileRuntimeConfig().turnstileSiteKey;
  } catch {
    return null;
  }
}

function isAllowedTurnstileNavigation(url: string) {
  return url === "about:blank" || url.startsWith(`${TURNSTILE_CHALLENGE_ORIGIN}/`);
}

function preventWebViewFailureDefault(event: unknown) {
  if (
    event &&
    typeof event === "object" &&
    "preventDefault" in event &&
    typeof event.preventDefault === "function"
  ) {
    event.preventDefault();
  }
}

const createStyles = (theme: MobileTheme) => ({
  brand: {
    ...theme.typography.authSubtitle,
    color: theme.text.muted,
    textAlign: "center" as const,
  },
  error: {
    ...theme.typography.authSubtitle,
    color: theme.status.dangerOnBase,
    textAlign: "center" as const,
  },
  label: {
    ...theme.typography.authFieldLabel,
    color: theme.text.primary,
    textAlign: "center" as const,
  },
  root: {
    backgroundColor: theme.surface.card,
    borderColor: theme.border.subtle,
    borderRadius: theme.layout.auth.fieldRadius,
    borderWidth: theme.layout.border.hairline,
    gap: theme.layout.spacing.tight,
    minWidth: 0,
    padding: theme.spacing.section,
  },
  webView: {
    height: theme.layout.auth.iconCard,
    overflow: "hidden" as const,
  },
});

export function AuthTurnstileCard({ action, onVerify, testID }: AuthTurnstileCardProps) {
  const copy = activeMobileCopy;
  const styles = useThemedStyles(createStyles);
  const onVerifyRef = useRef(onVerify);
  const completedRef = useRef(false);
  const terminallyInvalidatedRef = useRef(false);
  const siteKey = getTurnstileSiteKey();
  const challengeIdentity = `${siteKey ?? "missing"}:${action}`;
  const [failed, setFailed] = useState(!siteKey);

  useEffect(() => {
    onVerifyRef.current = onVerify;
  }, [onVerify]);

  useEffect(() => {
    completedRef.current = false;
    terminallyInvalidatedRef.current = !siteKey;

    if (!siteKey) {
      setFailed(true);
      onVerifyRef.current(null);
      return;
    }

    setFailed(false);
  }, [challengeIdentity, siteKey]);

  const invalidate = () => {
    if (terminallyInvalidatedRef.current) {
      return;
    }

    terminallyInvalidatedRef.current = true;
    setFailed(true);
    onVerifyRef.current(null);
  };

  const handleMessage: NonNullable<ComponentProps<typeof WebView>["onMessage"]> = (event) => {
    if (terminallyInvalidatedRef.current) {
      return;
    }

    const message = parseTurnstileMessage(event.nativeEvent.data);

    if (message?.type === "success") {
      if (completedRef.current) {
        return;
      }

      completedRef.current = true;
      setFailed(false);
      onVerifyRef.current(message.token);
      return;
    }

    invalidate();
  };

  const handleWebViewFailure = (event: unknown) => {
    preventWebViewFailureDefault(event);
    invalidate();
  };

  return (
    <View style={styles.root} testID={testID}>
      <Text style={styles.label}>{copy.authTurnstileLabel}</Text>
      {siteKey ? (
        <WebView
          javaScriptCanOpenWindowsAutomatically={false}
          mixedContentMode="never"
          onError={handleWebViewFailure}
          onHttpError={handleWebViewFailure}
          onMessage={handleMessage}
          onShouldStartLoadWithRequest={(request) => isAllowedTurnstileNavigation(request.url)}
          originWhitelist={[TURNSTILE_CHALLENGE_ORIGIN, "about:blank"]}
          setSupportMultipleWindows={false}
          source={{ baseUrl: TURNSTILE_CHALLENGE_ORIGIN, html: buildTurnstileDocument(siteKey, action) }}
          style={styles.webView}
          testID={testID ? `${testID}-webview` : undefined}
        />
      ) : null}
      {failed ? (
        <Text accessibilityLiveRegion="polite" style={styles.error} testID={testID ? `${testID}-error` : undefined}>
          {copy.authTurnstileError}
        </Text>
      ) : null}
      <Text style={styles.brand}>{copy.authTurnstileBrand}</Text>
    </View>
  );
}
