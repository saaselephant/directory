import Link from "next/link";

import type { PublicCategoriesResult } from "@/lib/repositories/categories";
import type { NormalizedSoftwareSearchParams } from "@/lib/repositories/search";

interface SoftwareFiltersProps {
  categories: PublicCategoriesResult;
  filters: NormalizedSoftwareSearchParams;
}

export function SoftwareFilters({ categories, filters }: SoftwareFiltersProps) {
  return (
    <form className="catalog-filters" action="/software" method="get" role="search">
      <div>
        <label htmlFor="software-search">Search software</label>
        <input
          defaultValue={filters.query}
          id="software-search"
          maxLength={100}
          name="q"
          placeholder="Search by name, vendor, or use case"
          type="search"
        />
      </div>
      <div>
        <label htmlFor="software-category">Category</label>
        <select defaultValue={filters.categorySlug} id="software-category" name="category">
          <option value="">All categories</option>
          {categories.status === "success"
            ? categories.categories.map((category) => (
                <option key={category.slug} value={category.slug}>
                  {category.name}
                </option>
              ))
            : null}
        </select>
      </div>
      <div className="catalog-filter-actions">
        <button className="primary" type="submit">
          Search
        </button>
        <Link className="secondary" href="/software">
          Clear
        </Link>
      </div>
      {categories.status === "error" ? (
        <p className="filter-notice">
          Category filters are temporarily unavailable. You can still search by name or use case.
        </p>
      ) : null}
    </form>
  );
}
