import { requireAdmin } from "@/lib/auth/admin";
import { getAdminDashboard } from "@/lib/repositories/admin";
import { redirect } from "next/navigation";

import { AdminDashboard } from "./admin-dashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
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

  return (
    <main className="placeholder-page">
      <p className="eyebrow">Admin</p>
      <h1>Editorial workspace</h1>
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
