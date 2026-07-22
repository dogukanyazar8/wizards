import Ionicons from "@expo/vector-icons/Ionicons";
import * as Clipboard from "expo-clipboard";
import { useLayoutEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { activeMobileCopy as copy } from "../../locale/mobile-locale-preferences";
import {
  MOBILE_OVERLAY_CLOSE_DURATION_MS,
  MOBILE_OVERLAY_CLOSE_EASING,
  MOBILE_OVERLAY_OPEN_SPRING,
  OverlaySurface,
  useOverlayPhase,
} from "./kit/overlay-surface";
import { useMobileHaptics } from "../providers/mobile-haptics-provider";
import { useTheme } from "../providers/mobile-theme-provider";
import { useMobileBottomSystemSpacing } from "../use-mobile-bottom-system-spacing";
import { AvatarMark } from "./ui-atoms";
import { useMessageActionMenuStyles } from "./message-action-menu.styles";
import type { MobileMessageReactionToggleInput } from "./message-primitives";

/** 8a quick-reaction bar order is part of the visual handoff contract. */
export const MOBILE_MESSAGE_REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;

/** How small the menu starts before it settles at its resting size. */
const MENU_ENTRY_SCALE = 0.92;

const MENU_BACKDROP_BLUR_INTENSITY = 12;

export type MessageActionMenuMessage = {
  readonly content: string;
  readonly deliveryStatus?: string | undefined;
  readonly id: string;
  readonly isPinned?: boolean | undefined;
  readonly reactions: readonly {
    readonly count: number;
    readonly emoji: string;
    readonly userIds: readonly string[];
  }[];
};

export interface MessageActionMenuProps {
  readonly authorAvatarUrl: string | null;
  readonly authorId: string;
  readonly authorLabel: string;
  /** Long-press trigger content; omit for controlled usage (8c channel ⋯). */
  readonly children?: ReactNode;
  readonly currentUserId?: string;
  readonly disabled?: boolean;
  readonly message: MessageActionMenuMessage;
  /** Controlled overlay visibility; leave undefined for the built-in trigger. */
  readonly open?: boolean;
  readonly onClose?: () => void;
  /** 8c channel ⋯ card hides the quick reaction bar (the inline bar owns it). */
  readonly showQuickBar?: boolean;
  readonly onDelete?: () => void;
  readonly onDiscardFailed?: () => void;
  readonly onEdit?: () => void;
  /** Real forwarding lands with 8b; without a handler the row explains it is coming soon. */
  readonly onForward?: () => void;
  readonly onOpenEmojiPicker?: () => void;
  /** Real pinning lands with 8c; without a handler the row explains it is coming soon. */
  readonly onPin?: () => void;
  /** Plain tap on the row (e.g. double-tap ❤️ detection lives in the caller). */
  readonly onPress?: () => void;
  readonly onReply?: () => void;
  readonly onRetryFailedSend?: () => void;
  readonly onStartThread?: () => void;
  readonly onToggleReaction?: (input: MobileMessageReactionToggleInput) => void;
  readonly own: boolean;
  readonly previewText: string;
  readonly scope: "channel" | "dm";
  readonly testID?: string;
}

type MessageActionMenuRow = {
  readonly destructive?: boolean;
  readonly icon: ComponentProps<typeof Ionicons>["name"];
  readonly id: string;
  readonly label: string;
  readonly onPress: () => void;
};

export function MessageActionMenu({
  authorAvatarUrl,
  authorId,
  authorLabel,
  children,
  currentUserId,
  disabled = false,
  message,
  onClose,
  onDelete,
  onDiscardFailed,
  onEdit,
  onForward,
  onOpenEmojiPicker,
  onPin,
  onPress,
  onReply,
  onRetryFailedSend,
  onStartThread,
  onToggleReaction,
  open: controlledOpen,
  own,
  previewText,
  scope,
  showQuickBar = true,
  testID = "mobile-message-actions",
}: MessageActionMenuProps) {
  const styles = useMessageActionMenuStyles();
  const theme = useTheme();
  const haptics = useMobileHaptics();
  // The card is centred, so a three-button navigation bar would otherwise crop
  // its bottom row; the inset keeps the last action above the bar.
  const bottomSystemInset = useMobileBottomSystemSpacing(0);
  const reducedMotion = useReducedMotion() === true;
  const [internalOpen, setInternalOpen] = useState(false);
  const menuRef = useRef<View | null>(null);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const close = () => {
    if (!isControlled) setInternalOpen(false);
    onClose?.();
  };

  const { phase, settleClosed } = useOverlayPhase(open);
  // The card grows into place and shrinks back out; the backdrop rides the same
  // progress so the blur never snaps on or off.
  const progress = useSharedValue(open ? 1 : 0);

  useLayoutEffect(() => {
    if (phase === "closed") {
      return;
    }

    if (phase === "open") {
      progress.value = reducedMotion ? 1 : withSpring(1, MOBILE_OVERLAY_OPEN_SPRING);
      return;
    }

    if (reducedMotion) {
      progress.value = 0;
      settleClosed();
      return;
    }

    progress.value = withTiming(
      0,
      { duration: MOBILE_OVERLAY_CLOSE_DURATION_MS, easing: MOBILE_OVERLAY_CLOSE_EASING },
      (finished) => {
        "worklet";
        if (finished === true) {
          runOnJS(settleClosed)();
        }
      },
    );
  }, [phase, progress, reducedMotion, settleClosed]);

  const animatedBackdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const animatedMenuStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      {
        scale: interpolate(progress.value, [0, 1], [MENU_ENTRY_SCALE, 1], Extrapolation.CLAMP),
      },
    ],
  }));

  const isFailed = message.deliveryStatus === "failed";
  const shouldRenderQuickBar = showQuickBar && !isFailed && onToggleReaction !== undefined;

  const copyRow: MessageActionMenuRow | null = message.content
    ? {
        icon: "copy-outline",
        id: "copy",
        label: copy.messageCopyAction,
        onPress: () => {
          void Clipboard.setStringAsync(message.content).catch(() => {
            Alert.alert(copy.messageCopyFailedTitle, copy.messageCopyFailedDescription);
          });
        },
      }
    : null;

  const mainRows: readonly MessageActionMenuRow[] = isFailed
    ? [
        ...(onRetryFailedSend
          ? [
              {
                icon: "refresh-outline",
                id: "retry-send",
                label: copy.messageRetrySendAction,
                onPress: onRetryFailedSend,
              } as const,
            ]
          : []),
        ...(copyRow ? [copyRow] : []),
      ]
    : [
        ...(onReply
          ? [
              {
                icon: "arrow-undo-outline",
                id: "reply",
                label: copy.messageReplyAction,
                onPress: onReply,
              } as const,
            ]
          : []),
        ...(own && onEdit
          ? [
              {
                icon: "create-outline",
                id: "edit",
                label: copy.messageEditAction,
                onPress: onEdit,
              } as const,
            ]
          : []),
        ...(scope === "channel" && onStartThread
          ? [
              {
                icon: "chatbubbles-outline",
                id: "start-thread",
                label: copy.messageThreadStartAction,
                onPress: onStartThread,
              } as const,
            ]
          : []),
        {
          icon: "arrow-redo-outline",
          id: "forward",
          label: copy.messageForwardAction,
          onPress:
            onForward ??
            (() => {
              Alert.alert(
                copy.messageFeatureComingSoonTitle,
                copy.messageForwardComingSoonDescription,
              );
            }),
        } as const,
        ...(copyRow ? [copyRow] : []),
        {
          icon: "pin-outline",
          id: "pin",
          label: message.isPinned ? copy.messageUnpinAction : copy.messagePinAction,
          onPress:
            onPin ??
            (() => {
              Alert.alert(copy.messageFeatureComingSoonTitle, copy.messagePinComingSoonDescription);
            }),
        } as const,
      ];

  const dangerRows: readonly MessageActionMenuRow[] = isFailed
    ? onDiscardFailed
      ? [
          {
            destructive: true,
            icon: "trash-outline",
            id: "discard-failed",
            label: copy.messageDiscardFailedAction,
            onPress: onDiscardFailed,
          },
        ]
      : []
    : own && onDelete
      ? [
          {
            destructive: true,
            icon: "trash-outline",
            id: "delete",
            label: copy.messageDeleteAction,
            onPress: () => {
              Alert.alert(copy.messageDeleteConfirmTitle, copy.messageDeleteConfirmDescription, [
                { style: "cancel", text: copy.messageDeleteCancelAction },
                { onPress: onDelete, style: "destructive", text: copy.messageDeleteAction },
              ]);
            },
          },
        ]
      : [];

  const handleRowPress = (row: MessageActionMenuRow) => {
    row.destructive ? haptics.notification("warning") : haptics.selection();
    close();
    row.onPress();
  };

  const renderRow = (row: MessageActionMenuRow) => (
    <Pressable
      accessibilityLabel={row.label}
      accessibilityRole="menuitem"
      key={row.id}
      onPress={() => handleRowPress(row)}
      style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
      testID={`${testID}-action-${row.id}`}
    >
      <Text
        maxFontSizeMultiplier={2}
        style={[styles.actionLabel, row.destructive && styles.actionLabelDestructive]}
      >
        {row.label}
      </Text>
      <Ionicons
        name={row.icon}
        size={17}
        color={row.destructive ? theme.status.danger : theme.text.visualSecondary}
      />
    </Pressable>
  );

  return (
    <>
      {children !== undefined ? (
        <Pressable
          accessibilityLabel={copy.messageReactionMenuLabel}
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          delayLongPress={350}
          disabled={disabled}
          onLongPress={() => {
            haptics.impact();
            setInternalOpen(true);
          }}
          {...(onPress ? { onPress } : {})}
          style={styles.trigger}
          testID={`${testID}-trigger`}
        >
          {children}
        </Pressable>
      ) : null}
      {phase === "closed" ? null : (
        <OverlaySurface
          accessibilityLabel={copy.messageActionMenuCloseAction}
          animatedBackdropStyle={animatedBackdropStyle}
          backdropBlurIntensity={MENU_BACKDROP_BLUR_INTENSITY}
          backdropStyle={styles.backdrop}
          focusRef={menuRef}
          onClose={close}
          open={open}
          style={styles.root}
          testID={testID}
        >
          <Animated.View
            pointerEvents="box-none"
            ref={menuRef}
            style={[styles.content, { paddingBottom: bottomSystemInset }, animatedMenuStyle]}
            testID={`${testID}-menu`}
          >
              {shouldRenderQuickBar ? (
                <View
                  style={[styles.quickBar, own ? styles.alignOwn : styles.alignIncoming, !own && styles.incomingInset]}
                  testID={`${testID}-quick-bar`}
                >
                  {MOBILE_MESSAGE_REACTION_EMOJIS.map((emoji) => {
                    const reacted =
                      currentUserId !== undefined &&
                      message.reactions.some(
                        (reaction) =>
                          reaction.emoji === emoji && reaction.userIds.includes(currentUserId),
                      );
                    const label = (
                      reacted ? copy.messageReactionRemoveAction : copy.messageReactionAddAction
                    ).replace("{emoji}", emoji);
                    return (
                      <Pressable
                        accessibilityLabel={label}
                        accessibilityRole="button"
                        hitSlop={2}
                        key={emoji}
                        onPress={() => {
                          haptics.selection();
                          close();
                          onToggleReaction?.({
                            emoji,
                            messageId: message.id,
                            shouldReact: !reacted,
                          });
                        }}
                        style={[styles.quickEmojiButton, reacted && styles.quickEmojiButtonActive]}
                        testID={`${testID}-quick-${emoji}`}
                      >
                        <Text style={styles.quickEmojiText}>{emoji}</Text>
                      </Pressable>
                    );
                  })}
                  {onOpenEmojiPicker ? (
                    <Pressable
                      accessibilityLabel={copy.messageEmojiPickerAction}
                      accessibilityRole="button"
                      hitSlop={2}
                      onPress={() => {
                        haptics.selection();
                        close();
                        onOpenEmojiPicker();
                      }}
                      style={styles.moreEmojiButton}
                      testID={`${testID}-more-emoji`}
                    >
                      <Ionicons name="add" size={18} color={theme.text.visualSecondary} />
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
              <View
                style={[styles.previewRow, own && styles.previewRowOwn]}
                testID={`${testID}-preview`}
              >
                {!own ? (
                  <AvatarMark
                    avatarBorderRadius={11}
                    avatarBorderWidth={0}
                    dimension={30}
                    identityId={authorId}
                    imageUrl={authorAvatarUrl}
                    label={authorLabel}
                    style={styles.previewAvatar}
                  />
                ) : null}
                <View style={[styles.previewBubble, own && styles.previewBubbleOwn]}>
                  <Text
                    numberOfLines={8}
                    style={[styles.previewText, own && styles.previewTextOwn]}
                  >
                    {previewText}
                  </Text>
                </View>
              </View>
              {mainRows.length > 0 || dangerRows.length > 0 ? (
                <View
                  accessibilityRole="menu"
                  style={[
                    styles.actionCard,
                    own ? styles.alignOwn : styles.alignIncoming,
                    !own && styles.incomingInset,
                  ]}
                  testID={`${testID}-options`}
                >
                  {mainRows.map(renderRow)}
                  {mainRows.length > 0 && dangerRows.length > 0 ? (
                    <View style={styles.actionSeparator} />
                  ) : null}
                  {dangerRows.map(renderRow)}
                </View>
              ) : null}
          </Animated.View>
        </OverlaySurface>
      )}
    </>
  );
}
