import type { APIRequestContext } from "@playwright/test";

import { expect, test } from "../../fixtures/test";
import { apiLoginAs, apiLogout, e2eRequestHeaders } from "../../helpers/api-auth";
import { getE2EDMConversationId, getE2EUserId, withE2EDatabase } from "../../helpers/db";

/**
 * Mesajlar paketinin yeni uçları — Dalga 3 §6, `00-ortak-baglam.md` §5.1.
 *
 * Bu dosya **davranış** kanıtlıyor: servis katmanının kendi testleri sahte
 * bağımlılıklarla koşuyor ve bir uç yanlış servisi çağırırsa hepsi yeşil kalır.
 * Buradaki her istek gerçek sunucuya, gerçek oturumla gidiyor.
 *
 * Üç madde ölçülüyor:
 *   1. **401** — oturum yoksa hiçbir uç veri döndürmez.
 *   2. **400** — tavanları aşan yük şemada durur, servise hiç ulaşmaz.
 *   3. **Kapsam** — katılımcı olunmayan konuşma ne aramada görünür ne
 *      iletilebilir; yokluk **404** ile bildirilir, 403 ile değil (403 "var ama
 *      senin değil" demek olurdu ve bir kimliği doğrulardı).
 */

const OUTSIDER_MESSAGE = "Yabanci konusma govdesi zzq";

type OutsiderFixture = {
  conversationId: string;
  messageId: string;
};

/**
 * Alice'in **katılımcı olmadığı** bir konuşma: Bob ile Charlie arasında.
 *
 * Tohumdaki konuşmalar Alice'i içeriyor; kapsam kontrolünü kanıtlamanın tek
 * yolu dışarıda kalan gerçek bir satır üretmek.
 */
async function createOutsiderConversation(): Promise<OutsiderFixture> {
  const [bobId, charlieId] = await Promise.all([getE2EUserId("bob"), getE2EUserId("charlie")]);

  return withE2EDatabase(async (prisma) => {
    const conversation = await prisma.dMConversation.create({
      data: {
        participants: {
          create: [
            { nameColor: "#6C8CFF", userId: bobId },
            { nameColor: "#6C8CFF", userId: charlieId },
          ],
        },
        type: "DM",
      },
      select: { id: true },
    });

    const message = await prisma.dMMessage.create({
      data: {
        content: OUTSIDER_MESSAGE,
        conversationId: conversation.id,
        userId: bobId,
      },
      select: { id: true },
    });

    return { conversationId: conversation.id, messageId: message.id };
  });
}

async function deleteOutsiderConversation(conversationId: string): Promise<void> {
  await withE2EDatabase(async (prisma) => {
    await prisma.dMConversation.delete({ where: { id: conversationId } });
  });
}

async function statusOf(
  request: APIRequestContext,
  method: "get" | "post",
  url: string,
  data?: unknown,
): Promise<number> {
  const response =
    method === "get"
      ? await request.get(url, { headers: e2eRequestHeaders })
      : await request.post(url, { data: data ?? {}, headers: e2eRequestHeaders });

  return response.status();
}

test.describe("Mesajlar uçları — oturum kapısı", () => {
  test("oturum yokken hiçbir uç veri döndürmez", async ({ request }) => {
    await apiLogout(request);

    const conversationId = await getE2EDMConversationId();

    expect(await statusOf(request, "get", "/api/v1/dm/messages/search?q=merhaba")).toBe(401);
    expect(await statusOf(request, "get", `/api/v1/dm/${conversationId}/pins`)).toBe(401);
    expect(
      await statusOf(request, "post", "/api/v1/dm/messages/forward", {
        messageId: "00000000-0000-4000-8000-000000000000",
        targetConversationId: conversationId,
      }),
    ).toBe(401);
    expect(
      await statusOf(request, "post", "/api/v1/polls", {
        anonymous: false,
        conversationId,
        duration: "24h",
        multi: false,
        options: ["A", "B"],
        question: "Kaçta?",
      }),
    ).toBe(401);
  });
});

test.describe("Mesajlar uçları — tavanlar sunucuda", () => {
  test.beforeEach(async ({ request }) => {
    await apiLoginAs(request, "alice");
  });

  /**
   * Yedi seçenekli anket: istemci altıda duruyor ama istek elle de yazılabilir.
   * Tavan şemada olmasaydı, düğmeyi çizmemek bir kontrol sanılırdı.
   */
  test("yedi seçenekli anket 400 döner", async ({ request }) => {
    const conversationId = await getE2EDMConversationId();

    expect(
      await statusOf(request, "post", "/api/v1/polls", {
        anonymous: false,
        conversationId,
        duration: "24h",
        multi: false,
        options: ["A", "B", "C", "D", "E", "F", "G"],
        question: "Kaçta?",
      }),
    ).toBe(400);
  });

  /**
   * Kısa sorgu **tarama yapmaz**: panel her tuşta bu ucu çağırıyor ve iki
   * harften kısa bir desen bütün geçmişi okurdu. Yanıt 200 ve boş — hata değil,
   * çünkü kullanıcı henüz yanlış bir şey yapmadı.
   */
  test("kısa arama sorgusu boş sonuç döner, tarama yapmaz", async ({ request }) => {
    const response = await request.get("/api/v1/dm/messages/search?q=", {
      headers: e2eRequestHeaders,
    });

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ nextCursor: null, results: [], totalLabel: 0 });
  });

  /** 200 karakterlik tavan şemada; aşan sorgu servise hiç ulaşmaz. */
  test("tavanı aşan arama sorgusu 400 döner", async ({ request }) => {
    const tooLong = "a".repeat(201);

    expect(await statusOf(request, "get", `/api/v1/dm/messages/search?q=${tooLong}`)).toBe(400);
  });
});

test.describe("Mesajlar uçları — kapsam", () => {
  let outsider: OutsiderFixture;

  test.beforeAll(async () => {
    outsider = await createOutsiderConversation();
  });

  test.afterAll(async () => {
    await deleteOutsiderConversation(outsider.conversationId);
  });

  test.beforeEach(async ({ request }) => {
    await apiLoginAs(request, "alice");
  });

  /**
   * Katılımcılık sorgunun `JOIN` koşulu: satır hiç üretilmiyor. Sonradan
   * süzülen bir sorgu, bir hata durumunda başkasının konuşmasını sızdırabilirdi.
   */
  test("global arama katılımcı olunmayan konuşmayı döndürmez", async ({ request }) => {
    const response = await request.get(
      `/api/v1/dm/messages/search?q=${encodeURIComponent("zzq")}`,
      { headers: e2eRequestHeaders },
    );

    expect(response.status()).toBe(200);

    const payload = JSON.stringify(await response.json());

    expect(payload).not.toContain(outsider.conversationId);
    expect(payload).not.toContain(outsider.messageId);
    expect(payload).not.toContain(OUTSIDER_MESSAGE);
  });

  /** Yokluk 404 ile bildirilir: 403 kimliğin gerçek olduğunu doğrulardı. */
  test("yabancı mesajı iletmek 404 döner, 403 değil", async ({ request }) => {
    const targetConversationId = await getE2EDMConversationId();

    expect(
      await statusOf(request, "post", "/api/v1/dm/messages/forward", {
        messageId: outsider.messageId,
        targetConversationId,
      }),
    ).toBe(404);
  });

  test("yabancı konuşmanın sabitleri okunamaz", async ({ request }) => {
    const status = await statusOf(request, "get", `/api/v1/dm/${outsider.conversationId}/pins`);

    expect([403, 404]).toContain(status);
  });
});
