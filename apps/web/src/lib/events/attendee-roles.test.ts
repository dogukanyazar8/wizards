import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { EVENT_ATTENDEE_ROLE_TONE, type EventAttendeeRole } from "@wizards/types";

import {
  EVENT_ATTENDEE_PAGE_SIZE,
  EVENT_ATTENDEE_ROLE_ORDER,
  compareEventAttendeeKeys,
  decodeEventAttendeeCursor,
  encodeEventAttendeeCursor,
  eventAttendeeRoleRank,
  resolveEventAttendees,
  toEventAttendeeName,
  toEventInitials,
  type EventAttendeeCandidate,
} from "./attendee-roles";

function candidate(
  overrides: Partial<EventAttendeeCandidate> & Pick<EventAttendeeCandidate, "id" | "role">,
): EventAttendeeCandidate {
  return {
    avatarUrl: null,
    displayName: null,
    sortAt: new Date("2026-08-21T09:00:00.000Z"),
    username: overrides.id,
    ...overrides,
  };
}

describe("events attendee roles — öncelik sırası", () => {
  it("sırayı host → listening → going → maybe olarak sabitler", () => {
    assert.deepEqual([...EVENT_ATTENDEE_ROLE_ORDER], ["host", "listening", "going", "maybe"]);

    const ranks = EVENT_ATTENDEE_ROLE_ORDER.map((role) => eventAttendeeRoleRank(role));
    assert.deepEqual(ranks, [0, 1, 2, 3]);
  });

  it("dört rolün tamamı sözlükte bir tona sahip", () => {
    for (const role of EVENT_ATTENDEE_ROLE_ORDER) {
      assert.match(EVENT_ATTENDEE_ROLE_TONE[role], /^--[a-z-]+$/u);
    }
  });

  it("karışık gelen adayları rol sırasına dizer", () => {
    const resolved = resolveEventAttendees([
      candidate({ id: "maybe-1", role: "maybe" }),
      candidate({ id: "going-1", role: "going" }),
      candidate({ id: "host-1", role: "host" }),
      candidate({ id: "listening-1", role: "listening" }),
    ]);

    assert.deepEqual(
      resolved.map((attendee) => attendee.id),
      ["host-1", "listening-1", "going-1", "maybe-1"],
    );
  });

  it("grup içinde createdAt ASC, eşitlikte kimlik sırası", () => {
    const resolved = resolveEventAttendees([
      candidate({ id: "b", role: "going", sortAt: new Date("2026-08-21T10:00:00.000Z") }),
      candidate({ id: "a", role: "going", sortAt: new Date("2026-08-21T10:00:00.000Z") }),
      candidate({ id: "c", role: "going", sortAt: new Date("2026-08-21T08:00:00.000Z") }),
    ]);

    assert.deepEqual(
      resolved.map((attendee) => attendee.id),
      ["c", "a", "b"],
    );
  });
});

describe("events attendee roles — bir kişi tek satırda", () => {
  it("hem GOING hem VoiceState olan kişiyi tek satırda ve listening olarak verir", () => {
    const resolved = resolveEventAttendees([
      candidate({ id: "u1", role: "going", sortAt: new Date("2026-08-21T08:00:00.000Z") }),
      candidate({ id: "u1", role: "listening", sortAt: new Date("2026-08-21T11:00:00.000Z") }),
    ]);

    assert.equal(resolved.length, 1);
    assert.equal(resolved[0]?.role, "listening");
  });

  it("sahibi aynı zamanda katılıyorsa yalnız host satırı kalır", () => {
    const resolved = resolveEventAttendees([
      candidate({ id: "u1", role: "going" }),
      candidate({ id: "u1", role: "host" }),
      candidate({ id: "u1", role: "maybe" }),
    ]);

    assert.deepEqual(
      resolved.map((attendee) => attendee.role),
      ["host"],
    );
  });

  it("öncelik giriş sırasından bağımsızdır", () => {
    const rows: EventAttendeeCandidate[] = [
      candidate({ id: "u1", role: "listening" }),
      candidate({ id: "u1", role: "going" }),
    ];

    assert.equal(resolveEventAttendees(rows)[0]?.role, "listening");
    assert.equal(resolveEventAttendees([...rows].reverse())[0]?.role, "listening");
  });
});

