import Link from "next/link";

export const SOFTWARE_PAGE_SIZE = 12;

interface PaginationProps {
  currentPage: number;
  pathname: string;
  searchParams?: Record<string, string>;
  totalPages: number;
}

type PaginationItem = number | "ellipsis";

export function parsePageParam(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !/^\d+$/.test(raw)) return 1;
  const page = Number(raw);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export function paginationHref(
  pathname: string,
  page: number,
  searchParams: Record<string, string> = {},
): string {
  const params = new URLSearchParams(
    Object.entries(searchParams).filter(([, value]) => value.length > 0),
  );
  if (page > 1) params.set("page", String(page));
  else params.delete("page");
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function paginationItems(currentPage: number, totalPages: number): PaginationItem[] {
  const visible = new Set([1, totalPages]);
  for (let page = Math.max(1, currentPage - 1); page <= Math.min(totalPages, currentPage + 1); page++) {
    visible.add(page);
  }

  const pages = [...visible].sort((a, b) => a - b);
  const items: PaginationItem[] = [];
  pages.forEach((page, index) => {
    const previousPage = pages[index - 1];
    if (previousPage !== undefined && page - previousPage > 1) items.push("ellipsis");
    items.push(page);
  });
  return items;
}

export function Pagination({
  currentPage,
  pathname,
  searchParams,
  totalPages,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <nav className="pagination" aria-label="Pagination">
      {currentPage > 1 ? (
        <Link
          className="pagination-direction"
          href={paginationHref(pathname, currentPage - 1, searchParams)}
        >
          ← Previous
        </Link>
      ) : (
        <span className="pagination-direction is-disabled" aria-disabled="true">
          ← Previous
        </span>
      )}
      <div className="pagination-pages">
        {paginationItems(currentPage, totalPages).map((item, index) =>
          item === "ellipsis" ? (
            <span className="pagination-ellipsis" aria-hidden="true" key={`ellipsis-${index}`}>
              …
            </span>
          ) : (
            <Link
              aria-current={item === currentPage ? "page" : undefined}
              href={paginationHref(pathname, item, searchParams)}
              key={item}
            >
              {item}
            </Link>
          ),
        )}
      </div>
      {currentPage < totalPages ? (
        <Link
          className="pagination-direction"
          href={paginationHref(pathname, currentPage + 1, searchParams)}
        >
          Next →
        </Link>
      ) : (
        <span className="pagination-direction is-disabled" aria-disabled="true">
          Next →
        </span>
      )}
    </nav>
  );
}
