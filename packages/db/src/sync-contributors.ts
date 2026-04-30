import { prisma } from "./index.js";
import { CONTRIBUTOR_NAMES, CORRUPTED_CONTRIBUTOR_NAMES } from "./contributors.js";

async function syncContributors() {
  await prisma.contributor.deleteMany({
    where: {
      name: {
        in: [...CORRUPTED_CONTRIBUTOR_NAMES],
      },
    },
  });

  for (const name of CONTRIBUTOR_NAMES) {
    await prisma.contributor.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  const contributors = await prisma.contributor.findMany({
    orderBy: { name: "asc" },
    select: { name: true },
  });

  console.log(`Synced ${CONTRIBUTOR_NAMES.length} contributor records.`);
  console.log(contributors.map((contributor) => `- ${contributor.name}`).join("\n"));
}

syncContributors()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
