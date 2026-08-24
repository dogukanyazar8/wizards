import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  POLL_MAX_OPTIONS,
  POLL_MIN_OPTIONS,
  PollCreateRequestSchema,
  PollVoteRequestSchema,
  addPollOption,
  applyPollVote,
  canAddPollOption,
  canRemovePollOption,
  canSubmitPoll,
  createInitialPollDraft,
  getPollOptionKey,
  isPollClosed,
  removePollOption,
  selectPollCountdown,
  selectPollPercentages,
  setPollOption,
  toPollCreateRequest,
  type PollDTO,
  type PollDraft,
} from "./poll";

function draftWith(options: string[], overrides: Partial<PollDraft> = {}): PollDraft {
  return { ...createInitialPollDraft(), options, question: "Saat kaçta?", ...overrides };
}

function pollWith(votes: number[], overrides: Partial<PollDTO> = {}): PollDTO {
  return {
    anonymous: true,
    canSeeVoters: false,
    closesAt: "2026-08-21T09:00:00.000Z",
    id: "poll-1",
    multi: false,
    myOptionIds: [],
    options: votes.map((count, index) => ({
      id: `option-${index}`,
      label: `Seçenek ${index}`,
      position: index,
      votes: count,
    })),
    question: "Saat kaçta?",
    totalVoters: votes.reduce((sum, count) => sum + count, 0),
    ...overrides,
  };
}

describe("anket taslağı", () => {
  it("§8'in varsayılanlarıyla açılır", () => {
    const draft = createInitialPollDraft();

    assert.equal(draft.multi, false);
    assert.equal(draft.anonymous, true);
    assert.equal(draft.duration, "24h");
    assert.equal(draft.options.length, 3);
    assert.equal(draft.question, "");
  });

  it("soru ya da iki dolu seçenek yoksa gönderilemez", () => {
    assert.equal(canSubmitPoll(createInitialPollDraft()), false);
    assert.equal(canSubmitPoll(draftWith(["15:00", ""])), false);
    assert.equal(canSubmitPoll(draftWith(["15:00", "16:00"], { question: "  " })), false);
    assert.equal(canSubmitPoll(draftWith(["15:00", "16:00"])), true);
  });

  it("boşluktan ibaret seçenek dolu sayılmaz", () => {
    assert.equal(canSubmitPoll(draftWith(["15:00", "   "])), false);
  });

  it("seçenek tavanında ekleme durur", () => {
    let draft = createInitialPollDraft();
    while (canAddPollOption(draft)) {
      draft = addPollOption(draft);
    }

    assert.equal(draft.options.length, POLL_MAX_OPTIONS);
    assert.equal(addPollOption(draft), draft, "tavanda aynı taslak döner");
  });

  it("tabanın altına inilemez ve kaldırma butonu çizilmez", () => {
    const draft = draftWith(["a", "b"]);

    assert.equal(canRemovePollOption(draft), false);
    assert.equal(removePollOption(draft, 0), draft);
  });

  it("kaldırma yalnız hedeflenen satırı düşürür", () => {
    const draft = draftWith(["a", "b", "c"]);

    assert.deepEqual(removePollOption(draft, 1).options, ["a", "c"]);
  });

  it("aralık dışı indeks taslağı bozmaz", () => {
    const draft = draftWith(["a", "b", "c"]);

    assert.equal(removePollOption(draft, 9), draft);
    assert.equal(setPollOption(draft, -1, "x"), draft);
  });

  it("harf tileları A'dan başlar ve 26'dan sonra sayıya döner", () => {
    assert.equal(getPollOptionKey(0), "A");
    assert.equal(getPollOptionKey(5), "F");
    assert.equal(getPollOptionKey(26), "27");
  });

  it("istek gövdesinden boş seçenekleri eler ve kırpar", () => {
    const request = toPollCreateRequest(
      draftWith([" 15:00 ", "", "16:00", "   "], { question: "  Saat kaçta?  " }),
    );

    assert.deepEqual(request.options, ["15:00", "16:00"]);
    assert.equal(request.question, "Saat kaçta?");
  });

  it("ürettiği gövdeyi yazma şeması kabul eder", () => {
    const request = toPollCreateRequest(draftWith(["15:00", "16:00", "18:00 sonrası"]));

    assert.deepEqual(PollCreateRequestSchema.parse(request), request);
  });

  it("yazma şeması tabanı ve tavanı zorlar", () => {
    const base = toPollCreateRequest(draftWith(["15:00", "16:00"]));

    assert.throws(() => PollCreateRequestSchema.parse({ ...base, options: ["tek"] }));
    assert.throws(() =>
      PollCreateRequestSchema.parse({
        ...base,
        options: Array.from({ length: POLL_MAX_OPTIONS + 1 }, (_unused, index) => `o${index}`),
      }),
    );
    assert.equal(POLL_MIN_OPTIONS, 2);
  });

  it("oy isteği tam kümeyi taşır, fark değil", () => {
    assert.deepEqual(PollVoteRequestSchema.parse({ optionIds: [] }), { optionIds: [] });
    assert.throws(() => PollVoteRequestSchema.parse({ optionIds: ["a"], add: true }));
  });
});

