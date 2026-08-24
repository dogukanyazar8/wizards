import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import type { DMConversationDTO, DMParticipantDTO } from "@wizards/types";
import { sumDMUnreadCount } from "@/lib/dm/unread";

const SRC_ROOT = fileURLToPath(new URL("../../", import.meta.url));

function participant(userId: string, unreadCount: number): DMParticipantDTO {
  return {
    avatarUrl: null,
    displayName: null,
    lastSeenAt: null,
    presence: { status: "ONLINE" },
    status: "ONLINE",
    unreadCount,
    userId,
    username: userId,
  } as unknown as DMParticipantDTO;
}

function conversation(id: string, participants: DMParticipantDTO[]): DMConversationDTO {
  return {
    iconUrl: null,
    id,
    lastMessage: null,
    lastMessageAt: "2026-08-19T00:00:00.000Z",
    name: null,
    ownerId: null,
    participants,
    type: "DM",
  } as unknown as DMConversationDTO;
}

describe("sumDMUnreadCount", () => {
  it("returns zero without conversations", () => {
    assert.equal(sumDMUnreadCount([], "viewer"), 0);
  });

  it("adds up only the viewer's own participant rows", () => {
    const total = sumDMUnreadCount(
      [
        conversation("a", [participant("viewer", 3), participant("other", 7)]),
        conversation("b", [participant("viewer", 2), participant("other", 11)]),
      ],
      "viewer",
    );

    assert.equal(total, 5);
  });

  it("skips a conversation the viewer is not part of", () => {
    const total = sumDMUnreadCount([conversation("a", [participant("other", 9)])], "viewer");

    assert.equal(total, 0);
  });

  it("treats a missing counter as zero", () => {
    const row = conversation("a", [participant("viewer", 4)]);
    delete (row.participants[0] as { unreadCount?: number }).unreadCount;

    assert.equal(sumDMUnreadCount([row], "viewer"), 0);
  });
});

/** `apps/web/src` altındaki her kaynak dosya. */
function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      return collectSourceFiles(path);
    }

    return entry.name.endsWith(".ts") || entry.name.endsWith(".tsx") ? [path] : [];
  });
}

describe("DM unread counter has a single implementation", () => {
  /**
   * §4 "iki ayrı hesap yok". Kabuk ve DM listesi aynı toplamı ayrı ayrı katlarsa sayı sessizce
   * ayrışır; bu test ikinci bir katlamanın geri gelmesini kırmızıya çevirir. Satır başına düşen
   * okunmamış sayısı (rozet) yasak değil — yasak olan **toplamı** ikinci kez hesaplamak.
   */
  it("is the only place that folds unread counts into a total", () => {
    const allowed = join(SRC_ROOT, "lib", "dm", "unread.ts");
    const offenders: string[] = [];

    for (const path of collectSourceFiles(SRC_ROOT)) {
      if (path === allowed || path.endsWith(".test.ts") || path.endsWith(".test.tsx")) {
        continue;
      }

      const contents = readFileSync(path, "utf8");

      for (const match of contents.matchAll(/\.reduce\(/g)) {
        const window = contents.slice(match.index ?? 0, (match.index ?? 0) + 240);

        if (/unreadCount/.test(window)) {
          offenders.push(relative(SRC_ROOT, path).split(sep).join("/"));
          break;
        }
      }
    }

    assert.deepEqual(offenders, [], "these files must call sumDMUnreadCount instead");
  });
});
