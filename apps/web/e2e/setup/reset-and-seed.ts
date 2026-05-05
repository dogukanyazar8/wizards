import { resetAndSeedE2EData } from "./e2e-database";

resetAndSeedE2EData()
  .then(() => {
    console.info("E2E database reset and seed completed.");
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown E2E seed failure.";
    console.error(message);
    process.exitCode = 1;
  });
