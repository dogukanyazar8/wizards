import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { ForgotPasswordClient } from "./forgot-password-client";

/** SPEC-GIRIS-KAYIT §4.7 — `Şifreni sıfırla`. */
export default async function ForgotPasswordPage() {
  const session = await auth();

  if (session?.user?.id) {
    redirect("/");
  }

  return <ForgotPasswordClient />;
}
