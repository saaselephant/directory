'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

export default function AnalyticsTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).gtag) {
      const url = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : '');
      (window as any).gtag('config', 'G-0SSQ26C8J3', {
        page_path: url,
      });
    }
  }, [pathname, searchParams]);

  return null;
}
