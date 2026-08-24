import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import { createPrismaClient } from "@wizards/db";
import type { PollCreateRequest } from "@wizards/types";
import {
  castPollVote,
  createPollMessage,
  getPollForViewer,
  listPollVoters,
  resolvePollClosesAt,
  type PollServiceDependencies,
} from "./service";

const NOW = new Date("2026-08-20T09:00:00.000Z");
const OPEN_UNTIL = new Date("2026-08-21T09:00:00.000Z");

type PollRow = NonNullable<Awaited<ReturnType<PollServiceDependencies["loadPollForViewer"]>>>;

function securedMessage(overrides: Record<string, unknown> = {}): PollRow["dmMessage"] {
  return {
    conversationId: "conv-1",
    conversation: { participants: [{ historyFromAt: null }] },
    createdAt: NOW,
    deletedAt: null,
    expiresAt: OPEN_UNTIL,
    placeholderRemovedAt: null,
    ...overrides,
  } as unknown as PollRow["dmMessage"];
}

function pollRow(overrides: Partial<PollRow> = {}): PollRow {
  return {
    anonymous: false,
    closesAt: OPEN_UNTIL,
    createdById: "user-1",
    dmMessage: securedMessage(),
    id: "poll-1",
    multi: false,
    options: [
      { id: "opt-a", label: "15:00", position: 0 },
      { id: "opt-b", label: "16:00", position: 1 },
      { id: "opt-c", label: "18:00 sonrası", position: 2 },
    ],
    question: "Sürüm 2.4 dağıtımı hangi saatte olsun?",
    votes: [],
    ...overrides,
  };
}

type Calls = {
  sent: unknown[];
  votes: { multi: boolean; optionIds: readonly string[]; pollId: string; userId: string }[];
};

function buildDependencies(overrides: Partial<PollServiceDependencies> = {}): {
  calls: Calls;
  dependencies: PollServiceDependencies;
} {
  const calls: Calls = { sent: [], votes: [] };

  const dependencies: PollServiceDependencies = {
    loadPollForViewer: async () => pollRow(),
    loadVoters: async () => [],
    now: () => NOW,
    replaceVote: async (input) => {
      calls.votes.push(input);
    },
    sendMessage: (async (input: unknown) => {
      calls.sent.push(input);
      return { id: "msg-1" };
    }) as PollServiceDependencies["sendMessage"],
    ...overrides,
  };

  return { calls, dependencies };
}

const draft: PollCreateRequest = {
  anonymous: true,
  duration: "24h",
  multi: false,
  options: ["15:00", "16:00"],
  question: "Saat kaçta?",
};

describe("kapanma anı", () => {
  it("süreyi sunucunun saatiyle çözer", () => {
    assert.equal(resolvePollClosesAt("1h", NOW).toISOString(), "2026-08-20T10:00:00.000Z");
    assert.equal(resolvePollClosesAt("24h", NOW).toISOString(), "2026-08-21T09:00:00.000Z");
    assert.equal(resolvePollClosesAt("3d", NOW).toISOString(), "2026-08-23T09:00:00.000Z");
  });
});

describe("anket oluşturma", () => {
  it("tek gönderim yolundan geçer", async () => {
    // İzin, engel ve kaybolan mesaj penceresi orada yaşıyor; ikinci bir yazma
    // yolu onları ikinci kez unutmak olurdu.
    const { calls, dependencies } = buildDependencies();

    await createPollMessage(
      { conversationId: "conv-1", poll: draft, userId: "user-1" },
      dependencies,
    );

    assert.equal(calls.sent.length, 1);
  });

  it("gövde yazılmadıysa soruyu gövde yapar", async () => {
    const { calls, dependencies } = buildDependencies();

    await createPollMessage(
      { conversationId: "conv-1", poll: draft, userId: "user-1" },
      dependencies,
    );

    assert.equal((calls.sent[0] as { content: string }).content, "Saat kaçta?");
  });

  it("yazılan gövdeyi korur", async () => {
    const { calls, dependencies } = buildDependencies();

    await createPollMessage(
      {
        content: "  Dağıtım saatini oylayalım.  ",
        conversationId: "conv-1",
        poll: draft,
        userId: "user-1",
      },
      dependencies,
    );

    assert.equal((calls.sent[0] as { content: string }).content, "Dağıtım saatini oylayalım.");
  });

  it("kapanma anını istemciden almaz", async () => {
    const { calls, dependencies } = buildDependencies();

    await createPollMessage(
      { conversationId: "conv-1", poll: draft, userId: "user-1" },
      dependencies,
    );

    const sent = calls.sent[0] as { poll: { closesAt: Date } };
    assert.equal(sent.poll.closesAt.toISOString(), "2026-08-21T09:00:00.000Z");
  });
});

