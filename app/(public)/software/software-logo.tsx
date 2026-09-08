"use client";

import { useState } from "react";

import type { SoftwareLogoDescriptor } from "@/types/models";

interface SoftwareLogoProps {
  name: string;
  logo?: SoftwareLogoDescriptor | null;
}

export function SoftwareLogo({ name, logo }: SoftwareLogoProps) {
  const initial = Array.from(name.trim())[0]?.toLocaleUpperCase() ?? "?";
  const logoSrc = logo?.src.trim();
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showLogo = Boolean(logoSrc && logoSrc !== failedSrc);

  return (
    <span className="product-monogram">
      {showLogo ? (
        <img
          className="software-logo-image"
          src={logoSrc}
          alt={logo?.alt ?? ""}
          loading="lazy"
          onError={() => setFailedSrc(logoSrc ?? null)}
        />
      ) : (
        <span aria-hidden="true">{initial}</span>
      )}
    </span>
  );
}
