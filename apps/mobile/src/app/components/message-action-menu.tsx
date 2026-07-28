import * as Clipboard from "expo-clipboard";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  Alert,
  Pressable,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { activeMobileCopy as copy } from "../../locale/mobile-locale-preferences";
import { MobileLineIcon, type MobileLineIconName } from "../../design/mobile-line-icons";
import {
  MOBILE_OVERLAY_CLOSE_DURATION_MS,
  MOBILE_OVERLAY_CLOSE_EASING,
  OverlaySurface,
  useOverlayPhase,
} from "./kit/overlay-surface";
import { useMobileHaptics } from "../providers/mobile-haptics-provider";
import { useTheme } from "../providers/mobile-theme-provider";
import { useMobileBottomSystemSpacing } from "../use-mobile-bottom-system-spacing";
import { AvatarMark } from "./ui-atoms";
import { useMessageActionMenuStyles } from "./message-action-menu.styles";
import { MessageRowLongPressProvider } from "./message-row-long-press-context";
import {
  measureMobileMessageAnchor,
  useMobileMessageMenuBounds,
  type MobileMessageAnchorRect,
} from "./message-menu-anchor";
import type { MobileMessageReactionToggleInput } from "./message-primitives";

/** §2 "1g".2: the strip order is part of the contract, and it is five emoji. */
export const MOBILE_MESSAGE_REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "🙏"] as const;

/** How small the menu starts before it settles at its resting size. */
const MENU_ENTRY_SCALE = 0.96;

/** §2 "1g".1: `backdrop-filter: blur(3px)`. */
const MENU_BACKDROP_BLUR_INTENSITY = 3;

/** §2 "1g".2: the gap between the strip, the message and the action card. */
const MENU_LAYER_GAP = 9;

/** The strip hangs off the avatar column, the way the handoff insets it. */
const MENU_INCOMING_INSET = 38;

const MENU_SCREEN_PADDING = 16;

const MENU_BOTTOM_PADDING = 14;

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
  /** §2 "1g".2: where the row actually sits, so the menu can leave it there. */
  readonly anchor?: MobileMessageAnchorRect | null;
  readonly authorAvatarUrl: string | null;
  readonly authorId: string;
  readonly authorLabel: string;
  /** 10e: MANAGE_MESSAGES holder — mirrors the web `canModerate` toolbar gate. */
  readonly canModerate?: boolean;
  /** Long-press trigger content; omit for controlled usage (10e channel long press). */
  readonly children?: ReactNode;
  readonly currentUserId?: string;
  readonly disabled?: boolean;
  readonly message: MessageActionMenuMessage;
  /** Controlled overlay visibility; leave undefined for the built-in trigger. */
  readonly open?: boolean;
  readonly onClose?: () => void;
  /** Failed sends and preview-only surfaces drop the quick reaction bar. */
  readonly showQuickBar?: boolean;
  readonly onDelete?: () => void;
  readonly onDiscardFailed?: () => void;
  readonly onEdit?: () => void;
  readonly onForward?: () => void;
  readonly onOpenEmojiPicker?: () => void;
  /** Reaction roster sheet; only meaningful once the message carries reactions. */
  readonly onOpenReactionDetails?: () => void;
  /** Channel-only pin/unpin; DM conversations have no pinned-message surface. */
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
  /** Clock printed on the lifted copy, so it matches the row underneath it. */
  readonly timeLabel?: string;
}

type MessageActionMenuRow = {
  readonly destructive?: boolean;
  readonly icon: MobileLineIconName;
  readonly id: string;
  readonly label: string;
  readonly onPress: () => void;
  /** §2 "1g".3: reply and thread are 700 with an accent glyph; the rest are 600. */
  readonly primary?: boolean;
};

/**
 * The long-press target of a message row. Split out of the menu itself so a list
 * can keep the overlay outside its recycler: the row renders only this trigger,
 * the list renders the menu for whichever message id is selected. A row that
 * scrolls out of the render window then cannot take an open menu down with it.
 *
 * It also measures itself on the way in — §2 "1g".2 needs the rectangle the row
 * occupies, not a copy floated somewhere else.
 */
