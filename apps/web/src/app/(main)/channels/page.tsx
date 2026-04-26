import { redirect } from "next/navigation";

export default async function ChannelsPage() {
  redirect("/channels/@me");
}
