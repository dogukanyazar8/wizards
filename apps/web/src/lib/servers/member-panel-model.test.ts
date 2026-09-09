import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { WorkspaceMember, WorkspaceRole } from "@wizards/types";

import {
  buildPresenceGroups,
  buildVoiceGroups,
  buildVoicePresenceIndex,
  canInviteToVoice,
  getPresenceColor,
  getRoleBadgeColors,
  getVoiceInviteState,
  markVoiceInviteSent,
  matchesMemberQuery,
  type MemberPanelLabels,
} from "./member-panel-model";
import { roleToneToColor } from "./role-color";

/**
 * Ş5 — SPEC-SUNUCU §4.1 ve §4.2'nin gruplama, alt satır ve davet kuralları.
 *
 * Model saf olduğu için test sağlayıcı ağacı kurmaz; bileşenin kendisi
 * `components/shell/server-member-panel.test.tsx`'te ölçülür.
 */

const LABELS: MemberPanelLabels = {
  admin: "Yönetici",
  deafened: "Sesi kapalı",
  owner: "Sunucu",
  screenSharing: "Ekran paylaşıyor",
  separator: " · ",
};

function member(
  overrides: Partial<WorkspaceMember> & Pick<WorkspaceMember, "userId">,
): WorkspaceMember {
  return {
    accessLevel: "MEMBER",
    avatarUrl: null,
    communicationDisabledUntil: null,
    customStatus: null,
    displayName: overrides.userId,
    id: `m-${overrides.userId}`,
    roles: [],
    status: "ONLINE",
    username: overrides.userId,
    ...overrides,
  };
}

function role(
  overrides: Partial<WorkspaceRole> & Pick<WorkspaceRole, "id" | "name">,
): WorkspaceRole {
  return {
    color: roleToneToColor("warning"),
    isDefault: false,
    managed: false,
    mentionable: true,
    permissions: [],
    position: 1,
    ...overrides,
  };
}

const NO_VOICE = new Map();

describe("üye listesi grupları (§4.1)", () => {
  it("iki grup üretir ve çevrimdışını ikinci gruba koyar", () => {
    const groups = buildPresenceGroups({
      labels: LABELS,
      locale: "tr",
      members: [
        member({ displayName: "Selin", userId: "selin" }),
        member({ displayName: "Kerem", status: "OFFLINE", userId: "kerem" }),
        member({ displayName: "Ayça", status: "IDLE", userId: "ayca" }),
      ],
      query: "",
      roles: [],
      voiceIndex: NO_VOICE,
    });

    assert.equal(groups.length, 2);
    assert.deepEqual(
      groups[0]!.rows.map((row) => row.userId),
      ["selin", "ayca"],
    );
    assert.equal(groups[0]!.key, "online");
    assert.deepEqual(
      groups[1]!.rows.map((row) => row.userId),
      ["kerem"],
    );
  });

  it("çevrimiçi grubu presence sırasına, sonra ada göre dizer", () => {
    const groups = buildPresenceGroups({
      labels: LABELS,
      locale: "tr",
      members: [
        member({ displayName: "Zeynep", status: "DND", userId: "zeynep" }),
        member({ displayName: "Berk", status: "IDLE", userId: "berk" }),
        member({ displayName: "Ali", status: "ONLINE", userId: "ali" }),
      ],
      query: "",
      roles: [],
      voiceIndex: NO_VOICE,
    });

    assert.deepEqual(
      groups[0]!.rows.map((row) => row.userId),
      ["ali", "berk", "zeynep"],
    );
  });

  it("arama kutusu görünen adı ve kullanıcı adını süzer", () => {
    const input = {
      labels: LABELS,
      locale: "tr",
      members: [
        member({ displayName: "Doğukan Yazar", userId: "dogukan" }),
        member({ displayName: "Emre Şahin", userId: "emre" }),
      ],
      roles: [],
      voiceIndex: NO_VOICE,
    };

    assert.deepEqual(
      buildPresenceGroups({ ...input, query: "yazar" })[0]!.rows.map((row) => row.userId),
      ["dogukan"],
    );
    assert.deepEqual(
      buildPresenceGroups({ ...input, query: "emre" })[0]!.rows.map((row) => row.userId),
      ["emre"],
    );
  });

  it("Türkçe İ/ı çiftinde de eşleşir", () => {
    assert.equal(
      matchesMemberQuery({ displayName: "IŞIL Yıldız", username: "isil" }, "ışıl", "tr"),
      true,
    );
  });
});

