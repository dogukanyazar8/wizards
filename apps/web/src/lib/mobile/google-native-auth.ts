import { randomBytes } from "node:crypto";

import { Prisma, prisma } from "@wizards/db";
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";

import { DEFAULT_WIZARDS_THEME } from "@/lib/appearance";
import { buildUsernameCandidate, normalizeUsername } from "@/lib/auth/username";
import { normalizeAppLocale } from "@/lib/locale";

const GOOGLE_JWKS_URL = new URL("https://www.googleapis.com/oauth2/v3/certs");
const GOOGLE_ISSUERS = ["accounts.google.com", "https://accounts.google.com"] as const;
const GOOGLE_CLOCK_TOLERANCE_SECONDS = 5;
const USERNAME_RETRY_BATCHES = 3;
const USERNAME_CANDIDATES_PER_BATCH = 16;

export interface MobileGoogleIdentity {
  readonly avatarUrl: string | null;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly name: string | null;
  readonly subject: string;
}

export interface MobileGoogleLinkedUser {
  readonly avatarUrl: string | null;
  readonly deletedAt: Date | null;
  readonly displayName: string | null;
  readonly emailVerified: boolean;
  readonly id: string;
  readonly isBanned: boolean;
  readonly username: string;
}

export class MobileGoogleAuthError extends Error {
  constructor(
    public readonly code:
      "GOOGLE_EMAIL_UNVERIFIED" | "GOOGLE_NOT_CONFIGURED" | "GOOGLE_TOKEN_INVALID",
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "MobileGoogleAuthError";
  }
}

let cachedGoogleJwks: JWTVerifyGetKey | null = null;

function getGoogleJwks() {
  cachedGoogleJwks ??= createRemoteJWKSet(GOOGLE_JWKS_URL);
  return cachedGoogleJwks;
}

/**
 * Audiences the API accepts on a native ID token. The mobile client signs in
 * with the *web* client id as `serverClientId`, which is what Google stamps into
 * `aud`; the extra variable exists for builds that use a separate client id.
 */
export function getMobileGoogleAudiences(env: NodeJS.ProcessEnv = process.env): string[] {
  const candidates = [
    env.GOOGLE_MOBILE_CLIENT_ID,
    env.GOOGLE_CLIENT_ID,
    env.AUTH_GOOGLE_ID,
    env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  ];

  return [
    ...new Set(
      candidates
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter((value) => value.length > 0),
    ),
  ];
}

/** Pure claim reader so the shape checks stay testable without a live JWKS. */
export function readMobileGoogleIdentityClaims(payload: JWTPayload): MobileGoogleIdentity {
  const subject = typeof payload.sub === "string" ? payload.sub.trim() : "";
  const rawEmail = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const emailVerified = payload.email_verified === true || payload.email_verified === "true";
  const name = typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : null;
  const picture = typeof payload.picture === "string" ? payload.picture.trim() : "";

  if (!subject || !rawEmail) {
    throw new MobileGoogleAuthError(
      "GOOGLE_TOKEN_INVALID",
      401,
      "The Google identity token is missing required claims.",
    );
  }

  if (!emailVerified) {
    throw new MobileGoogleAuthError(
      "GOOGLE_EMAIL_UNVERIFIED",
      401,
      "The Google account email is not verified.",
    );
  }

  return {
    avatarUrl: picture.startsWith("https://") ? picture : null,
    email: rawEmail,
    emailVerified,
    name,
    subject,
  };
}

export async function verifyMobileGoogleIdToken(
  idToken: string,
  options: {
    audiences?: readonly string[];
    jwks?: JWTVerifyGetKey;
  } = {},
): Promise<MobileGoogleIdentity> {
  const audiences = options.audiences ?? getMobileGoogleAudiences();

  if (audiences.length === 0) {
    throw new MobileGoogleAuthError(
      "GOOGLE_NOT_CONFIGURED",
      503,
      "Google sign-in is not configured on this deployment.",
    );
  }

  let payload: JWTPayload;

  try {
    ({ payload } = await jwtVerify(idToken, options.jwks ?? getGoogleJwks(), {
      audience: [...audiences],
      clockTolerance: GOOGLE_CLOCK_TOLERANCE_SECONDS,
      issuer: [...GOOGLE_ISSUERS],
    }));
  } catch {
    throw new MobileGoogleAuthError(
      "GOOGLE_TOKEN_INVALID",
      401,
      "The Google identity token could not be verified.",
    );
  }

  return readMobileGoogleIdentityClaims(payload);
}

