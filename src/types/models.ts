declare const applicationIdBrand: unique symbol;

export type ApplicationId<Entity extends string> = string & {
  readonly [applicationIdBrand]: Entity;
};

export type SoftwareId = ApplicationId<"software">;
export type CategoryId = ApplicationId<"category">;
export type AffiliateProgramId = ApplicationId<"affiliate_program">;

export interface PublicCategory {
  slug: string;
  name: string;
  description: string | null;
}

export interface SoftwareCatalogItem {
  id: SoftwareId;
  slug: string;
  name: string;
  description: string;
  bestFor: string | null;
  pricing: string | null;
  hasFreePlan: boolean;
  hasFreeTrial: boolean;
  websiteUrl: string;
  vendor: {
    id: string | null;
    name: string;
    slug: string | null;
    websiteUrl: string | null;
  };
}
