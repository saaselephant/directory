import type { PublicationStatus, VerificationStatus } from "./database";

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

export interface AdminSoftwareReviewItem {
  id: SoftwareId;
  slug: string;
  name: string;
  vendorName: string;
  publicationStatus: PublicationStatus;
  verificationStatus: VerificationStatus | null;
}

export interface SoftwareVerificationEvidence {
  sourceUrl: string;
  sourceReference?: string | null;
  notes?: string | null;
}

export interface AdminCategoryReviewItem {
  id: CategoryId;
  slug: string;
  name: string;
  publicationStatus: PublicationStatus;
}

export interface AdminDashboardModel {
  summary: {
    softwareInReview: number;
    softwarePublished: number;
    softwareNeedsVerification: number;
    categoriesInReview: number;
    categoriesPublished: number;
  };
  softwareInReview: AdminSoftwareReviewItem[];
  softwarePublished: AdminSoftwareReviewItem[];
  categoriesInReview: AdminCategoryReviewItem[];
  categoriesPublished: AdminCategoryReviewItem[];
}

export interface SoftwareReview {
  id: string;
  name: string;
  slug: string | null;
  vendorName: string | null;
  legacyVendor: string | null;
  websiteUrl: string | null;
  shortDescription: string | null;
  fullDescription: string | null;
  bestFor: string | null;
  pricing: string | null;
  freePlan: boolean | null;
  freeTrial: boolean | null;
  publicationStatus: PublicationStatus | null;
  verificationStatus: VerificationStatus | null;
  verifiedAt: string | null;
  categories: Array<{
    id: string;
    name: string;
    slug: string | null;
    publicationStatus: PublicationStatus | null;
  }>;
}
export interface SoftwareReviewEvent {
  result: VerificationStatus;
  verifiedAt: string;
  sourceUrl: string | null;
  sourceReference: string | null;
  notes: string | null;
  reason: string | null;
}
