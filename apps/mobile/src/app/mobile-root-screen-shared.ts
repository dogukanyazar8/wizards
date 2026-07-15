import type { ComponentProps } from "react";

import Ionicons from "@expo/vector-icons/Ionicons";
import { activeMobileCopy } from "../locale/mobile-locale-preferences";
import { getMobileRuntimeConfig } from "../config/environment";
import { summarizeMobileQualityGate } from "../quality/mobile-quality-gate";
import { summarizeMobileProductionReadiness } from "../release/mobile-production-readiness";
import { validateMobileStoreReadiness } from "../release/mobile-store-contract";

export { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
export type { ComponentProps, ReactNode } from "react";
export { Ionicons };
export { default as mobilePackageJson } from "../../package.json";
export { default as whisprIcon } from "../../assets/whispr-icon.png";
export type {
  ChatMessage,
  MobileBootstrapFeature,
  MobileBootstrapPayload,
  MobileDMConversationListItem,
  MobileChannelMessagesResponse,
  MobileDMMessagesResponse,
  MobileNotificationItem,
  MessageSearchResult,
  MobileWorkspaceChannelSummary,
} from "@wizards/types";
export {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
export type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
export type { MobileSessionDiagnostics } from "../auth/session-types";
export { MOBILE_BOOTSTRAP_ENDPOINT } from "../bootstrap/mobile-bootstrap";
export type { MobileDeepLinkParseResult } from "../deep-link/mobile-deep-links";
export { mobileRadii, mobileSizing, mobileSpacing } from "../design/tokens";
export { MOBILE_DM_MESSAGES_LIMIT } from "../dm/mobile-dm-client";
export { MOBILE_LOCALE_OPTIONS } from "../locale/mobile-locale-preferences";
export type { MobileLocale } from "../locale/mobile-locale-preferences";
export type { MobileAppLockAvailability } from "../security/mobile-app-lock";
export {
  getMobileAttachmentDraftSendGuard,
  summarizeMobileMediaRuntimeState,
} from "../media/mobile-media-contract";
export type { MobileMediaRuntimeState } from "../media/mobile-media-contract";
export { getMobileAttachmentUploadReadiness } from "../media/mobile-attachment-upload-contract";
export { getMobileInviteReadiness } from "../invite/mobile-invite-contract";
export type { MobileInviteReadiness } from "../invite/mobile-invite-contract";
export type { MobileTabId } from "../navigation/mobile-navigation";
export { summarizeMobileNotificationRuntimeState } from "../notifications/mobile-notification-contract";
export type { MobileNotificationRuntimeState } from "../notifications/mobile-notification-contract";
export { summarizeMobileVoiceRuntimeState } from "../voice/mobile-voice-contract";
export type { MobileVoiceRuntimeState } from "../voice/mobile-voice-contract";
export { getMobileNoiseSuppressionLabel } from "../voice/mobile-voice-noise-contract";
export type {
  MobilePushToTalkPhase,
  MobileVoiceInputMode,
} from "../voice/mobile-voice-ptt-contract";
export { MobileVoiceRoomPanel } from "../voice/mobile-voice-room-panel";
export {
  getMobileVoiceInviteCandidates,
  hasVoiceRoomContext,
  isVoiceSessionActive,
} from "../voice/mobile-voice-room-contract";
export type {
  MobileVoiceAudioOutputMode,
  MobileVoiceInviteCandidate,
  MobileVoiceInviteSendState,
  MobileVoiceRoomParticipant,
  MobileVoiceRoomState,
} from "../voice/mobile-voice-room-contract";
export {
  getMobilePermissionNativeMetadata,
  getPermissionReadinessForFeature,
} from "../permissions/mobile-permission-contract";
export type {
  MobilePermissionIntentId,
  MobilePermissionReadiness,
  MobilePermissionSummary,
} from "../permissions/mobile-permission-contract";
export { MOBILE_MANUAL_QA_CHECKS, MOBILE_QA_DEVICE_MATRIX } from "../quality/mobile-quality-gate";
export { MOBILE_RELEASE_BUDGETS } from "../release/mobile-release-contract";
export { MOBILE_PRODUCTION_READINESS_GATES } from "../release/mobile-production-readiness";
export { formatMobileSyncAge, isMobileSyncStale } from "../sync/mobile-sync-contract";
export type { MobileSyncHealthSummary, MobileSyncSnapshot } from "../sync/mobile-sync-contract";
export {
  filterMobileConversations,
  filterMobileWorkspaceChannelSections,
  formatMobileDisplayTime,
  getBoundedMobileList,
  getMobileChannelChatHeaderModel,
  getMobileChannelChatSearchVisibility,
  getMobileChannelPriority,
  getMobileConversationActiveCount,
  getMobileConversationAvatarUrl,
  getMobileConversationInitialsLabel,
  getMobileConversationTitle,
  getMobileHomeQuickActions,
  getMobileMessageBodyPreview,
  getMobileMessageEngagementCounts,
  getMobileMessageListPerformanceConfig,
  getMobileMessageStreamItems,
  getMobileVoiceChannelScreenModel,
  getMobileWorkspaceChannelSurface,
  getMobileWorkspaceChannelSections,
  getMobileWorkspaceChannels,
  getVisibleMobileWorkspaceChannelSections,
  MOBILE_RENDER_LIMITS,
} from "./mobile-display-model";
export type {
  MobileConversationFilter,
  MobileHomeQuickAction,
  MobileMessageStreamItem,
  MobileVisibleWorkspaceChannelSection,
} from "./mobile-display-model";
export {
  getMobileFeatureEvidence,
  getMobilePermissionEvidence,
  getMobileReleaseEvidence,
  getMobileSessionEvidence,
  getMobileStoreEvidence,
  summarizeMobileFeatureReadiness,
} from "./mobile-settings-model";
export type { MobileSettingsEvidenceItem } from "./mobile-settings-model";
export { INITIAL_CHANNEL_SEND_STATE, INITIAL_DM_SEND_STATE } from "./mobile-screen-state";
export type {
  MobileBootstrapViewState,
  MobileChannelMessagesViewState,
  MobileChannelSendViewState,
  MobileDMMessagesViewState,
  MobileDMSendViewState,
  MobileMessageSearchViewState,
  MobileWorkspaceServerViewState,
} from "./mobile-screen-state";
export type { MobileVoiceInviteOverlayEntry } from "./overlays/mobile-voice-invite-overlay";

export const copy = activeMobileCopy;
export const runtimeConfig = getMobileRuntimeConfig();
export const mobileQualitySummary = summarizeMobileQualityGate();
export const mobileProductionReadinessSummary = summarizeMobileProductionReadiness();
export const mobileStoreReadiness = validateMobileStoreReadiness();
export type MobileIoniconName = ComponentProps<typeof Ionicons>["name"];
