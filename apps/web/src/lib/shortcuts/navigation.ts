export type ShortcutNavigationTarget = {
  readonly href: string;
  readonly id: string;
  readonly unread: boolean;
};

export function getRelativeShortcutTarget(
  targets: readonly ShortcutNavigationTarget[],
  activeId: string | null,
  direction: -1 | 1,
  options: { readonly unreadOnly?: boolean } = {},
): ShortcutNavigationTarget | null {
  const activeIndex = targets.findIndex((target) => target.id === activeId);
  if (activeIndex < 0) {
    const orderedTargets = direction > 0 ? targets : [...targets].reverse();
    return orderedTargets.find((target) => !options.unreadOnly || target.unread) ?? null;
  }

  for (let offset = 1; offset <= targets.length; offset += 1) {
    const index = (activeIndex + direction * offset + targets.length) % targets.length;
    const candidate = targets[index];
    if (candidate && candidate.id !== activeId && (!options.unreadOnly || candidate.unread)) {
      return candidate;
    }
  }

  return null;
}
