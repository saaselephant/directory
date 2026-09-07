"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export function FeaturedSoftwareShelf({ children }: { children: ReactNode }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateControls = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    setCanScrollLeft(viewport.scrollLeft > 1);
    setCanScrollRight(viewport.scrollLeft + viewport.clientWidth < viewport.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const frame = requestAnimationFrame(updateControls);
    const observer = new ResizeObserver(updateControls);
    observer.observe(viewport);
    viewport.addEventListener("scroll", updateControls, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      viewport.removeEventListener("scroll", updateControls);
    };
  }, [updateControls]);

  function scroll(direction: -1 | 1) {
    const viewport = viewportRef.current;
    const card = viewport?.querySelector<HTMLElement>(".catalog-card");
    if (!viewport || !card) return;
    const gap = Number.parseFloat(getComputedStyle(viewport).columnGap) || 0;
    viewport.scrollBy({ left: direction * (card.offsetWidth + gap), behavior: "smooth" });
  }

  return (
    <div className="featured-shelf">
      {canScrollLeft ? (
        <button
          aria-label="Scroll featured software left"
          className="featured-shelf-control is-left"
          onClick={() => scroll(-1)}
          type="button"
        >
          <span aria-hidden="true">←</span>
        </button>
      ) : null}
      <div className="featured-shelf-viewport" ref={viewportRef}>
        {children}
      </div>
      {canScrollRight ? (
        <button
          aria-label="Scroll featured software right"
          className="featured-shelf-control is-right"
          onClick={() => scroll(1)}
          type="button"
        >
          <span aria-hidden="true">→</span>
        </button>
      ) : null}
    </div>
  );
}