describe("events attendee roles — ad ve baş harfler", () => {
  it("iki kelimeden iki harf üretir", () => {
    assert.equal(toEventInitials("Selin Aksoy"), "SA");
  });

  it("tek kelimeden tek harf üretir", () => {
    assert.equal(toEventInitials("selin"), "S");
  });

  it("boş adı da bir karakterle karşılar (şema en az 1 harf ister)", () => {
    assert.equal(toEventInitials("   ").length, 1);
    assert.equal(toEventInitials("").length, 1);
  });

  it("iki harften uzun ad üretmez", () => {
    assert.ok(toEventInitials("Ali Veli Deli Kırk Budala").length <= 2);
  });

  it("görünen ad boşsa kullanıcı adına düşer", () => {
    assert.equal(toEventAttendeeName({ displayName: null, username: "selin" }), "selin");
    assert.equal(toEventAttendeeName({ displayName: "   ", username: "selin" }), "selin");
    assert.equal(
      toEventAttendeeName({ displayName: "Selin Aksoy", username: "selin" }),
      "Selin Aksoy",
    );
  });

  it("çözümleyici baş harfleri kendisi üretir, istemciye bırakmaz", () => {
    const [attendee] = resolveEventAttendees([
      candidate({ displayName: "Mert Kaya", id: "u1", role: "going", username: "mert" }),
    ]);

    assert.equal(attendee?.name, "Mert Kaya");
    assert.equal(attendee?.initials, "MK");
  });
});

describe("events attendee roles — imleç", () => {
  it("sayfa boyu 8", () => {
    assert.equal(EVENT_ATTENDEE_PAGE_SIZE, 8);
  });

  it("imleci gidiş dönüş çözer", () => {
    const key = { id: "u1", rank: 2, sortAt: new Date("2026-08-21T09:00:00.000Z") };
    const decoded = decodeEventAttendeeCursor(encodeEventAttendeeCursor(key));

    assert.deepEqual(decoded, { id: "u1", rank: 2, sortAt: key.sortAt.toISOString() });
  });

  it("bozuk imleci null döner, patlamaz", () => {
    assert.equal(decodeEventAttendeeCursor("zzz"), null);
    assert.equal(decodeEventAttendeeCursor(undefined), null);
    assert.equal(decodeEventAttendeeCursor(""), null);
  });

  it("tanımadığı rol sırasını reddeder", () => {
    const forged = Buffer.from("9|2026-08-21T09:00:00.000Z|u1", "utf8").toString("base64url");
    assert.equal(decodeEventAttendeeCursor(forged), null);
  });

  it("anahtarları rol, zaman, kimlik sırasıyla karşılaştırır", () => {
    const host = { id: "u9", rank: 0, sortAt: "2026-08-21T23:00:00.000Z" };
    const going = { id: "u1", rank: 2, sortAt: "2026-08-21T01:00:00.000Z" };

    assert.ok(compareEventAttendeeKeys(host, going) < 0);
    assert.ok(compareEventAttendeeKeys(going, host) > 0);
    assert.equal(compareEventAttendeeKeys(going, going), 0);
    assert.ok(
      compareEventAttendeeKeys(
        { id: "a", rank: 2, sortAt: "2026-08-21T01:00:00.000Z" },
        { id: "b", rank: 2, sortAt: "2026-08-21T01:00:00.000Z" },
      ) < 0,
    );
  });
});

describe("events attendee roles — sözleşme", () => {
  it("üretilen satır ekranda gösterilecek metin taşımaz", () => {
    const [attendee] = resolveEventAttendees([candidate({ id: "u1", role: "maybe" })]);
    const roles: EventAttendeeRole[] = ["host", "going", "maybe", "listening"];

    assert.ok(attendee);
    assert.deepEqual(Object.keys(attendee).sort(), ["avatarUrl", "id", "initials", "name", "role"]);
    assert.ok(roles.includes(attendee.role));
  });
});
