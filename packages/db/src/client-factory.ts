import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";
import { readPrismaPoolOptions } from "./pool-options";

export type PrismaClientFactoryOptions = {
  connectionString?: string;
  environment?: NodeJS.ProcessEnv;
};

export function createPrismaClient({
  connectionString,
  environment = process.env,
}: PrismaClientFactoryOptions = {}) {
  const poolEnvironment = connectionString
    ? { ...environment, DATABASE_URL: connectionString }
    : environment;
  const poolOptions = readPrismaPoolOptions(poolEnvironment);
  const adapter = new PrismaPg(poolOptions);
  const log: ["query", "error", "warn"] | ["error"] =
    environment.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"];

  return new PrismaClient({ adapter, log });
}
