"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { PublicCategory } from "@/types/models";
import { categoryGroup } from "./discovery";

interface PublicNavigationProps {
  categories?: PublicCategory[];
  categorySoftware?: Record<string, CategorySoftwarePreview[]>;
}

export interface CategorySoftwarePreview {
  name: string;
  slug: string;
}

const MOBILE_CATEGORIES_MENU = "mobile-categories";
const ALL_SOFTWARE_MENU = "all-software";
const SOFTWARE_INITIALS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

interface SoftwareIndexItem {
  id: string;
  name: string;
  slug: string;
}

interface SoftwareIndexResponse {
  items: SoftwareIndexItem[];
  page: number;
  total: number;
  totalPages: number;
  availableLetters?: string[];
}

export function PublicNavigation({
  categories = [],
  categorySoftware = {},
}: PublicNavigationProps) {
  const pathname = usePathname();
  const navigationRef = useRef<HTMLUListElement>(null);
  const categoryNavigationRef = useRef<HTMLUListElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [selectedInitial, setSelectedInitial] = useState("ALL");
  const [softwareIndexPage, setSoftwareIndexPage] = useState(1);
  const [softwareIndex, setSoftwareIndex] = useState<SoftwareIndexResponse | null>(null);
  const [availableInitials, setAvailableInitials] = useState<string[]>([]);
  const [initialsLoaded, setInitialsLoaded] = useState(false);
  const [loadedIndexKey, setLoadedIndexKey] = useState<string | null>(null);
  const [softwareIndexError, setSoftwareIndexError] = useState<string | null>(null);
  const [softwareIndexLoading, setSoftwareIndexLoading] = useState(false);
  const [softwareIndexRequest, setSoftwareIndexRequest] = useState(0);
  const categoryGroups = [
    "Run your business",
    "Grow your business",
    "Work smarter",
    "Create & manage",
  ]
    .map((name) => ({
      name,
      categories: categories.filter((category) => categoryGroup(category) === name),
    }))
    .filter((group) => group.categories.length);

  useEffect(() => setOpenMenu(null), [pathname]);

  useEffect(() => {
    function closeOutside(event: PointerEvent) {
      const target = event.target as Node;
      if (
        !navigationRef.current?.contains(target) &&
        !categoryNavigationRef.current?.contains(target)
      ) {
        setOpenMenu(null);
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        const trigger =
          categoryNavigationRef.current?.querySelector<HTMLButtonElement>(
            '[aria-expanded="true"]',
          ) ??
          navigationRef.current?.querySelector<HTMLButtonElement>('[aria-expanded="true"]');
        trigger?.focus();
        setOpenMenu(null);
      }
    }
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (openMenu !== ALL_SOFTWARE_MENU) return;
    const indexKey = `${selectedInitial}:${softwareIndexPage}`;
    if (loadedIndexKey === indexKey) return;

    const controller = new AbortController();
    const params = new URLSearchParams({
      letter: selectedInitial,
      page: String(softwareIndexPage),
    });
    if (!initialsLoaded) params.set("includeLetters", "1");

    setSoftwareIndexLoading(true);
    setSoftwareIndexError(null);
    fetch(`/api/software-index?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const body = (await response.json()) as { error?: string };
          throw new Error(body.error ?? "Unable to load the software index.");
        }
        return response.json() as Promise<SoftwareIndexResponse>;
      })
      .then((result) => {
        setSoftwareIndex(result);
        if (result.availableLetters) {
          setAvailableInitials(result.availableLetters);
          setInitialsLoaded(true);
        }
        setLoadedIndexKey(indexKey);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setSoftwareIndexError(
          error instanceof Error ? error.message : "Unable to load the software index.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setSoftwareIndexLoading(false);
      });

    return () => controller.abort();
  }, [
    initialsLoaded,
    loadedIndexKey,
    openMenu,
    selectedInitial,
    softwareIndexPage,
    softwareIndexRequest,
  ]);

  function cancelScheduledClose() {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  function openCategoryOnHover(slug: string, event: React.PointerEvent) {
    if (event.pointerType !== "mouse") return;
    cancelScheduledClose();
    setOpenMenu(slug);
  }

  function closeCategoryAfterDelay(event: React.PointerEvent) {
    if (event.pointerType !== "mouse") return;
    cancelScheduledClose();
    closeTimerRef.current = setTimeout(() => setOpenMenu(null), 150);
  }

  const chevron = (
    <svg className="nav-chevron" viewBox="0 0 16 16" aria-hidden="true">
      <path d="m3.5 6 4.5 4 4.5-4" />
    </svg>
  );

  return (
    <div className="header-navigation">
      <ul
        className="header-category-list"
        aria-label="Software categories"
        ref={categoryNavigationRef}
      >
        {categories.slice(0, 4).map((category) => {
          const href = `/categories/${encodeURIComponent(category.slug)}`;
          const menuId = `category-menu-${category.slug}`;
          const isOpen = openMenu === category.slug;
          return (
            <li
              className={`header-category-disclosure${isOpen ? " is-open" : ""}`}
              key={category.slug}
              onPointerEnter={(event) => openCategoryOnHover(category.slug, event)}
              onPointerLeave={closeCategoryAfterDelay}
            >
              <button
                className="header-nav-link public-category-nav-trigger"
                type="button"
                aria-controls={menuId}
                aria-expanded={isOpen}
                aria-haspopup="true"
                aria-current={pathname === href ? "page" : undefined}
                onClick={() => {
                  cancelScheduledClose();
                  setOpenMenu((current) => (current === category.slug ? null : category.slug));
                }}
              >
                {category.name} {chevron}
              </button>
              {isOpen ? (
                <div className="header-category-menu" id={menuId}>
                  {(categorySoftware[category.slug] ?? []).map((software) => (
                    <Link
                      className="header-category-software-link"
                      href={`/software/${encodeURIComponent(software.slug)}?from=${encodeURIComponent(href)}`}
                      key={software.slug}
                    >
                      {software.name}
                    </Link>
                  ))}
                  <Link className="header-category-all-link" href={href}>
                    View all in {category.name} <span aria-hidden="true">→</span>
                  </Link>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <ul className="public-nav-list" ref={navigationRef}>
        <li
          className={`header-category-disclosure all-software-disclosure${openMenu === ALL_SOFTWARE_MENU ? " is-open" : ""}${pathname?.startsWith("/software") ? " is-current" : ""}`}
          onPointerEnter={(event) => openCategoryOnHover(ALL_SOFTWARE_MENU, event)}
          onPointerLeave={closeCategoryAfterDelay}
        >
          <button
            className="header-nav-link public-category-nav-trigger all-software-link"
            type="button"
            aria-controls="all-software-menu"
            aria-expanded={openMenu === ALL_SOFTWARE_MENU}
            aria-haspopup="true"
            onClick={() => {
              cancelScheduledClose();
              setOpenMenu((current) =>
                current === ALL_SOFTWARE_MENU ? null : ALL_SOFTWARE_MENU,
              );
            }}
          >
            All Softwares {chevron}
          </button>
          {openMenu === ALL_SOFTWARE_MENU ? (
            <div
              className="header-category-menu all-software-menu"
              id="all-software-menu"
              aria-label="All softwares index"
            >
              <p className="software-index-kicker">All Softwares</p>
              <div className="software-index-alphabet" aria-label="Filter software by initial">
                <button
                  type="button"
                  aria-pressed={selectedInitial === "ALL"}
                  onClick={() => {
                    setSelectedInitial("ALL");
                    setSoftwareIndexPage(1);
                    setLoadedIndexKey(null);
                  }}
                >
                  All
                </button>
                {SOFTWARE_INITIALS.map((letter) => (
                  <button
                    type="button"
                    aria-pressed={selectedInitial === letter}
                    disabled={initialsLoaded && !availableInitials.includes(letter)}
                    key={letter}
                    onClick={() => {
                      setSelectedInitial(letter);
                      setSoftwareIndexPage(1);
                      setLoadedIndexKey(null);
                    }}
                  >
                    {letter}
                  </button>
                ))}
              </div>
              <div className="software-index-results" aria-live="polite">
                {softwareIndexLoading ? (
                  <p className="software-index-status">Loading software…</p>
                ) : softwareIndexError ? (
                  <div className="software-index-status">
                    <p>{softwareIndexError}</p>
                    <button
                      type="button"
                      onClick={() => setSoftwareIndexRequest((request) => request + 1)}
                    >
                      Try again
                    </button>
                  </div>
                ) : softwareIndex?.items.length ? (
                  <ul>
                    {softwareIndex.items.map((software) => (
                      <li key={software.id}>
                        <Link
                          href={`/software/${encodeURIComponent(software.slug)}?from=%2Fsoftware`}
                        >
                          {software.name} <span aria-hidden="true">→</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="software-index-status">No published software for this initial.</p>
                )}
              </div>
              <div className="software-index-pagination">
                <button
                  type="button"
                  disabled={softwareIndexLoading || softwareIndexPage <= 1}
                  onClick={() => {
                    setSoftwareIndexPage((page) => Math.max(1, page - 1));
                    setLoadedIndexKey(null);
                  }}
                >
                  Previous
                </button>
                <span>
                  Page {softwareIndexPage} of {softwareIndex?.totalPages ?? 1}
                </span>
                <button
                  type="button"
                  disabled={
                    softwareIndexLoading ||
                    softwareIndexPage >= (softwareIndex?.totalPages ?? 1)
                  }
                  onClick={() => {
                    setSoftwareIndexPage((page) =>
                      Math.min(softwareIndex?.totalPages ?? page, page + 1),
                    );
                    setLoadedIndexKey(null);
                  }}
                >
                  Next
                </button>
              </div>
              <Link className="header-category-all-link software-index-all-link" href="/software">
                View all softwares <span aria-hidden="true">→</span>
              </Link>
            </div>
          ) : null}
        </li>
        <li className="mobile-all-software-item">
          <Link
            className="header-nav-link mobile-all-software-link"
            href="/software"
            aria-current={pathname?.startsWith("/software") ? "page" : undefined}
          >
            All Softwares
          </Link>
        </li>
        <li
          className={`nav-disclosure mobile-category-nav${openMenu === MOBILE_CATEGORIES_MENU ? " is-open" : ""}`}
        >
          <button
            type="button"
            aria-expanded={openMenu === MOBILE_CATEGORIES_MENU}
            aria-haspopup="true"
            aria-current={pathname?.startsWith("/categories") ? "page" : undefined}
            onClick={() =>
              setOpenMenu((current) =>
                current === MOBILE_CATEGORIES_MENU ? null : MOBILE_CATEGORIES_MENU,
              )
            }
          >
            Categories {chevron}
          </button>
          {openMenu === MOBILE_CATEGORIES_MENU ? (
            <div className="nav-menu category-menu">
              <div className="nav-menu-heading">
                <p className="nav-menu-kicker">What problem are you solving?</p>
                <p>Start with a business need, then explore the software built for it.</p>
              </div>
              {categoryGroups.length > 0 ? (
                <div className="nav-category-groups">
                  {categoryGroups.map((group) => (
                    <section key={group.name}>
                      <p className="nav-menu-label">{group.name}</p>
                      {group.categories.slice(0, 4).map((category) => (
                        <Link
                          key={category.slug}
                          href={`/categories/${encodeURIComponent(category.slug)}`}
                        >
                          {category.name} <span aria-hidden="true">→</span>
                        </Link>
                      ))}
                    </section>
                  ))}
                </div>
              ) : (
                <p className="nav-menu-empty">Explore software grouped around business needs.</p>
              )}
              <Link className="nav-menu-all" href="/categories">
                View all categories <span aria-hidden="true">→</span>
              </Link>
            </div>
          ) : null}
        </li>
      </ul>
    </div>
  );
}
