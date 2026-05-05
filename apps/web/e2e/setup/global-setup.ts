import { resetAndSeedE2EData } from "./e2e-database";

export default async function globalSetup(): Promise<void> {
  await resetAndSeedE2EData();
}
