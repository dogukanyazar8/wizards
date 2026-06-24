import { assertE2EEnvironmentReady } from "../../src/lib/e2e/environment";

export default async function globalSetup(): Promise<void> {
  assertE2EEnvironmentReady();

  const { resetAndSeedE2EData } = await import("./e2e-database");
  await resetAndSeedE2EData();
}
