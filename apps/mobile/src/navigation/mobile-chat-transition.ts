/**
 * The chat push animation, as something a run can measure instead of argue about.
 *
 * A device run measured `chat-open-cached` at 461ms p95 against a 100ms budget,
 * of which 106ms was already gone by the time the navigator had committed the
 * route. A 350ms slide cannot fit inside a 100ms budget, so one of the two has to
 * move — and which one is a question about numbers, not taste.
 *
 * The three variants therefore rotate *within* one session rather than across
 * builds: a run that compares a slide today against a fade tomorrow compares two
 * different devices, two different caches and two different networks as well.
 * Each chat open records the variant it used, so the panel can put the three side
 * by side from a single baseline.
 */
export type MobileChatTransitionVariant = "fade" | "none" | "slide";

/** Rotation order. `none` is first so production never spends the cached-open budget on motion. */
export const MOBILE_CHAT_TRANSITION_VARIANTS: readonly MobileChatTransitionVariant[] = [
  "none",
  "fade",
  "slide",
];

/** What `@react-navigation/native-stack` calls each of them. */
const NATIVE_STACK_ANIMATION = {
  fade: "fade",
  none: "none",
  slide: "slide_from_right",
} as const;

export type MobileChatTransitionAnimation =
  (typeof NATIVE_STACK_ANIMATION)[MobileChatTransitionVariant];

let rotationEnabled = false;
let reducedMotion = false;
let variantIndex = 0;

/**
 * Rotation is an instrument, so it is off wherever the panel is: a production
 * reader must not get a different transition on every chat they open. Reduced
 * motion outranks the experiment entirely — the operating system already said
 * what the answer is.
 */
export function configureMobileChatTransition(input: {
  readonly reducedMotion: boolean;
  readonly rotate: boolean;
}): void {
  reducedMotion = input.reducedMotion;
  rotationEnabled = input.rotate && !input.reducedMotion;
  if (!rotationEnabled) {
    variantIndex = 0;
  }
}

export function getMobileChatTransitionVariant(): MobileChatTransitionVariant {
  if (reducedMotion) {
    return "none";
  }

  return MOBILE_CHAT_TRANSITION_VARIANTS[variantIndex % MOBILE_CHAT_TRANSITION_VARIANTS.length]!;
}

/**
 * Moves to the next variant, once per chat open rather than once per render.
 *
 * The navigator calls this only when a chat route was newly committed, so the
 * variant a span records is the one the push actually played.
 */
export function advanceMobileChatTransitionVariant(): void {
  if (!rotationEnabled) {
    return;
  }

  variantIndex = (variantIndex + 1) % MOBILE_CHAT_TRANSITION_VARIANTS.length;
}

export function resolveMobileChatTransitionAnimation(
  variant: MobileChatTransitionVariant = getMobileChatTransitionVariant(),
): MobileChatTransitionAnimation {
  return NATIVE_STACK_ANIMATION[variant];
}

export function resetMobileChatTransitionForTests(): void {
  rotationEnabled = false;
  reducedMotion = false;
  variantIndex = 0;
}