describe("anket okuma", () => {
  it("katılımcı olmayana 404 verir", async () => {
    // 403 "var ama senin değil" demektir; bu da yine var olduğunu söylemektir.
    const { dependencies } = buildDependencies({ loadPollForViewer: async () => null });

    await assert.rejects(
      () => getPollForViewer("poll-1", "stranger", dependencies),
      (error: { status?: number; code?: string }) => {
        assert.equal(error.status, 404);
        assert.equal(error.code, "NOT_FOUND");
        return true;
      },
    );
  });

  it("kendi oyunu işaretler, başkasınınkini değil", async () => {
    const { dependencies } = buildDependencies({
      loadPollForViewer: async () =>
        pollRow({
          votes: [
            { optionId: "opt-b", userId: "user-1" },
            { optionId: "opt-a", userId: "user-2" },
          ],
        }),
    });

    const { poll } = await getPollForViewer("poll-1", "user-1", dependencies);

    assert.deepEqual(poll.myOptionIds, ["opt-b"]);
    assert.deepEqual(
      poll.options.map((option) => option.votes),
      [1, 1, 0],
    );
    assert.equal(JSON.stringify(poll).includes("user-2"), false);
  });

  it("historyFromAt öncesindeki poll mesajını 404 ile gizler", async () => {
    const { dependencies } = buildDependencies({
      loadPollForViewer: async () =>
        pollRow({
          dmMessage: securedMessage({
            createdAt: new Date("2026-08-01T09:00:00.000Z"),
            conversation: {
              participants: [{ historyFromAt: new Date("2026-08-10T09:00:00.000Z") }],
            },
          }),
        }),
    });

    await assert.rejects(
      () => getPollForViewer("poll-1", "late-member", dependencies),
      (error: { status?: number; code?: string }) => {
        assert.equal(error.status, 404);
        assert.equal(error.code, "NOT_FOUND");
        return true;
      },
    );
  });

  it("oy verenleri farklı kişi olarak sayar", async () => {
    // Çoktan seçmelide üç seçeneği işaretleyen bir kişi yine bir kişidir.
    const { dependencies } = buildDependencies({
      loadPollForViewer: async () =>
        pollRow({
          multi: true,
          votes: [
            { optionId: "opt-a", userId: "user-2" },
            { optionId: "opt-b", userId: "user-2" },
            { optionId: "opt-c", userId: "user-2" },
          ],
        }),
    });

    const { poll } = await getPollForViewer("poll-1", "user-1", dependencies);

    assert.equal(poll.totalVoters, 1);
  });

  it("anonim ankette oy verenleri görme izni kapalıdır", async () => {
    const { dependencies } = buildDependencies({
      loadPollForViewer: async () => pollRow({ anonymous: true }),
    });

    const { poll } = await getPollForViewer("poll-1", "user-1", dependencies);

    assert.equal(poll.canSeeVoters, false);
  });
});

