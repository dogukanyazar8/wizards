import { z } from "zod";

/**
 * Mesajlar paketi §5.5 / §8 — anket.
 *
 * Every rule the composer and the card enforce lives here, as pure functions,
 * because three surfaces need the same answers: the modal (may I submit?), the
 * card (what percentage is this?) and the route handler (is this body legal?).
 * A rule implemented beside whichever surface needed it first is a rule that
 * drifts.
 *
 * This module imports nothing from the package.
 */

/** §8: "en çok 6". */
export const POLL_MAX_OPTIONS = 6;
/** A poll with one option is a statement. */
export const POLL_MIN_OPTIONS = 2;
/** §8 draws three empty rows on open. */
export const POLL_INITIAL_OPTIONS = 3;
export const POLL_QUESTION_MAX_LENGTH = 300;
export const POLL_OPTION_MAX_LENGTH = 80;

export const PollDurationSchema = z.enum(["1h", "24h", "3d"]);
export type PollDuration = z.infer<typeof PollDurationSchema>;

/** Minutes each segment resolves to. The server does the arithmetic, not the client. */
export const POLL_DURATION_MINUTES: Readonly<Record<PollDuration, number>> = Object.freeze({
  "1h": 60,
  "24h": 60 * 24,
  "3d": 60 * 24 * 3,
});

// ---------------------------------------------------------------------------
// Draft — what the compose modal holds
// ---------------------------------------------------------------------------

export interface PollDraft {
  readonly question: string;
  readonly options: readonly string[];
  readonly multi: boolean;
  readonly anonymous: boolean;
  readonly duration: PollDuration;
}

/** §8's defaults: multi off, anonymous on, 24 saat. */
export function createInitialPollDraft(): PollDraft {
  return {
    anonymous: true,
    duration: "24h",
    multi: false,
    options: Array.from({ length: POLL_INITIAL_OPTIONS }, () => ""),
    question: "",
  };
}

function filledOptions(draft: PollDraft): string[] {
  return draft.options.map((option) => option.trim()).filter((option) => option.length > 0);
}

/** Enabled only with a question and at least two filled options. */
export function canSubmitPoll(draft: PollDraft): boolean {
  return draft.question.trim().length > 0 && filledOptions(draft).length >= POLL_MIN_OPTIONS;
}

export function canAddPollOption(draft: PollDraft): boolean {
  return draft.options.length < POLL_MAX_OPTIONS;
}

export function canRemovePollOption(draft: PollDraft): boolean {
  return draft.options.length > POLL_MIN_OPTIONS;
}

export function addPollOption(draft: PollDraft): PollDraft {
  if (!canAddPollOption(draft)) {
    return draft;
  }

  return { ...draft, options: [...draft.options, ""] };
}

/**
 * Removal is refused at the floor rather than clamped afterwards: a screen that
 * lets the row disappear and then silently re-adds it is worse than one where
 * the button was never drawn.
 */
export function removePollOption(draft: PollDraft, index: number): PollDraft {
  if (!canRemovePollOption(draft) || index < 0 || index >= draft.options.length) {
    return draft;
  }

  return { ...draft, options: draft.options.filter((_option, at) => at !== index) };
}

export function setPollOption(draft: PollDraft, index: number, value: string): PollDraft {
  if (index < 0 || index >= draft.options.length) {
    return draft;
  }

  return {
    ...draft,
    options: draft.options.map((option, at) => (at === index ? value : option)),
  };
}

/** `A`, `B`, `C`… for §8's letter tiles. Past `Z` it falls back to the number. */
export function getPollOptionKey(index: number): string {
  return index >= 0 && index < 26 ? String.fromCharCode(65 + index) : String(index + 1);
}

// ---------------------------------------------------------------------------
// Write contract
// ---------------------------------------------------------------------------

export const PollCreateRequestSchema = z
  .object({
    anonymous: z.boolean(),
    duration: PollDurationSchema,
    multi: z.boolean(),
    options: z
      .array(z.string().trim().min(1).max(POLL_OPTION_MAX_LENGTH))
      .min(POLL_MIN_OPTIONS)
      .max(POLL_MAX_OPTIONS),
    question: z.string().trim().min(1).max(POLL_QUESTION_MAX_LENGTH),
  })
  .strict();

export type PollCreateRequest = z.infer<typeof PollCreateRequestSchema>;

/** Blank rows are dropped here, so the request never carries an empty option. */
export function toPollCreateRequest(draft: PollDraft): PollCreateRequest {
  return {
    anonymous: draft.anonymous,
    duration: draft.duration,
    multi: draft.multi,
    options: filledOptions(draft),
    question: draft.question.trim(),
  };
}

/**
 * A vote replaces the voter's whole selection, rather than describing a delta.
 *
 * A delta (`add this`, `remove that`) needs the client and server to agree on
 * the prior state; two taps in flight at once make them disagree. Sending the
 * full set makes the last request win, which is what the user sees.
 */
export const PollVoteRequestSchema = z
  .object({
    optionIds: z.array(z.string().min(1)).max(POLL_MAX_OPTIONS),
  })
  .strict();

// ---------------------------------------------------------------------------
// Read contract
// ---------------------------------------------------------------------------

