import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect } from "react";
import { Text, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { activeMobileCopy } from "../../locale/mobile-locale-preferences";
import type { MobileDMCallSession } from "../../voice/mobile-dm-call-state";
import { Avatar } from "../components/kit/avatar";
import { BottomSheet } from "../components/kit/bottom-sheet";
import { Button } from "../components/kit/button";
import { useSheetPresentation } from "../components/kit/sheet-primitives";
import { useMobileHaptics } from "../providers/mobile-haptics-provider";
import { useTheme } from "../providers/mobile-theme-provider";
import {
  resolveMobileIncomingRequest,
  type MobileIncomingRequestPresentation,
  type MobileVoiceInviteOverlayEntry,
} from "./mobile-incoming-request-model";
import { useMobileIncomingRequestSheetStyles } from "./mobile-incoming-request-sheet.styles";

const copy = activeMobileCopy;
/** Ring cadence: a haptic pulse every two seconds, like a phone ringtone burst. */
const RING_PULSE_INTERVAL_MS = 2_000;
const RING_HALO_DURATION_MS = 1_600;

/**
 * One bottom sheet for every inbound "join?" moment — DM voice/video calls and
 * voice-room invites from web, desktop or another phone. It replaces the two
 * bespoke top banners so both surfaces speak the redesigned sheet language.
 */
export function MobileIncomingRequestSheet({
  call,
  invites,
  onAcceptCall,
  onAcceptInvite,
  onDeclineCall,
  onDeclineInvite,
  vibrationEnabled = false,
}: {
  readonly call: MobileDMCallSession | null;
  readonly invites: readonly MobileVoiceInviteOverlayEntry[];
  onAcceptCall(): void;
  onAcceptInvite(inviteId: string): void;
  onDeclineCall(): void;
  onDeclineInvite(inviteId: string): void;
  /** Resolved from the notification preferences by the product shell. */
  readonly vibrationEnabled?: boolean;
}) {
  const invite = invites[0] ?? null;
  const request = resolveMobileIncomingRequest({ call, invite });

  const handleAccept = () => {
    if (!request) {
      return;
    }
    if (request.source === "call") {
      onAcceptCall();
    } else if (invite) {
      onAcceptInvite(invite.id);
    }
  };

  const handleDecline = () => {
    if (!request) {
      return;
    }
    if (request.source === "call") {
      onDeclineCall();
    } else if (invite) {
      onDeclineInvite(invite.id);
    }
  };

  return (
    <MobileIncomingRequestSheetView
      onAccept={handleAccept}
      onDecline={handleDecline}
      request={request}
      vibrationEnabled={vibrationEnabled}
    />
  );
}

function MobileIncomingRequestSheetView({
  onAccept,
  onDecline,
  request,
  vibrationEnabled,
}: {
  onAccept(): void;
  onDecline(): void;
  request: MobileIncomingRequestPresentation | null;
  vibrationEnabled: boolean;
}) {
  const styles = useMobileIncomingRequestSheetStyles();
  const presentation = useSheetPresentation();
  const { notification } = useMobileHaptics();
  const open = request !== null;
  const ringing = request?.ringing === true;

  // Pulse while a call rings so it is felt even when the phone is not being watched.
  useEffect(() => {
    if (!ringing || !vibrationEnabled) {
      return;
    }

    notification("warning");
    const interval = setInterval(() => notification("warning"), RING_PULSE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [notification, ringing, vibrationEnabled]);

  return (
    <BottomSheet
      accessibilityLabel={request?.title ?? copy.directCallIncomingVoiceTitle}
      onClose={onDecline}
      open={open}
      presentation={presentation}
      sizing="content"
      testID="mobile-incoming-request-sheet"
    >
      {request ? (
        <View style={styles.root} testID="mobile-incoming-request-card">
          <View style={styles.header}>
            <RequestAvatar request={request} />
            <View style={styles.headerText}>
              <Text numberOfLines={2} style={styles.title}>
                {request.title}
              </Text>
              <Text numberOfLines={3} style={styles.subtitle}>
                {request.subtitle}
              </Text>
              {request.errorMessage ? (
                <Text numberOfLines={2} style={styles.error} testID="mobile-incoming-request-error">
                  {request.errorMessage}
                </Text>
              ) : null}
            </View>
          </View>
          <View style={styles.actions}>
            <View style={styles.action}>
              <Button
                icon={request.decline.icon}
                label={request.decline.label}
                onPress={onDecline}
                testID="mobile-incoming-request-decline"
                variant={request.decline.variant}
              />
            </View>
            <View style={styles.action}>
              <Button
                icon={request.accept.icon}
                label={request.accept.label}
                onPress={onAccept}
                testID="mobile-incoming-request-accept"
                variant={request.accept.variant}
              />
            </View>
          </View>
        </View>
      ) : null}
    </BottomSheet>
  );
}

/** Caller avatar with a call-only pulsing halo and a kind badge (voice/video/invite). */
function RequestAvatar({ request }: { request: MobileIncomingRequestPresentation }) {
  const theme = useTheme();
  const styles = useMobileIncomingRequestSheetStyles();
  const reducedMotion = useReducedMotion() === true;
  const pulse = useSharedValue(0);
  const accent = request.source === "call" ? theme.status.success : theme.accent.default;

  useEffect(() => {
    if (!request.ringing || reducedMotion) {
      pulse.value = 0;
      return;
    }

    pulse.value = withRepeat(
      withTiming(1, { duration: RING_HALO_DURATION_MS, easing: Easing.out(Easing.ease) }),
      -1,
      false,
    );
    return () => {
      cancelAnimation(pulse);
      pulse.value = 0;
    };
  }, [pulse, reducedMotion, request.ringing]);

  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.5 * (1 - pulse.value),
    transform: [{ scale: 1 + pulse.value * 0.42 }],
  }));

  return (
    <View style={styles.avatarWrap}>
      {request.ringing ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.halo, { backgroundColor: accent }, haloStyle]}
        />
      ) : null}
      <Avatar
        identityId={request.identityId}
        imageUrl={request.avatarUrl}
        label={request.avatarLabel}
        size="lg"
      />
      <View style={[styles.badge, { backgroundColor: accent }]}>
        <Ionicons color={theme.text.onPrimary} name={request.badgeIcon} size={15} />
      </View>
    </View>
  );
}
