'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, Suspense } from 'react';

function AnalyticsTrackerComponent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).gtag) {
      const currentSearch = searchParams.toString();
      const url = pathname + (currentSearch ? `?${currentSearch}` : '');
      (window as any).gtag('config', 'G-0SSQ26C8J3', {
        page_path: url,
      });
    }
  }, [pathname, searchParams]);

  return null;
}

export default function AnalyticsTracker() {
  return (
    <Suspense fallback={null}>
      <AnalyticsTrackerComponent />
    </Suspense>
  );
}
