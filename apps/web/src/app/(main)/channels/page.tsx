import { requireAuth } from "@/lib/auth/utils";

export default async function ChannelsPage() {
  await requireAuth();

  return null;
}
