import Link from "next/link";
import type { SoftwareReview, SoftwareReviewEvent } from "@/types/models";
import type { SoftwareReviewHistoryResult } from "@/lib/repositories/software-review";
import { safeReviewUrl } from "@/lib/security/review-url";

function ReviewUrl({ value }: { value: string | null }) {
  if (!value) return <span>Not recorded</span>;
  const href = safeReviewUrl(value);
  return href ? (
    <a href={href} rel="noopener noreferrer">
      {value}
    </a>
  ) : (
    <span>
      {value} <strong>(Invalid URL — link unavailable)</strong>
    </span>
  );
}
function status(value: string | null) {
  return value ? value.replaceAll("_", " ") : "Not recorded";
}
function eventLabel(event: SoftwareReviewEvent) {
  if (event.result === "needs_verification")
    return event.reason ? "Returned to verification" : "Needs verification";
  return { verified: "Verified", pending: "Pending", failed: "Failed", stale: "Stale" }[
    event.result
  ];
}
export function SoftwareReviewDetail({
  review,
  history,
}: {
  review: SoftwareReview;
  history: SoftwareReviewHistoryResult;
}) {
  const facts = [
    ["Slug", review.slug],
    ["Vendor", review.vendorName ?? review.legacyVendor],
    [
      "Legacy vendor",
      review.vendorName && review.legacyVendor !== review.vendorName ? review.legacyVendor : null,
    ],
    ["Short description", review.shortDescription],
    ["Full description", review.fullDescription],
    ["Best for", review.bestFor],
    ["Pricing", review.pricing],
    ["Free plan", review.freePlan === null ? "Not recorded" : review.freePlan ? "Yes" : "No"],
    ["Free trial", review.freeTrial === null ? "Not recorded" : review.freeTrial ? "Yes" : "No"],
    ["Publication", status(review.publicationStatus)],
    ["Verification", status(review.verificationStatus)],
    ["Latest successful verification", review.verifiedAt],
  ];
  return (
    <main className="placeholder-page admin-software-review">
      <Link href="/admin">Back to admin dashboard</Link>
      <p className="eyebrow">Private software review</p>
      <h1>{review.name}</h1>
      <p>
        Review catalogue facts and prior evidence here. Publication and verification are separate
        actions on the admin dashboard.
      </p>
      <section aria-labelledby="catalogue-facts">
        <h2 id="catalogue-facts">Catalogue facts</h2>
        <dl>
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value ?? "Not recorded"}</dd>
            </div>
          ))}
          <div>
            <dt>Official website</dt>
            <dd>
              <ReviewUrl value={review.websiteUrl} />
            </dd>
          </div>
        </dl>
      </section>
      <section aria-labelledby="assigned-categories">
        <h2 id="assigned-categories">Assigned categories</h2>
        {review.categories.length ? (
          <ul>
            {review.categories.map((category) => (
              <li key={category.id}>
                {category.name} — {category.slug ?? "Slug not recorded"} —{" "}
                {status(category.publicationStatus)}
              </li>
            ))}
          </ul>
        ) : (
          <p>No assigned categories.</p>
        )}
      </section>
      <section aria-labelledby="verification-history">
        <h2 id="verification-history">Verification history</h2>
        <p>
          Catalogue review audit trail. Showing up to the 50 most recent events, newest first. Times
          include their UTC offset.
        </p>
        {history.status === "error" ? (
          <p role="status">Verification history is unavailable. Please try again.</p>
        ) : history.events.length === 0 ? (
          <p>No software catalogue verification history recorded.</p>
        ) : (
          <ol className="admin-review-history">
            {history.events.map((event, index) => (
              <li key={index}>
                <h3>{eventLabel(event)}</h3>
                <time dateTime={event.verifiedAt}>{event.verifiedAt}</time>
                <dl>
                  {event.sourceUrl ? (
                    <div>
                      <dt>Evidence URL</dt>
                      <dd>
                        <ReviewUrl value={event.sourceUrl} />
                      </dd>
                    </div>
                  ) : null}
                  {event.sourceReference ? (
                    <div>
                      <dt>Source reference</dt>
                      <dd>{event.sourceReference}</dd>
                    </div>
                  ) : null}
                  {event.notes ? (
                    <div>
                      <dt>Notes</dt>
                      <dd>{event.notes}</dd>
                    </div>
                  ) : null}
                  {event.reason ? (
                    <div>
                      <dt>Reason</dt>
                      <dd>{event.reason}</dd>
                    </div>
                  ) : null}
                </dl>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
