import Link from "next/link";
import { categoryGroup } from "../discovery";

import type { PublicCategoriesResult } from "@/lib/repositories/categories";

export function CategoryList({ result }: { result: PublicCategoriesResult }) {
  if (result.status === "error") {
    return (
      <section className="catalog-state">
        <h2>We couldn&apos;t load the category directory.</h2>
        <p>Please try again shortly.</p>
      </section>
    );
  }

  if (result.status === "empty") {
    return (
      <section className="catalog-state">
        <h2>We&apos;re preparing the first software categories.</h2>
        <p>
          Our opening collection is taking shape. Category pages will bring related tools together
          as they become available.
        </p>
        <Link className="text-link" href="/software">
          Browse software →
        </Link>
      </section>
    );
  }

  const groups = ["Run your business", "Grow your business", "Work smarter", "Create & manage"];
  const descriptions: Record<string, string> = {
    "Run your business": "Organize the people, resources and processes behind your business.",
    "Grow your business": "Build your audience and develop customer relationships.",
    "Work smarter": "Simplify everyday work and bring your team together.",
    "Create & manage": "Explore tools for your ideas and specialized business needs.",
  };
  return (
    <div className="category-collections">
      {groups.map((group) => {
        const members = result.categories.filter((category) => categoryGroup(category) === group);
        if (!members.length) return null;
        return (
          <section
            className="category-collection"
            id={group.toLowerCase().replaceAll(" ", "-")}
            key={group}
          >
            <header>
              <p className="eyebrow">Explore a business need</p>
              <h2>{group}</h2>
              <p>{descriptions[group]}</p>
            </header>
            <div className="category-grid" aria-label="Software categories">
              {members.map((category) => (
                <article className="category-card" key={category.slug}>
                  <h2>
                    <Link href={`/categories/${encodeURIComponent(category.slug)}`}>
                      {category.name}
                    </Link>
                  </h2>
                  {category.description ? <p>{category.description}</p> : null}
                  <Link
                    className="catalog-detail-link"
                    href={`/categories/${encodeURIComponent(category.slug)}`}
                  >
                    Explore category <span aria-hidden="true">→</span>
                  </Link>
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
