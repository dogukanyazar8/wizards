/**
 * External About destinations live outside translated copy. Social profiles
 * stay null until product supplies canonical URLs; the chips still render but
 * never guess a public account.
 */
export const mobileAboutLinks = Object.freeze({
  email: "mailto:support@whispr.team",
  instagram: null,
  x: null,
} as const);
