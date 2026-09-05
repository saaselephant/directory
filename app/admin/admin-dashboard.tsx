import { signOutAdmin } from "@/lib/auth/actions";
import {
  publishCategory,
  publishSoftware,
  returnCategoryToReview,
  returnSoftwareToReview,
} from "@/lib/commands/publication-actions";
import type {
  AdminCategoryReviewItem,
  AdminDashboardModel,
  AdminSoftwareReviewItem,
} from "@/types/models";

function SoftwareList({
  items,
  action,
  actionLabel,
  emptyMessage,
}: {
  items: AdminSoftwareReviewItem[];
  action: (formData: FormData) => Promise<never>;
  actionLabel: string;
  emptyMessage: string;
}) {
  if (items.length === 0) return <p>{emptyMessage}</p>;

  return (
    <ul>
      {items.map((item) => (
        <li key={item.id}>
          <div className="admin-record-heading">
            <strong>{item.name}</strong> by {item.vendorName}
          </div>
          <span className="admin-record-status">
            Current state: {item.publicationStatus.replaceAll("_", " ")}
          </span>
          <span
            className={
              item.verificationStatus === "needs_verification"
                ? "admin-verification-warning"
                : undefined
            }
          >
            Verification: {item.verificationStatus?.replaceAll("_", " ") ?? "not set"}
          </span>
          <form action={action} className="admin-publication-form">
            <input type="hidden" name="record_id" value={item.id} />
            <button className="admin-action-button" type="submit">
              {actionLabel}
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}

function CategoryList({
  items,
  action,
  actionLabel,
  emptyMessage,
}: {
  items: AdminCategoryReviewItem[];
  action: (formData: FormData) => Promise<never>;
  actionLabel: string;
  emptyMessage: string;
}) {
  if (items.length === 0) return <p>{emptyMessage}</p>;

  return (
    <ul>
      {items.map((item) => (
        <li key={item.id}>
          <strong>{item.name}</strong>
          <span className="admin-record-status">
            Current state: {item.publicationStatus.replaceAll("_", " ")}
          </span>
          <form action={action} className="admin-publication-form">
            <input type="hidden" name="record_id" value={item.id} />
            <button className="admin-action-button" type="submit">
              {actionLabel}
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}

export function AdminDashboard({ dashboard }: { dashboard: AdminDashboardModel }) {
  const summaries = [
    ["Software in review", dashboard.summary.softwareInReview],
    ["Software published", dashboard.summary.softwarePublished],
    ["Needs verification", dashboard.summary.softwareNeedsVerification],
    ["Categories in review", dashboard.summary.categoriesInReview],
    ["Categories published", dashboard.summary.categoriesPublished],
  ] as const;

  return (
    <>
      <form action={signOutAdmin} className="admin-sign-out">
        <button className="admin-action-button" type="submit">
          Sign out
        </button>
      </form>
      <section className="admin-summary" aria-label="Editorial summary">
        {summaries.map(([label, value]) => (
          <article key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </article>
        ))}
      </section>
      <section className="admin-queue">
        <h2>Software awaiting review</h2>
        <SoftwareList
          items={dashboard.softwareInReview}
          action={publishSoftware}
          actionLabel="Publish"
          emptyMessage="No software is awaiting review."
        />
      </section>
      <section className="admin-queue">
        <h2>Software published</h2>
        <SoftwareList
          items={dashboard.softwarePublished}
          action={returnSoftwareToReview}
          actionLabel="Return to review"
          emptyMessage="No software is published."
        />
      </section>
      <section className="admin-queue">
        <h2>Categories awaiting review</h2>
        <CategoryList
          items={dashboard.categoriesInReview}
          action={publishCategory}
          actionLabel="Publish"
          emptyMessage="No categories are awaiting review."
        />
      </section>
      <section className="admin-queue">
        <h2>Categories published</h2>
        <CategoryList
          items={dashboard.categoriesPublished}
          action={returnCategoryToReview}
          actionLabel="Return to review"
          emptyMessage="No categories are published."
        />
      </section>
    </>
  );
}
