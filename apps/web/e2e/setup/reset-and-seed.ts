import { assertE2EEnvironmentReady } from "../../src/lib/e2e/environment";

assertE2EEnvironmentReady();

const { resetAndSeedE2EData } = await import("./e2e-database");

void resetAndSeedE2EData()
  .then(() => {
    console.info("E2E database reset and seed completed.");
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown E2E seed failure.";
    console.error(message);
    process.exitCode = 1;
  });
