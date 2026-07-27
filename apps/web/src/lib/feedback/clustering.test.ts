import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeFeedbackText,
  proposeClusters,
  trigramSimilarity,
} from "@/lib/feedback/clustering";

describe("feedback text normalization", () => {
  it("drops punctuation, case and filler words", () => {
    assert.equal(
      normalizeFeedbackText("Ses kanalında ÇOK gecikme var, bir de kopuyor!"),
      "ses kanalında gecikme var kopuyor",
    );
  });

  it("keeps a message that is only filler from becoming an empty match", () => {
    assert.equal(normalizeFeedbackText("ve bir de"), "");
    assert.equal(trigramSimilarity("ve bir de", "ama çok da"), 0);
  });
});

describe("trigram similarity", () => {
  it("scores near-identical wording high and unrelated wording low", () => {
    const close = trigramSimilarity(
      "Ses kanalında sesim kopuyor",
      "Ses kanalında sesim sürekli kopuyor",
    );
    const far = trigramSimilarity("Ses kanalında sesim kopuyor", "Karanlık tema çok parlak");

    assert.ok(close > 0.5, `expected a high score, got ${close}`);
    assert.ok(far < 0.2, `expected a low score, got ${far}`);
  });
});

describe("cluster proposals", () => {
  it("groups two similar reports in the same topic", () => {
    const clusters = proposeClusters([
      { id: "f1", message: "Ses kanalında sesim kopuyor", topic: "VOICE" },
      { id: "f2", message: "Ses kanalında sesim sürekli kopuyor", topic: "VOICE" },
      { id: "f3", message: "Karanlık tema çok parlak", topic: "SUGGESTION" },
    ]);

    assert.equal(clusters.length, 1);
    assert.deepEqual(clusters[0]?.feedbackIds, ["f1", "f2"]);
    assert.equal(clusters[0]?.topic, "VOICE");
    assert.ok((clusters[0]?.score ?? 0) > 0);
  });

  it("never merges across topics even when the wording matches", () => {
    const clusters = proposeClusters([
      { id: "f1", message: "Ses kanalında sesim kopuyor", topic: "VOICE" },
      { id: "f2", message: "Ses kanalında sesim kopuyor", topic: "BUG" },
    ]);

    assert.deepEqual(clusters, []);
  });

  it("leaves a lone report unclustered", () => {
    assert.deepEqual(
      proposeClusters([{ id: "f1", message: "Ses kanalında sesim kopuyor", topic: "VOICE" }]),
      [],
    );
  });

  it("claims each report once so two clusters cannot share a member", () => {
    const clusters = proposeClusters([
      { id: "f1", message: "Bildirimler geç geliyor", topic: "BUG" },
      { id: "f2", message: "Bildirimler çok geç geliyor", topic: "BUG" },
      { id: "f3", message: "Bildirimler geç geliyor gerçekten", topic: "BUG" },
    ]);

    const ids = clusters.flatMap((cluster) => cluster.feedbackIds);

    assert.equal(new Set(ids).size, ids.length);
  });

  it("returns the strongest proposal first", () => {
    const clusters = proposeClusters([
      { id: "a1", message: "Karanlık tema çok parlak", topic: "SUGGESTION" },
      { id: "a2", message: "Karanlık tema biraz parlak", topic: "SUGGESTION" },
      { id: "b1", message: "Bildirimler geç geliyor", topic: "BUG" },
      { id: "b2", message: "Bildirimler geç geliyor", topic: "BUG" },
    ]);

    assert.equal(clusters.length, 2);
    assert.ok((clusters[0]?.score ?? 0) >= (clusters[1]?.score ?? 0));
  });

  it("proposes nothing when the threshold is out of reach", () => {
    assert.deepEqual(
      proposeClusters(
        [
          { id: "f1", message: "Ses kanalında sesim kopuyor", topic: "VOICE" },
          { id: "f2", message: "Ses kanalında sesim sürekli kopuyor", topic: "VOICE" },
        ],
        0.99,
      ),
      [],
    );
  });
});
