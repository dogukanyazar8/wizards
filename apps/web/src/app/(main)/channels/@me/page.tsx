import { auth } from "@/auth";
import { logoutAction } from "@/lib/auth/actions";

async function submitLogout() {
  "use server";
  await logoutAction();
}

export default async function ChannelsMePage() {
  const session = await auth();
  const displayName =
    session?.user.displayName ?? session?.user.username ?? session?.user.email ?? "Wizard";

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-10 text-slate-100">
      <section className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-xl">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Protected Route</p>
        <h1 className="mt-2 text-3xl font-semibold">Welcome to Wizards, {displayName}</h1>
        <p className="mt-3 text-sm text-slate-400">
          Your authentication flow is active. This is a placeholder for /channels/@me.
        </p>

        <div className="mt-8 flex items-center gap-4">
          <form action={submitLogout}>
            <button
              type="submit"
              className="rounded-md bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-white"
            >
              Log Out
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
