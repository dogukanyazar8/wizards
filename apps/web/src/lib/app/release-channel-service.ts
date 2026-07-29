import { prisma } from "@wizards/db";
import type { MobileReleaseChannel } from "@wizards/types";

import { toReleaseChannelColumn } from "@/lib/releases/release-service";

/**
 * 2c writes the user's preferred update stream. It never touches the EAS
 * channel a build shipped on — this only decides which stream the app offers
 * next, which is why the route answers `effectiveFrom: "next-build"`.
 */

export type MobileReleaseChannelDependencies = {
  updatePreferredChannel: (userId: string, channel: MobileReleaseChannel) => Promise<unknown>;
};

const defaultDependencies: MobileReleaseChannelDependencies = {
  updatePreferredChannel: (userId, channel) =>
    prisma.user.update({
      data: { preferredReleaseChannel: toReleaseChannelColumn(channel) },
      select: { id: true },
      where: { id: userId },
    }),
};

export async function setMobilePreferredReleaseChannel(
  userId: string,
  channel: MobileReleaseChannel,
  dependencies: MobileReleaseChannelDependencies = defaultDependencies,
): Promise<void> {
  await dependencies.updatePreferredChannel(userId, channel);
}
