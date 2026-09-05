import Image from "next/image";
import type { Metadata } from "next";
import Link from "next/link";
import { listPublicCategories } from "@/lib/repositories/categories";
import { CategoryList } from "./categories/category-list";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Business software discovery",
  description:
    "Discover, compare and choose software for your business. Explore SaaSElephant by product or category and take your next step with the vendor.",
};

export default async function HomePage() {
  const categories = await listPublicCategories();
  const featuredCategories =
    categories.status === "success"
      ? { ...categories, categories: categories.categories.slice(0, 6) }
      : categories;
  return (
    <main>
      <section className="launch-hero">
        <div className="hero-copy">
          <p className="eyebrow">SaaSElephant · Business software discovery</p>
          <h1>
            Your Elephant-Sized
            <br className="hero-break" /> Store of Software<span>.</span>
          </h1>
          <p className="lede">Discover, compare and choose software for your business.</p>
          <p className="hero-description">
            Start with what your business needs. Explore software, understand the essentials, and
            take your next step directly with the vendor.
          </p>
          <div className="actions">
            <Link className="primary" href="/software">
              Browse Software <span aria-hidden="true">↗</span>
            </Link>
            <Link className="secondary" href="/categories">
              Browse Categories
            </Link>
          </div>
          <p className="hero-note">Free to browse. No account needed.</p>
        </div>
        <aside className="discovery-note" aria-label="Choosing your next tool">
          {/* Integrated Real Final Branding Logo Asset */}
          <Image
            className="hero-elephant"
            src="/SaasElephantLogoFinal.png"
            alt="SaaSElephant Official Logo"
            width={280}
            height={78}
            style={{ objectFit: "contain", height: "auto", marginBottom: "16px" }}
            priority
          />
          <p className="eyebrow">A good choice starts here</p>
          <h2>
            Find the fit.
            <br />
            Then take the next step.
          </h2>
          <ol>
            <li>
              <strong>Your needs</strong>
              <span>What should the software help your team do?</span>
            </li>
            <li>
              <strong>Your options</strong>
              <span>Look at the use case, pricing and available plans.</span>
            </li>
            <li>
              <strong>Your decision</strong>
              <span>Check the latest details with the vendor before you buy.</span>
            </li>
          </ol>
        </aside>
      </section>
      <section className="launch-section" aria-labelledby="discover-categories">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Find your starting point</p>
            <h2 id="discover-categories">Explore by business need</h2>
          </div>
          <Link className="text-link" href="/categories">
            Browse all categories <span aria-hidden="true">→</span>
          </Link>
        </div>
        <p className="section-intro">
          Bring your next project, daily task or growing team into focus with category-based
          browsing.
        </p>
        <CategoryList result={featuredCategories} />
      </section>
      <section className="launch-section how-it-works" aria-labelledby="how-it-works">
        <p className="eyebrow">From discovery to decision</p>
        <h2 id="how-it-works">How SaaSElephant works</h2>
        <div className="steps-grid">
          <article>
            <span className="step-number">01</span>
            <h3>Discover</h3>
            <p>Browse the directory or search by product, vendor or use case.</p>
          </article>
          <article>
            <span className="step-number">02</span>
            <h3>Compare the essentials</h3>
            <p>
              Review product descriptions, who each tool is for, and pricing information where
              available.
            </p>
          </article>
          <article>
            <span className="step-number">03</span>
            <h3>Choose with the vendor</h3>
            <p>
              Visit the official website for current plans and purchase directly. The vendor handles
              payment, support and onboarding.
            </p>
          </article>
        </div>
      </section>
      <section className="launch-section why-section" aria-labelledby="why-saaselephant">
        <div>
          <p className="eyebrow">Less searching. More clarity.</p>
          <h2 id="why-saaselephant">
            Software discovery,
            <br />
            with your business in mind.
          </h2>
          <Link className="secondary" href="/software">
            Explore the directory
          </Link>
        </div>
        <div className="why-points">
          <article>
            <h3>Useful information, together</h3>
            <p>Product facts and business use cases help you decide what deserves a closer look.</p>
          </article>
          <article>
            <h3>A direct path to the source</h3>
            <p>
              Official vendor websites are the place to confirm current features, terms and pricing.
            </p>
          </article>
          <article>
            <h3>Your choice, at your pace</h3>
            <p>Explore without creating an account. Choose the tools that work for you.</p>
          </article>
        </div>
      </section>
    </main>
  );
}
