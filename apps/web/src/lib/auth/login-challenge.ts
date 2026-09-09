import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { logError } from "@/lib/logger";
import { getRedisRate } from "@/lib/redis";

/**
 * İki adımlı girişin sunucu taraflı challenge'ı — paket kararı K2.
 *
 * SPEC-GIRIS-KAYIT §4.2 doğrulama kodunu **ayrı ekranda** istiyor. Bugünkü tek atışlı akış
 * parolayı ve kodu aynı formda taşıyordu; ayrı ekran için iki yol var: parolayı istemcide
 * tutup ikinci kez göndermek, ya da parolayı bir kez sunucuda doğrulayıp kısa ömürlü bir
 * challenge vermek. İkincisi seçildi — parola ne bellekte kalır ne ikinci kez ağa çıkar.
 *
 * İki kısa ömürlü nesne var:
 *
 * 1. **Challenge** (5 dakika): "bu e-postanın parolası doğrulandı, ikinci adım bekleniyor".
 *    `/login/two-factor` ekranı bunu taşır.
 * 2. **Ticket** (30 saniye): "ikinci adım da geçildi, oturum açılabilir". Yalnız NextAuth
 *    `authorize` bunu tüketir ve parola sormadan oturumu kurar.
 *
 * İkisi de tek kullanımlıktır, opak rastgele değerdir ve depoda **özetiyle** durur; ham değer
 * yalnız istemciye gider. Parmak izi (IP + User-Agent) eşleşmezse kayıt silinir: çalınmış bir
 * challenge başka bir tarayıcıda işe yaramaz.
 */

/** SPEC §4.2 ekranının makul üst sınırı: kod girmek için beş dakika. */
export const LOGIN_CHALLENGE_TTL_MS = 5 * 60_000;

/** Ticket yalnız `signIn` çağrısı kadar yaşar. */
export const LOGIN_TICKET_TTL_MS = 30_000;

/** SPEC §7/3 — üç yanlış koddan sonra challenge düşer, kullanıcı giriş ekranına döner. */
export const LOGIN_CHALLENGE_MAX_CODE_ATTEMPTS = 3;

const CHALLENGE_KEY_PREFIX = "auth:2fa-challenge";
const TICKET_KEY_PREFIX = "auth:2fa-ticket";

export type LoginChallengeRecord = {
  attempts: number;
  createdAtMs: number;
  email: string;
  expiresAtMs: number;
  fingerprint: string;
  redirectTo: string;
  rememberMe: boolean;
  userId: string;
};

export type LoginTicketRecord = {
  email: string;
  expiresAtMs: number;
  fingerprint: string;
  redirectTo: string;
  rememberMe: boolean;
  userId: string;
};

/**
 * Depo sözleşmesi Redis ilkelleri yerine dört fiil taşır. `take` **atomiktir** — tek kullanımlık
 * olma özelliği buna dayanır, `read` + `drop` çiftiyle yazılırsa iki eşzamanlı istek aynı
 * challenge'ı tüketebilir.
 */
export type ChallengeStore = {
  drop: (key: string) => Promise<void>;
  put: (key: string, value: string, ttlMs: number) => Promise<void>;
  read: (key: string) => Promise<string | null>;
  take: (key: string) => Promise<string | null>;
};

type ChallengeRedis = {
  del: (key: string) => Promise<unknown>;
  eval: (script: string, keyCount: number, ...args: Array<number | string>) => Promise<unknown>;
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, mode: "PX", ttlMs: number) => Promise<unknown>;
};

const TAKE_SCRIPT = `
local value = redis.call("GET", KEYS[1])
if value then
  redis.call("DEL", KEYS[1])
end
return value
`;

export function createRedisChallengeStore(redis: ChallengeRedis): ChallengeStore {
  return {
    async drop(key) {
      await redis.del(key);
    },
    async put(key, value, ttlMs) {
      await redis.set(key, value, "PX", Math.max(1, Math.trunc(ttlMs)));
    },
    read: (key) => redis.get(key),
    async take(key) {
      const value = await redis.eval(TAKE_SCRIPT, 1, key);
      return typeof value === "string" ? value : null;
    },
  };
}

/**
 * Süreç içi depo. Redis olmayan geliştirme ortamı ve testler için; TTL'i kendisi uygular ki
 * davranış Redis'le aynı olsun.
 */