describe("oy verme", () => {
  it("kapanmış ankette 409 verir", async () => {
    const { calls, dependencies } = buildDependencies({
      loadPollForViewer: async () => pollRow({ closesAt: new Date("2026-08-20T08:59:59.000Z") }),
    });

    await assert.rejects(
      () =>
        castPollVote({ optionIds: ["opt-a"], pollId: "poll-1", viewerId: "user-1" }, dependencies),
      (error: { status?: number; code?: string }) => {
        assert.equal(error.status, 409);
        assert.equal(error.code, "POLL_CLOSED");
        return true;
      },
    );
    assert.deepEqual(calls.votes, []);
  });

  it("expired, deleted veya hidden poll mesajına oy yazmaz", async () => {
    for (const dmMessage of [
      securedMessage({ expiresAt: NOW }),
      securedMessage({ deletedAt: NOW }),
      securedMessage({ placeholderRemovedAt: NOW }),
    ]) {
      const { calls, dependencies } = buildDependencies({
        loadPollForViewer: async () => pollRow({ dmMessage }),
      });

      await assert.rejects(
        () =>
          castPollVote(
            { optionIds: ["opt-a"], pollId: "poll-1", viewerId: "user-1" },
            dependencies,
          ),
        (error: { status?: number; code?: string }) => {
          assert.equal(error.status, 404);
          assert.equal(error.code, "NOT_FOUND");
          return true;
        },
      );
      assert.deepEqual(calls.votes, []);
    }
  });

  it("tek seçimlide ikinci seçeneği reddeder", async () => {
    const { calls, dependencies } = buildDependencies();

    await assert.rejects(
      () =>
        castPollVote(
          { optionIds: ["opt-a", "opt-b"], pollId: "poll-1", viewerId: "user-1" },
          dependencies,
        ),
      (error: { status?: number; code?: string }) => {
        assert.equal(error.status, 400);
        assert.equal(error.code, "POLL_SINGLE_CHOICE");
        return true;
      },
    );
    assert.deepEqual(calls.votes, []);
  });

  it("başka ankete ait seçeneği reddeder", async () => {
    const { calls, dependencies } = buildDependencies();

    await assert.rejects(
      () =>
        castPollVote(
          { optionIds: ["opt-elsewhere"], pollId: "poll-1", viewerId: "user-1" },
          dependencies,
        ),
      (error: { code?: string }) => {
        assert.equal(error.code, "POLL_OPTION_UNKNOWN");
        return true;
      },
    );
    assert.deepEqual(calls.votes, []);
  });

  it("oyu tam küme olarak yazar ve tekrarları eler", async () => {
    const { calls, dependencies } = buildDependencies({
      loadPollForViewer: async () => pollRow({ multi: true }),
    });

    await castPollVote(
      { optionIds: ["opt-a", "opt-a", "opt-b"], pollId: "poll-1", viewerId: "user-1" },
      dependencies,
    );

    assert.deepEqual(calls.votes, [
      {
        multi: true,
        optionIds: ["opt-a", "opt-b"],
        pollId: "poll-1",
        userId: "user-1",
      },
    ]);
  });

  it("boş küme oyu geri çeker", async () => {
    const { calls, dependencies } = buildDependencies();

    await castPollVote({ optionIds: [], pollId: "poll-1", viewerId: "user-1" }, dependencies);

    assert.deepEqual(calls.votes, [
      { multi: false, optionIds: [], pollId: "poll-1", userId: "user-1" },
    ]);
  });

  it("yazdıktan sonra anketi yeniden okuyup döndürür", async () => {
    let written = false;
    const { dependencies } = buildDependencies({
      loadPollForViewer: async () =>
        written ? pollRow({ votes: [{ optionId: "opt-a", userId: "user-1" }] }) : pollRow(),
      replaceVote: async () => {
        written = true;
      },
    });

    const { poll } = await castPollVote(
      { optionIds: ["opt-a"], pollId: "poll-1", viewerId: "user-1" },
      dependencies,
    );

    assert.deepEqual(poll.myOptionIds, ["opt-a"]);
    assert.equal(poll.options[0]?.votes, 1);
  });
});

describe("oy verenler (karar #11)", () => {
  it("anonim ankette 403 verir ve hiçbir kimlik dönmez", async () => {
    const { dependencies } = buildDependencies({
      loadPollForViewer: async () => pollRow({ anonymous: true }),
      loadVoters: async () => {
        throw new Error("anonim ankette oy verenler hiç okunmamalı");
      },
    });

    await assert.rejects(
      () => listPollVoters("poll-1", "user-1", dependencies),
      (error: { status?: number; code?: string }) => {
        assert.equal(error.status, 403);
        assert.equal(error.code, "POLL_ANONYMOUS");
        return true;
      },
    );
  });

  it("anketi açan da anonimde göremez", async () => {
    const { dependencies } = buildDependencies({
      loadPollForViewer: async () => pollRow({ anonymous: true, createdById: "user-1" }),
    });

    await assert.rejects(() => listPollVoters("poll-1", "user-1", dependencies));
  });

  it("açık ankette oy verenleri döndürür", async () => {
    const { dependencies } = buildDependencies({
      loadVoters: async () => [
        {
          avatarUrl: null,
          displayName: "Selin Aksoy",
          id: "user-2",
          optionId: "opt-a",
          username: "selin",
        },
      ],
    });

    const voters = await listPollVoters("poll-1", "user-1", dependencies);

    assert.equal(voters.length, 1);
    assert.equal(voters[0]?.username, "selin");
  });
});

