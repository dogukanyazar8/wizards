import { expect, test } from "../../fixtures/test";
import { apiLoginAs, e2eRequestHeaders } from "../../helpers/api-auth";
import {
  addE2EServerMember,
  clearE2EUserPresence,
  clearE2EVoiceStates,
  createIsolatedServerForMembershipTest,
  deleteIsolatedE2EServer,
  getE2EServerRoute,
  getE2EUserId,
  joinE2EVoiceStateInDb,
  setE2EUserInvisible,
  withE2EDatabase,
} from "../../helpers/db";
import { PermissionBits } from "../../../src/lib/workspace/permissions";
import type { APIRequestContext } from "@playwright/test";

/**
 * Ana Sayfa 1a — Faz 8 §4. Beş elle test, iki gerçek hesapla otomatik koşuluyor.
 *
 * `00-ortak-baglam.md` §5.1 her yeni uç için altı madde sayıyor; 401 / Zod / rate limit
 * `home-endpoints.spec.ts` içinde kanıtlı. Burada kalan üçü var: **yetki** (göremediği kanal,
 * atıldığı sunucu), **redaksiyon** (görünmez kullanıcı) ve **açık yönlendirme**.
 *
 * Hepsi veriyi gerçek uçlardan okuyor: bir kartın ekranda ne çizdiği değil, sunucunun ne
 * gönderdiği ölçülüyor — ekran zaten yalnız gelen veriyi çiziyor.
 */

async function readJson(request: APIRequestContext, url: string): Promise<unknown> {
  const response = await request.get(url, { headers: e2eRequestHeaders });

  expect(response.status(), url).toBe(200);

  return response.json();
}

/** Yanıtın herhangi bir yerinde bu metin geçiyor mu? Alan adı bilmeye gerek yok. */
function payloadContains(payload: unknown, needle: string): boolean {
  return JSON.stringify(payload).includes(needle);
}

/** Yanıtın içinde bu kimliği taşıyan her nesne — DTO sarmalayıcısını bilmeye gerek yok. */
function findObjectsById(value: unknown, id: string, found: Record<string, unknown>[] = []) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      findObjectsById(entry, id, found);
    }

    return found;
  }

  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;

    if (record.id === id) {
      found.push(record);
    }

    for (const entry of Object.values(record)) {
      findObjectsById(entry, id, found);
    }
  }

  return found;
}

function collectHrefs(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectHrefs(entry, found);
    }

    return found;
  }

  if (typeof value === "object" && value !== null) {
    for (const [key, entry] of Object.entries(value)) {
      if (key === "href" && typeof entry === "string") {
        found.push(entry);
      } else {
        collectHrefs(entry, found);
      }
    }
  }

  return found;
}

/**
 * İzole sunucunun `@everyone` rolü sıfır izinle kuruluyor (fikstürün kendi seçimi). Yetki
 * testinin anlamlı olması için alice'in **görebildiği** bir taban gerekiyor: aksi hâlde
 * "gizli kanal sızmıyor" iddiası her kanalın görünmez olmasından geçerdi.
 */
async function grantDefaultRoleBaseline(serverId: string): Promise<void> {
  await withE2EDatabase(async (prisma) => {
    await prisma.role.updateMany({
      data: {
        permissions:
          PermissionBits.VIEW_CHANNEL | PermissionBits.SEND_MESSAGES | PermissionBits.CONNECT_VOICE,
      },
      where: { isDefault: true, serverId },
    });
  });
}

