import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const prisma = resolve(packageRoot, "node_modules", "prisma", "build", "index.js");

const result = spawnSync(process.execPath, [prisma, "generate"], {
  cwd: packageRoot,
  env: {
    ...process.env,
    // Generation validates config but does not connect. Keep CI/tooling independent from a live database.
    DATABASE_URL:
      process.env.DATABASE_URL ?? "postgresql://prisma:prisma@127.0.0.1:5432/prisma_generate",
  },
  stdio: "inherit",
});

if (result.error) {
  throw result.error;
}
if (result.status !== 0) {
  process.exitCode = result.status ?? 1;
}
