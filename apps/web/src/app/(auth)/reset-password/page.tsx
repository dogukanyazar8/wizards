import { verifyPasswordResetToken } from "@/lib/auth/password-reset";
import { ResetPasswordClient } from "./reset-password-client";

export const dynamic = "force-dynamic";

type ResetPasswordPageProps = {
  searchParams: Promise<{
    token?: string | string[];
  }>;
};

function getToken(searchToken: string | string[] | undefined) {
  return typeof searchToken === "string" ? searchToken : "";
}

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const { token } = await searchParams;
  const rawToken = getToken(token);
  const verification = await verifyPasswordResetToken(rawToken).catch(() => ({
    status: "invalid" as const,
  }));

  return (
    <ResetPasswordClient
      email={verification.status === "valid" ? verification.email : undefined}
      status={verification.status}
      token={verification.status === "valid" ? verification.token : rawToken}
    />
  );
}