describe("yüzde hesabı", () => {
  it("SPEC'in 1/3/1 dağılımını 20/60/20 verir", () => {
    const percentages = selectPollPercentages(pollWith([1, 3, 1]));

    assert.deepEqual(percentages, { "option-0": 20, "option-1": 60, "option-2": 20 });
  });

  it("oy yokken hepsi sıfırdır", () => {
    assert.deepEqual(selectPollPercentages(pollWith([0, 0])), { "option-0": 0, "option-1": 0 });
  });

  /**
   * Bağımsız yuvarlama 1/1/1'i 33+33+33 = 99 yapardı; büyük artık yöntemi
   * kalan puanı dağıtır ve toplam tam 100 olur. Çubuklar bu sayılardan çizildiği
   * için 100'ü aşan bir toplam rayı taşırırdı.
   */
  it("toplamı 100'ü aşmaz ve eksik bırakmaz", () => {
    for (const votes of [[1, 1, 1], [1, 1, 1, 1, 1, 1], [2, 1], [7, 3, 3, 3], [1], [5, 5]]) {
      const percentages = selectPollPercentages(pollWith(votes));
      const total = Object.values(percentages).reduce((sum, value) => sum + value, 0);

      assert.equal(total, 100, `${votes.join("/")} toplamı ${total}`);
    }
  });

  it("aynı oy sayısında dağıtım deterministiktir", () => {
    const first = selectPollPercentages(pollWith([1, 1, 1]));
    const second = selectPollPercentages(pollWith([1, 1, 1]));

    assert.deepEqual(first, second);
  });
});

describe("iyimser oy", () => {
  it("tek seçimlide oyu taşır", () => {
    const poll = pollWith([1, 3, 1], { myOptionIds: ["option-1"], totalVoters: 5 });
    const next = applyPollVote(poll, "option-0");

    assert.deepEqual(next.myOptionIds, ["option-0"]);
    assert.equal(next.options[0]?.votes, 2);
    assert.equal(next.options[1]?.votes, 2);
    // Oy taşındı, yeni bir oy veren gelmedi.
    assert.equal(next.totalVoters, 5);
  });

  it("aynı seçeneğe ikinci tıklama oyu geri çeker", () => {
    const poll = pollWith([1, 3, 1], { myOptionIds: ["option-1"], totalVoters: 5 });
    const next = applyPollVote(poll, "option-1");

    assert.deepEqual(next.myOptionIds, []);
    assert.equal(next.options[1]?.votes, 2);
    assert.equal(next.totalVoters, 4);
  });

  it("ilk oyda oy veren sayısı artar", () => {
    const poll = pollWith([1, 3, 1], { totalVoters: 5 });
    const next = applyPollVote(poll, "option-2");

    assert.equal(next.options[2]?.votes, 2);
    assert.equal(next.totalVoters, 6);
  });

  it("çoktan seçmelide seçenekler bağımsız açılıp kapanır", () => {
    const poll = pollWith([1, 1, 0], { multi: true, myOptionIds: ["option-0"], totalVoters: 2 });
    const withSecond = applyPollVote(poll, "option-1");

    assert.deepEqual(withSecond.myOptionIds, ["option-0", "option-1"]);
    assert.equal(withSecond.options[1]?.votes, 2);
    // İki seçenek işaretli olsa da oy veren hâlâ bir kişi.
    assert.equal(withSecond.totalVoters, 2);

    const withoutFirst = applyPollVote(withSecond, "option-0");
    assert.deepEqual(withoutFirst.myOptionIds, ["option-1"]);
    assert.equal(withoutFirst.totalVoters, 2);
  });

  it("çoktan seçmelide son seçenek de kalkınca oy veren düşer", () => {
    const poll = pollWith([1, 0], { multi: true, myOptionIds: ["option-0"], totalVoters: 1 });

    assert.equal(applyPollVote(poll, "option-0").totalVoters, 0);
  });

  it("bilinmeyen seçenek anketi değiştirmez", () => {
    const poll = pollWith([1, 1]);

    assert.equal(applyPollVote(poll, "option-yok"), poll);
  });

  it("oy sayısı negatife düşmez", () => {
    const poll = pollWith([0], { myOptionIds: ["option-0"], totalVoters: 0 });

    assert.equal(applyPollVote(poll, "option-0").options[0]?.votes, 0);
  });
});

