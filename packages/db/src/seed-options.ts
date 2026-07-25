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

  return { password };
}
