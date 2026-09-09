import { deriveServerShortName, type ServerIconTone } from "@wizards/types";

import { resolveServerIconTone } from "@/lib/servers/server-icon-tone";

export function isServerAbbreviation(value: string): boolean {
  return /^[\p{L}\p{N}][\p{L}\p{N}_-]{2}$/u.test(value.trim());
}

/** Eski/boş kayıtlar için görsel olarak daima üç karakter üretir. */
export function deriveServerAbbreviation(name: string): string {
  return deriveServerShortName(name);
}

export function resolveServerAbbreviation(name: string, shortName: string | null): string {
  return isServerAbbreviation(shortName ?? "")
    ? shortName!.trim().toLocaleUpperCase("tr-TR")
    : deriveServerAbbreviation(name);
}

export type ServerIconPresentation =
  | { readonly imageUrl: string; readonly kind: "image" }
  | { readonly kind: "fallback"; readonly label: string; readonly tone: ServerIconTone };

export function resolveServerIconPresentation(input: {
  readonly iconColor: ServerIconTone | null | undefined;
  readonly iconUrl: string | null | undefined;
  readonly name: string;
  readonly shortName: string | null;
}): ServerIconPresentation {
  if (input.iconUrl) {
    return { imageUrl: input.iconUrl, kind: "image" };
  }

  const label = resolveServerAbbreviation(input.name, input.shortName);
  return {
    kind: "fallback",
    label,
    tone: resolveServerIconTone(input.iconColor, label),
  };
}
