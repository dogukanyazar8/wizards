import bcrypt from "bcryptjs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createPrismaClient } from "./client-factory";
import type { PrismaClient } from "./index";

export const UAT_TEST_USERS_CONFIRMATION = "create-five-uat-test-users";

export const UAT_TEST_USERS = [
  { displayName: "UAT Test 1", email: "uat-test-1@whispr.team", username: "uat_test_1" },
  { displayName: "UAT Test 2", email: "uat-test-2@whispr.team", username: "uat_test_2" },
  { displayName: "UAT Test 3", email: "uat-test-3@whispr.team", username: "uat_test_3" },
  { displayName: "UAT Test 4", email: "uat-test-4@whispr.team", username: "uat_test_4" },
  { displayName: "UAT Test 5", email: "uat-test-5@whispr.team", username: "uat_test_5" },
] as const;

type UatTestUserPrisma = Pick<PrismaClient, "user">;

type UatTestUsersSeedOptions = {
  password: string;
  resetPassword: boolean;
};

type SeedUatTestUsersInput = {
  hashPassword?: (password: string) => Promise<string>;
  password: string;
  prisma: UatTestUserPrisma;
  resetPassword?: boolean;
};

const defaultHashPassword = (password: string) => bcrypt.hash(password, 12);

export function readUatTestUsersSeedOptions(
  environment: NodeJS.ProcessEnv = process.env,
): UatTestUsersSeedOptions {
  if (environment.UAT_TEST_USERS_CONFIRM !== UAT_TEST_USERS_CONFIRMATION) {
    throw new Error(
      `Refusing to seed UAT test users. Set UAT_TEST_USERS_CONFIRM=${UAT_TEST_USERS_CONFIRMATION}.`,
    );
  }

  const password = environment.UAT_TEST_USERS_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error("UAT_TEST_USERS_PASSWORD must contain at least 12 characters.");
  }
  if (Buffer.byteLength(password, "utf8") > 72) {
    throw new Error("UAT_TEST_USERS_PASSWORD must be 72 UTF-8 bytes or fewer.");
  }

  return {
    password,
    resetPassword: environment.UAT_TEST_USERS_RESET_PASSWORD === "true",
  };
}

export async function seedUatTestUsers({
  hashPassword = defaultHashPassword,
  password,
  prisma,
  resetPassword,
}: SeedUatTestUsersInput): Promise<void> {
  const passwordHash = await hashPassword(password);
  const emailVerifiedAt = new Date();

  await Promise.all(
    UAT_TEST_USERS.map((user) =>
      prisma.user.upsert({
        where: { email: user.email },
        update: {
          displayName: user.displayName,
          emailVerified: true,
          emailVerifiedAt,
          ...(resetPassword ? { passwordHash } : {}),
          username: user.username,
        },
        create: {
          displayName: user.displayName,
          email: user.email,
          emailVerified: true,
          emailVerifiedAt,
          notificationSettings: { create: {} },
          passwordHash,
          settings: { create: {} },
          username: user.username,
        },
      }),
    ),
  );
}

async function main() {
  const options = readUatTestUsersSeedOptions();
  const prisma = createPrismaClient();

  try {
    await seedUatTestUsers({ ...options, prisma });
    console.log(`Seeded ${UAT_TEST_USERS.length} UAT test users:`);
    for (const user of UAT_TEST_USERS) {
      console.log(`${user.username} (${user.email})`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