export const PollOptionDTOSchema = z.object({
  id: z.string(),
  label: z.string(),
  position: z.number().int().nonnegative(),
  votes: z.number().int().nonnegative(),
});

export const PollDTOSchema = z.object({
  /**
   * Server-computed. `anonymous` polls return `false` here **and** their voter
   * endpoint refuses — the client never derives this, so hiding a link can
   * never be the only thing protecting the names behind it.
   */
  canSeeVoters: z.boolean(),
  closesAt: z.string().datetime(),
  id: z.string(),
  multi: z.boolean(),
  anonymous: z.boolean(),
  /** Empty when the viewer has not voted. */
  myOptionIds: z.array(z.string()),
  options: z.array(PollOptionDTOSchema),
  question: z.string(),
  /** Distinct voters, not the sum of option counts — a multi vote counts once. */
  totalVoters: z.number().int().nonnegative(),
});

export type PollOptionDTO = z.infer<typeof PollOptionDTOSchema>;
export type PollDTO = z.infer<typeof PollDTOSchema>;

export const PollVoterDTOSchema = z.object({
  avatarUrl: z.string().nullable(),
  displayName: z.string().nullable(),
  id: z.string(),
  optionId: z.string(),
  username: z.string(),
});

export type PollVoterDTO = z.infer<typeof PollVoterDTOSchema>;

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------

export function isPollClosed(poll: PollDTO, now: Date): boolean {
  return new Date(poll.closesAt).getTime() <= now.getTime();
}

/**
 * Whole percentages per option id, summing to at most 100.
 *
 * Rounding each share independently overshoots (`{1,1,1}` of 3 → 33+33+33 = 99,
 * but `{1,2}` of 3 → 33+67 = 100 only by luck). This uses largest-remainder:
 * floor everything, then hand the leftover points to the largest remainders.
 * The bars are drawn from these numbers, so a total over 100 would overflow the
 * track.
 */
export function selectPollPercentages(poll: PollDTO): Record<string, number> {
  const total = poll.options.reduce((sum, option) => sum + option.votes, 0);
  const percentages: Record<string, number> = {};

  if (total <= 0) {
    for (const option of poll.options) {
      percentages[option.id] = 0;
    }

    return percentages;
  }

  const exact = poll.options.map((option) => ({
    id: option.id,
    remainder: ((option.votes * 100) % total) / total,
    whole: Math.floor((option.votes * 100) / total),
  }));

  let assigned = 0;
  for (const entry of exact) {
    percentages[entry.id] = entry.whole;
    assigned += entry.whole;
  }

  const leftover = 100 - assigned;
  const byRemainder = [...exact].sort(
    (left, right) => right.remainder - left.remainder || left.id.localeCompare(right.id),
  );

  for (let index = 0; index < leftover && index < byRemainder.length; index += 1) {
    const entry = byRemainder[index];
    if (entry) {
      percentages[entry.id] = (percentages[entry.id] ?? 0) + 1;
    }
  }

  return percentages;
}

/**
 * The optimistic result of tapping an option.
 *
 * Single choice **moves** the vote: it comes off the old option and lands on the
 * new one, so the totals never spike while a request is in flight. Tapping the
 * option already chosen withdraws it — the card has no other affordance for
 * changing your mind to "no answer".
 */
export function applyPollVote(poll: PollDTO, optionId: string): PollDTO {
  if (!poll.options.some((option) => option.id === optionId)) {
    return poll;
  }

  const wasChosen = poll.myOptionIds.includes(optionId);
  const nextMine = poll.multi
    ? wasChosen
      ? poll.myOptionIds.filter((id) => id !== optionId)
      : [...poll.myOptionIds, optionId]
    : wasChosen
      ? []
      : [optionId];

  const options = poll.options.map((option) => {
    const had = poll.myOptionIds.includes(option.id);
    const has = nextMine.includes(option.id);

    if (had === has) {
      return option;
    }

    return { ...option, votes: Math.max(0, option.votes + (has ? 1 : -1)) };
  });

  const wasVoter = poll.myOptionIds.length > 0;
  const isVoter = nextMine.length > 0;

  return {
    ...poll,
    myOptionIds: nextMine,
    options,
    totalVoters: Math.max(0, poll.totalVoters + (isVoter ? 1 : 0) - (wasVoter ? 1 : 0)),
  };
}

/**
 * Kalan süreyi kaba bir birime indirir — SPEC §5.5'in `{süre} sonra kapanıyor`
 * satırı için.
 *
 * Dakika/saat/gün: saniye vermiyoruz, çünkü ayak her saniye yeniden çizilmiyor ve
 * "43 saniye sonra kapanıyor" bir kare sonra yalan olurdu. Kapanmış anket
 * `null` döner ve çağıran `kapandı` yazar.
 */
export function selectPollCountdown(
  poll: PollDTO,
  now: Date,
): { unit: "day" | "hour" | "minute"; value: number } | null {
  const remainingMs = new Date(poll.closesAt).getTime() - now.getTime();

  if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
    return null;
  }

  const minutes = Math.ceil(remainingMs / 60_000);

  if (minutes < 60) {
    return { unit: "minute", value: minutes };
  }

  const hours = Math.ceil(minutes / 60);

  return hours < 24
    ? { unit: "hour", value: hours }
    : { unit: "day", value: Math.ceil(hours / 24) };
}
