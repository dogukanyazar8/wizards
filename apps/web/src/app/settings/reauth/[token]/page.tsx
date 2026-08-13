import { AccountDeletionReauthConfirmation } from "./reauth-confirmation";

export default async function AccountDeletionReauthPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <AccountDeletionReauthConfirmation token={token} />;
}