const LINKED_USER_SELECT = {
  avatarUrl: true,
  deletedAt: true,
  displayName: true,
  emailVerified: true,
  id: true,
  isBanned: true,
  username: true,
} as const;

async function findUniqueUsername(seed: string): Promise<string> {
  const safeSeed = normalizeUsername(seed);
  const firstCandidate = buildUsernameCandidate(safeSeed);
  const takenFirstCandidate = await prisma.user.findUnique({
    select: { id: true },
    where: { username: firstCandidate },
  });

  if (!takenFirstCandidate) {
    return firstCandidate;
  }

  for (let batch = 0; batch < USERNAME_RETRY_BATCHES; batch += 1) {
    const candidates = [
      ...new Set(
        Array.from({ length: USERNAME_CANDIDATES_PER_BATCH }, () =>
          buildUsernameCandidate(safeSeed, `_${randomBytes(4).toString("hex").slice(0, 6)}`),
        ),
      ),
    ];
    const takenUsers = await prisma.user.findMany({
      select: { username: true },
      where: { username: { in: candidates } },
    });
    const taken = new Set(takenUsers.map((user) => user.username));
    const available = candidates.find((candidate) => !taken.has(candidate));

    if (available) {
      return available;
    }
  }

  return buildUsernameCandidate(
    "whispr",
    `_${Date.now().toString(36)}${randomBytes(4).toString("hex").slice(0, 6)}`,
  );
}

/**
 * Mirrors what the NextAuth Prisma adapter does for the web Google provider:
 * match the linked account first, then fall back to the verified email (Google
 * asserts `email_verified`, which is checked before this runs), and only create
 * a fresh user when neither exists.
 */
export async function linkMobileGoogleAccount(input: {
  identity: MobileGoogleIdentity;
  locale?: "en" | "tr" | undefined;
}): Promise<MobileGoogleLinkedUser> {
  const { identity } = input;
  const linkedAccount = await prisma.account.findUnique({
    select: { user: { select: LINKED_USER_SELECT } },
    where: {
      provider_providerAccountId: {
        provider: "google",
        providerAccountId: identity.subject,
      },
    },
  });

  if (linkedAccount) {
    return linkedAccount.user;
  }

  const existingUser = await prisma.user.findUnique({
    select: { ...LINKED_USER_SELECT, emailVerifiedAt: true },
    where: { email: identity.email },
  });

  if (existingUser) {
    const [, updatedUser] = await prisma.$transaction([
      prisma.account.create({
        data: {
          provider: "google",
          providerAccountId: identity.subject,
          type: "oauth",
          userId: existingUser.id,
        },
      }),
      prisma.user.update({
        data: existingUser.emailVerified
          ? {}
          : { emailVerified: true, emailVerifiedAt: existingUser.emailVerifiedAt ?? new Date() },
        select: LINKED_USER_SELECT,
        where: { id: existingUser.id },
      }),
    ]);

    return updatedUser;
  }

  const locale = normalizeAppLocale(input.locale);
  const username = await findUniqueUsername(
    identity.name ?? identity.email.split("@")[0] ?? "whispr",
  );
  const displayName = identity.name ?? username;

  try {
    return await prisma.user.create({
      data: {
        accounts: {
          create: {
            provider: "google",
            providerAccountId: identity.subject,
            type: "oauth",
          },
        },
        avatarUrl: identity.avatarUrl,
        displayName,
        email: identity.email,
        emailVerified: true,
        emailVerifiedAt: new Date(),
        locale,
        notificationSettings: { create: {} },
        settings: { create: {} },
        status: "ONLINE",
        theme: DEFAULT_WIZARDS_THEME,
        username,
      },
      select: LINKED_USER_SELECT,
    });
  } catch (error) {
    // Two devices can race the very first sign-in of the same Google account;
    // the unique constraint decides the winner and the loser reads the row.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const racedAccount = await prisma.account.findUnique({
        select: { user: { select: LINKED_USER_SELECT } },
        where: {
          provider_providerAccountId: {
            provider: "google",
            providerAccountId: identity.subject,
          },
        },
      });

      if (racedAccount) {
        return racedAccount.user;
      }
    }

    throw error;
  }
}
