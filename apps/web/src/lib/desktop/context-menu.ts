export const DESKTOP_NATIVE_CONTEXT_MENU_ATTRIBUTE = "data-whispr-native-context-menu";

type ClosestCapableTarget = {
  closest: (selector: string) => unknown;
  parentElement?: unknown;
};

function hasClosest(value: unknown): value is ClosestCapableTarget {
  return Boolean(value && typeof (value as ClosestCapableTarget).closest === "function");
}

function getClosestCapableTarget(target: EventTarget | null): ClosestCapableTarget | null {
  if (hasClosest(target)) {
    return target;
  }

  const parentElement = (target as { parentElement?: unknown } | null)?.parentElement;

  return hasClosest(parentElement) ? parentElement : null;
}

export function shouldAllowDesktopNativeContextMenu(target: EventTarget | null) {
  const closestTarget = getClosestCapableTarget(target);

  return Boolean(
    closestTarget?.closest(
      `[${DESKTOP_NATIVE_CONTEXT_MENU_ATTRIBUTE}], [${DESKTOP_NATIVE_CONTEXT_MENU_ATTRIBUTE}="true"], [${DESKTOP_NATIVE_CONTEXT_MENU_ATTRIBUTE}="allow"]`,
    ),
  );
}
