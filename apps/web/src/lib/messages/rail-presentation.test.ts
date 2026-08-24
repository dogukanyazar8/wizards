import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DMConversationDTO } from "@wizards/types";
import {
  filterRailRows,
  formatRailTime,
  splitRailSections,
  toConversationRow,
  toInitials,
  toMessagesPresence,
  type RailTimeLabels,
} from "./rail-presentation";

const LABELS: RailTimeLabels = {
  weekdays: ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"],
  yesterday: "Dün",
};

/** 2026-08-20 bir perşembe. */
const NOW = new Date(2026, 7, 20, 14, 0, 0);

type Participant = DMConversationDTO["participants"][number];

function participant(userId: string, overrides: Partial<Participant> = {}): Participant {
  return {
    avatarUrl: null,
    customStatus: null,
    displayName: null,
    muted: false,
    presence: { customStatus: null, status: "ONLINE" },
    status: "ONLINE",
    unreadCount: 0,
    userId,
    username: userId,
    ...overrides,
  };
}

function conversation(overrides: Partial<DMConversationDTO> = {}): DMConversationDTO {
  return {
    iconUrl: null,
    id: "conv-1",
    lastMessage: null,
    lastMessageAt: new Date(2026, 7, 20, 9, 26).toISOString(),
    name: null,
    ownerId: null,
    participants: [participant("user-1"), participant("user-2")],
    type: "DM",
    ...overrides,
  };
}

function row(overrides: Partial<Parameters<typeof toConversationRow>[0]> = {}) {
  return toConversationRow({
    authorPrefix: null,
    conversation: conversation(),
    currentUserId: "user-1",
    locale: "tr",
    name: "Selin Aksoy",
    now: NOW,
    preview: "Kritiğe bunu getirelim",
    timeLabels: LABELS,
    ...overrides,
  });
}

describe("baş harfler", () => {
  it("iki kelimeden iki harf alır", () => {
    assert.equal(toInitials("Selin Aksoy"), "SA");
  });

  it("tek kelimede tek harf", () => {
    assert.equal(toInitials("Selin"), "S");
  });

  it("Türkçe büyütme kuralını kullanır", () => {
    // İngilizce kuralla `IÇ` olurdu; ray tile'ında yanlış harf yanlış kişi demek.
    assert.equal(toInitials("irem Çelik"), "İÇ");
  });

  it("boş adda soru işareti verir", () => {
    assert.equal(toInitials("   "), "?");
  });
});

describe("presence eşlemesi", () => {
  it("dört durumu da eşler", () => {
    assert.equal(toMessagesPresence("ONLINE"), "online");
    assert.equal(toMessagesPresence("IDLE"), "idle");
    assert.equal(toMessagesPresence("DND"), "dnd");
    assert.equal(toMessagesPresence("OFFLINE"), "offline");
  });

  it("bilinmeyen ve eksik durumu çevrimdışı sayar", () => {
    assert.equal(toMessagesPresence(null), "offline");
    assert.equal(toMessagesPresence(undefined), "offline");
  });
});

describe("saat sütunu", () => {
  it("bugünkü mesajda saat yazar", () => {
    assert.equal(formatRailTime(new Date(2026, 7, 20, 9, 26), NOW, LABELS, "tr"), "09:26");
  });

  it("dünkü mesajda `Dün` yazar", () => {
    assert.equal(formatRailTime(new Date(2026, 7, 19, 23, 59), NOW, LABELS, "tr"), "Dün");
  });

  it("bu hafta içindeki mesajda gün adı yazar", () => {
    // 2026-08-17 pazartesi.
    assert.equal(formatRailTime(new Date(2026, 7, 17, 10, 0), NOW, LABELS, "tr"), "Pzt");
  });

  it("bir haftadan eskisinde tarih yazar", () => {
    const label = formatRailTime(new Date(2026, 7, 12, 10, 0), NOW, LABELS, "tr");

    assert.match(label, /12/);
    assert.equal(label.includes(":"), false);
  });

  it("gelecekteki bir damga bugüne düşer", () => {
    // Saat farkı ya da bir istemci saati ileri bir damga üretebilir; "yarın"
    // diye bir sütun yok.
    assert.equal(formatRailTime(new Date(2026, 7, 21, 9, 0), NOW, LABELS, "tr"), "09:00");
  });
});

describe("satır eşlemesi", () => {
  it("1:1 satırda karşı tarafın presence'ını taşır", () => {
    const mapped = row({
      conversation: conversation({
        participants: [participant("user-1"), participant("user-2", { status: "DND" })],
      }),
    });

    assert.equal(mapped.kind, "dm");
    assert.equal(mapped.presence, "dnd");
  });

  it("grupta presence noktası yok", () => {
    // Rozet bir kişinin durumudur, bir odanınki değil.
    const mapped = row({
      conversation: conversation({ avatarColor: "primary", type: "GROUP_DM" }),
      name: "Sürüm 2.4 Ekibi",
    });

    assert.equal(mapped.kind, "group");
    assert.equal(mapped.presence, null);
    assert.equal(mapped.tileColor, "primary");
    assert.equal(mapped.initials, "S2");
  });

  it("1:1 satırda tile rengi yok", () => {
    assert.equal(row().tileColor, null);
  });

  it("okunmamış sayısını görüntüleyenin satırından alır", () => {
    const mapped = row({
      conversation: conversation({
        participants: [
          participant("user-1", { unreadCount: 3 }),
          participant("user-2", { unreadCount: 9 }),
        ],
      }),
    });

    assert.equal(mapped.unreadCount, 3);
  });

  it("sabitleme görüntüleyenin kendi sabitlemesidir", () => {
    // Konuşmanın sabitlenen **mesajı** başka bir şey; ray bu ikisini karıştırmaz.
    assert.equal(row().pinned, false);
    assert.equal(row({ conversation: conversation({ pinnedAt: NOW.toISOString() }) }).pinned, true);
  });

  it("kendi mesajında ön eki taşır", () => {
    const mapped = row({ authorPrefix: "Sen: ", preview: "yarın ilk işim bakmak" });

    assert.deepEqual(mapped.preview, {
      authorPrefix: "Sen: ",
      text: "yarın ilk işim bakmak",
    });
  });
});

describe("bölümler ve süzme", () => {
  it("sabitlenenleri aynı sıralamanın dilimi olarak ayırır", () => {
    const rows = [
      { id: "a", pinned: false },
      { id: "b", pinned: true },
      { id: "c", pinned: false },
      { id: "d", pinned: true },
    ];

    const { pinned, rest } = splitRailSections(rows);

    assert.deepEqual(
      pinned.map((entry) => entry.id),
      ["b", "d"],
    );
    assert.deepEqual(
      rest.map((entry) => entry.id),
      ["a", "c"],
    );
  });

  it("boş sorguda hepsini döndürür", () => {
    const rows = [row()];

    assert.equal(filterRailRows(rows, "   ").length, 1);
  });

  it("ad ve önizlemede arar", () => {
    const rows = [row(), row({ name: "Mert Kaya", preview: "dağıtım 16:00" })];

    assert.equal(filterRailRows(rows, "mert").length, 1);
    assert.equal(filterRailRows(rows, "dağıtım").length, 1);
    assert.equal(filterRailRows(rows, "yok").length, 0);
  });

  it("Türkçe büyük I harfini doğru küçültür", () => {
    // İngilizce kuralla `İstanbul` → `istanbul` olmaz; arayan sonuç bulamazdı.
    const rows = [row({ name: "İstanbul Ekibi" })];

    assert.equal(filterRailRows(rows, "istanbul").length, 1);
  });
});