export function createMemoryChallengeStore(nowMs: () => number = () => Date.now()): ChallengeStore {
  const values = new Map<string, { expiresAtMs: number; value: string }>();

  function readFresh(key: string) {
    const entry = values.get(key);

    if (!entry) {
      return null;
    }

    if (entry.expiresAtMs <= nowMs()) {
      values.delete(key);
      return null;
    }

    return entry.value;
  }

  return {
    async drop(key) {
      values.delete(key);
    },
    async put(key, value, ttlMs) {
      values.set(key, { expiresAtMs: nowMs() + ttlMs, value });
    },
    async read(key) {
      return readFresh(key);
    },
    async take(key) {
      const value = readFresh(key);
      values.delete(key);
      return value;
    },
  };
}

export type LoginChallengeDependencies = {
  getRedisRate: typeof getRedisRate;
  isProduction: boolean;
  logError: typeof logError;
  nowMs: () => number;
  randomToken: () => string;
  store?: ChallengeStore;
};

export type LoginChallengeIssueInput = {
  clientIp?: string | null;
  email: string;
  /**
   * Parmak izi hazır geliyorsa (mobil uçlar başlıkları kendisi okuyor) yeniden hesaplanmaz.
   * Verilmezse `clientIp` + `userAgent` çiftinden türetilir.
   */
  fingerprintOverride?: string | undefined;
  redirectTo: string;
  rememberMe: boolean;
  userAgent?: string | null;
  userId: string;
};

export type LoginChallengeFailureResult =
  { attemptsLeft: number; status: "retry" } | { status: "exhausted" } | { status: "expired" };

/** SPEC §11 — parmak izi ham değerleri saklamaz, yalnız özet taşır. */
export function createRequestFingerprint(input: {
  clientIp?: string | null;
  userAgent?: string | null;
}): string {
  return createHash("sha256")
    .update(input.clientIp?.trim() ?? "")
    .update("\n")
    .update(input.userAgent?.trim() ?? "")
    .digest("base64url");
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("base64url");
}

function isSafeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function parseRecord<T>(raw: string | null): T | null {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

const fallbackStore = createMemoryChallengeStore();

export function createLoginChallengeStore(overrides: Partial<LoginChallengeDependencies> = {}) {
  const dependencies: LoginChallengeDependencies = {
    getRedisRate,
    isProduction: process.env.NODE_ENV === "production",
    logError,
    nowMs: () => Date.now(),
    randomToken: () => randomBytes(32).toString("base64url"),
    ...overrides,
  };

  function resolveStore(): ChallengeStore {
    if (dependencies.store) {
      return dependencies.store;
    }

    try {
      return createRedisChallengeStore(dependencies.getRedisRate() as unknown as ChallengeRedis);
    } catch (error) {
      /*
       * Fail-closed: üretimde challenge depolanamıyorsa iki adımlı doğrulama sessizce süreç
       * belleğine düşemez — çok düğümlü bir kurulumda kullanıcı kodu doğrulayamaz ve daha
       * kötüsü, ticket'ı üreten düğümle tüketen düğüm farklı olabilir.
       */
      if (dependencies.isProduction) {
        dependencies.logError("[auth] Login challenge store unavailable", error);
        throw new Error("Login challenge store is unavailable.");
      }

      dependencies.logError("[auth] Login challenge falling back to in-memory store", error);
      return fallbackStore;
    }
  }

  async function readChallenge(
    challengeId: string,
    fingerprint: string,
  ): Promise<LoginChallengeRecord | null> {
    const store = resolveStore();
    const key = `${CHALLENGE_KEY_PREFIX}:${hashToken(challengeId)}`;
    const record = parseRecord<LoginChallengeRecord>(await store.read(key));

    if (!record) {
      return null;
    }

    if (record.expiresAtMs <= dependencies.nowMs()) {
      await store.drop(key);
      return null;
    }

    if (!isSafeEqual(record.fingerprint, fingerprint)) {
      // Challenge başka bir tarayıcıda kullanılıyor: kaydı yok et, ikinci deneme de olmasın.
      await store.drop(key);
      return null;
    }

    return record;
  }

  return {
    /** İkinci adım beklerken challenge'ı düşürmeden okur. */
    peek: readChallenge,

    /**
     * Parola doğrulandıktan **sonra**, oturum açılmadan önce çağrılır.
     * Dönen opak kimlik istemciye gider; depoda yalnız özeti durur.
     */
    async issue(input: LoginChallengeIssueInput): Promise<string> {
      const store = resolveStore();
      const challengeId = dependencies.randomToken();
      const nowMs = dependencies.nowMs();
      const record: LoginChallengeRecord = {
        attempts: 0,
        createdAtMs: nowMs,
        email: input.email,
        expiresAtMs: nowMs + LOGIN_CHALLENGE_TTL_MS,
        fingerprint: input.fingerprintOverride ?? createRequestFingerprint(input),
        redirectTo: input.redirectTo,
        rememberMe: input.rememberMe,
        userId: input.userId,
      };

      await store.put(
        `${CHALLENGE_KEY_PREFIX}:${hashToken(challengeId)}`,
        JSON.stringify(record),
        LOGIN_CHALLENGE_TTL_MS,
      );

      return challengeId;
    },

    /**
     * Yanlış kod. Challenge **tüketilmez** ama deneme sayacı artar; üçüncü yanlışta kayıt
     * düşer ve kullanıcı giriş ekranına döner (SPEC §7/3).
     */
    async registerCodeFailure(
      challengeId: string,
      fingerprint: string,
    ): Promise<LoginChallengeFailureResult> {
      const store = resolveStore();
      const key = `${CHALLENGE_KEY_PREFIX}:${hashToken(challengeId)}`;
      const record = await readChallenge(challengeId, fingerprint);

      if (!record) {
        return { status: "expired" };
      }

      const attempts = record.attempts + 1;

      if (attempts >= LOGIN_CHALLENGE_MAX_CODE_ATTEMPTS) {
        await store.drop(key);
        return { status: "exhausted" };
      }

      // Kalan ömür korunur: yanlış kod girmek challenge'ın süresini uzatmaz.
      await store.put(
        key,
        JSON.stringify({ ...record, attempts }),
        Math.max(1, record.expiresAtMs - dependencies.nowMs()),
      );

      return { attemptsLeft: LOGIN_CHALLENGE_MAX_CODE_ATTEMPTS - attempts, status: "retry" };
    },

    /** İkinci adım geçildi; challenge tek kullanımlık olarak tüketilir. */
    async consume(challengeId: string, fingerprint: string): Promise<LoginChallengeRecord | null> {
      const store = resolveStore();
      const key = `${CHALLENGE_KEY_PREFIX}:${hashToken(challengeId)}`;
      const record = parseRecord<LoginChallengeRecord>(await store.take(key));

      if (!record) {
        return null;
      }

      if (record.expiresAtMs <= dependencies.nowMs()) {
        return null;
      }

      if (!isSafeEqual(record.fingerprint, fingerprint)) {
        return null;
      }

      return record;
    },

    /**
     * `signIn` çağrısı için 30 saniyelik bilet. Yalnız challenge tüketildikten sonra üretilir;
     * NextAuth `authorize` bunu görürse parola sormaz.
     */
    async issueTicket(record: LoginChallengeRecord): Promise<string> {
      const store = resolveStore();
      const ticket = dependencies.randomToken();
      const payload: LoginTicketRecord = {
        email: record.email,
        expiresAtMs: dependencies.nowMs() + LOGIN_TICKET_TTL_MS,
        fingerprint: record.fingerprint,
        redirectTo: record.redirectTo,
        rememberMe: record.rememberMe,
        userId: record.userId,
      };

      await store.put(
        `${TICKET_KEY_PREFIX}:${hashToken(ticket)}`,
        JSON.stringify(payload),
        LOGIN_TICKET_TTL_MS,
      );

      return ticket;
    },

    /**
     * `authorize` tarafında tüketilir. E-posta eşleşmesi **zorunlu**: bilet başka bir hesabın
     * oturumunu açamaz.
     */
    async consumeTicket(ticket: string, email: string): Promise<LoginTicketRecord | null> {
      if (!ticket) {
        return null;
      }

      const store = resolveStore();
      const record = parseRecord<LoginTicketRecord>(
        await store.take(`${TICKET_KEY_PREFIX}:${hashToken(ticket)}`),
      );

      if (!record) {
        return null;
      }

      if (record.expiresAtMs <= dependencies.nowMs()) {
        return null;
      }

      if (!isSafeEqual(record.email, email)) {
        return null;
      }

      return record;
    },
  };
}

export const loginChallengeStore = createLoginChallengeStore();
