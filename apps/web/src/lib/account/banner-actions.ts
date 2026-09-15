"use server";

import type { AccountBannerResult, UpdateAccountBannerInput } from "@/lib/account/banner";
import {
  claimAccountBanner,
  getAccountBanner,
  updateAccountBanner,
} from "@/lib/account/banner-service";

export async function getAccountBannerAction(): Promise<AccountBannerResult> {
  return getAccountBanner();
}

export async function claimAccountBannerAction(claimId: string): Promise<AccountBannerResult> {
  return claimAccountBanner(claimId);
}

export async function updateAccountBannerAction(
  input: UpdateAccountBannerInput,
): Promise<AccountBannerResult> {
  return updateAccountBanner(input);
}
