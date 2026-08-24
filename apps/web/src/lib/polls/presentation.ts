import type { PollDTO } from "@wizards/types";

/**
 * Mesajlar karar #1 / #11 — ham anket satırlarını DTO'ya çeviren tek yer.
 *
 * Mesaj yükü, `GET /v1/polls/[id]` ve `poll:updated` yayını aynı fonksiyondan
 * geçer. İkinci bir eşleyici, `canSeeVoters`'ın bir yolda doğru bir yolda yanlış
 * hesaplanması demek olurdu — ve yanlış olan yol, kimsenin bakmadığı yol olurdu.
 */

export type RawPollVote = {
  readonly optionId: string;
  readonly userId: string;
};

export type RawPoll = {
  readonly anonymous: boolean;
  readonly closesAt: Date;
  readonly id: string;
  readonly multi: boolean;
  readonly options: ReadonlyArray<{
    readonly id: string;
    readonly label: string;
    readonly position: number;
  }>;
  readonly question: string;
  readonly votes: ReadonlyArray<RawPollVote>;
};

/**
 * `viewerId` null olduğunda (kimliksiz okuma yolu yok, ama tip izin veriyor)
 * kimsenin oyu işaretlenmez.
 *
 * `canSeeVoters` **burada** türetilir ve `anonymous` iken daima `false`'tur.
 * `voters` ucu da aynı bayrağa bakar; istemci ikisini de hesaplamaz.
 */
export function mapPollToDTO(poll: RawPoll, viewerId: string | null | undefined): PollDTO {
  const tally = new Map<string, number>();
  const voters = new Set<string>();
  const mine: string[] = [];

  for (const vote of poll.votes) {
    tally.set(vote.optionId, (tally.get(vote.optionId) ?? 0) + 1);
    voters.add(vote.userId);

    if (viewerId && vote.userId === viewerId) {
      mine.push(vote.optionId);
    }
  }

  const options = [...poll.options]
    .sort((left, right) => left.position - right.position)
    .map((option) => ({
      id: option.id,
      label: option.label,
      position: option.position,
      votes: tally.get(option.id) ?? 0,
    }));

  return {
    anonymous: poll.anonymous,
    canSeeVoters: !poll.anonymous,
    closesAt: poll.closesAt.toISOString(),
    id: poll.id,
    multi: poll.multi,
    // Seçeneklerin sırasıyla aynı sırada: kart kendi oyunu bu diziden buluyor.
    myOptionIds: options.filter((option) => mine.includes(option.id)).map((option) => option.id),
    options,
    question: poll.question,
    // Oyların toplamı değil, **farklı** oy verenler: çoktan seçmelide bir kişi
    // üç seçeneği işaretlemişse yine bir kişidir.
    totalVoters: voters.size,
  };
}

/** Prisma `select`'i; üç okuma yolu da aynısını kullanır. */
export const POLL_SELECT = {
  id: true,
  question: true,
  multi: true,
  anonymous: true,
  closesAt: true,
  options: { select: { id: true, label: true, position: true } },
  /**
   * Oylar iki kolonla çekiliyor. Sayımı `_count` ile yapmak daha ucuz olurdu ama
   * görüntüleyenin kendi oyu statik bir `include` ile süzülemez — `select`
   * `viewerId`'yi bilmez. Sınır tanımlı: bir anket en çok üye sayısı × seçenek
   * kadar satır taşır (250 × 6), ve yalnız anketi olan mesajda okunur.
   */
  votes: { select: { optionId: true, userId: true } },
} as const;
