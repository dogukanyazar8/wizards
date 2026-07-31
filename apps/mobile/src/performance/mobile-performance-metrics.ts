export type MobilePerformanceSurface =
  | "channel-messages"
  | "dm-inbox"
  | "dm-messages"
  | "navigation"
  | "startup"
  | "workspace-channels"
  | "workspace-servers";

export type MobilePerformanceMetricKind = "list-load" | "navigation" | "startup";

export interface MobilePerformanceMetric {
  readonly durationMs: number;
  readonly metric: MobilePerformanceMetricKind;
  readonly surface: MobilePerformanceSurface;
}

/**
 * One measurement, kept whole.
 *
 * The store used to be a `Map` keyed by surface, so a second measurement of the
 * same screen overwrote the first — a session reported one sample per surface
 * however many times the reader opened it, and no percentile could be built from
 * that. Samples are appended instead, each with an id the backend can dedupe on,
 * because the reporter may retry a batch it already delivered.
 */
export interface MobilePerformanceSample extends MobilePerformanceMetric {
  readonly context: Readonly<Record<string, unknown>>;
  readonly sampleId: string;
}

interface MobileListLoadInfo {
  readonly elapsedTimeInMs: number;
}

const MAX_MOBILE_PERFORMANCE_DURATION_MS = 60_000;
/** Beyond this the oldest samples go: a session that is never flushed must not grow. */
export const MOBILE_PERFORMANCE_SAMPLE_CAP = 200;

let samples: MobilePerformanceSample[] = [];
let sampleCounter = 0;
// Distinguishes samples from two runs of the same install, so ids stay unique
// across a restart without needing a crypto source at import time.
const processNonce = Date.now().toString(36);

function normalizeDurationMs(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.round(Math.min(value, MAX_MOBILE_PERFORMANCE_DURATION_MS) * 100) / 100;
}

function nextSampleId(): string {
  sampleCounter += 1;
  return `${processNonce}-${sampleCounter}`;
}

export function createMobilePerformanceMetric(
  surface: MobilePerformanceSurface,
  durationMs: number,
): MobilePerformanceMetric {
  return Object.freeze({
    durationMs: normalizeDurationMs(durationMs),
    metric: surface === "startup" ? "startup" : "list-load",
    surface,
  });
}

export function recordMobilePerformanceSample(input: {
  readonly context?: Readonly<Record<string, unknown>>;
  readonly durationMs: number;
  readonly metric: MobilePerformanceMetricKind;
  readonly surface: MobilePerformanceSurface;
}): MobilePerformanceSample {
  const sample: MobilePerformanceSample = Object.freeze({
    context: Object.freeze({ ...(input.context ?? {}) }),
    durationMs: normalizeDurationMs(input.durationMs),
    metric: input.metric,
    sampleId: nextSampleId(),
    surface: input.surface,
  });

  samples.push(sample);
  if (samples.length > MOBILE_PERFORMANCE_SAMPLE_CAP) {
    samples = samples.slice(samples.length - MOBILE_PERFORMANCE_SAMPLE_CAP);
  }

  onSampleObservers.forEach((observer) => {
    try {
      observer(sample);
    } catch {
      // A retained-log writer that throws must not cost the measurement.
    }
  });

  return sample;
}

type MobilePerformanceSampleObserver = (sample: MobilePerformanceSample) => void;
const onSampleObservers = new Set<MobilePerformanceSampleObserver>();

/**
 * Watches every measurement as it is recorded.
 *
 * The retained log needs this because the array below is *drained*, not read:
 * the health reporter hands samples away on an interval and on every background
 * transition, so anything that only reads the array sees whatever has not been
 * shipped yet. An observer sees each sample once, at the moment it exists.
 */
export function observeMobilePerformanceSamples(
  observer: MobilePerformanceSampleObserver,
): () => void {
  onSampleObservers.add(observer);
  return () => {
    onSampleObservers.delete(observer);
  };
}

export function resetMobilePerformanceSampleObserversForTests(): void {
  onSampleObservers.clear();
}

