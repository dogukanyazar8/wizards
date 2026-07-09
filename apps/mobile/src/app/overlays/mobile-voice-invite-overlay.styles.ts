import { StyleSheet } from "react-native";
import { mobileColors, mobileRadii } from "../../design/tokens";
import { sharedStyles } from "../styles/shared-styles";

export const mobileVoiceInviteOverlayStyles = StyleSheet.create({
  mobileVoiceInviteOverlay: {
    position: "absolute",
    top: 10,
    left: 8,
    right: 8,
    zIndex: 30,
  },
  mobileVoiceInviteOverlayActions: {
    gap: 6,
    alignItems: "stretch",
  },
  mobileVoiceInviteOverlayCard: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderWidth: 1,
    borderColor: "#C4B5FD",
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    padding: 10,
    shadowColor: "#6D5DFB",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 8,
  },
  mobileVoiceInviteOverlayDescription: {
    marginTop: 2,
    color: mobileColors.muted,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 15,
  },
  mobileVoiceInviteOverlayGhostButton: {
    minHeight: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: mobileRadii.pill,
    backgroundColor: "#F8FAFF",
    paddingHorizontal: 10,
  },
  mobileVoiceInviteOverlayGhostText: {
    color: mobileColors.muted,
    fontSize: 10,
    fontWeight: "900",
  },
  mobileVoiceInviteOverlayIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    backgroundColor: "#F5F3FF",
  },
  mobileVoiceInviteOverlayPrimaryButton: {
    minHeight: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: mobileRadii.pill,
    backgroundColor: mobileColors.accentStrong,
    paddingHorizontal: 12,
  },
  mobileVoiceInviteOverlayPrimaryText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "900",
  },
  mobileVoiceInviteOverlayText: {
    flex: 1,
    minWidth: 0,
  },
  mobileVoiceInviteOverlayTitle: {
    color: mobileColors.text,
    fontSize: 13,
    fontWeight: "900",
  },
});

export const styles = {
  ...sharedStyles,
  ...mobileVoiceInviteOverlayStyles,
};
