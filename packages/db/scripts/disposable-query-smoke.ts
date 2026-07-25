import assert from "node:assert/strict";
import { createPrismaClient } from "../src/client-factory.js";

async function main() {
  const prisma = createPrismaClient();

  try {
    const result = await prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok`;
    assert.equal(result[0]?.ok, 1, "expected PostgreSQL query smoke result");

    const seededUserCount = await prisma.user.count({
      where: { email: { in: ["demo@whispr.team", "test@whispr.team"] } },
    });
    assert.equal(seededUserCount, 2, "expected explicit seed to create both demo users");
  } finally {
    await prisma.$disconnect();
  }
}

void main();