export function recordMobilePerformanceMetric(
  surface: MobilePerformanceSurface,
  durationMs: number,
): MobilePerformanceSample {
  return recordMobilePerformanceSample({
    durationMs,
    metric: surface === "startup" ? "startup" : "list-load",
    surface,
  });
}

/**
 * Hands the samples over and forgets them. The reporter owns delivery from here:
 * re-reading a snapshot on every flush is what sent the same measurement over and
 * over.
 */
export function drainMobilePerformanceSamples(): readonly MobilePerformanceSample[] {
  const drained = samples;
  samples = [];
  return Object.freeze(drained);
}

/** Read-only view, for surfaces that display the numbers rather than report them. */
export function peekMobilePerformanceSamples(): readonly MobilePerformanceSample[] {
  return Object.freeze([...samples]);
}

/** Kept for the surfaces that render the numbers; samples are what it returns. */
export function getMobilePerformanceMetricsSnapshot(): readonly MobilePerformanceSample[] {
  return peekMobilePerformanceSamples();
}

export function resetMobilePerformanceMetricsForTests(): void {
  samples = [];
  sampleCounter = 0;
}

/**
 * A list finishing its first render is the closest thing the app has to
 * "meaningful content on screen", so it is what closes the launch and the
 * tap-to-content spans as well as reporting its own render cost.
 *
 * The two are separate numbers on purpose: this one is render time, the span is
 * what the reader waited.
 */
function recordListLoad(
  surface: MobilePerformanceSurface,
  elapsedTimeInMs: number,
  route: string | null,
): MobilePerformanceSample {
  const sample = recordMobilePerformanceMetric(surface, elapsedTimeInMs);
  onListLoadObservers.forEach((observer) => observer(route));
  return sample;
}

type MobileListLoadObserver = (route: string | null) => void;
const onListLoadObservers = new Set<MobileListLoadObserver>();

/**
 * Lets the startup and navigation instruments react to content without this
 * module importing them — they import it, and a cycle would be the alternative.
 */
export function observeMobileListLoads(observer: MobileListLoadObserver): () => void {
  onListLoadObservers.add(observer);
  return () => {
    onListLoadObservers.delete(observer);
  };
}

export function resetMobileListLoadObserversForTests(): void {
  onListLoadObservers.clear();
}

/**
 * Content that arrived without a list to render it.
 *
 * `onLoad` is a FlashList callback, and FlashList never fires it for an empty
 * list — so an empty or failed chat open left its span open forever. Ten DM
 * opens in a device run all went to the abandoned counter for this reason. An
 * empty conversation is still an opening the reader waited for, so it closes the
 * span the same way, without inventing a render duration nobody measured.
 */
export function notifyMobileFirstPaint(route: string): void {
  if (route.length === 0) {
    return;
  }

  onListLoadObservers.forEach((observer) => observer(route));
}

export const mobileListLoadHandlers = Object.freeze({
  channelMessages: ({ elapsedTimeInMs }: MobileListLoadInfo) =>
    recordListLoad("channel-messages", elapsedTimeInMs, "ChannelChat"),
  /**
   * The bounded preview card, not the live transcript. It reports its render
   * cost but closes no span: it renders channel messages inside an already-open
   * channel screen, and it used to be wired to the DM handler — so every preview
   * render closed a `DirectMessage` span that a DM open was still waiting on.
   */
  channelMessagesPreview: ({ elapsedTimeInMs }: MobileListLoadInfo) =>
    recordListLoad("channel-messages", elapsedTimeInMs, null),
  dmInbox: ({ elapsedTimeInMs }: MobileListLoadInfo) =>
    recordListLoad("dm-inbox", elapsedTimeInMs, null),
  dmMessages: ({ elapsedTimeInMs }: MobileListLoadInfo) =>
    recordListLoad("dm-messages", elapsedTimeInMs, "DirectMessage"),
  workspaceChannels: ({ elapsedTimeInMs }: MobileListLoadInfo) =>
    recordListLoad("workspace-channels", elapsedTimeInMs, null),
  workspaceServers: ({ elapsedTimeInMs }: MobileListLoadInfo) =>
    recordListLoad("workspace-servers", elapsedTimeInMs, null),
});