describe("rol rozeti", () => {
  it("sahibe `Sunucu`, rolsüz yöneticiye `Yönetici` rozeti verir", () => {
    const groups = buildPresenceGroups({
      labels: LABELS,
      locale: "tr",
      members: [
        member({ accessLevel: "OWNER", displayName: "Selin", userId: "selin" }),
        member({ accessLevel: "ADMIN", displayName: "Emre", userId: "emre" }),
        member({ displayName: "Mert", userId: "mert" }),
      ],
      query: "",
      roles: [],
      voiceIndex: NO_VOICE,
    });
    const byId = new Map(groups[0]!.rows.map((row) => [row.userId, row]));

    assert.equal(byId.get("selin")?.roleBadge?.label, "Sunucu");
    assert.equal(byId.get("emre")?.roleBadge?.label, "Yönetici");
    assert.equal(byId.get("mert")?.roleBadge, null);
  });

  it("adlandırılmış rolü `@everyone` yerine seçer ve rengini `Role.color`dan alır", () => {
    const groups = buildPresenceGroups({
      labels: LABELS,
      locale: "tr",
      members: [
        member({
          displayName: "Can",
          roles: [
            { color: 0, id: "everyone", name: "@everyone" },
            { color: roleToneToColor("warning"), id: "mod", name: "Moderatör" },
          ],
          userId: "can",
        }),
      ],
      query: "",
      roles: [
        role({ id: "everyone", isDefault: true, name: "@everyone", position: 0 }),
        role({ color: roleToneToColor("warning"), id: "mod", name: "Moderatör", position: 3 }),
      ],
      voiceIndex: NO_VOICE,
    });
    const badge = groups[0]!.rows[0]!.roleBadge;

    assert.equal(badge?.label, "Moderatör");
    assert.deepEqual(getRoleBadgeColors(badge!), {
      background: "hsl(var(--warning) / 0.14)",
      foreground: "hsl(var(--warning))",
    });
  });

  it("iki rol arasında `position`u yüksek olanı seçer", () => {
    const groups = buildPresenceGroups({
      labels: LABELS,
      locale: "tr",
      members: [
        member({
          displayName: "Can",
          roles: [
            { color: 0, id: "low", name: "Katkıcı" },
            { color: 0, id: "high", name: "Moderatör" },
          ],
          userId: "can",
        }),
      ],
      query: "",
      roles: [
        role({ id: "low", name: "Katkıcı", position: 1 }),
        role({ id: "high", name: "Moderatör", position: 9 }),
      ],
      voiceIndex: NO_VOICE,
    });

    assert.equal(groups[0]!.rows[0]!.roleBadge?.label, "Moderatör");
  });
});

