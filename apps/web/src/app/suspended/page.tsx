import { redirect } from "next/navigation";
import { SuspendedAppealForm } from "@/components/moderation/suspended-appeal-form";
import { getCurrentUserForSession, requireAuth } from "@/lib/auth/utils";

/**
 * The only page a suspended account can reach. It states the decision and
 * offers one appeal — the queue picks it up as an `APPEALED` case.
 */
export default async function SuspendedPage() {
  const session = await requireAuth();
  const user = await getCurrentUserForSession(session);

  if (!user?.isBanned) {
    redirect("/channels");
  }

  return (
    <main className="app-shell mx-auto flex min-h-dvh max-w-[640px] flex-col justify-center px-6 py-12">
      <h1 className="text-app-foreground font-display text-[26px] font-bold">
        Hesabın askıya alındı
      </h1>
      <p className="text-app-muted mt-3 text-[14px] leading-6">
        Bir moderasyon kararı sonucu bu hesabın erişimi kapatıldı. Kararın yanlış olduğunu
        düşünüyorsan bir kez itiraz edebilirsin; itirazın moderasyon kuyruğunda incelenir.
      </p>
      <div className="mt-6">
        <SuspendedAppealForm />
      </div>
    </main>
  );
}
