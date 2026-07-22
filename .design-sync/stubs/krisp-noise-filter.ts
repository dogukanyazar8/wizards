// Preview stub for @livekit/krisp-noise-filter — the real package ships ~6 MB of
// WASM-as-JS that would blow the design-system bundle's 12 MB upload limit.
// Only referenced behind a lazy import() for live audio, which previews never run.
export type KrispNoiseFilterProcessor = unknown;
export function KrispNoiseFilter(..._args: unknown[]): never {
  throw new Error("krisp noise filter is stubbed in design-system previews");
}
export function isKrispNoiseFilterSupported(): boolean {
  return false;
}
