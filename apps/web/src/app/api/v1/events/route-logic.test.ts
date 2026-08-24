import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { API_RATE_LIMITS } from "@/lib/api-rate-limit";
import type { EventsListQuery } from "@/lib/events/events-service";
import { UNAUTHENTICATED, readJson, recordRateLimit } from "@/lib/home/home-test-doubles";

import { ApiError } from "@/lib/api";

import {
  eventCreateRoute,
  eventsRoute,
  type EventCreateRouteDependencies,
  type EventsRouteDependencies,
} from "./route-logic";

const EMPTY_RESPONSE = {
  counts: { all: 0, going: 0, live: 0, liveNow: false, nextStartsAt: null, upcoming: 0 },
  items: [],
  nextCursor: null,
  week: [],
};

function routeDependencies(
  overrides: Partial<EventsRouteDependencies> = {},
): EventsRouteDependencies {
  return {
    authenticate: () => Promise.resolve("u1"),
    enforceRateLimit: () => Promise.resolve(),
    listEvents: () => Promise.resolve(EMPTY_RESPONSE),
    ...overrides,
  };
}

async function capture(url: string): Promise<EventsListQuery> {
  let captured: EventsListQuery | null = null;

  await eventsRoute(
    new Request(url),
    routeDependencies({
      listEvents: (_userId, query) => {
        captured = query;
        return Promise.resolve(EMPTY_RESPONSE);
      },
    }),
  );

  assert.ok(captured);
  return captured;
}

describe("GET /api/v1/events", () => {
  it("kimligi once, butceyi sonra sorar; oturumsuz istek sorguya hic ulasmaz", async () => {
    let reached = false;

    const response = await eventsRoute(
      new Request("https://whispr.test/api/v1/events"),
      routeDependencies({
        authenticate: UNAUTHENTICATED,
        listEvents: () => {
          reached = true;
          return Promise.resolve(EMPTY_RESPONSE);
        },
      }),
    );

    assert.equal(response.status, 401);
    assert.equal(reached, false);
  });

  it("events:list butcesini harcar ve o butce kayitlidir", async () => {
    const recorded: string[] = [];

    await eventsRoute(
      new Request("https://whispr.test/api/v1/events"),
      routeDependencies({ enforceRateLimit: recordRateLimit(recorded) }),
    );

    assert.deepEqual(recorded, ["events:list"]);
    assert.ok(API_RATE_LIMITS["events:list"]);
  });

  it("izleyiciye ozel yanit hicbir yerde onbelleklenmez", async () => {
    const response = await eventsRoute(
      new Request("https://whispr.test/api/v1/events"),
      routeDependencies(),
    );

    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.deepEqual(await readJson(response), EMPTY_RESPONSE);
  });

  /**
   * Ş10 §6 — ekranın iki kolonu (ızgara ve 300'lük ajanda rayı) **ayrı** istekler açıyor ve
   * biri diğerini beklemiyor. "Yavaş" bir ilk boyanın sunucudan mı taşımadan mı geldiğini
   * ayırmanın tek yolu bu başlık; `db` kovası sorgunun kendi süresi, `total` isteğin tamamı.
   */
  it("yanit Server-Timing tasir: auth, db ve total kovalari ayri", async () => {
    const response = await eventsRoute(
      new Request("https://whispr.test/api/v1/events"),
      routeDependencies(),
    );

    const header = response.headers.get("Server-Timing") ?? "";
    assert.match(header, /(^|, )auth;dur=/u);
    assert.match(header, /(^|, )db;dur=/u);
    assert.match(header, /(^|, )total;dur=/u);
    // Onbellek basligi kaybolmadi: zamanlama basligi onun **yanina** yaziliyor.
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  });

  it("sekme, zaman, kaynak, katilim, arama ve hafta sunucuya gecer", async () => {
    const query = await capture(
      "https://whispr.test/api/v1/events?tab=live&time=week&source=s1&mine=host&q=oyun&week=2026-08-27",
    );

    assert.equal(query.tab, "live");
    assert.equal(query.time, "week");
    assert.equal(query.serverId, "s1");
    assert.equal(query.mine, "host");
    assert.equal(query.query, "oyun");
    assert.equal(query.weekStart, "2026-08-24");
  });

  it("taninmayan deger varsayilana duser, istegi reddetmez", async () => {
    const query = await capture(
      "https://whispr.test/api/v1/events?tab=zzz&time=zzz&mine=zzz&week=zzz",
    );

    assert.equal(query.tab, "all");
    assert.equal(query.time, null);
    assert.equal(query.mine, null);
    assert.equal(query.weekStart, null);
  });

  it("bos arama sorgusu yok sayilir; her satiri eslesen bir kalip suzgec degildir", async () => {
    const query = await capture("https://whispr.test/api/v1/events?q=%20%20");

    assert.equal(query.query, null);
  });

  it("sayfa buyuklugu varsayilan 24", async () => {
    assert.equal((await capture("https://whispr.test/api/v1/events")).limit, 24);
    assert.equal((await capture("https://whispr.test/api/v1/events?limit=12")).limit, 12);
  });

  it("limit=0 bir kiptir: kart istemeyen kabuk ipucu yalniz sayaclari okur", async () => {
    assert.equal((await capture("https://whispr.test/api/v1/events?limit=0")).limit, 0);
  });

  it("tavani asan ya da negatif sayfa buyuklugu reddedilir, sessizce daraltilmaz", async () => {
    for (const limit of ["-1", "51", "500"]) {
      const response = await eventsRoute(
        new Request(`https://whispr.test/api/v1/events?limit=${limit}`),
        routeDependencies(),
      );

      assert.equal(response.status, 400, `limit=${limit}`);
    }
  });

  it("imlec opak tasinir; yon kuralini ne rota ne istemci tekrar eder", async () => {
    const token = "YXNjfDIwMjYtMDgtMjZUMTM6MDA6MDAuMDAwWnxldi0x";
    const query = await capture(`https://whispr.test/api/v1/events?cursor=${token}`);

    assert.equal(query.cursor, token);
  });

  it("yanit sozlesmeye gore dogrulanir; eksik alan istemciye sessizce gecmez", async () => {
    const response = await eventsRoute(
      new Request("https://whispr.test/api/v1/events"),
      routeDependencies({
        listEvents: () => Promise.resolve({ ...EMPTY_RESPONSE, counts: undefined } as never),
      }),
    );

    assert.equal(response.ok, false);
    assert.equal(response.status, 400);
  });
});