describe("alt satır ve durum ikonları", () => {
  const voiceIndex = buildVoicePresenceIndex(
    [
      {
        channelId: "voice-1",
        participants: [
          {
            avatarUrl: null,
            displayName: null,
            isDeafened: false,
            isScreenSharing: true,
            userId: "dogukan",
            username: "dogukan",
          },
          {
            avatarUrl: null,
            displayName: null,
            isDeafened: true,
            isScreenSharing: false,
            userId: "mert",
            username: "mert",
          },
        ],
      },
    ],
    new Map([["voice-1", "Genel Sohbet"]]),
  );

  it("ses kanalındaki üyenin alt satırında kanal adı ve durumu yazar", () => {
    const groups = buildPresenceGroups({
      labels: LABELS,
      locale: "tr",
      members: [
        member({ displayName: "Doğukan", userId: "dogukan" }),
        member({ displayName: "Mert", userId: "mert" }),
      ],
      query: "",
      roles: [],
      voiceIndex,
    });
    const byId = new Map(groups[0]!.rows.map((row) => [row.userId, row]));

    assert.equal(byId.get("dogukan")?.subtitle, "Genel Sohbet · Ekran paylaşıyor");
    assert.equal(byId.get("dogukan")?.screenSharing, true);
    assert.equal(byId.get("mert")?.subtitle, "Genel Sohbet · Sesi kapalı");
    assert.equal(byId.get("mert")?.deafened, true);
  });

  it("ses yoksa özel durumu, o da yoksa kullanıcı adını yazar", () => {
    const groups = buildPresenceGroups({
      labels: LABELS,
      locale: "tr",
      members: [
        member({ customStatus: "2.4 dağıtımını izliyor", displayName: "Emre", userId: "emre" }),
        member({ displayName: "Berk", userId: "berk" }),
      ],
      query: "",
      roles: [],
      voiceIndex: NO_VOICE,
    });
    const byId = new Map(groups[0]!.rows.map((row) => [row.userId, row]));

    assert.equal(byId.get("emre")?.subtitle, "2.4 dağıtımını izliyor");
    assert.equal(byId.get("berk")?.subtitle, "@berk");
  });

  it("adı bilinmeyen kanalın katılımcısını dizine hiç koymaz", () => {
    const index = buildVoicePresenceIndex(
      [
        {
          channelId: "silinmis",
          participants: [
            {
              avatarUrl: null,
              displayName: null,
              isDeafened: false,
              userId: "hayalet",
              username: "hayalet",
            },
          ],
        },
      ],
      new Map(),
    );

    assert.equal(index.size, 0);
  });
});

describe("ses kanalı katılımcıları (§4.2)", () => {
  const input = {
    labels: LABELS,
    locale: "tr",
    members: [
      member({ displayName: "Selin", userId: "selin" }),
      member({ displayName: "Emre", userId: "emre" }),
      member({ displayName: "Kerem", status: "OFFLINE", userId: "kerem" }),
    ],
    query: "",
    roles: [],
    voiceIndex: NO_VOICE,
  };

  it("`BU KANALDA` ve `KANALDA DEĞİL` gruplarını katılımcı kümesinden ayırır", () => {
    const groups = buildVoiceGroups({ ...input, participantIds: new Set(["selin"]) });

    assert.deepEqual(
      groups.map((group) => group.key),
      ["inChannel", "notInChannel"],
    );
    assert.deepEqual(
      groups[0]!.rows.map((row) => row.userId),
      ["selin"],
    );
    assert.deepEqual(
      groups[1]!.rows.map((row) => row.userId),
      ["emre", "kerem"],
    );
  });

  it("çevrimdışı üyeye davet düğmesi çizilmez", () => {
    const groups = buildVoiceGroups({ ...input, participantIds: new Set(["selin"]) });
    const byId = new Map(groups[1]!.rows.map((row) => [row.userId, row]));

    assert.equal(canInviteToVoice(byId.get("emre")!), true);
    assert.equal(canInviteToVoice(byId.get("kerem")!), false);
  });
});

describe("`Davet et` → `Gönderildi` (§4.2)", () => {
  it("geçiş tek yönlüdür ve ikinci çağrı aynı kümeyi döndürür", () => {
    const empty: ReadonlySet<string> = new Set();
    const once = markVoiceInviteSent(empty, "emre");
    const twice = markVoiceInviteSent(once, "emre");

    assert.equal(getVoiceInviteState(empty, "emre"), "idle");
    assert.equal(getVoiceInviteState(once, "emre"), "sent");
    assert.equal(twice, once, "aynı kimlik ikinci kez eklenince yeni küme üretilmez");
  });

  it("başka bir üyeyi işaretlemek öncekini düşürmez", () => {
    const state = markVoiceInviteSent(markVoiceInviteSent(new Set(), "emre"), "ayca");

    assert.equal(getVoiceInviteState(state, "emre"), "sent");
    assert.equal(getVoiceInviteState(state, "ayca"), "sent");
  });
});

describe("presence rengi", () => {
  it("dört durumun dördü de token okur", () => {
    assert.equal(getPresenceColor("ONLINE"), "hsl(var(--success))");
    assert.equal(getPresenceColor("IDLE"), "hsl(var(--warning))");
    assert.equal(getPresenceColor("DND"), "hsl(var(--danger))");
    assert.equal(getPresenceColor("OFFLINE"), "hsl(var(--text-muted))");
  });
});
