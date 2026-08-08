import type { NavigatorScreenParams } from "@react-navigation/native";
import type { MobileLegalDocumentId } from "@wizards/types";
import type { MobileDeepLinkIntent } from "../deep-link/mobile-deep-links";

export type MobileBottomTabParamList = {
  overview: undefined;
  messages: undefined;
  notifications: undefined;
  settings: undefined;
};

export type MobileRootStackParamList = {
  MainTabs: NavigatorScreenParams<MobileBottomTabParamList> | undefined;
  VoiceRoom: undefined;
  ChannelChat: {
    readonly channelId: string;
    readonly serverId: string;
  };
  DirectMessage: {
    readonly conversationId: string;
  };
  /**
   * Faz 5 §13.2 group creation. A full route rather than a modal so the two
   * steps (pick members, then name the group) each own a back press, and so the
   * keyboard region the chat screens already solve applies unchanged.
   */
  GroupCreate: undefined;
  /** Faz 5 §17.1 group roster and admin actions. */
  GroupDetails: {
    readonly conversationId: string;
  };
  MessageThread: {
    readonly contextId: string;
    readonly messageId: string;
    readonly scope: "channel" | "dm";
  };
  SettingsDetail: {
    readonly section: string;
    /**
     * Only the `badges` section reads it: a BADGE notification names the badge
     * it is about, and the screen opens that detail directly (07 §4).
     */
    readonly badgeId?: string;
  };
  ProfileEdit: undefined;
  /** 11c full profile page; `serverId` is what turns the role chips on. */
  UserProfile: {
    readonly serverId?: string | undefined;
    readonly userId: string;
  };
  BlockedUsers: undefined;
  /** 4a product feedback form. */
  Feedback: undefined;
  /**
   * 4b as a standalone destination: the tracking view a FEEDBACK notification
   * opens. The post-send receipt is not a route — it is the second state of
   * `Feedback`, so Back always means "leave feedback".
   */
  FeedbackSubmitted: { readonly feedbackId: string };
  /** 4b "Tümünü gör" — the whole community roadmap. */
  Roadmap: undefined;
  /** In-app reader for the same legal texts the web serves. */
  LegalDocument: { readonly documentId: MobileLegalDocumentId };
  /** Attribution list for the open-source packages bundled in this build. */
  OpenSourceLicenses: undefined;
  /**
   * "Hakkında" redesign destinations. The two consent sheets (2d beta, 2h
   * rating) and the 1d download sheet are deliberately absent: they are
   * overlays on the About screen, not places Back should unwind through.
   */
  AboutWhatsNew: undefined;
  AboutReleaseNote: { readonly version: string };
  AboutReleaseHistory: undefined;
  AboutUpdateChannel: undefined;
  HelpCenter: undefined;
  BugReport: { readonly category?: string } | undefined;
  CommunityInvite: { readonly slug?: string } | undefined;
  PerformanceDiagnostics: undefined;
  Security: undefined;
  /**
   * 11f shared-media gallery. `userId` is the other participant, carried so a
   * caller that already knows who it is (the 1c profile page) does not make the
   * screen re-derive the name from the conversation.
   */
  SharedMedia: { readonly conversationId: string; readonly userId?: string };
  ServerSettings: { readonly serverId: string };
  ServerRoles: { readonly serverId: string };
  RoleDetail: { readonly roleId: string; readonly serverId: string };
  ServerMembers: { readonly serverId: string };
  ServerInvites: { readonly serverId: string };
  /**
   * S2 2g generalised to a `serverId` source (Section D). Always a concrete
   * id — unlike `CommunityInvite`'s optional slug there is no flagship
   * default to fall back to.
   */
  ServerProfile: { readonly serverId: string };
  /** S3 Section D: browse public, discoverable servers. Cards route to `ServerProfile`. */
  Discover: undefined;
  ChannelSettings: { readonly channelId: string; readonly serverId: string };
  /**
   * F7 mobile moderation triage. Root stack routes rather than a tab: the queue
   * is a destination an admin walks into and backs out of, not a fifth place the
   * app always shows.
   */
  AdminIncidents: undefined;
  AdminIncidentDetail: { readonly caseId: string };
};

export type MobileNavigationRouteIntent =
  | {
      readonly name: "VoiceRoom";
      readonly params: undefined;
      readonly type: "route";
    }
  | {
      readonly name: "MainTabs";
      readonly params: NavigatorScreenParams<MobileBottomTabParamList>;
      readonly type: "route";
    }
  | {
      readonly name: "ChannelChat";
      readonly params: MobileRootStackParamList["ChannelChat"];
      readonly type: "route";
    }
  | {
      readonly name: "DirectMessage";
      readonly params: MobileRootStackParamList["DirectMessage"];
      readonly type: "route";
    }
  | { readonly name: "GroupCreate"; readonly params: undefined; readonly type: "route" }
  | {
      readonly name: "MessageThread";
      readonly params: MobileRootStackParamList["MessageThread"];
      readonly type: "route";
    }
  | {
      readonly name: "SettingsDetail";
      readonly params: MobileRootStackParamList["SettingsDetail"];
      readonly type: "route";
    }
  | {
      readonly name: "ServerRoles";
      readonly params: MobileRootStackParamList["ServerRoles"];
      readonly type: "route";
    }
  | {
      readonly name: "UserProfile";
      readonly params: MobileRootStackParamList["UserProfile"];
      readonly type: "route";
    }
  | { readonly name: "ProfileEdit"; readonly params: undefined; readonly type: "route" }
  | {
      readonly name: "FeedbackSubmitted";
      readonly params: MobileRootStackParamList["FeedbackSubmitted"];
      readonly type: "route";
    }
  | { readonly name: "BlockedUsers"; readonly params: undefined; readonly type: "route" }
  | { readonly name: "AboutWhatsNew"; readonly params: undefined; readonly type: "route" }
  | {
      readonly name: "AboutReleaseNote";
      readonly params: MobileRootStackParamList["AboutReleaseNote"];
      readonly type: "route";
    }
  | { readonly name: "AboutReleaseHistory"; readonly params: undefined; readonly type: "route" }
  | { readonly name: "AboutUpdateChannel"; readonly params: undefined; readonly type: "route" }
  | { readonly name: "HelpCenter"; readonly params: undefined; readonly type: "route" }
  | {
      readonly name: "BugReport";
      readonly params: MobileRootStackParamList["BugReport"];
      readonly type: "route";
    }
  | {
      readonly name: "CommunityInvite";
      readonly params: MobileRootStackParamList["CommunityInvite"];
      readonly type: "route";
    }
  | {
      readonly name: "ServerProfile";
      readonly params: MobileRootStackParamList["ServerProfile"];
      readonly type: "route";
    }
  | { readonly name: "AdminIncidents"; readonly params: undefined; readonly type: "route" }
  | {
      readonly name: "AdminIncidentDetail";
      readonly params: MobileRootStackParamList["AdminIncidentDetail"];
      readonly type: "route";
    };

export type MobileNavigationCommandIntent = Exclude<
  MobileDeepLinkIntent,
  { readonly type: "route" }
>;

export type MobileNavigationIntent = MobileNavigationRouteIntent | MobileNavigationCommandIntent;