export function MessageActionMenuTrigger({
  children,
  disabled = false,
  onLongPress,
  onPress,
  onPressIn,
  onPressOut,
  style,
  testID,
}: {
  readonly children: ReactNode;
  readonly disabled?: boolean;
  readonly onLongPress: (anchor: MobileMessageAnchorRect | null) => void;
  readonly onPress?: (() => void) | undefined;
  /** §4 pressed state: the row scales itself, so it needs the touch edges. */
  readonly onPressIn?: (() => void) | undefined;
  readonly onPressOut?: (() => void) | undefined;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID: string;
}) {
  const styles = useMessageActionMenuStyles();
  const haptics = useMobileHaptics();
  const targetRef = useRef<View | null>(null);
  const anchorRef = useRef<MobileMessageAnchorRect | null>(null);
  // The rectangle is taken when the finger lands, 400ms before the menu opens,
  // so opening never waits on a measurement round-trip.
  const captureAnchor = () => {
    measureMobileMessageAnchor(targetRef.current, (anchor) => {
      anchorRef.current = anchor;
    });
  };
  // Published to the row's descendants too: a nested press target (an image
  // attachment card) owns the touch over its area and hands the long press back.
  const longPressTrigger = () => {
    haptics.impact();
    onLongPress(anchorRef.current);
  };

  return (
    <Pressable
      accessibilityLabel={copy.messageReactionMenuLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      // §4: 400ms and a light haptic.
      delayLongPress={400}
      disabled={disabled}
      onLongPress={longPressTrigger}
      {...(onPress ? { onPress } : {})}
      onPressIn={() => {
        captureAnchor();
        onPressIn?.();
      }}
      {...(onPressOut ? { onPressOut } : {})}
      ref={targetRef}
      style={style ?? styles.trigger}
      testID={testID}
    >
      <MessageRowLongPressProvider onLongPress={longPressTrigger}>
        {children}
      </MessageRowLongPressProvider>
    </Pressable>
  );
}

export function MessageActionMenu({
  anchor = null,
  authorAvatarUrl,
  authorId,
  authorLabel,
  canModerate = false,
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
  onOpenReactionDetails,
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
  timeLabel,
}: MessageActionMenuProps) {
  const styles = useMessageActionMenuStyles();
  const theme = useTheme();
  const haptics = useMobileHaptics();
  const screen = useWindowDimensions();
  const scrimBounds = useMobileMessageMenuBounds();
  // The card is centred, so a three-button navigation bar would otherwise crop
  // its bottom row; the inset keeps the last action above the bar.
  const bottomSystemInset = useMobileBottomSystemSpacing(0);
  const reducedMotion = useReducedMotion() === true;
  const [internalOpen, setInternalOpen] = useState(false);
  const [internalAnchor, setInternalAnchor] = useState<MobileMessageAnchorRect | null>(null);
  const [actionCardHeight, setActionCardHeight] = useState(0);
  const menuRef = useRef<View | null>(null);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const activeAnchor = anchor ?? internalAnchor;
  const close = () => {
    if (!isControlled) setInternalOpen(false);
    onClose?.();
  };
  const { phase, settleClosed } = useOverlayPhase(open);
  // §2 "1g".4 splits the entry in two: the scrim fades in over 150ms while the
  // layers ease out over 180ms from scale(.96). The exit stays on the shared
  // overlay timing, which is what owns the unmount.
  const progress = useSharedValue(open ? 1 : 0);
  const backdropProgress = useSharedValue(open ? 1 : 0);

  useLayoutEffect(() => {
    if (phase === "closed") {
      return;
    }

    if (phase === "open") {
      progress.value = reducedMotion
        ? 1
        : withTiming(1, { duration: 180, easing: Easing.out(Easing.cubic) });
      backdropProgress.value = reducedMotion ? 1 : withTiming(1, { duration: 150 });
      return;
    }

    if (reducedMotion) {
      progress.value = 0;
      backdropProgress.value = 0;
      settleClosed();
      return;
    }

    backdropProgress.value = withTiming(0, {
      duration: MOBILE_OVERLAY_CLOSE_DURATION_MS,
      easing: MOBILE_OVERLAY_CLOSE_EASING,
    });
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
  }, [backdropProgress, phase, progress, reducedMotion, settleClosed]);

  const animatedBackdropStyle = useAnimatedStyle(() => ({ opacity: backdropProgress.value }));
  // §2 "1g".2: only the layers scale in. The message itself never does, so its
  // copy is deliberately not part of this style.
  const animatedLayerStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      {
        scale: interpolate(progress.value, [0, 1], [MENU_ENTRY_SCALE, 1], Extrapolation.CLAMP),
      },
    ],
  }));
  const animatedMessageStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  const isFailed = message.deliveryStatus === "failed";
  const shouldRenderQuickBar = showQuickBar && !isFailed && onToggleReaction !== undefined;

  const copyRow: MessageActionMenuRow | null = message.content
    ? {
        icon: "copy",
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
                icon: "loader-arc",
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
                icon: "reply-arrow",
                id: "reply",
                label: copy.messageReplyAction,
                onPress: onReply,
                primary: true,
              } as const,
            ]
          : []),
        ...(scope === "channel" && onStartThread
          ? [
              {
                icon: "thread-start",
                id: "start-thread",
                label: copy.messageThreadStartAction,
                onPress: onStartThread,
                primary: true,
              } as const,
            ]
          : []),
        ...(own && onEdit
          ? [
              {
                icon: "edit",
                id: "edit",
                label: copy.messageEditAction,
                onPress: onEdit,
              } as const,
            ]
          : []),
        ...(onForward
          ? [
              {
                icon: "forward-arrow",
                id: "forward",
                label: copy.messageForwardAction,
                onPress: onForward,
              } as const,
            ]
          : []),
        ...(copyRow ? [copyRow] : []),
        // Pinning is a channel surface: DM conversations have no pinned list to
        // pin into, and only MANAGE_MESSAGES holders may pin on the server.
        ...(scope === "channel" && canModerate && onPin
          ? [
              {
                icon: "pin",
                id: "pin",
                label: message.isPinned ? copy.messageUnpinAction : copy.messagePinAction,
                onPress: onPin,
              } as const,
            ]
          : []),
        ...(onOpenReactionDetails && message.reactions.length > 0
          ? [
              {
                icon: "members",
                id: "reaction-details",
                label: copy.messageReactionDetailsAction,
                onPress: onOpenReactionDetails,
              } as const,
            ]
          : []),
      ];

  const dangerRows: readonly MessageActionMenuRow[] = isFailed
    ? onDiscardFailed
      ? [
          {
            destructive: true,
            icon: "trash",
            id: "discard-failed",
            label: copy.messageDiscardFailedAction,
            onPress: onDiscardFailed,
          },
        ]
      : []
    : (own || canModerate) && onDelete
      ? [
          {
            destructive: true,
            icon: "trash",
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
      {/* §2 "1g".3: the glyph is on the left of the label, never trailing it. */}
      <MobileLineIcon
        color={
          row.destructive
            ? theme.messaging.danger
            : row.primary
              ? theme.messaging.accentText
              : theme.messaging.textSecondary
        }
        name={row.icon}
        size={17}
      />
      <Text
        maxFontSizeMultiplier={2}
        style={[
          styles.actionLabel,
          row.primary && styles.actionLabelPrimary,
          row.destructive && styles.actionLabelDestructive,
        ]}
      >
        {row.label}
      </Text>
    </Pressable>
  );

  const quickBar = shouldRenderQuickBar ? (
    <Animated.View
      style={[
        styles.quickBar,
        activeAnchor === null && (own ? styles.alignOwn : styles.alignIncoming),
        activeAnchor === null && !own && styles.incomingInset,
        animatedLayerStyle,
      ]}
      testID={`${testID}-quick-bar`}
    >
      {MOBILE_MESSAGE_REACTION_EMOJIS.map((emoji) => {
        const reacted =
          currentUserId !== undefined &&
          message.reactions.some(
            (reaction) => reaction.emoji === emoji && reaction.userIds.includes(currentUserId),
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
          <MobileLineIcon color={theme.messaging.textSecondary} name="plus" size={17} />
        </Pressable>
      ) : null}
    </Animated.View>
  ) : null;

  const selectedMessage = (
    <Animated.View
      style={[
        styles.previewRow,
        activeAnchor === null && own && styles.previewRowOwn,
        animatedMessageStyle,
      ]}
      testID={`${testID}-preview`}
    >
      {!own && scope === "dm" ? (
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
      <View
        style={[
          styles.previewBubble,
          own && styles.previewBubbleOwn,
          scope === "channel" && styles.previewBubbleChannel,
        ]}
      >
        {scope === "channel" ? (
          <Text numberOfLines={1} style={styles.previewAuthor}>
            {authorLabel}
          </Text>
        ) : null}
        <View style={styles.previewBubbleLine}>
          <Text numberOfLines={8} style={[styles.previewText, own && styles.previewTextOwn]}>
            {previewText}
          </Text>
          {timeLabel ? (
            <Text style={[styles.previewTime, own && styles.previewTimeOwn]}>{timeLabel}</Text>
          ) : null}
        </View>
      </View>
    </Animated.View>
  );

  const actionCard =
    mainRows.length > 0 || dangerRows.length > 0 ? (
      <Animated.View
        accessibilityLabel={copy.messageActionMenuLabel}
        accessibilityRole="menu"
        onLayout={(event: LayoutChangeEvent) =>
          setActionCardHeight(event.nativeEvent.layout.height)
        }
        style={[
          styles.actionCard,
          activeAnchor === null && (own ? styles.alignOwn : styles.alignIncoming),
          activeAnchor === null && !own && styles.incomingInset,
          animatedLayerStyle,
        ]}
        testID={`${testID}-options`}
      >
        {mainRows.map(renderRow)}
        {mainRows.length > 0 && dangerRows.length > 0 ? (
          <View style={styles.actionSeparator} />
        ) : null}
        {dangerRows.map(renderRow)}
      </Animated.View>
    ) : null;

  // §2 "1g".1: the scrim darkens the conversation only — the header dims itself
  // and the composer stays at full strength — so it takes the message area's
  // rectangle when the surface published one.
  const backdropStyle = scrimBounds
    ? [styles.backdrop, { bottom: undefined, height: scrimBounds.height, top: scrimBounds.y }]
    : styles.backdrop;

  const layers = activeAnchor ? (
    // Absolute window coordinates: the copy lands exactly on the row it was
    // measured from, and the two layers hang off its edges.
    <View pointerEvents="box-none" style={styles.anchoredRoot} testID={`${testID}-menu`}>
      {quickBar ? (
        <View
          pointerEvents="box-none"
          style={[
            styles.anchoredLayer,
            {
              bottom: Math.max(0, screen.height - activeAnchor.y + MENU_LAYER_GAP),
            },
            own
              ? { alignItems: "flex-end", right: MENU_SCREEN_PADDING }
              : { alignItems: "flex-start", left: activeAnchor.x + MENU_INCOMING_INSET },
          ]}
        >
          {quickBar}
        </View>
      ) : null}
      <View
        pointerEvents="box-none"
        style={[
          styles.anchoredMessage,
          { left: activeAnchor.x, top: activeAnchor.y, width: activeAnchor.width },
        ]}
      >
        {selectedMessage}
      </View>
      {actionCard ? (
        <View
          pointerEvents="box-none"
          style={[
            styles.anchoredLayer,
            {
              top: Math.max(
                0,
                Math.min(
                  activeAnchor.y + activeAnchor.height + MENU_LAYER_GAP,
                  screen.height -
                    bottomSystemInset -
                    MENU_BOTTOM_PADDING -
                    Math.max(actionCardHeight, 0),
                ),
              ),
            },
            own
              ? { alignItems: "flex-end", right: MENU_SCREEN_PADDING }
              : { alignItems: "flex-start", left: activeAnchor.x + MENU_INCOMING_INSET },
          ]}
        >
          {actionCard}
        </View>
      ) : null}
    </View>
  ) : (
    // No measurement (a preview surface, a test): the handoff's own bottom stack.
    <Animated.View
      pointerEvents="box-none"
      ref={menuRef}
      style={[styles.content, { paddingBottom: bottomSystemInset + MENU_BOTTOM_PADDING }]}
      testID={`${testID}-menu`}
    >
      {quickBar}
      {selectedMessage}
      {actionCard}
    </Animated.View>
  );

  return (
    <>
      {children !== undefined ? (
        <MessageActionMenuTrigger
          disabled={disabled}
          onLongPress={(measured) => {
            setInternalAnchor(measured);
            setInternalOpen(true);
          }}
          {...(onPress ? { onPress } : {})}
          testID={`${testID}-trigger`}
        >
          {children}
        </MessageActionMenuTrigger>
      ) : null}
      {phase === "closed" ? null : (
        <OverlaySurface
          accessibilityLabel={copy.messageActionMenuCloseAction}
          animatedBackdropStyle={animatedBackdropStyle}
          backdropBlurIntensity={MENU_BACKDROP_BLUR_INTENSITY}
          backdropStyle={backdropStyle}
          focusRef={menuRef}
          onClose={close}
          open={open}
          style={styles.root}
          testID={testID}
        >
          {layers}
        </OverlaySurface>
      )}
    </>
  );
}
