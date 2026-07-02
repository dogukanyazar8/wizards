import {
  MOBILE_BOOTSTRAP_ATTACHMENTS_FEATURE_DEFAULT,
  MOBILE_BOOTSTRAP_INVITES_FEATURE_DEFAULT,
  MOBILE_BOOTSTRAP_MESSAGE_SEARCH_FEATURE_DEFAULT,
  MobileBootstrapPayloadSchema,
  type MobileBootstrapDMConversationSummary,
  type MobileBootstrapPayload,
  type MobileBootstrapServerSummary,
} from "@wizards/types";
import { getWhisprVersionPayload } from "@/lib/app-version";
import { normalizeAppLocale, type AppLocale } from "@/lib/locale";

export type MobileBootstrapUser = {
  avatarUrl: string | null;
  displayName: string | null;
  id: string;
  locale: string | null;
  status: string | null;
  username: string;
};

export type MobileBootstrapHomeSummary = {
  directMessages: {
    recent: MobileBootstrapDMConversationSummary[];
    totalCount: number;
    unreadCount: number;
  };
  servers: {
    recent: MobileBootstrapServerSummary[];
    totalCount: number;
  };
};

export type GetMobileBootstrapPayloadInput = {
  home?: MobileBootstrapHomeSummary;
  now?: Date;
  user: MobileBootstrapUser;
};

export const EMPTY_MOBILE_BOOTSTRAP_HOME: MobileBootstrapHomeSummary = {
  directMessages: {
    recent: [],
    totalCount: 0,
    unreadCount: 0,
  },
  servers: {
    recent: [],
    totalCount: 0,
  },
};

export function getMobileBootstrapPayload({
  home = EMPTY_MOBILE_BOOTSTRAP_HOME,
  now = new Date(),
  user,
}: GetMobileBootstrapPayloadInput): MobileBootstrapPayload {
  const locale = normalizeAppLocale(user.locale);
  const version = getWhisprVersionPayload(locale as AppLocale);

  return MobileBootstrapPayloadSchema.parse({
    app: {
      buildId: version.buildId,
      name: "Whispr",
      releaseChannel: version.releaseChannel,
      serverTime: now.toISOString(),
      version: version.version,
    },
    contracts: {
      deepLinks: ["auth-handoff", "invite", "route"],
      permissions: ["notifications", "microphone", "camera", "photoLibrary"],
    },
    features: {
      attachments: MOBILE_BOOTSTRAP_ATTACHMENTS_FEATURE_DEFAULT,
      invites: MOBILE_BOOTSTRAP_INVITES_FEATURE_DEFAULT,
      messageSearch: {
        label: MOBILE_BOOTSTRAP_MESSAGE_SEARCH_FEATURE_DEFAULT.label,
        reason:
          "Authenticated mobile channel and direct-message search endpoints are available through bounded API queries.",
        status: "available",
      },
      messages: {
        label: "Messages",
        status: "available",
      },
      nativeAuthTokenExchange: {
        label: "Native auth handoff",
        reason:
          "Mobile uses a short-lived one-time web handoff and server-side token exchange before storing a Bearer session in SecureStore.",
        status: "available",
      },
      pushNotifications: {
        label: "Push notifications",
        reason:
          "Push device registration is available after explicit native notification permission. Delivery rollout remains gated by user settings and mobile QA.",
        status: "requires-native-permission",
      },
      voice: {
        label: "Voice",
        reason:
          "Mobile voice channels use explicit microphone permission, server-authorized LiveKit tokens, and bounded voice state heartbeats.",
        status: "requires-native-permission",
      },
    },
    home,
    user: {
      avatarUrl: user.avatarUrl,
      displayName: user.displayName,
      id: user.id,
      locale,
      status: user.status,
      username: user.username,
    },
  });
}