test.describe("Ana Sayfa güvenlik doğrulaması", () => {
  test.afterEach(async () => {
    await clearE2EVoiceStates();
    await clearE2EUserPresence("bob");
  });

  test("§4.1 görünmez kullanıcı canlı odada listelenmiyor", async ({ request }) => {
    const route = await getE2EServerRoute();
    const bobId = await getE2EUserId("bob");

    await addE2EServerMember(route.serverId, "bob");
    await setE2EUserInvisible("bob");
    await joinE2EVoiceStateInDb({
      channelId: route.voiceChannelId,
      serverId: route.serverId,
      userKey: "bob",
    });

    await apiLoginAs(request, "alice");

    const live = await readJson(request, "/api/v1/voice/live?limit=4");
    const friends = await readJson(request, "/api/v1/friends");

    // Görünmez kullanıcı ne katılımcı listesinde ne de sayımda görünür; tek katılımcı oysa
    // odanın kendisi de çizilmez.
    expect(payloadContains(live, bobId), "canlı oda görünmez kullanıcıyı listeliyor").toBe(false);

    for (const row of findObjectsById(friends, bobId)) {
      expect(row.status, "arkadaş şeridi görünmez kullanıcıyı çevrimiçi sayıyor").toBe("OFFLINE");
      expect(row.voiceRoom ?? null, "arkadaş satırı görünmez kullanıcının odasını sızdırıyor").toBe(
        null,
      );
    }
  });

  test("§4.2 görülemeyen özel kanalın mesajı, bahsedilmesi ve araması sızmıyor", async ({
    request,
  }) => {
    const isolated = await createIsolatedServerForMembershipTest("bob");

    try {
      await addE2EServerMember(isolated.serverId, "alice");
      await grantDefaultRoleBaseline(isolated.serverId);

      const secret = `gizli-kanal-${Date.now().toString(36)}`;
      const seeded = await withE2EDatabase(async (prisma) => {
        const [aliceId, bobId] = await Promise.all([
          prisma.user
            .findUniqueOrThrow({ select: { id: true }, where: { email: "alice@whispr.test" } })
            .then((user) => user.id),
          prisma.user
            .findUniqueOrThrow({ select: { id: true }, where: { email: "bob@whispr.test" } })
            .then((user) => user.id),
        ]);

        const defaultRole = await prisma.role.findFirstOrThrow({
          select: { id: true },
          where: { isDefault: true, serverId: isolated.serverId },
        });

        const channel = await prisma.channel.create({
          data: {
            name: secret,
            position: 9,
            serverId: isolated.serverId,
            type: "TEXT",
          },
          select: { id: true },
        });

        // @everyone'dan `VIEW_CHANNEL` alınır: alice sunucunun üyesi ama bu kanalın değil.
        await prisma.channelPermissionOverride.create({
          data: {
            channelId: channel.id,
            deny: PermissionBits.VIEW_CHANNEL,
            targetId: defaultRole.id,
            targetType: "ROLE",
          },
        });

        const message = await prisma.message.create({
          data: {
            channelId: channel.id,
            content: `${secret} icindeki gizli mesaj @alice_e2e`,
            userId: bobId,
          },
          select: { id: true },
        });

        await prisma.messageMention.create({
          data: { messageId: message.id, userId: aliceId },
        });

        return { channelId: channel.id, messageId: message.id };
      });

      await apiLoginAs(request, "alice");

      for (const endpoint of [
        "/api/v1/app/recent?limit=6",
        "/api/v1/mentions?limit=20",
        `/api/v1/search/command?q=${encodeURIComponent(secret)}`,
      ]) {
        const payload = await readJson(request, endpoint);

        expect(payloadContains(payload, secret), `${endpoint} kanal adını sızdırıyor`).toBe(false);
        expect(
          payloadContains(payload, seeded.channelId),
          `${endpoint} kanal kimliğini sızdırıyor`,
        ).toBe(false);
        expect(
          payloadContains(payload, seeded.messageId),
          `${endpoint} mesaj kimliğini sızdırıyor`,
        ).toBe(false);
      }
    } finally {
      await deleteIsolatedE2EServer(isolated.serverId);
    }
  });

  test("§4.3 sunucudan çıkarılan kullanıcı o sunucunun odasını ve etkinliğini görmüyor", async ({
    request,
  }) => {
    const isolated = await createIsolatedServerForMembershipTest("bob");

    try {
      await addE2EServerMember(isolated.serverId, "alice");
      await grantDefaultRoleBaseline(isolated.serverId);

      const eventName = `atilma-etkinligi-${Date.now().toString(36)}`;

      await withE2EDatabase(async (prisma) => {
        const bob = await prisma.user.findUniqueOrThrow({
          select: { id: true },
          where: { email: "bob@whispr.test" },
        });

        await prisma.scheduledEvent.create({
          data: {
            creatorId: bob.id,
            entityType: "EXTERNAL",
            externalLocation: "E2E",
            name: eventName,
            scheduledStartAt: new Date(Date.now() + 60 * 60 * 1000),
            serverId: isolated.serverId,
            status: "SCHEDULED",
          },
        });
      });

      await joinE2EVoiceStateInDb({
        channelId: isolated.voiceChannelId,
        serverId: isolated.serverId,
        userKey: "bob",
      });

      await apiLoginAs(request, "alice");

      const beforeEvents = await readJson(request, "/api/v1/events/upcoming?limit=10");
      const beforeLive = await readJson(request, "/api/v1/voice/live?limit=4");

      expect(payloadContains(beforeEvents, eventName), "üyeyken etkinlik görünmüyor").toBe(true);
      expect(
        payloadContains(beforeLive, isolated.voiceChannelId),
        "üyeyken canlı oda görünmüyor",
      ).toBe(true);

      await withE2EDatabase(async (prisma) => {
        const alice = await prisma.user.findUniqueOrThrow({
          select: { id: true },
          where: { email: "alice@whispr.test" },
        });

        await prisma.serverMember.deleteMany({
          where: { serverId: isolated.serverId, userId: alice.id },
        });
      });

      const afterEvents = await readJson(request, "/api/v1/events/upcoming?limit=10");
      const afterLive = await readJson(request, "/api/v1/voice/live?limit=4");

      expect(payloadContains(afterEvents, eventName), "atıldıktan sonra etkinlik kalıyor").toBe(
        false,
      );
      expect(
        payloadContains(afterLive, isolated.voiceChannelId),
        "atıldıktan sonra canlı oda kalıyor",
      ).toBe(false);
    } finally {
      await deleteIsolatedE2EServer(isolated.serverId);
    }
  });

  test("§4.4 dış URL taşıyan bildirim dış bağlantı olarak çizilmiyor", async ({ request }) => {
    const aliceId = await getE2EUserId("alice");
    const hostile = [
      "https://evil.example.com/steal",
      "//evil.example.com/steal",
      "javascript:alert(1)",
      "/\\evil.example.com",
    ];

    const created = await withE2EDatabase(async (prisma) => {
      const ids: string[] = [];

      for (const [index, actionUrl] of hostile.entries()) {
        const row = await prisma.notification.create({
          data: {
            actionUrl,
            body: "E2E open redirect probe",
            title: `E2E redirect ${index}`,
            type: "SERVER_INVITE",
            userId: aliceId,
          },
          select: { id: true },
        });

        ids.push(row.id);
      }

      return ids;
    });

    try {
      await apiLoginAs(request, "alice");

      for (const endpoint of ["/api/v1/app/awaiting?limit=20", "/api/v1/app/summary"]) {
        const payload = await readJson(request, endpoint);

        for (const href of collectHrefs(payload)) {
          expect(href.startsWith("/"), `${endpoint} dış bağlantı verdi: ${href}`).toBe(true);
          expect(href.startsWith("//"), `${endpoint} protokolsüz bağlantı verdi: ${href}`).toBe(
            false,
          );
          expect(href.startsWith("/\\"), `${endpoint} ters bölü bağlantı verdi: ${href}`).toBe(
            false,
          );
        }

        for (const actionUrl of hostile) {
          expect(payloadContains(payload, actionUrl), `${endpoint} ham actionUrl sızdırdı`).toBe(
            false,
          );
        }
      }
    } finally {
      await withE2EDatabase((prisma) =>
        prisma.notification.deleteMany({ where: { id: { in: created } } }),
      );
    }
  });

  test("§4.5 hızlı ardışık istek 429 dönüyor ve gövde iç hata sızdırmıyor", async ({ request }) => {
    await apiLoginAs(request, "alice");

    // `search:command` bütçesi dakikada 60. Sırayla atılır: paralel bir yağmur Redis'in
    // sayacını değil ağı ölçerdi.
    let limitedStatus: number | null = null;
    let limitedBody: unknown = null;

    for (let attempt = 0; attempt < 90; attempt += 1) {
      const response = await request.get("/api/v1/search/command?q=a", {
        headers: e2eRequestHeaders,
      });

      if (response.status() === 429) {
        limitedStatus = 429;
        limitedBody = await response.json();
        break;
      }

      expect(response.status(), `istek ${attempt} beklenmedik durum döndü`).toBe(200);
    }

    expect(limitedStatus, "rate limit hiç devreye girmedi").toBe(429);
    expect(limitedBody).toMatchObject({ error: expect.any(String) });
    expect(JSON.stringify(limitedBody)).not.toContain("prisma");
    expect(JSON.stringify(limitedBody)).not.toContain("Redis");
  });
});
