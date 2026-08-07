import type { ImageStyle, TextStyle, ViewStyle } from "react-native";
import type { MobileTheme } from "../../design/themes";
import { useThemedStyles, useVoiceRoomThemedStyles } from "../providers/mobile-theme-provider";
import { createSharedStyles } from "../styles/shared-styles";

export const createVoiceScreenStyles = (theme: MobileTheme) => {
  const mobileRadii = theme.radii;
  /** One header pill shape, worn by the room's invite action and the DM call's. */
  const headerPill: ViewStyle = {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderWidth: 1,
    borderColor: theme.voiceRoom.border,
    borderRadius: 13,
    backgroundColor: theme.voiceRoom.card,
    paddingHorizontal: 14,
    paddingVertical: 9,
  };
  const headerPillText: TextStyle = {
    color: theme.voiceRoom.accent,
    fontSize: 12.5,
    fontFamily: theme.typography.fontFamilyBold,
  };
  /**
   * The pill's icon-only twin, worn by the minimize control and by the channel
   * room's settings entry — the invite pill already spends the header's width,
   * so a second labelled pill would not fit beside it.
   */
  const headerIconButton: ViewStyle = {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.voiceRoom.border,
    borderRadius: 13,
    backgroundColor: theme.voiceRoom.card,
  };

  return {
    activeVoiceRoomAvatarFallback: {
      fontSize: 26,
      lineHeight: 30,
    },
    activeVoiceRoomAvatarRing: {
      width: 92,
      height: 92,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 34,
    },
    activeVoiceRoomAvatarRingSpeaking: {
      borderColor: theme.voiceRoom.success,
      borderWidth: 3,
    },
    /** 5a header: a compact card chip, not a bare 44pt hit box. */
    activeVoiceRoomBackButton: headerIconButton,
    activeVoiceRoomControl: {
      width: 48,
      height: 48,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: theme.voiceRoom.controlBorder,
      borderRadius: mobileRadii.pill,
      backgroundColor: theme.voiceRoom.control,
    },
    activeVoiceRoomControlDanger: {
      width: 52,
      height: 52,
      borderColor: theme.voiceRoom.danger,
      backgroundColor: theme.voiceRoom.danger,
      elevation: 8,
      shadowColor: theme.voiceRoom.danger,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.38,
      shadowRadius: 18,
    },
    activeVoiceRoomControlDisabled: {
      opacity: 0.48,
    },
    /** Muted microphone: the one control that changes fill rather than icon tint. */
    activeVoiceRoomControlMuted: {
      borderColor: theme.voiceRoom.dangerSoft,
      backgroundColor: theme.voiceRoom.dangerSoft,
    },
    activeVoiceRoomControlSelected: {
      borderColor: theme.voiceRoom.success,
    },
    activeVoiceRoomControls: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    /**
     * The media controls sit in their own bottom bar, edge to edge and pinned
     * like the app's navigation bar, so a full room can never scroll them away.
     */
    activeVoiceRoomDock: {
      borderTopWidth: 1,
      borderTopColor: theme.voiceRoom.dockBorder,
      backgroundColor: theme.voiceRoom.card,
      paddingHorizontal: 24,
      paddingTop: 14,
    },
    activeVoiceRoomError: {
      marginTop: 8,
      color: theme.voiceRoom.danger,
      fontSize: 12,
      lineHeight: 17,
      fontFamily: theme.typography.fontFamilyBold,
      paddingHorizontal: 20,
    },
    activeVoiceRoomHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 20,
      paddingTop: 8,
    },
    activeVoiceRoomHeaderText: {
      flex: 1,
      minWidth: 0,
    },
    /**
     * The scattered invite icon, connection chip and noise badge collapsed into
     * this one pill; the state they carried moved to the session strip below.
     * A DM call has nobody to invite, so it hangs its own single action (audio
     * settings, or the encryption mark while ringing) on the same pill.
     */
    activeVoiceRoomInviteButton: headerPill,
    activeVoiceRoomInviteButtonText: headerPillText,
    activeVoiceRoomHeaderIconButton: headerIconButton,
    activeVoiceRoomHeaderPill: headerPill,
    activeVoiceRoomHeaderPillText: headerPillText,
    /** Muted twin of the pill label: the ringing screen's "E2E" mark. */
    activeVoiceRoomHeaderPillTextMuted: {
      ...headerPillText,
      color: theme.voiceRoom.textSecondary,
    },
    /**
     * One badge carries every participant state: muted, speaking, or the real
     * audio route of the signed-in member.
     */
    activeVoiceRoomStatusBadge: {
      position: "absolute",
      right: -5,
      bottom: -5,
      width: 30,
      height: 30,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 3,
      borderColor: theme.voiceRoom.card,
      borderRadius: mobileRadii.pill,
      backgroundColor: theme.voiceRoom.screen,
    },
    activeVoiceRoomParticipantCard: {
      flexGrow: 1,
      flexBasis: "42%",
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
      minHeight: 196,
      borderWidth: 1,
      borderColor: theme.voiceRoom.border,
      borderRadius: 28,
      backgroundColor: theme.voiceRoom.card,
      paddingHorizontal: 12,
      paddingVertical: 32,
    },
    activeVoiceRoomParticipantCardSpeaking: {
      borderWidth: 2,
      borderColor: theme.voiceRoom.success,
    },
    // #5g camera tile: participant card turns into a live video surface when a
    // camera (mobile, web or desktop) is publishing.
    activeVoiceRoomVideoCard: {
      overflow: "hidden",
      paddingHorizontal: 0,
      paddingVertical: 0,
      backgroundColor: theme.media.surface,
    },
    activeVoiceRoomVideoSurface: {
      height: "100%",
      width: "100%",
    },
    activeVoiceRoomVideoBadges: {
      position: "absolute",
      top: 10,
      left: 10,
      flexDirection: "row",
      gap: 6,
    },
    activeVoiceRoomVideoBadge: {
      width: 28,
      height: 28,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 10,
      backgroundColor: theme.surface.scrim,
    },
    activeVoiceRoomVideoFlip: {
      position: "absolute",
      top: 10,
      right: 10,
      width: 36,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 13,
      backgroundColor: theme.surface.scrim,
    },
    activeVoiceRoomVideoNameChip: {
      position: "absolute",
      bottom: 10,
      left: 10,
      maxWidth: "80%",
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderRadius: 11,
      backgroundColor: theme.surface.scrim,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    activeVoiceRoomVideoName: {
      minWidth: 0,
      color: theme.text.onInverse,
      fontSize: 12,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    activeVoiceRoomVideoStatusDot: {
      width: 7,
      height: 7,
      borderRadius: mobileRadii.pill,
      backgroundColor: theme.text.onInverseMuted,
    },
    activeVoiceRoomVideoStatusDotSpeaking: {
      backgroundColor: theme.status.successOnInverse,
    },
    activeVoiceRoomShareBadge: {
      position: "absolute",
      left: -5,
      bottom: -5,
      width: 30,
      height: 30,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 3,
      borderColor: theme.voiceRoom.card,
      borderRadius: mobileRadii.pill,
      backgroundColor: theme.voiceRoom.screen,
    },
    // #audience-grid: tiles are measured to fit, so the box only ever scrolls
    // once the room outgrows the readable minimum tile size.
    activeVoiceRoomAudience: {
      flex: 1,
      minWidth: 0,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    activeVoiceRoomAudienceScroll: {
      flex: 1,
      minWidth: 0,
    },
    activeVoiceRoomAudienceContent: {
      gap: 12,
    },
    activeVoiceRoomAudienceContentFitted: {
      flexGrow: 1,
      justifyContent: "center",
    },
    activeVoiceRoomAudienceRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
    },
    activeVoiceRoomParticipantName: {
      color: theme.voiceRoom.text,
      fontSize: 15,
      fontFamily: theme.typography.fontFamilyExtraBold,
      textAlign: "center",
    },
    activeVoiceRoomParticipantStatus: {
      color: theme.voiceRoom.textSecondary,
      fontSize: 11.5,
      fontFamily: theme.typography.fontFamilySemiBold,
      textAlign: "center",
    },
    activeVoiceRoomParticipantStatusSpeaking: {
      color: theme.voiceRoom.success,
    },
    activeVoiceRoomParticipantText: {
      alignItems: "center",
      gap: 2,
      minWidth: 0,
    },
    activeVoiceRoomScreen: {
      flex: 1,
      minWidth: 0,
      backgroundColor: theme.voiceRoom.screen,
    },
    activeVoiceRoomSubtitle: {
      marginTop: 1,
      color: theme.voiceRoom.textSecondary,
      fontSize: 11.5,
      fontFamily: theme.typography.fontFamilySemiBold,
    },
    activeVoiceRoomTitle: {
      flex: 1,
      minWidth: 0,
      color: theme.voiceRoom.text,
      fontSize: 18,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    activeVoiceRoomTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      minWidth: 0,
    },
    /**
     * 5a session strip: connection, elapsed time and the noise toggle on one
     * line, so the header above it carries nothing but identity and invite.
     */
    activeVoiceRoomSessionStrip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginTop: 12,
      marginHorizontal: 20,
      borderWidth: 1,
      borderColor: theme.voiceRoom.border,
      borderRadius: 16,
      backgroundColor: theme.voiceRoom.card,
      paddingHorizontal: 14,
      paddingVertical: 11,
    },
    activeVoiceRoomSessionStatus: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    activeVoiceRoomSessionDotHalo: {
      width: 14,
      height: 14,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: mobileRadii.pill,
      backgroundColor: theme.voiceRoom.successHalo,
    },
    activeVoiceRoomSessionDotHaloWarning: {
      backgroundColor: "transparent",
    },
    activeVoiceRoomSessionDot: {
      width: 8,
      height: 8,
      borderRadius: mobileRadii.pill,
      backgroundColor: theme.voiceRoom.success,
    },
    activeVoiceRoomSessionDotWarning: {
      backgroundColor: theme.voiceRoom.warning,
    },
    activeVoiceRoomSessionDotDanger: {
      backgroundColor: theme.voiceRoom.danger,
    },
    activeVoiceRoomSessionLabel: {
      color: theme.voiceRoom.success,
      fontSize: 12.5,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    activeVoiceRoomSessionLabelWarning: {
      color: theme.voiceRoom.warning,
    },
    activeVoiceRoomSessionLabelDanger: {
      color: theme.voiceRoom.danger,
    },
    activeVoiceRoomSessionDuration: {
      color: theme.voiceRoom.textFaint,
      fontSize: 12,
      fontFamily: theme.typography.fontFamilyBold,
    },
    activeVoiceRoomSessionSpacer: {
      flex: 1,
    },
    activeVoiceRoomSessionNoise: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    activeVoiceRoomSessionNoiseLabel: {
      color: theme.voiceRoom.text,
      fontSize: 12.5,
      fontFamily: theme.typography.fontFamilyBold,
    },
    activeVoiceRoomNoiseToggle: {
      width: 36,
      height: 21,
      borderRadius: 11,
      backgroundColor: theme.voiceRoom.toggleTrackOff,
    },
    activeVoiceRoomNoiseToggleOn: {
      backgroundColor: theme.voiceRoom.success,
    },
    activeVoiceRoomNoiseToggleKnob: {
      position: "absolute",
      top: 2.5,
      left: 2.5,
      width: 16,
      height: 16,
      borderRadius: mobileRadii.pill,
      backgroundColor: theme.voiceRoom.toggleKnob,
      elevation: 2,
      shadowColor: theme.voiceRoom.text,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.2,
      shadowRadius: 3,
    },
    /** Solo room: one full-width card, exactly as the handoff draws it. */
    activeVoiceRoomSolo: {
      flex: 1,
      minWidth: 0,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 20,
    },
    activeVoiceRoomSoloCard: {
      width: "100%",
      alignItems: "center",
      gap: 5,
      borderWidth: 1,
      borderColor: theme.voiceRoom.border,
      borderRadius: 28,
      backgroundColor: theme.voiceRoom.card,
      paddingHorizontal: 20,
      paddingVertical: 46,
    },
    activeVoiceRoomSoloAvatar: {
      width: 96,
      height: 96,
      marginBottom: 12,
    },
    activeVoiceRoomSoloAvatarRing: {
      position: "absolute",
      top: -6,
      right: -6,
      bottom: -6,
      left: -6,
      borderWidth: 3,
      borderColor: theme.voiceRoom.success,
      borderRadius: 40,
    },
    activeVoiceRoomSoloAvatarFallback: {
      color: theme.voiceRoom.avatarText,
      fontSize: 30,
      lineHeight: 38,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    activeVoiceRoomSoloName: {
      maxWidth: "100%",
      color: theme.voiceRoom.text,
      fontSize: 17,
      fontFamily: theme.typography.fontFamilyExtraBold,
      textAlign: "center",
    },
    activeVoiceRoomSoloStatus: {
      maxWidth: "100%",
      color: theme.voiceRoom.textSecondary,
      fontSize: 12.5,
      fontFamily: theme.typography.fontFamilySemiBold,
      textAlign: "center",
    },
    activeVoiceRoomSoloStatusSpeaking: {
      color: theme.voiceRoom.success,
    },
    /**
     * A ringing DM call wears the solo card: same 96pt avatar and card frame, with
     * the outgoing call waves ringing around the avatar instead of a status badge.
     * The halo box is sized by the screen and reserves the full wave diameter, so a
     * ring can never bleed onto the callee name beneath it.
     */
    activeVoiceRoomRingingHalo: {
      alignItems: "center",
      justifyContent: "center",
    },
    /** Shorter than the room's solo card: the halo already carries the height. */
    activeVoiceRoomRingingCard: {
      paddingVertical: 30,
    },
    activeVoiceRoomRingingStatusRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    activeVoiceRoomRingingHint: {
      marginTop: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      borderWidth: 1,
      borderColor: theme.voiceRoom.border,
      borderRadius: 13,
      backgroundColor: theme.voiceRoom.control,
      paddingHorizontal: 13,
      paddingVertical: 8,
    },
    activeVoiceRoomRingingHintText: {
      color: theme.voiceRoom.textSecondary,
      fontSize: 11.5,
      fontFamily: theme.typography.fontFamilySemiBold,
    },
    mobileChannelChatDot: {
      color: theme.status.successText,
      fontSize: 11,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    mobileChannelChatMemberCount: {
      color: theme.status.successText,
      fontSize: 11,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    mobileChannelChatMetaRow: {
      marginTop: 3,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
    },
    mobileChannelChatServerName: {
      maxWidth: "62%",
      color: theme.text.muted,
      fontSize: 11,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    mobileVoiceChannelContent: {
      gap: 10,
      minWidth: 0,
      paddingBottom: 6,
    },
    mobileVoiceChannelHeader: {
      minHeight: 54,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      borderBottomWidth: 1,
      borderBottomColor: theme.border.subtle,
      paddingBottom: 9,
    },
    mobileVoiceChannelHeaderText: {
      flex: 1,
      minWidth: 0,
    },
    mobileVoiceChannelScreen: {
      flex: 1,
      minWidth: 0,
      gap: 10,
      borderWidth: 1,
      borderColor: theme.border.subtle,
      borderRadius: mobileRadii.card,
      backgroundColor: theme.surface.card,
      padding: 10,
    },
    mobileVoiceChannelTitle: {
      color: theme.text.primary,
      fontSize: 18,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    mobileVoiceControlBar: {
      minWidth: 0,
      flexDirection: "row",
      alignItems: "stretch",
      justifyContent: "space-between",
      gap: 5,
      borderWidth: 1,
      borderColor: theme.border.subtle,
      borderRadius: 18,
      backgroundColor: theme.surface.card,
      padding: 7,
      shadowColor: theme.elevation.headerCard.shadowColor,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: theme.dark ? 0 : 0.12,
      shadowRadius: 16,
      elevation: theme.dark ? 0 : 4,
    },
    mobileVoiceControlButton: {
      flex: 1,
      minWidth: 0,
      minHeight: 58,
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      borderWidth: 1,
      borderColor: theme.border.subtle,
      borderRadius: 16,
      backgroundColor: theme.surface.card,
      paddingHorizontal: 3,
      paddingVertical: 6,
    },
    mobileVoiceControlButtonActive: {
      borderColor: theme.border.focus,
      backgroundColor: theme.accent.soft,
    },
    mobileVoiceControlButtonDanger: {
      borderColor: theme.status.danger,
      backgroundColor: theme.status.dangerSoft,
    },
    mobileVoiceControlButtonDisabled: {
      opacity: 0.48,
    },
    mobileVoiceControlButtonPrimary: {
      borderColor: theme.accent.action,
      backgroundColor: theme.accent.action,
    },
    mobileVoiceControlLabel: {
      color: theme.text.muted,
      fontSize: 9,
      fontFamily: theme.typography.fontFamilyExtraBold,
      textAlign: "center",
    },
    mobileVoiceControlLabelDanger: {
      color: theme.status.onStatus,
    },
    mobileVoiceControlLabelDisabled: {
      color: theme.text.soft,
    },
    mobileVoiceControlLabelPrimary: {
      color: theme.text.onPrimary,
    },
    mobilePushToTalkButton: {
      minHeight: 62,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      borderWidth: 1,
      borderColor: theme.status.success,
      borderRadius: 18,
      backgroundColor: theme.status.successSoft,
      paddingHorizontal: 14,
      paddingVertical: 9,
    },
    mobilePushToTalkButtonActive: {
      borderColor: theme.status.success,
      backgroundColor: theme.status.successSoft,
    },
    mobilePushToTalkButtonDisabled: {
      opacity: 0.48,
    },
    mobilePushToTalkIcon: {
      width: 42,
      height: 42,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 16,
      backgroundColor: theme.surface.inverse,
    },
    mobilePushToTalkIconActive: {
      backgroundColor: theme.surface.inverse,
    },
    mobilePushToTalkLabel: {
      minWidth: 0,
      color: theme.status.successText,
      fontSize: 15,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    mobileVoiceScreenShareBanner: {
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderWidth: 1,
      borderColor: theme.status.success,
      borderRadius: 16,
      backgroundColor: theme.status.successSoft,
      padding: 10,
    },
    mobileVoiceScreenShareBannerDescription: {
      color: theme.status.successText,
      fontSize: 11,
      fontFamily: theme.typography.fontFamilyExtraBold,
      lineHeight: 15,
    },
    mobileVoiceScreenShareBannerIcon: {
      width: 34,
      height: 34,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 13,
      backgroundColor: theme.status.successSoft,
    },
    mobileVoiceScreenShareBannerText: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    mobileVoiceScreenShareBannerTitle: {
      color: theme.status.successText,
      fontSize: 13,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    mobileVoiceScreenShareConsent: {
      minWidth: 0,
      flexDirection: "row",
      gap: 10,
      borderWidth: 1,
      borderColor: theme.status.warning,
      borderRadius: 16,
      backgroundColor: theme.status.warningSoft,
      padding: 12,
    },
    mobileVoiceScreenShareConsentActions: {
      marginTop: 9,
      minWidth: 0,
      flexDirection: "row",
      gap: 8,
    },
    mobileVoiceScreenShareConsentDescription: {
      color: theme.status.warning,
      fontSize: 12,
      fontFamily: theme.typography.fontFamilyExtraBold,
      lineHeight: 17,
    },
    mobileVoiceScreenShareConsentIcon: {
      width: 34,
      height: 34,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 13,
      backgroundColor: theme.status.warningSoft,
    },
    mobileVoiceScreenShareConsentText: {
      flex: 1,
      minWidth: 0,
    },
    mobileVoiceScreenShareConsentTitle: {
      marginBottom: 3,
      color: theme.status.warning,
      fontSize: 14,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    mobileVoiceScreenShareFullscreen: {
      flex: 1,
      minWidth: 0,
      gap: 12,
      backgroundColor: theme.media.surface,
      paddingHorizontal: 12,
      paddingBottom: 12,
      paddingTop: 44,
    },
    mobileVoiceScreenShareFullscreenClose: {
      width: 42,
      height: 42,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: theme.media.border,
      borderRadius: 16,
      backgroundColor: theme.media.surfaceElevated,
    },
    mobileVoiceScreenShareFullscreenEyebrow: {
      color: theme.status.info,
      fontSize: 11,
      fontFamily: theme.typography.fontFamilyExtraBold,
      textTransform: "uppercase",
    },
    mobileVoiceScreenShareFullscreenFrame: {
      width: "100%",
      aspectRatio: 16 / 9,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: theme.media.border,
      borderRadius: 16,
      backgroundColor: theme.media.surface,
    },
    mobileVoiceScreenShareFullscreenHeader: {
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    mobileVoiceScreenShareFullscreenScroll: {
      flex: 1,
    },
    mobileVoiceScreenShareFullscreenScrollContent: {
      flexGrow: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    mobileVoiceScreenShareFullscreenText: {
      flex: 1,
      minWidth: 0,
    },
    mobileVoiceScreenShareFullscreenTitle: {
      marginTop: 3,
      color: theme.text.onPrimary,
      fontSize: 17,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    mobileVoiceScreenShareFullscreenVideo: {
      flex: 1,
      width: "100%",
      backgroundColor: theme.media.surface,
    },
    mobileVoiceScreenShareFullscreenWaiting: {
      flex: 1,
      minHeight: 220,
      width: "100%",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: theme.media.surface,
      padding: 18,
    },
    mobileVoiceScreenShareVideo: {
      flex: 1,
      width: "100%",
      backgroundColor: theme.media.surface,
    },
    mobileVoiceScreenShareVideoFrame: {
      width: "100%",
      aspectRatio: 16 / 9,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: theme.status.info,
      borderRadius: 14,
      backgroundColor: theme.media.surface,
    },
    mobileVoiceScreenShareViewer: {
      gap: 10,
      minWidth: 0,
      borderWidth: 1,
      borderColor: theme.status.info,
      borderRadius: 16,
      backgroundColor: theme.status.infoSoft,
      padding: 10,
    },
    mobileVoiceScreenShareViewerAction: {
      width: 36,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: theme.status.info,
      borderRadius: 14,
      backgroundColor: theme.surface.card,
    },
    mobileVoiceScreenShareViewerActionDisabled: {
      opacity: 0.5,
    },
    mobileVoiceScreenShareViewerEyebrow: {
      color: theme.status.info,
      fontSize: 10,
      fontFamily: theme.typography.fontFamilyExtraBold,
      textTransform: "uppercase",
    },
    mobileVoiceScreenShareViewerHeader: {
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
    },
    mobileVoiceScreenShareViewerIcon: {
      width: 34,
      height: 34,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 13,
      backgroundColor: theme.status.infoSoft,
    },
    mobileVoiceScreenShareViewerText: {
      flex: 1,
      minWidth: 0,
    },
    mobileVoiceScreenShareViewerTitle: {
      marginTop: 1,
      color: theme.text.primary,
      fontSize: 13,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    mobileVoiceScreenShareWaiting: {
      flex: 1,
      minHeight: 150,
      width: "100%",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: theme.media.surface,
      padding: 16,
    },
    mobileVoiceScreenShareWaitingText: {
      color: theme.media.textMuted,
      fontSize: 12,
      fontFamily: theme.typography.fontFamilyExtraBold,
      lineHeight: 17,
      textAlign: "center",
    },
    mobileVoiceEmptyText: {
      color: theme.text.muted,
      fontSize: 12,
      lineHeight: 17,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    mobileVoiceError: {
      overflow: "hidden",
      borderWidth: 1,
      borderColor: theme.status.danger,
      borderRadius: mobileRadii.control,
      backgroundColor: theme.status.dangerSoft,
      color: theme.status.onStatus,
      fontSize: 12,
      lineHeight: 17,
      fontFamily: theme.typography.fontFamilyExtraBold,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    mobileVoiceHeaderDisabledButton: {
      opacity: 0.56,
    },
    mobileVoiceInfoLabel: {
      flex: 1,
      minWidth: 0,
      color: theme.text.muted,
      fontSize: 12,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    mobileVoiceInfoRow: {
      minHeight: 38,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderTopWidth: 1,
      borderTopColor: theme.border.subtle,
      paddingTop: 9,
    },
    mobileVoiceInfoValue: {
      maxWidth: "48%",
      color: theme.text.primary,
      fontSize: 12,
      fontFamily: theme.typography.fontFamilyExtraBold,
      textAlign: "right",
    },
    mobileVoiceLevelBar: {
      width: 4,
      borderRadius: mobileRadii.pill,
      backgroundColor: theme.status.success,
    },
    mobileVoiceLevelBars: {
      width: 34,
      minHeight: 28,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: 3,
    },
    mobileVoiceParticipantList: {
      gap: 7,
      minWidth: 0,
    },
    mobileVoiceParticipantRow: {
      minHeight: 58,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderWidth: 1,
      borderColor: theme.border.subtle,
      borderRadius: 15,
      backgroundColor: theme.surface.soft,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    mobileVoiceParticipantRowSpeaking: {
      borderColor: theme.status.success,
      backgroundColor: theme.status.successSoft,
    },
    mobileVoiceParticipantSubtitle: {
      marginTop: 2,
      color: theme.text.muted,
      fontSize: 12,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    mobileVoiceParticipantText: {
      flex: 1,
      minWidth: 0,
    },
    mobileVoiceParticipantTitle: {
      minWidth: 0,
      color: theme.text.primary,
      fontSize: 14,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    mobileVoiceParticipantTitleRow: {
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    mobileVoiceSectionCard: {
      gap: 10,
      minWidth: 0,
      borderWidth: 1,
      borderColor: theme.border.subtle,
      borderRadius: 16,
      backgroundColor: theme.surface.card,
      padding: 12,
    },
    mobileVoiceSectionCount: {
      minWidth: 24,
      overflow: "hidden",
      borderRadius: mobileRadii.pill,
      backgroundColor: theme.accent.soft,
      color: theme.accent.strong,
      fontSize: 11,
      fontFamily: theme.typography.fontFamilyExtraBold,
      lineHeight: 21,
      paddingHorizontal: 7,
      textAlign: "center",
    },
    mobileVoiceSectionHeader: {
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    },
    mobileVoiceSectionTitle: {
      flex: 1,
      minWidth: 0,
      color: theme.text.muted,
      fontSize: 11,
      fontFamily: theme.typography.fontFamilyExtraBold,
      letterSpacing: 2,
      textTransform: "uppercase",
    },
    mobileVoiceSelfBadge: {
      overflow: "hidden",
      borderRadius: mobileRadii.pill,
      backgroundColor: theme.accent.soft,
      color: theme.accent.strong,
      fontSize: 10,
      fontFamily: theme.typography.fontFamilyExtraBold,
      lineHeight: 18,
      paddingHorizontal: 7,
    },
    mobileVoiceStatusRow: {
      minWidth: 0,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 7,
    },
    mobileVoiceStatusText: {
      color: theme.text.muted,
      fontSize: 12,
      lineHeight: 17,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    // #camera-stage: paginated media surface, four tiles per screen.
    activeVoiceRoomStage: {
      flex: 1,
      minWidth: 0,
      gap: 10,
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 4,
    },
    activeVoiceRoomStagePager: {
      flex: 1,
      minWidth: 0,
    },
    activeVoiceRoomStagePage: {
      height: "100%",
    },
    activeVoiceRoomStageGrid: {
      flex: 1,
      gap: 10,
    },
    activeVoiceRoomStageRow: {
      flex: 1,
      minWidth: 0,
      flexDirection: "row",
      gap: 10,
    },
    activeVoiceRoomStageTile: {
      flex: 1,
      minWidth: 0,
      overflow: "hidden",
      position: "relative",
      borderWidth: 1,
      borderColor: theme.voiceRoom.border,
      borderRadius: 24,
      backgroundColor: theme.media.surface,
    },
    activeVoiceRoomStageTileSpeaking: {
      borderWidth: 2,
      borderColor: theme.voiceRoom.success,
    },
    activeVoiceRoomStageVideo: {
      height: "100%",
      width: "100%",
    },
    activeVoiceRoomStageTilePlaceholder: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      backgroundColor: theme.voiceRoom.card,
      padding: 12,
    },
    activeVoiceRoomStageTilePlaceholderName: {
      maxWidth: "90%",
      color: theme.voiceRoom.text,
      fontSize: 13,
      fontFamily: theme.typography.fontFamilyBold,
      textAlign: "center",
    },
    activeVoiceRoomStageTagText: {
      color: theme.voiceRoom.success,
      fontSize: 10,
      fontFamily: theme.typography.fontFamilyExtraBold,
      letterSpacing: 1,
      textTransform: "uppercase",
    },
    activeVoiceRoomStageDots: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
    },
    activeVoiceRoomStageDot: {
      width: 7,
      height: 7,
      borderRadius: mobileRadii.pill,
      backgroundColor: theme.voiceRoom.border,
    },
    activeVoiceRoomStageDotActive: {
      width: 18,
      backgroundColor: theme.voiceRoom.accent,
    },
    activeVoiceRoomRail: {
      minHeight: 62,
      maxHeight: 62,
    },
    activeVoiceRoomRailContent: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingHorizontal: 6,
    },
    activeVoiceRoomRailItem: {
      width: 58,
      alignItems: "center",
      gap: 5,
    },
    activeVoiceRoomRailName: {
      maxWidth: 58,
      color: theme.voiceRoom.textSecondary,
      fontSize: 10.5,
      fontFamily: theme.typography.fontFamilyBold,
      textAlign: "center",
    },
    ...createSharedStyles(theme),
  } satisfies Record<string, ImageStyle | TextStyle | ViewStyle>;
};

export const useVoiceScreenStyles = () => useVoiceRoomThemedStyles(createVoiceScreenStyles);

/**
 * The invite sheet is a normal app sheet that happens to open from the room, so
 * it reads the app theme the `BottomSheet` chrome around it already uses — not
 * the room's own light/dark preference.
 */
export const createVoiceInviteSheetStyles = (theme: MobileTheme) =>
  ({
    root: {
      minWidth: 0,
      gap: 14,
    },
    /** About five rows; past that the list scrolls instead of eating the screen. */
    scroll: {
      maxHeight: 288,
      minWidth: 0,
    },
    list: {
      gap: 6,
      paddingBottom: 2,
    },
    row: {
      minHeight: theme.sizing.minTouchTarget,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.row,
      borderWidth: 1,
      borderColor: theme.border.subtle,
      borderRadius: theme.radii.row,
      backgroundColor: theme.surface.card,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    rowPressed: {
      opacity: 0.72,
    },
    rowDisabled: {
      opacity: 0.72,
    },
    rowText: {
      flex: 1,
      minWidth: 0,
      gap: 1,
    },
    rowTitle: {
      ...theme.typography.bodyStrong,
      color: theme.text.primary,
    },
    rowSubtitle: {
      ...theme.typography.caption,
      color: theme.text.muted,
    },
    rowSubtitleError: {
      color: theme.status.dangerOnBase,
    },
    action: {
      minHeight: 28,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      borderWidth: 1,
      borderColor: "transparent",
      borderRadius: theme.radii.pill,
      paddingHorizontal: 10,
    },
    actionFilled: {
      borderColor: theme.accent.action,
      backgroundColor: theme.accent.action,
    },
    actionText: {
      color: theme.text.onPrimary,
      fontSize: 11.5,
      fontFamily: theme.typography.fontFamilyExtraBold,
    },
    empty: {
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderWidth: 1,
      borderColor: theme.border.subtle,
      borderRadius: theme.radii.row,
      backgroundColor: theme.surface.soft,
      paddingHorizontal: 12,
      paddingVertical: 14,
    },
    emptyText: {
      ...theme.typography.caption,
      flex: 1,
      minWidth: 0,
      color: theme.text.muted,
    },
  }) satisfies Record<string, ImageStyle | TextStyle | ViewStyle>;

export const useVoiceInviteSheetStyles = () => useThemedStyles(createVoiceInviteSheetStyles);
