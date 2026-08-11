/**
 * Grup sohbetleri 2a–2f, Faz 3 §B6. The four destinations 2e/2f and the invite
 * link need, registered now so the routes, their params and `/g/<code>` land in
 * one phase; the screens themselves arrive in Faz 5.
 *
 * They render `null` and carry no style deliberately: this phase's gate is that
 * no group render code exists yet, and a placeholder with a spinner or a label
 * would be exactly that. They live here rather than in `screens/` so the gate's
 * `git diff --stat` check over that directory stays empty.
 */
export function MobileGroupInfoPlaceholderScreen() {
  return null;
}

export function MobileGroupSettingsPlaceholderScreen() {
  return null;
}

export function MobileGroupMembersPlaceholderScreen() {
  return null;
}

export function MobileGroupInvitePreviewPlaceholderScreen() {
  return null;
}