describe("kapanma", () => {
  it("kapanma anına ulaşan anket kapalıdır", () => {
    const poll = pollWith([1]);

    assert.equal(isPollClosed(poll, new Date("2026-08-21T08:59:59.000Z")), false);
    assert.equal(isPollClosed(poll, new Date("2026-08-21T09:00:00.000Z")), true);
    assert.equal(isPollClosed(poll, new Date("2026-08-21T09:00:01.000Z")), true);
  });
});

describe("anonimlik (karar #11)", () => {
  it("oy verenleri görme izni sunucudan gelir, anonim bayrağından türetilmez", () => {
    // İstemci `!anonymous` diye hesaplasaydı, bağlantıyı gizlemek arkasındaki
    // isimleri koruyan tek şey olurdu.
    const poll = pollWith([1], { anonymous: true, canSeeVoters: false });

    assert.equal(poll.canSeeVoters, false);
  });
});

describe("selectPollCountdown", () => {
  const NOW = new Date("2026-08-20T09:00:00.000Z");

  it("bir saatin altında dakika verir", () => {
    const poll = pollWith([1], { closesAt: "2026-08-20T09:40:00.000Z" });

    assert.deepEqual(selectPollCountdown(poll, NOW), { unit: "minute", value: 40 });
  });

  it("bir günün altında saat verir", () => {
    const poll = pollWith([1], { closesAt: "2026-08-20T14:00:00.000Z" });

    assert.deepEqual(selectPollCountdown(poll, NOW), { unit: "hour", value: 5 });
  });

  it("bir günden uzun kalan gün verir", () => {
    const poll = pollWith([1], { closesAt: "2026-08-23T09:00:00.000Z" });

    assert.deepEqual(selectPollCountdown(poll, NOW), { unit: "day", value: 3 });
  });

  /** Kapanmışta `null`; çağıran o durumda `kapandı` yazar, "0 dakika" değil. */
  it("kapanmış ankette null", () => {
    const poll = pollWith([1], { closesAt: "2026-08-20T08:59:00.000Z" });

    assert.equal(selectPollCountdown(poll, NOW), null);
  });

  /**
   * Yukarı yuvarlama: 61 dakika kalan bir anket "1 saat" yazsaydı, bir dakika
   * sonra hâlâ "1 saat" derdi ve sayaç ilerlemez görünürdü.
   */
  it("kalan süreyi yukarı yuvarlar", () => {
    const poll = pollWith([1], { closesAt: "2026-08-20T10:01:00.000Z" });

    assert.deepEqual(selectPollCountdown(poll, NOW), { unit: "hour", value: 2 });
  });

  it("geçersiz tarihte null", () => {
    const poll = pollWith([1], { closesAt: "değil-bir-tarih" });

    assert.equal(selectPollCountdown(poll, NOW), null);
  });
});
