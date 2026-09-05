import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/admin";
import {
  getSoftwareReview,
  getSoftwareVerificationHistory,
} from "@/lib/repositories/software-review";
import { SoftwareReviewDetail } from "./software-review";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = {
  title: "Private software review",
  robots: { index: false, follow: false },
};

export default async function SoftwareReviewPage({
  params,
}: {
  params: Promise<{ recordId: string }>;
}) {
  const authorization = await requireAdmin().catch(() => ({ status: "error" as const }));
  if (authorization.status === "unauthenticated") redirect("/admin/sign-in");
  if (authorization.status !== "authorized") {
    return (
      <main className="placeholder-page">
        <h1>Access unavailable</h1>
        <p>This review is not available for the current account.</p>
      </main>
    );
  }
  const { recordId } = await params;
  const result = await getSoftwareReview(recordId, authorization.client);
  if (result.status !== "success") {
    return (
      <main className="placeholder-page">
        <Link href="/admin">Back to admin dashboard</Link>
        <h1>{result.status === "not_found" ? "Software unavailable" : "Review unavailable"}</h1>
        <p>
          {result.status === "not_found"
            ? "The requested software could not be found."
            : "We couldn’t load this review. Please try again."}
        </p>
      </main>
    );
  }
  const history = await getSoftwareVerificationHistory(recordId, authorization.client);
  return <SoftwareReviewDetail review={result.review} history={history} />;
}
