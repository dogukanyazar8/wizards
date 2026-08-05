export type DemoSeedOptions = {
  password: string;
};

export function readDemoSeedOptions(
  environment: { SEED_DEMO_PASSWORD?: string } = process.env,
): DemoSeedOptions {
  const password = environment.SEED_DEMO_PASSWORD?.trim();

  if (!password) {
    throw new Error("SEED_DEMO_PASSWORD is required for an explicit demo seed run.");
  }
  if (Buffer.byteLength(password, "utf8") > 72) {
    throw new Error("SEED_DEMO_PASSWORD must be 72 UTF-8 bytes or fewer.");
  }

  return { password };
}
