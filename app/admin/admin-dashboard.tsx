import type { AdminDashboardModel } from "@/types/models";

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
        {dashboard.softwareQueue.length ? (
          <ul>
            {dashboard.softwareQueue.map((item) => (
              <li key={item.id}>
                <strong>{item.name}</strong> by {item.vendorName}
                <span>{item.verificationStatus?.replaceAll("_", " ") ?? "Not set"}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p>No software is awaiting review.</p>
        )}
      </section>
      <section className="admin-queue">
        <h2>Categories awaiting review</h2>
        {dashboard.categoryQueue.length ? (
          <ul>
            {dashboard.categoryQueue.map((item) => (
              <li key={item.id}>
                <strong>{item.name}</strong>
                <span>{item.publicationStatus.replaceAll("_", " ")}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p>No categories are awaiting review.</p>
        )}
      </section>
    </>
  );
}
