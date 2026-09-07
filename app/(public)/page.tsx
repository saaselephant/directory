import { listPublishedSoftware } from "@/lib/repositories/software";
import { SoftwareCatalog } from "./software/software-catalog";
import { FeaturedSoftwareShelf } from "./featured-software-shelf";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Business software discovery",
  description:
    "Discover, compare and choose software for your business. Explore SaaSElephant by product or category and take your next step with the vendor.",
};

export default async function HomePage() {
  const software = await listPublishedSoftware();
  return (
    <main className="marketplace-home">
      <div className="marketplace-workspace">
        <div className="workspace-main">
          <section className="workspace-intro" aria-labelledby="discovery-title">
            <div className="workspace-intro-layout">
              <div className="workspace-discovery">
                <p className="eyebrow">Software discovery, built around you</p>
                <h1 id="discovery-title">Find the right software for your business.</h1>
                <p className="lede">
                  Discover and compare software that fits what you’re trying to accomplish.
                </p>
                <form className="workspace-search" action="/software" method="get" role="search">
                  <label htmlFor="home-search">Search software or describe what you need</label>
                  <div className="workspace-search-control">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      aria-hidden="true"
                    >
                      <circle cx="10.5" cy="10.5" r="6.5" />
                      <path d="m16 16 5 5" />
                    </svg>
                    <input
                      id="home-search"
                      name="q"
                      type="search"
                      maxLength={100}
                      placeholder="Try a product name or a task, like email marketing"
                      aria-describedby="home-search-hint"
                      required
                    />
                    <button className="primary" type="submit">
                      Find software <span aria-hidden="true">→</span>
                    </button>
                  </div>
                  <p id="home-search-hint" className="workspace-search-hint">
                    Search by product, vendor or use case.
                  </p>
                </form>
              </div>
              <aside className="discovery-path" aria-labelledby="discovery-path-title">
                <p className="eyebrow" id="discovery-path-title">
                  A clear path forward
                </p>
                <ol>
                  <li>
                    <span>01</span>
                    <div>
                      <h2>Discover</h2>
                      <p>Search by product, vendor or use case.</p>
                    </div>
                  </li>
                  <li>
                    <span>02</span>
                    <div>
                      <h2>Compare essentials</h2>
                      <p>Review the details that matter to your team.</p>
                    </div>
                  </li>
                  <li>
                    <span>03</span>
                    <div>
                      <h2>Choose with the vendor</h2>
                      <p>Confirm current plans and take the next step.</p>
                    </div>
                  </li>
                </ol>
                <ul className="discovery-trust" aria-label="Marketplace assurances">
                  {[
                    "Free to browse",
                    "No account required",
                    "No spam, ever",
                    "Buy directly from the vendor",
                  ].map((assurance) => (
                    <li key={assurance}>
                      <span aria-hidden="true">✓</span>
                      {assurance}
                    </li>
                  ))}
                </ul>
              </aside>
            </div>
          </section>

          <section className="workspace-featured" aria-labelledby="featured-software-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Inside the directory</p>
                <h2 id="featured-software-title">Software worth a closer look</h2>
              </div>
            </div>
            <FeaturedSoftwareShelf>
              <SoftwareCatalog
                compact
                result={
                  software.status === "success"
                    ? { ...software, items: software.items.slice(0, 6) }
                    : software
                }
              />
            </FeaturedSoftwareShelf>
          </section>

        </div>
      </div>
    </main>
  );
}
