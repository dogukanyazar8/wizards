/**
 * Where a transcript starts rendering from, as something a run can measure.
 *
 * `startRenderingFromBottom` is what makes a chat behave like a chat: content
 * sits on the bottom edge and grows upward, and a prepended page does not yank
 * the reader down. It also asks FlashList to lay the content out before it can
 * show the first row, and a device measured 560-676ms between `list-mounted` and
 * `content` on an idle thread with no network in the open at all.
 *
 * Whether that layout pass is part of the cost is a question about numbers, so it
 * gets a switch rather than an opinion. `bottom` is the product behaviour and the
 * default; `top` exists to be compared against it in a baseline run and is
 * refused outside the builds that carry the diagnostics panel.
 */
export type MobileMessageListAnchorVariant = "bottom" | "top";

export type MobileMessageListAnchorConfig = {
  readonly animateAutoScrollToBottom: boolean;
  readonly autoscrollToBottomThreshold: number;
  readonly startRenderingFromBottom: boolean;
};

/**
 * Frozen so the two transcripts hand FlashList the same object identity on every
 * render; a fresh literal per render is a prop change the list has to consider.
 */
const ANCHOR_CONFIGS: Readonly<
  Record<MobileMessageListAnchorVariant, MobileMessageListAnchorConfig>
> = Object.freeze({
  bottom: Object.freeze({
    animateAutoScrollToBottom: true,
    autoscrollToBottomThreshold: 0.2,
    startRenderingFromBottom: true,
  }),
  top: Object.freeze({
    animateAutoScrollToBottom: true,
    autoscrollToBottomThreshold: 0.2,
    startRenderingFromBottom: false,
  }),
});

let variant: MobileMessageListAnchorVariant = "bottom";

/**
 * Only a build with the panel may leave the product behaviour. A reader must not
 * get a transcript that renders from the top because an instrument said so.
 */
export function configureMobileMessageListAnchor(input: {
  readonly allowExperiment: boolean;
  readonly variant: MobileMessageListAnchorVariant;
}): void {
  variant = input.allowExperiment ? input.variant : "bottom";
}

export function getMobileMessageListAnchorVariant(): MobileMessageListAnchorVariant {
  return variant;
}

export function getMobileMessageListAnchorConfig(): MobileMessageListAnchorConfig {
  return ANCHOR_CONFIGS[variant];
}

export function resetMobileMessageListAnchorForTests(): void {
  variant = "bottom";
}