/* --------------------------------------------------------------- Ş3 · POST */

const CREATE_COUNTS = {
  all: 1,
  going: 0,
  live: 0,
  liveNow: false,
  nextStartsAt: null,
  upcoming: 1,
};

const CREATE_RESPONSE = {
  counts: CREATE_COUNTS,
  event: { id: "evt-1" },
  scheduled: false,
} as never;

function createRequest(body: unknown): Request {
  return new Request("https://whispr.test/api/v1/events", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

const VALID_CREATE_BODY = {
  durationMinutes: 45,
  isPublic: false,
  kind: "voice",
  serverId: "srv-1",
  startsAt: "2026-09-01T15:00:00.000Z",
  title: "Tasarım Kritiği",
};

function createDependencies(overrides: Partial<EventCreateRouteDependencies> = {}) {
  const rateActions: string[] = [];
  const seen: unknown[] = [];

  return {
    deps: {
      authenticate: () => Promise.resolve("u1"),
      createEvent: (_userId: string, input: unknown) => {
        seen.push(input);
        return Promise.resolve(CREATE_RESPONSE);
      },
      enforceRateLimit: recordRateLimit(rateActions),
      parseBody: async (request: Request, schema: { parse: (value: unknown) => unknown }) =>
        schema.parse(await request.json()),
      ...overrides,
    } as EventCreateRouteDependencies,
    rateActions,
    seen,
  };
}

describe("POST /api/v1/events", () => {
  it("201 ile etkinliği ve güncel sayaçları döner", async () => {
    const { deps, rateActions, seen } = createDependencies();

    const response = await eventCreateRoute(createRequest(VALID_CREATE_BODY), deps);
    const body = await readJson(response);

    assert.equal(response.status, 201);
    assert.equal(seen.length, 1);
    assert.deepEqual(rateActions, ["events:create"]);
    assert.deepEqual(body.counts, CREATE_COUNTS);
    assert.ok(Object.hasOwn(API_RATE_LIMITS, "events:create"));
  });

  it("MANAGE_EVENTS taşımayan üyeye 403 verir (K4)", async () => {
    const { deps } = createDependencies({
      createEvent: () =>
        Promise.reject(
          new ApiError("You do not have permission to manage events.", 403, "FORBIDDEN"),
        ),
    });

    const response = await eventCreateRoute(createRequest(VALID_CREATE_BODY), deps);

    assert.equal(response.status, 403);
    assert.equal((await readJson(response)).code, "FORBIDDEN");
  });

  it("tür ↔ kanal kuralı ihlalinde 422 (K10)", async () => {
    const { deps } = createDependencies({
      createEvent: () =>
        Promise.reject(
          new ApiError(
            "This event kind cannot be hosted in that channel.",
            422,
            "EVENT_KIND_CHANNEL_MISMATCH",
          ),
        ),
    });

    const response = await eventCreateRoute(
      createRequest({ ...VALID_CREATE_BODY, channelId: "chn-text", kind: "live" }),
      deps,
    );

    assert.equal(response.status, 422);
    assert.equal((await readJson(response)).code, "EVENT_KIND_CHANNEL_MISMATCH");
  });

  it("COMMUNITY olmayan sunucuda isPublic 422 (K3)", async () => {
    const { deps } = createDependencies({
      createEvent: () =>
        Promise.reject(
          new ApiError(
            "Only community servers can list events in Keşfet.",
            422,
            "EVENT_PUBLIC_REQUIRES_COMMUNITY",
          ),
        ),
    });

    const response = await eventCreateRoute(
      createRequest({ ...VALID_CREATE_BODY, isPublic: true }),
      deps,
    );

    assert.equal(response.status, 422);
    assert.equal((await readJson(response)).code, "EVENT_PUBLIC_REQUIRES_COMMUNITY");
  });

  it("kanal ve harici bağlantı birlikte verilirse 400 — yer tektir", async () => {
    const { deps, seen } = createDependencies();

    const response = await eventCreateRoute(
      createRequest({
        ...VALID_CREATE_BODY,
        channelId: "chn-1",
        externalLocation: "https://meet.test",
      }),
      deps,
    );

    assert.equal(response.status, 400);
    assert.deepEqual(seen, []);
  });

  it("oturumsuz isteği servise hiç götürmez", async () => {
    let called = false;
    const { deps } = createDependencies({
      authenticate: UNAUTHENTICATED,
      createEvent: () => {
        called = true;
        return Promise.resolve(CREATE_RESPONSE);
      },
    });

    const response = await eventCreateRoute(createRequest(VALID_CREATE_BODY), deps);

    assert.equal(response.status, 401);
    assert.equal(called, false);
  });
});
