import { rm } from "node:fs/promises";
import { resolve } from "node:path";

export default async function removeDashboardTestEvidence() {
  const repositoryRoot = resolve(import.meta.dirname, "..", "..", "..", "..");
  await rm(resolve(repositoryRoot, "test-results", "quality-dashboard-runtime"), {
    recursive: true,
    force: true,
  });
}
