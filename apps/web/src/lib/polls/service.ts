import { prisma } from "@wizards/db";
import {
  POLL_DURATION_MINUTES,
  type PollCreateRequest,
  type PollDTO,
  type PollVoterDTO,
} from "@wizards/types";
import { ApiError } from "@/lib/api";
import { sendDirectMessage } from "@/lib/dm/message-send-service";
import { toUnexpiredFilter } from "@/lib/dm/service";
import { POLL_SELECT, mapPollToDTO, type RawPoll } from "@/lib/polls/presentation";
import type { AppSocketServer } from "@/lib/socket/runtime";

/**
 * Mesajlar karar #1 / #11 / #12 — anket.
 *
 * **Yetki tek sorguda.** Her okuma ve yazma anketi katılımcılık koşuluyla
 * birlikte çeker (`poll → dmMessage → conversation → participants.some(viewer)`).
 * "Önce anketi çek, sonra üyeliği kontrol et" yazılmaz: sızıntı yüzeyi tam
 * olarak o iki adımın arasındadır.
 *
 * Anket oluşturma kendi mesaj yazımını **yapmaz**; `sendDirectMessage`'dan
 * geçer, çünkü gönderme izni, engel kontrolü ve kaybolan mesaj penceresi orada
 * yaşıyor ve ikinci bir yol onları ikinci kez unutmak demek.
 */

type PollAuthRow = RawPoll & {
  readonly createdById: string;
  readonly dmMessage: {
    readonly conversationId: string;
    readonly conversation: {
      readonly participants: ReadonlyArray<{ readonly historyFromAt: Date | null }>;
    };
    readonly createdAt: Date;
    readonly deletedAt: Date | null;
    readonly expiresAt: Date | null;
    readonly placeholderRemovedAt: Date | null;
  } | null;
};

export type PollServiceDependencies = {
  loadPollForViewer(input: {
    now: Date;
    pollId: string;
    viewerId: string;
  }): Promise<PollAuthRow | null>;
  loadVoters(pollId: string): Promise<PollVoterDTO[]>;
  now(): Date;
  replaceVote(input: {
    multi: boolean;
    optionIds: readonly string[];
    pollId: string;
    userId: string;
  }): Promise<void>;
  sendMessage: typeof sendDirectMessage;
};