describe("single-choice gerçek PostgreSQL concurrency", () => {
  const runDatabaseConcurrency = process.env.WHISPR_PHASE2_DB_CONCURRENCY === "1";

  it(
    "aynı voter'ın iki option yarışını transaction seviyesinde tek satıra indirir",
    { skip: runDatabaseConcurrency ? false : "WHISPR_PHASE2_DB_CONCURRENCY=1 gerekli" },
    async () => {
      const connectionString = process.env.DATABASE_URL;
      assert.ok(connectionString, "DATABASE_URL gerçek PostgreSQL testi için zorunlu");

      const databaseUrl = new URL(connectionString);
      assert.ok(
        ["127.0.0.1", "localhost", "::1"].includes(databaseUrl.hostname),
        "concurrency fixture yalnız loopback PostgreSQL üzerinde çalışabilir",
      );

      const database = createPrismaClient({ connectionString });
      const fixtureId = randomUUID();
      const userId = `phase2-poll-user-${fixtureId}`;
      const conversationId = `phase2-poll-conversation-${fixtureId}`;
      const messageId = `phase2-poll-message-${fixtureId}`;
      const pollId = `phase2-poll-${fixtureId}`;
      const optionAId = `phase2-poll-option-a-${fixtureId}`;
      const optionBId = `phase2-poll-option-b-${fixtureId}`;

      try {
        await database.user.create({
          data: {
            email: `${userId}@example.invalid`,
            id: userId,
            username: userId,
          },
        });
        await database.dMConversation.create({
          data: {
            id: conversationId,
            participants: {
              create: { nameColor: "#5865F2", userId },
            },
            type: "DM",
          },
        });
        await database.dMMessage.create({
          data: {
            content: "Phase 2 poll concurrency fixture",
            conversationId,
            id: messageId,
            poll: {
              create: {
                anonymous: false,
                closesAt: new Date(Date.now() + 60_000),
                createdById: userId,
                id: pollId,
                multi: false,
                options: {
                  create: [
                    { id: optionAId, label: "A", position: 0 },
                    { id: optionBId, label: "B", position: 1 },
                  ],
                },
                question: "A mı B mi?",
              },
            },
            userId,
          },
        });

        for (let attempt = 0; attempt < 5; attempt += 1) {
          await database.pollVote.deleteMany({ where: { pollId, userId } });

          const responses = await Promise.all([
            castPollVote({ optionIds: [optionAId], pollId, viewerId: userId }),
            castPollVote({ optionIds: [optionBId], pollId, viewerId: userId }),
          ]);
          const storedVotes = await database.pollVote.findMany({
            orderBy: { optionId: "asc" },
            select: { optionId: true },
            where: { pollId, userId },
          });

          assert.equal(storedVotes.length, 1, `attempt ${attempt + 1}: single-choice invariant`);

          const committed = await getPollForViewer(pollId, userId);
          assert.deepEqual(committed.poll.myOptionIds, [storedVotes[0]?.optionId]);
          assert.equal(
            committed.poll.options.reduce((total, option) => total + option.votes, 0),
            storedVotes.length,
          );
          assert.ok(
            responses.every(
              ({ poll }) =>
                poll.myOptionIds.length === 1 &&
                poll.options.reduce((total, option) => total + option.votes, 0) === 1,
            ),
            "transaction sonrası DTO yalnız commit edilmiş single-choice state taşımalı",
          );
        }
      } finally {
        await database.dMConversation.deleteMany({ where: { id: conversationId } });
        await database.user.deleteMany({ where: { id: userId } });
        await database.$disconnect();
      }
    },
  );
});
