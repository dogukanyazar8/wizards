import { redirect } from "next/navigation";

export default function AdminDownloadsPage() {
  redirect("/admin/releases?view=packages");
}
