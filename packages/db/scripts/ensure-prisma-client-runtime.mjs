import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

const DIRECT_DATABASE_PROTOCOLS = [
  "postgres://",
  "postgresql://",
  "mysql://",
  "sqlserver://",
  "file:",
  "sqlite:",
  "mongodb://",
  "mongodb+srv://",
  "cockroachdb://",
];

function isDirectDatabaseUrl(value) {
  return DIRECT_DATABASE_PROTOCOLS.some((protocol) => value.startsWith(protocol));
}

function isPrismaProxyUrl(value) {
  return value.startsWith("prisma://") || value.startsWith("prisma+postgres://");
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const fileContents = fs.readFileSync(filePath, "utf8");

  for (const rawLine of fileContents.split(/\r?\n/u)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();

    if (!key || process.env[key] !== undefined) {
      continue;
    }

    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function loadWorkspaceEnv() {
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDirectory, "../../..");

  const candidateEnvFiles = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(repoRoot, ".env"),
    path.resolve(repoRoot, "apps/web/.env"),
    path.resolve(repoRoot, "packages/db/.env"),
  ];

  for (const filePath of candidateEnvFiles) {
    loadEnvFile(filePath);
  }
}

function findGeneratedClientIndexPath() {
  const prismaClientPackageJsonPath = require.resolve("@prisma/client/package.json");
  const prismaClientDirectory = path.dirname(prismaClientPackageJsonPath);
  return path.resolve(prismaClientDirectory, "../../.prisma/client/index.js");
}

function hasNativeEngineArtifact(generatedClientDirectory) {
  if (!fs.existsSync(generatedClientDirectory)) {
    return false;
  }

  return fs.readdirSync(generatedClientDirectory).some((fileName) => {
    return (
      /^query_engine-.*\.(dll\.node|so\.node|dylib\.node)$/i.test(fileName) ||
      /^libquery_engine-.*\.(so\.node|dylib\.node)$/i.test(fileName)
    );
  });
}

function ensurePrismaClientRuntime() {
  loadWorkspaceEnv();

  const databaseUrl = process.env.DATABASE_URL ?? "";

  if (!databaseUrl || isPrismaProxyUrl(databaseUrl) || !isDirectDatabaseUrl(databaseUrl)) {
    return;
  }

  const generatedClientIndexPath = findGeneratedClientIndexPath();

  if (!fs.existsSync(generatedClientIndexPath)) {
    return;
  }

  const generatedClientSource = fs.readFileSync(generatedClientIndexPath, "utf8");
  const hasNoEngineRuntime = generatedClientSource.includes('"copyEngine": false');

  if (!hasNoEngineRuntime) {
    return;
  }

  const generatedClientDirectory = path.dirname(generatedClientIndexPath);

  if (!hasNativeEngineArtifact(generatedClientDirectory)) {
    console.error(
      [
        "[wizards/db] Prisma Client was generated in no-engine mode, but DATABASE_URL is a direct database URL.",
        "[wizards/db] Run `pnpm --dir packages/db exec prisma generate` after stopping the dev server, then start the app again.",
      ].join("\n"),
    );
    process.exit(1);
  }

  const repairedSource = generatedClientSource.replace(
    '"copyEngine": false',
    '"copyEngine": true',
  );

  if (repairedSource !== generatedClientSource) {
    fs.writeFileSync(generatedClientIndexPath, repairedSource, "utf8");
    console.warn(
      "[wizards/db] Repaired generated Prisma Client runtime mode for direct database access.",
    );
  }
}

ensurePrismaClientRuntime();
