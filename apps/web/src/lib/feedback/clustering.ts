import type { FeedbackTopic } from "@wizards/db";

/**
 * Words that carry no signal about *what* someone asked for. Turkish first,
 * because that is what most of the feedback arrives in.
 */
const STOP_WORDS = new Set([
  "acaba",
  "ama",
  "and",
  "bana",
  "ben",
  "bir",
  "bu",
  "but",
  "çok",
  "da",
  "daha",
  "de",
  "diye",
  "for",
  "gibi",
  "ile",
  "için",
  "is",
  "it",
  "ki",
  "mi",
  "mu",
  "of",
  "olsa",
  "olur",
  "ve",
  "veya",
  "the",
  "to",
  "with",
]);

const TRIGRAM_SIZE = 3;
export const DEFAULT_CLUSTER_THRESHOLD = 0.4;
const MIN_CLUSTER_SIZE = 2;

export function normalizeFeedbackText(text: string) {
  return text
    .toLocaleLowerCase("tr-TR")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/u)
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word))
    .join(" ")
    .trim();
}

function toTrigrams(value: string) {
  const padded = ` ${value} `;
  const grams = new Set<string>();

  for (let index = 0; index + TRIGRAM_SIZE <= padded.length; index += 1) {
    grams.add(padded.slice(index, index + TRIGRAM_SIZE));
  }

  return grams;
}

/** Jaccard overlap of character trigrams: 0 for unrelated, 1 for identical. */
export function trigramSimilarity(left: string, right: string) {
  const leftGrams = toTrigrams(normalizeFeedbackText(left));
  const rightGrams = toTrigrams(normalizeFeedbackText(right));

  if (leftGrams.size === 0 || rightGrams.size === 0) {
    return 0;
  }

  let shared = 0;

  for (const gram of leftGrams) {
    if (rightGrams.has(gram)) {
      shared += 1;
    }
  }

  const union = leftGrams.size + rightGrams.size - shared;

  return union === 0 ? 0 : Math.round((shared / union) * 1000) / 1000;
}

export type ClusterCandidate = {
  feedbackIds: string[];
  score: number;
  topic: FeedbackTopic;
};

export type ClusterInput = {
  id: string;
  message: string;
  topic: FeedbackTopic;
};

/**
 * Greedy single-pass grouping **inside one topic**. A bug report and a feature
 * request never merge even when their wording matches: the topic is the
 * submitter's own classification, and overriding it would hide one of them.
 */
export function proposeClusters(
  items: ClusterInput[],
  threshold = DEFAULT_CLUSTER_THRESHOLD,
): ClusterCandidate[] {
  const byTopic = new Map<FeedbackTopic, ClusterInput[]>();

  for (const item of items) {
    byTopic.set(item.topic, [...(byTopic.get(item.topic) ?? []), item]);
  }

  const candidates: ClusterCandidate[] = [];

  for (const [topic, topicItems] of byTopic) {
    const claimed = new Set<string>();

    for (const seed of topicItems) {
      if (claimed.has(seed.id)) {
        continue;
      }

      const members = [seed];
      const scores: number[] = [];

      for (const other of topicItems) {
        if (other.id === seed.id || claimed.has(other.id)) {
          continue;
        }

        const score = trigramSimilarity(seed.message, other.message);

        if (score >= threshold) {
          members.push(other);
          scores.push(score);
        }
      }

      if (members.length < MIN_CLUSTER_SIZE) {
        continue;
      }

      for (const member of members) {
        claimed.add(member.id);
      }

      candidates.push({
        feedbackIds: members.map((member) => member.id),
        score:
          Math.round((scores.reduce((total, value) => total + value, 0) / scores.length) * 1000) /
          1000,
        topic,
      });
    }
  }

  return candidates.sort((left, right) => right.score - left.score);
}
