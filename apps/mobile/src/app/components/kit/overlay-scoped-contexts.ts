import type { Context } from "react";

/**
 * A context whose provider sits *below* MobileOverlayHost in the tree. Overlay
 * children render in the host, not at the call site, so React resolves these
 * contexts at the host — they are invisible to an overlay unless the surface
 * bridges them explicitly.
 */
export interface MobileOverlayScopedContext {
  readonly context: Context<unknown>;
  readonly name: string;
}

const scopedContexts = new Map<Context<unknown>, MobileOverlayScopedContext>();

/**
 * Declared by providers that mount below the host. The bridge asserts in
 * development that every declaration is covered, so a new screen-level provider
 * fails loudly instead of handing overlay children a silent default value.
 */
export function registerMobileOverlayScopedContext(entry: MobileOverlayScopedContext): void {
  scopedContexts.set(entry.context, entry);
}

export function listMobileOverlayScopedContexts(): readonly MobileOverlayScopedContext[] {
  return [...scopedContexts.values()];
}

/** Test seam: drops declarations registered by a suite's fixtures. */
export function forgetMobileOverlayScopedContext(context: Context<unknown>): void {
  scopedContexts.delete(context);
}
