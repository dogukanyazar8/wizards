import { createPrismaClient } from "./client-factory";

type PrismaClientInstance = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as typeof globalThis & {
  wizardsPrisma?: PrismaClientInstance;
};

export const prisma = globalForPrisma.wizardsPrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.wizardsPrisma = prisma;
}
