import { createHash } from "node:crypto";

import {
  createAttemptTracker,
  createMemoryAttemptStore,
  createRedisAttemptStore,
  type AttemptStore,
} from "@/lib/auth/attempt-tracker";
import { logError } from "@/lib/logger";
import { getRedisRate } from "@/lib/redis";

/**
 * Giriş kilidi — SPEC-GIRIS-KAYIT §10 ve §7/2.
 *
 * "Deneme sayacı: 5 başarısız girişte hesap 15 dakika kilitlenir." Ekran iki sayıyı da
 * göstermek zorunda: kalan deneme (`3 deneme kaldı`, seviye 1) ve kalan süre
 * (`Kalan süre 14:32`, seviye 3 blok). Bu modül ikisini de üretir.
 *
 * Mevcut `checkLoginRequestRateLimit` **kaldırılmaz**: o ağ/istek hızını sınırlar (kaba kuvvetin
 * hızını keser), bu ise hesabı kilitler (kaba kuvvetin toplam denemesini keser). İkisi ayrı iş.
 *
 * Sayaç hem hesap hem ağ kimliği için tutulur. Kilit **yalnız hesap sayacından** doğar; ağ
 * sayacı aynı IP'nin farklı hesapları taramasını görünür kılar ve `peek` en kısıtlayıcı olanı
 * döndürür. E-posta düz metin saklanmaz, SHA-256 özeti anahtar olur.
 */

/** SPEC §10 — beşinci başarısız denemede kilit. */
export const LOGIN_MAX_ATTEMPTS = 5;

/** SPEC §10 ve §7/2 — kilit süresi. */
export const LOGIN_LOCK_DURATION_MS = 15 * 60_000;

/**
 * Sayaç penceresi kilit süresiyle aynı: kilit bittiğinde sayaç da düşer, yoksa kullanıcı
 * kilitten çıkar çıkmaz tek hatada yeniden kilitlenirdi.
 */
const LOGIN_ATTEMPT_WINDOW_SECONDS = LOGIN_LOCK_DURATION_MS / 1_000;

/**
 * Aynı IP'nin farklı hesaplara dağıttığı denemeler. Hesap sayacından yüksek tutulur ki paylaşımlı
 * çıkış kullanan (ofis, okul, operatör NAT) gerçek kullanıcılar birbirini kilitlemesin.
 */
const NETWORK_MAX_ATTEMPTS = 25;

export type LoginAttemptState =
  { attemptsLeft: number; status: "ok" } | { retryAfterMs: number; status: "locked" };

export type LoginLockoutIdentity = {
  /** Ham istemci IP'si; yoksa ağ sayacı çalışmaz, hesap sayacı çalışmaya devam eder. */
  clientIp?: string | null;
  email: string;
};

export type LoginLockoutDependencies = {
  getRedisRate: typeof getRedisRate;
  logError: typeof logError;
  nowMs: () => number;
  store?: AttemptStore;
};

const accountTracker = createAttemptTracker({
  freeFailures: LOGIN_MAX_ATTEMPTS - 1,
  initialBackoffMs: LOGIN_LOCK_DURATION_MS,
  keyPrefix: "auth:login-lock:account",
  maxBackoffMs: LOGIN_LOCK_DURATION_MS,
  windowSeconds: LOGIN_ATTEMPT_WINDOW_SECONDS,
});

const networkTracker = createAttemptTracker({
  freeFailures: NETWORK_MAX_ATTEMPTS - 1,
  initialBackoffMs: LOGIN_LOCK_DURATION_MS,
  keyPrefix: "auth:login-lock:network",
  maxBackoffMs: LOGIN_LOCK_DURATION_MS,
  windowSeconds: LOGIN_ATTEMPT_WINDOW_SECONDS,
});

function hashIdentifier(value: string) {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("base64url");
}

function toAttemptsLeft(failures: number, maxAttempts: number) {
  return Math.max(0, maxAttempts - failures);
}

function pickMostRestrictive(states: LoginAttemptState[]): LoginAttemptState {
  const locked = states.filter(
    (state): state is Extract<LoginAttemptState, { status: "locked" }> => state.status === "locked",
  );

  if (locked.length > 0) {
    return locked.reduce((worst, state) =>
      state.retryAfterMs > worst.retryAfterMs ? state : worst,
    );
  }

  return states.reduce((worst, state) =>
    state.status === "ok" && worst.status === "ok" && state.attemptsLeft < worst.attemptsLeft
      ? state
      : worst,
  );
}

