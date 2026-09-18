"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

const MEASUREMENT_ID = "G-0SSQ26C8J3";
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    saaselephantAnalytics?: { previousPath: string | null };
  }
}

export default function AnalyticsTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname || pathname.startsWith("/admin")) return;
    if (!window.saaselephantAnalytics) {
      window.dataLayer ??= [];
      // Google's command queue expects an Arguments object.
      window.gtag = function () {
        // eslint-disable-next-line prefer-rest-params
        window.dataLayer!.push(arguments);
      };
      window.gtag("js", new Date());
      window.gtag("config", MEASUREMENT_ID, {
        send_page_view: false,
        allow_google_signals: false,
        page_location: window.location.origin + pathname,
        page_referrer: "",
      });
      window.saaselephantAnalytics = { previousPath: null };
    }
    const state = window.saaselephantAnalytics;
    if (state.previousPath === pathname) return;
    // Only explicit public pathname views; never search terms, query strings or hashes.
    window.gtag?.("event", "page_view", {
      page_location: window.location.origin + pathname,
      page_path: pathname,
      page_title: document.title,
      page_referrer: state.previousPath ? window.location.origin + state.previousPath : "",
    });
    state.previousPath = pathname;
  }, [pathname]);
  return (
    <Script
      src={`https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`}
      strategy="afterInteractive"
    />
  );
}
