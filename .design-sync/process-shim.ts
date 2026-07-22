// Browser shim: the web app's modules read process.env at import time (Next.js
// inlines these at build time; the design-system bundle has no such step).
const g = globalThis as unknown as { process?: { env: Record<string, string | undefined> } };
g.process ??= { env: {} };
g.process.env ??= {};
g.process.env.NODE_ENV ??= "production";