/**
 * Redis yoksa süreç içi sayaç. **Üretimde tek düğüm varsayımı yanlıştır** — bellek sayacı yalnız
 * geliştirme ve test içindir; Redis düşerse `logError` ile görünür olur.
 */
function resolveStore(dependencies: LoginLockoutDependencies): AttemptStore {
  if (dependencies.store) {
    return dependencies.store;
  }

  try {
    return createRedisAttemptStore(dependencies.getRedisRate());
  } catch (error) {
    dependencies.logError("[auth] Login lockout falling back to in-memory store", error);
    return fallbackStore;
  }
}

const fallbackStore = createMemoryAttemptStore();

export function createLoginLockout(overrides: Partial<LoginLockoutDependencies> = {}) {
  const dependencies: LoginLockoutDependencies = {
    getRedisRate,
    logError,
    nowMs: () => Date.now(),
    ...overrides,
  };

  async function readOne(
    tracker: typeof accountTracker,
    identifier: string,
    maxAttempts: number,
  ): Promise<LoginAttemptState> {
    const store = resolveStore(dependencies);
    const nowMs = dependencies.nowMs();
    const state = await tracker.readState({ identifier, store });

    if (state.lockedUntilMs && state.lockedUntilMs > nowMs) {
      return { retryAfterMs: state.lockedUntilMs - nowMs, status: "locked" };
    }

    if (state.lockedUntilMs) {
      /*
       * Kilit süresi doldu. Sayaç sıfırlanmazsa kullanıcı kilitten çıkar çıkmaz "0 deneme kaldı"
       * görür ve tek hatada yeniden kilitlenir — cezayı iki kez ödemiş olur. Redis anahtarı zaten
       * pencere sonunda düşüyor; burada açıkça silmek bellek deposunda da aynı davranışı verir.
       */
      await tracker.resetFailures({ identifier, store });

      return { attemptsLeft: maxAttempts, status: "ok" };
    }

    return { attemptsLeft: toAttemptsLeft(state.failures, maxAttempts), status: "ok" };
  }

  return {
    /** Kimlik doğrulamadan **önce** çağrılır; kilitliyse parola hiç karşılaştırılmaz. */
    async peek(identity: LoginLockoutIdentity): Promise<LoginAttemptState> {
      const states = [
        await readOne(accountTracker, hashIdentifier(identity.email), LOGIN_MAX_ATTEMPTS),
      ];

      if (identity.clientIp) {
        states.push(
          await readOne(networkTracker, hashIdentifier(identity.clientIp), NETWORK_MAX_ATTEMPTS),
        );
      }

      return pickMostRestrictive(states);
    },

    /** Parola ya da ikinci adım başarısız olduğunda çağrılır. */
    async registerFailure(identity: LoginLockoutIdentity): Promise<LoginAttemptState> {
      const store = resolveStore(dependencies);
      const nowMs = dependencies.nowMs();

      const account = await accountTracker.recordFailure({
        identifier: hashIdentifier(identity.email),
        nowMs,
        store,
      });

      if (identity.clientIp) {
        await networkTracker.recordFailure({
          identifier: hashIdentifier(identity.clientIp),
          nowMs,
          store,
        });
      }

      if (account.locked) {
        return { retryAfterMs: account.retryAfterSeconds * 1_000, status: "locked" };
      }

      return { attemptsLeft: toAttemptsLeft(account.failures, LOGIN_MAX_ATTEMPTS), status: "ok" };
    },

    /**
     * Oturum **tam olarak** açıldığında çağrılır — iki adımlı doğrulama açıksa parola doğru
     * olduğu anda değil, ikinci adım da geçildikten sonra. Aksi hâlde parolayı bilen biri
     * sayacı sonsuza kadar sıfırlayıp ikinci adımı sınırsız deneyebilirdi.
     */
    async reset(identity: LoginLockoutIdentity): Promise<void> {
      const store = resolveStore(dependencies);

      await accountTracker.resetFailures({ identifier: hashIdentifier(identity.email), store });

      if (identity.clientIp) {
        await networkTracker.resetFailures({
          identifier: hashIdentifier(identity.clientIp),
          store,
        });
      }
    },
  };
}
