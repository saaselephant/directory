import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <section className="hero">
        <p className="eyebrow">SaaSElephant V1</p>
        <h1>Software discovery that puts buyers first.</h1>
        <p className="lede">
          Find, evaluate, and compare business software with clear information and trusted vendor
          links.
        </p>
        <div className="actions">
          <Link className="primary" href="/software">
            Browse software
          </Link>
          <Link className="secondary" href="/admin">
            Admin preview
          </Link>
        </div>
      </section>
      <section className="foundation" aria-label="Platform foundation">
        <article>
          <h2>Public directory</h2>
          <p>Server-rendered catalog, category, comparison, and SEO routes will live here.</p>
        </article>
        <article>
          <h2>Editorial operations</h2>
          <p>Protected admin workflows will manage products, vendors, links, and publishing.</p>
        </article>
        <article>
          <h2>Affiliate integrity</h2>
          <p>Future tracked redirects will select verified, prioritized affiliate destinations.</p>
        </article>
      </section>
    </main>
  );
}
