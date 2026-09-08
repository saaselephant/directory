import Link from "next/link";
import type { PublicCategory } from "@/types/models";

// Editorial groupings only: membership is derived from existing category names.
const categoryPatterns = [
  {
    match: /project|task|team|hr|human resource/i,
    group: "Run your business",
    icon: "M4 5h16v15H4z M8 3v4 M16 3v4 M4 10h16 M8 14h3 M8 17h6",
  },
  {
    match: /crm|sales|lead|customer/i,
    group: "Grow your business",
    icon: "M15 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2 M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6 M19 8v6 M16 11h6",
  },
  {
    match: /automat|workflow|integration/i,
    group: "Work smarter",
    icon: "M13 2 4 14h7l-1 8 10-13h-7z",
  },
  {
    match: /market|seo|content|social/i,
    group: "Grow your business",
    icon: "M4 10v5l13 4V5z M7 16l1 5h3l-1-4 M20 9l2-2 M20 15l2 2",
  },
  {
    match: /account|financ|invoice|billing|payroll/i,
    group: "Run your business",
    icon: "M4 4h16v16H4z M8 8h8 M8 12h2 M14 12h2 M8 16h2 M14 16h2",
  },
  {
    match: /productiv|note|calendar|document/i,
    group: "Work smarter",
    icon: "M12 3a9 9 0 1 0 9 9 M12 7v5l3 2 M16 4l2 2 4-4",
  },
  {
    match: /communicat|collaborat|meeting|chat|video confer/i,
    group: "Work smarter",
    icon: "M4 4h16v12H9l-5 4z M8 8h8 M8 12h5",
  },
  {
    match: /design|creat|image|video|website/i,
    group: "Create & manage",
    icon: "m4 16 12-12 4 4-12 12H4z M13 7l4 4 M4 16l4 4",
  },
] as const;

export function categoryGroup(category: PublicCategory) {
  return (
    categoryPatterns.find((pattern) => pattern.match.test(category.name))?.group ??
    "Create & manage"
  );
}

export function CategoryGlyph({ category }: { category: PublicCategory }) {
  const path =
    categoryPatterns.find((pattern) => pattern.match.test(category.name))?.icon ??
    "M4 5h16v14H4z M8 9h8 M8 13h8 M8 17h5";

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

const marketplaceGlyphs = {
  vendor: "M4 20V8l8-5 8 5v12 M8 20v-7h8v7 M9 9h.01 M15 9h.01",
  fit: "M12 3 14.5 8l5.5.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.5-.8z",
  discovery: "M11 4a7 7 0 1 0 4.9 12L21 21 M8 11h6 M11 8v6",
  external: "M14 4h6v6 M20 4l-9 9 M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6",
} as const;

export function MarketplaceGlyph({ name }: { name: keyof typeof marketplaceGlyphs }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d={marketplaceGlyphs[name]} />
    </svg>
  );
}

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <ol>
        <li>
          <Link href="/">Home</Link>
        </li>
        {items.map((item, index) => (
          <li key={index}>
            {item.href ? (
              <Link href={item.href}>{item.label}</Link>
            ) : (
              <span aria-current="page">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function DiscoveryNext({
  title = "Ask the Elephant. It knows software.",
  description = "Start with a business need or search the marketplace by product and vendor.",
  href = "/categories",
  action = "Explore categories",
}: {
  title?: string;
  description?: string;
  href?: string;
  action?: string;
}) {
  return (
    <aside className="discovery-strip">
      <span className="discovery-strip-icon">
        <MarketplaceGlyph name="discovery" />
      </span>
      <div>
        <p className="eyebrow">Smarter discovery starts here</p>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <Link className="secondary" href={href}>
        {action} →
      </Link>
    </aside>
  );
}

export function safeReturnPath(value?: string) {
  if (!value || value.length > 1000) return "/software";
  // Allow only our discovery destinations; never arbitrary URLs or protocols.
  return /^\/software(?:\?[^#\\]*)?$/.test(value) || /^\/categories\/[a-zA-Z0-9_-]+$/.test(value)
    ? value
    : "/software";
}
