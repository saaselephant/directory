import { redirect } from "next/navigation";

import { signInAdmin } from "@/lib/auth/actions";
import { requireAdmin } from "@/lib/auth/admin";

type SignInPageProps = {
  searchParams: Promise<{ error?: string | string[] }>;
};

export const dynamic = "force-dynamic";

export default async function AdminSignInPage({ searchParams }: SignInPageProps) {
  const authorization = await requireAdmin();
  if (authorization.status === "authorized") redirect("/admin");

  const error = (await searchParams).error;
  const showError = error === "authentication" || error === "unavailable";

  return (
    <main className="placeholder-page admin-auth-page">
      <section className="admin-auth-card">
        <p className="eyebrow">Admin</p>
        <h1>Sign in</h1>
        <p>Use your authorized SaaSElephant editorial account.</p>
        {showError ? (
          <p className="admin-auth-error" role="alert">
            Sign-in is unavailable. Check your details or contact the platform administrator.
          </p>
        ) : null}
        <form action={signInAdmin} className="admin-auth-form">
          <label htmlFor="admin-email">Email</label>
          <input
            id="admin-email"
            name="email"
            type="email"
            autoComplete="email"
            maxLength={254}
            required
          />
          <label htmlFor="admin-password">Password</label>
          <input
            id="admin-password"
            name="password"
            type="password"
            autoComplete="current-password"
            maxLength={1024}
            required
          />
          <button type="submit">Sign in</button>
        </form>
      </section>
    </main>
  );
}
