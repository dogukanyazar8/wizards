/** A master gain multiplies existing per-source volume; it never unmutes a source. */
export function masterOutputGain(percent: number): number {
  return Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) / 100 : 1;
}
