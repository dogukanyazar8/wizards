/**
 * Bahsedilmeler Ş2 — bahsetme token'larının ayrıştırıcısı.
 *
 * `extractMentionUsernames` buraya **taşındı**, değiştirilmedi. Kullanıcı adı deseni ASCII'dir
 * ve `message-notification-service` yıllardır onunla çalışıyor; rol adları Türkçe harf taşır ve
 * aynı regex'i genişletmek kullanıcı adı eşleşmelerini bozardı (00-ortak-baglam tuzak #3). İki
 * desen ayrı durur, aynı token iki listede birden görünebilir ve hangisi olduğuna **veri** karar
 * verir (bkz. `role-mention-service`).
 */

const RESERVED_MENTION_NAMES = new Set(["everyone", "here"]);

/** Değiştirilmedi: `message-notification-service` içindeki özgün desenin birebir kopyası. */
const USERNAME_MENTION_PATTERN = /(^|[\s([{])@([a-zA-Z0-9_.-]{2,32})/g;

/**
 * Rol adı deseni. Sınır karakteri kullanıcı adı deseniyle aynı — `ada@tasarım.com` bir bahsetme
 * değildir. Gövde `\p{L}\p{N}_-`: boşluk yok, çünkü boşluklu rol adı `@iki kelime` ile
 * `@iki` + `kelime` arasında ayrım bırakmaz.
 */
const ROLE_MENTION_PATTERN = /(^|[\s([{])@([\p{L}\p{N}_-]{1,32})(?=$|[^\p{L}\p{N}_-])/gu;

export type MentionTokens = {
  /** `@everyone` / `@here` geçti mi — izin ve `Message.mentionEveryone` bu bayrağa bakar. */
  mass: boolean;
  /** Rol olabilecek ham token'lar, ilk yazımlarıyla. */
  roleNames: string[];
  /** Kullanıcı adı olabilecek token'lar, küçük harfe indirgenmiş. */
  usernames: string[];
};

export function extractMentionUsernames(content: string) {
  const mentions = new Set<string>();
  const mentionPattern = new RegExp(USERNAME_MENTION_PATTERN.source, "g");
  let match: RegExpExecArray | null;

  while ((match = mentionPattern.exec(content)) !== null) {
    const username = (match[2] ?? "").toLocaleLowerCase("en-US");
    if (!RESERVED_MENTION_NAMES.has(username)) {
      mentions.add(username);
    }
  }

  return Array.from(mentions);
}

/**
 * Bir rol adının karşılaştırma anahtarları.
 *
 * Tek bir küçültme kuralı yetmiyor: `"IŞIK".toLowerCase()` → `işik`, ama kullanıcı `@ışık`
 * yazar; `"Info".toLocaleLowerCase("tr")` → `ınfo`, ama kullanıcı `@info` yazar. İki anahtar da
 * üretilir ve arama ikisini birden dener; yanlış eşleşme riski yok, çünkü anahtarlar yalnız aynı
 * sunucunun rol adları arasında aranıyor.
 */
export function normalizeRoleMentionName(value: string): string[] {
  const turkish = value.toLocaleLowerCase("tr");
  const invariant = value.toLocaleLowerCase("en-US");

  return turkish === invariant ? [turkish] : [turkish, invariant];
}

export function parseMentionTokens(content: string): MentionTokens {
  const usernames = extractMentionUsernames(content);
  const roleNames: string[] = [];
  const seenRoleKeys = new Set<string>();
  const rolePattern = new RegExp(ROLE_MENTION_PATTERN.source, "gu");
  let match: RegExpExecArray | null;
  let mass = false;

  while ((match = rolePattern.exec(content)) !== null) {
    const token = match[2] ?? "";
    if (RESERVED_MENTION_NAMES.has(token.toLocaleLowerCase("en-US"))) {
      mass = true;
      continue;
    }

    const keys = normalizeRoleMentionName(token);
    if (keys.some((key) => seenRoleKeys.has(key))) {
      continue;
    }

    for (const key of keys) {
      seenRoleKeys.add(key);
    }
    roleNames.push(token);
  }

  return { mass, roleNames, usernames };
}

/**
 * Gönderim yolunun tek sorusu: bu mesaj için rol fan-out işi kuyruklamaya değer mi? Cevap
 * saf regex — sorgu yok, çünkü bu kontrol mesaj yazan her isteğin üzerinde duruyor.
 */
export function containsRoleMentionCandidate(content: string): boolean {
  return parseMentionTokens(content).roleNames.length > 0;
}

export function matchRoleNameCandidate<T extends { name: string }>(
  roles: readonly T[],
  candidate: string,
): T | null {
  const candidateKeys = new Set(normalizeRoleMentionName(candidate));

  for (const role of roles) {
    if (normalizeRoleMentionName(role.name).some((key) => candidateKeys.has(key))) {
      return role;
    }
  }

  return null;
}

/**
 * Bestekar rol önerisi. Sorgu iki küçültme kuralıyla da denenir; tek kuralla `@ışık` yazan
 * kişi `IŞIK` rolünü hiç göremezdi (bkz. `normalizeRoleMentionName`).
 */
export function filterRolesByMentionQuery<T extends { name: string }>(
  roles: readonly T[],
  query: string,
  limit = 4,
): T[] {
  const queries = normalizeRoleMentionName(query);

  return roles
    .filter((role) => {
      const keys = normalizeRoleMentionName(role.name);
      return queries.some((candidate) => keys.some((key) => key.includes(candidate)));
    })
    .slice(0, limit);
}
