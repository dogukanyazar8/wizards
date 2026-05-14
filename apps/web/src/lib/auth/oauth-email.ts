export type OAuthEmailAccount = {
  access_token?: string | null;
  accessToken?: string | null;
  provider?: string | null;
};

type OAuthEmailUser = {
  email?: unknown;
  id?: unknown;
};

type GitHubEmailRow = {
  email?: unknown;
  primary?: unknown;
  verified?: unknown;
};

export type GitHubEmailFetch = (accessToken: string) => Promise<string | null>;

export function normalizeOAuthEmail(rawValue: unknown): string {
  return typeof rawValue === "string" ? rawValue.trim().toLowerCase() : "";
}

export function isGoogleEmailVerified(profile: unknown): boolean {
  return (
    typeof profile === "object" &&
    profile !== null &&
    "email_verified" in profile &&
    (profile as { email_verified?: unknown }).email_verified === true
  );
}

export function hasExplicitlyUnverifiedOAuthEmail(profile: unknown): boolean {
  return (
    typeof profile === "object" &&
    profile !== null &&
    "email_verified" in profile &&
    (profile as { email_verified?: unknown }).email_verified === false
  );
}

export function getOAuthProfileEmail(profile: unknown): string {
  if (
    typeof profile !== "object" ||
    profile === null ||
    !("email" in profile) ||
    typeof (profile as { email?: unknown }).email !== "string"
  ) {
    return "";
  }

  return normalizeOAuthEmail((profile as { email: string }).email);
}

function getOAuthAccessToken(account: OAuthEmailAccount | null | undefined) {
  return (
    (typeof account?.access_token === "string" && account.access_token) ||
    (typeof account?.accessToken === "string" && account.accessToken) ||
    ""
  );
}

export function findVerifiedPrimaryGitHubEmail(rows: unknown): string | null {
  if (!Array.isArray(rows)) {
    return null;
  }

  const primary = rows.find((row): row is GitHubEmailRow => {
    if (typeof row !== "object" || row === null) {
      return false;
    }

    const candidate = row as GitHubEmailRow;
    return candidate.primary === true && candidate.verified === true;
  });

  return normalizeOAuthEmail(primary?.email) || null;
}

export async function fetchVerifiedPrimaryGitHubEmail(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
) {
  const response = await fetchImpl("https://api.github.com/user/emails", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "WhisprAuth/1.0",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    return null;
  }

  return findVerifiedPrimaryGitHubEmail(await response.json());
}

export async function isGitHubOAuthEmailVerified(args: {
  account?: OAuthEmailAccount | null | undefined;
  fetchGitHubEmail?: GitHubEmailFetch | undefined;
  profile: unknown;
  user: OAuthEmailUser;
}) {
  const profileEmail = getOAuthProfileEmail(args.profile);
  const userEmail = normalizeOAuthEmail(args.user.email);
  const claimedEmail = profileEmail || userEmail;
  const accessToken = getOAuthAccessToken(args.account);

  if (!claimedEmail || !accessToken) {
    return false;
  }

  const verifiedPrimaryEmail = await (args.fetchGitHubEmail ?? fetchVerifiedPrimaryGitHubEmail)(
    accessToken,
  );

  return verifiedPrimaryEmail === claimedEmail;
}

export async function canOAuthUserSignIn(args: {
  account?: OAuthEmailAccount | null | undefined;
  fetchGitHubEmail?: GitHubEmailFetch | undefined;
  profile: unknown;
  user: OAuthEmailUser;
}) {
  if (args.account?.provider === "google" && !isGoogleEmailVerified(args.profile)) {
    return false;
  }

  if (args.account?.provider === "github") {
    return isGitHubOAuthEmailVerified(args);
  }

  if (hasExplicitlyUnverifiedOAuthEmail(args.profile)) {
    return false;
  }

  return true;
}