const defaults: PollServiceDependencies = {
  loadPollForViewer: ({ now, pollId, viewerId }) =>
    prisma.poll.findFirst({
      where: {
        id: pollId,
        // Membership is the `where` clause, so a non-participant finds nothing
        // and the 403 falls out of the same statement that reads the poll.
        dmMessage: {
          deletedAt: null,
          placeholderRemovedAt: null,
          ...toUnexpiredFilter(now),
          conversation: { participants: { some: { userId: viewerId } } },
        },
      },
      select: {
        ...POLL_SELECT,
        createdById: true,
        dmMessage: {
          select: {
            conversationId: true,
            conversation: {
              select: {
                participants: {
                  where: { userId: viewerId },
                  select: { historyFromAt: true },
                },
              },
            },
            createdAt: true,
            deletedAt: true,
            expiresAt: true,
            placeholderRemovedAt: true,
          },
        },
      },
    }),

  loadVoters: async (pollId) => {
    const rows = await prisma.pollVote.findMany({
      where: { pollId },
      orderBy: { createdAt: "asc" },
      select: {
        optionId: true,
        user: { select: { avatarUrl: true, displayName: true, id: true, username: true } },
      },
    });

    return rows.map((row) => ({
      avatarUrl: row.user.avatarUrl,
      displayName: row.user.displayName,
      id: row.user.id,
      optionId: row.optionId,
      username: row.user.username,
    }));
  },

  now: () => new Date(),

  /**
   * Delete-then-insert in one transaction, so a single-choice vote *moves*
   * rather than briefly counting twice, and two taps racing each other cannot
   * leave the voter on two options.
   *
   * The advisory lock below is what orders different-option replacements. The
   * unique on `(optionId, userId)` separately keeps same-option double taps
   * idempotent; `skipDuplicates` turns that collision into a no-op.
   */
  replaceVote: async ({ multi, optionIds, pollId, userId }) => {
    await prisma.$transaction(async (tx) => {
      if (!multi) {
        // A per-(poll, voter) transaction lock serializes only single-choice
        // replacements for this voter. It works across Node processes while
        // leaving other voters and multiple-choice polls independent.
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(
            hashtextextended(${`poll-vote:${pollId}:${userId}`}, 0)
          )
        `;
      }

      await tx.pollVote.deleteMany({ where: { pollId, userId } });

      if (optionIds.length > 0) {
        await tx.pollVote.createMany({
          data: optionIds.map((optionId) => ({ optionId, pollId, userId })),
          skipDuplicates: true,
        });
      }
    });
  },

  sendMessage: sendDirectMessage,
};

async function requirePoll(
  pollId: string,
  viewerId: string,
  dependencies: PollServiceDependencies,
  now = dependencies.now(),
): Promise<PollAuthRow> {
  const poll = await dependencies.loadPollForViewer({ now, pollId, viewerId });
  const message = poll?.dmMessage;
  const historyFromAt = message?.conversation.participants[0]?.historyFromAt ?? null;
  const messageVisible =
    message !== null &&
    message !== undefined &&
    message.deletedAt === null &&
    message.placeholderRemovedAt === null &&
    (message.expiresAt === null || message.expiresAt.getTime() > now.getTime()) &&
    (!historyFromAt || message.createdAt >= historyFromAt);

  if (!poll || !messageVisible) {
    // Deliberately 404 and not 403: telling a stranger that a poll exists but is
    // not theirs is still telling them it exists.
    throw new ApiError("Poll not found", 404, "NOT_FOUND");
  }

  return poll;
}

export function resolvePollClosesAt(duration: PollCreateRequest["duration"], now: Date): Date {
  return new Date(now.getTime() + POLL_DURATION_MINUTES[duration] * 60_000);
}

/**
 * Anketi mesaj olarak gönderir (SPEC §8 ayak metni: "Anket mesaj olarak
 * gönderilir").
 *
 * `content` verilmezse mesaj gövdesi sorunun kendisidir. Ekran görüntüsü 06'da
 * bestekâra yazılmış bir cümle ile kart yan yana duruyor; modal ise yalnız soru
 * soruyor. İkisi de doğru: yazılmış bir cümle varsa o gövdedir, yoksa soru
 * gövdedir ve anket satırı bir sebeple gelmezse mesaj yine okunabilir kalır.
 *
 * `closesAt` **sunucuda** hesaplanır. İstemciden gelen bir kapanma anı, saati
 * ileri alınmış bir istemcinin hiç kapanmayan anketi demek olurdu.
 */
export async function createPollMessage(
  input: {
    content?: string | null;
    conversationId: string;
    io?: AppSocketServer | null;
    poll: PollCreateRequest;
    userId: string;
  },
  dependencies: PollServiceDependencies = defaults,
) {
  const closesAt = resolvePollClosesAt(input.poll.duration, dependencies.now());
  const content = input.content?.trim() || input.poll.question;

  return await dependencies.sendMessage({
    content,
    conversationId: input.conversationId,
    io: input.io ?? null,
    poll: {
      anonymous: input.poll.anonymous,
      closesAt,
      multi: input.poll.multi,
      options: input.poll.options,
      question: input.poll.question,
    },
    userId: input.userId,
  });
}

export async function getPollForViewer(
  pollId: string,
  viewerId: string,
  dependencies: PollServiceDependencies = defaults,
): Promise<{ conversationId: string; poll: PollDTO }> {
  const row = await requirePoll(pollId, viewerId, dependencies);

  return {
    conversationId: row.dmMessage?.conversationId ?? "",
    poll: mapPollToDTO(row, viewerId),
  };
}

/**
 * Oy verir, taşır ya da geri çeker.
 *
 * İstek **tam kümeyi** taşır, farkı değil: iki tık aynı anda uçuyorken istemci
 * ile sunucunun önceki duruma dair anlaşması gerekmez, son istek kazanır ve
 * kullanıcının gördüğü de odur.
 */
export async function castPollVote(
  input: { optionIds: readonly string[]; pollId: string; viewerId: string },
  dependencies: PollServiceDependencies = defaults,
): Promise<{ conversationId: string; poll: PollDTO }> {
  const now = dependencies.now();
  const row = await requirePoll(input.pollId, input.viewerId, dependencies, now);

  if (row.closesAt.getTime() <= now.getTime()) {
    throw new ApiError("This poll has closed", 409, "POLL_CLOSED");
  }

  if (!row.multi && input.optionIds.length > 1) {
    throw new ApiError("This poll accepts a single choice", 400, "POLL_SINGLE_CHOICE");
  }

  const known = new Set(row.options.map((option) => option.id));
  const unknown = input.optionIds.filter((optionId) => !known.has(optionId));

  if (unknown.length > 0) {
    throw new ApiError("Unknown poll option", 400, "POLL_OPTION_UNKNOWN");
  }

  // Duplicates in the body would be one vote either way — the unique index says
  // so — but de-duplicating here keeps the write from depending on that.
  const optionIds = [...new Set(input.optionIds)];

  await dependencies.replaceVote({
    multi: row.multi,
    optionIds,
    pollId: input.pollId,
    userId: input.viewerId,
  });

  const updated = await requirePoll(input.pollId, input.viewerId, dependencies);

  return {
    conversationId: updated.dmMessage?.conversationId ?? "",
    poll: mapPollToDTO(updated, input.viewerId),
  };
}

/**
 * Oy verenler (karar #11).
 *
 * Anonim ankette **403**: kimlikler yanıt gövdesine hiç girmez. İstemcide
 * bağlantıyı gizlemek yeterli sayılsaydı, arkasındaki isimleri koruyan tek şey
 * bir `if` olurdu — ve anketi açan da dâhil kimse görmemeli.
 */
export async function listPollVoters(
  pollId: string,
  viewerId: string,
  dependencies: PollServiceDependencies = defaults,
): Promise<PollVoterDTO[]> {
  const row = await requirePoll(pollId, viewerId, dependencies);

  if (row.anonymous) {
    throw new ApiError("This poll is anonymous", 403, "POLL_ANONYMOUS");
  }

  return await dependencies.loadVoters(pollId);
}
