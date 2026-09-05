import { requireAdmin } from "@/lib/auth/admin";
import { getAdminDashboard } from "@/lib/repositories/admin";
import { redirect } from "next/navigation";

import { AdminDashboard } from "./admin-dashboard";

export const dynamic = "force-dynamic";

type AdminPageProps = {
  searchParams?: Promise<{ result?: string | string[] }>;
};

const RESULT_MESSAGES: Record<string, string> = {
  published: "Publication status updated.",
  returned: "The item was returned to review.",
  stale: "That item changed before the action completed. Refresh and try again.",
  unavailable: "We couldn’t complete that action. Please try again.",
  verified: "Software verified.",
  reopened: "Software returned to verification.",
  verification_invalid: "Verification data was invalid.",
  verification_stale: "The item changed before this action completed.",
  verification_unavailable: "Verification is unavailable.",
};

export default async function AdminPage({
  searchParams = Promise.resolve({}),
}: AdminPageProps = {}) {
  const authorization = await requireAdmin();

  if (authorization.status === "unauthenticated") {
    redirect("/admin/sign-in");
  }

  if (authorization.status === "forbidden") {
    return (
      <main className="placeholder-page">
        <p className="eyebrow">Admin</p>
        <h1>Access unavailable</h1>
        <p>This workspace is not available for the current account.</p>
      </main>
    );
  }

  if (authorization.status === "error") {
    return (
      <main className="placeholder-page">
        <p className="eyebrow">Admin</p>
        <h1>We couldn&apos;t load the editorial workspace.</h1>
        <p>Please try again shortly.</p>
      </main>
    );
  }

  const result = await getAdminDashboard(authorization.client);
  const resultKey = (await searchParams).result;
  const feedback = typeof resultKey === "string" ? RESULT_MESSAGES[resultKey] : undefined;

  return (
    <main className="placeholder-page">
      <p className="eyebrow">Admin</p>
      <h1>Editorial workspace</h1>
      {feedback ? (
        <p className="admin-action-feedback" role="status">
          {feedback}
        </p>
      ) : null}
      {result.status === "success" ? (
        <AdminDashboard dashboard={result.dashboard} />
      ) : (
        <section className="catalog-state">
          <h2>We couldn&apos;t load the review queues.</h2>
          <p>Please try again shortly.</p>
        </section>
      )}
    </main>
  );
}
