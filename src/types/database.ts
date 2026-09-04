/**
 * Provisional Phase 2 contract. Do not use these types for database I/O until the
 * production preflight confirms legacy ID types and Supabase-generated Database
 * types replace the provisional ID markers below.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

declare const provisionalIdBrand: unique symbol;
declare const uuidBrand: unique symbol;
declare const exactNumericBrand: unique symbol;
declare const int8Brand: unique symbol;

export type ProvisionalLegacyId<Entity extends string> = {
  readonly [provisionalIdBrand]: Entity;
};
export type Uuid = string & { readonly [uuidBrand]: "uuid" };
export type ExactNumeric = string & { readonly [exactNumericBrand]: "numeric" };
export type Int8String = string & { readonly [int8Brand]: "int8" };

export type SoftwareId = ProvisionalLegacyId<"software">;
export type CategoryId = ProvisionalLegacyId<"category">;
export type AffiliateProgramId = ProvisionalLegacyId<"affiliate_program">;

export type PublicationStatus = "draft" | "in_review" | "published" | "archived";
export type VerificationStatus = "needs_verification" | "pending" | "verified" | "failed" | "stale";
export type RecordStatus = "active" | "inactive" | "archived";
export type PlatformRole = "platform_admin" | "editor" | "affiliate_manager" | "analyst";
export type EntityType =
  | "software"
  | "category"
  | "vendor"
  | "affiliate_program"
  | "affiliate_link"
  | "pricing"
  | "feature"
  | "comparison_page"
  | "media_asset"
  | "user_role"
  | "affiliate_click"
  | "affiliate_conversion";

export interface SoftwareRow {
  software_id: SoftwareId;
  vendor_id: Uuid | null;
  slug: string | null;
  publication_status: PublicationStatus | null;
  verification_status: VerificationStatus | null;
  verified_at: string | null;
  seo_title: string | null;
  seo_meta_description: string | null;
  logo_media_asset_id: Uuid | null;
  featured_media_asset_id: Uuid | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface CategoryRow {
  category_id: CategoryId;
  slug: string | null;
  publication_status: PublicationStatus | null;
  sort_order: number | null;
  seo_title: string | null;
  seo_meta_description: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface SoftwareCategoryRow {
  software_id: SoftwareId;
  category_id: CategoryId;
  primary_category: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface AffiliateProgramRow {
  affiliate_program_id: AffiliateProgramId;
  software_id: SoftwareId;
  network: string | null;
  external_program_reference: string | null;
  program_terms: Json | null;
  verified_at: string | null;
  verification_status: VerificationStatus | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface VendorRow {
  vendor_id: Uuid;
  vendor_name: string;
  canonical_name: string;
  slug: string;
  website_url: string | null;
  status: RecordStatus;
  created_at: string;
  updated_at: string;
}

export interface AffiliateLinkRow {
  software_id: SoftwareId;
  affiliate_program_id: AffiliateProgramId | null;
  affiliate_link_id: Uuid;
  destination_url: string;
  canonical_destination_url: string;
  network: string | null;
  external_reference: string | null;
  legacy_source_key: string | null;
  tracking_metadata: Json;
  priority: number;
  status: RecordStatus;
  verification_status: VerificationStatus;
  valid_from: string | null;
  valid_until: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FeatureRow {
  feature_id: Uuid;
  feature_name: string;
  slug: string;
  description: string | null;
  status: RecordStatus;
  created_at: string;
  updated_at: string;
}

export interface SoftwareFeatureRow {
  software_id: SoftwareId;
  feature_id: Uuid;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SoftwareRelationshipRow {
  source_software_id: SoftwareId;
  target_software_id: SoftwareId;
  software_relationship_id: Uuid;
  relationship_type: string;
  rank: number;
  metadata: Json;
  created_at: string;
  updated_at: string;
}

export interface ComparisonPageRow {
  comparison_page_id: Uuid;
  slug: string;
  title: string;
  summary: string | null;
  publication_status: PublicationStatus;
  seo_title: string | null;
  seo_meta_description: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ComparisonPageProductRow {
  software_id: SoftwareId;
  comparison_page_id: Uuid;
  sort_order: number;
  editorial_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface MediaAssetRow {
  media_asset_id: Uuid;
  storage_bucket: string | null;
  storage_path: string | null;
  external_url: string | null;
  media_type: string;
  alt_text: string | null;
  width: number | null;
  height: number | null;
  metadata: Json;
  status: RecordStatus;
  created_at: string;
  updated_at: string;
}

export interface UserRoleRow {
  user_id: Uuid;
  role: PlatformRole;
  granted_by: Uuid | null;
  granted_at: string;
  revoked_at: string | null;
}

export interface AffiliateClickRow {
  affiliate_click_id: Uuid;
  affiliate_link_id: Uuid;
  occurred_at: string;
  attribution_id: Uuid;
  session_reference: string | null;
  referrer_url: string | null;
  landing_path: string | null;
  user_agent_family: string | null;
  ip_hash: string | null;
  ip_hash_expires_at: string | null;
  metadata: Json;
}

export interface AffiliateConversionRow {
  affiliate_conversion_id: Uuid;
  affiliate_click_id: Uuid | null;
  affiliate_link_id: Uuid | null;
  network: string;
  external_event_id: string | null;
  external_reference: string | null;
  order_id: string | null;
  subscription_reference: string | null;
  customer_reference: string | null;
  is_recurring: boolean;
  commission_period_start: string | null;
  commission_period_end: string | null;
  installment_sequence: number | null;
  commission_amount: ExactNumeric | null;
  commission_currency: string | null;
  conversion_status: string;
  import_batch_id: Uuid | null;
  payload_digest: string | null;
  occurred_at: string;
  received_at: string;
  metadata: Json;
}

export interface VerificationEventRow {
  verification_event_id: Uuid;
  entity_type: EntityType;
  entity_id: string;
  subject: string;
  result: VerificationStatus;
  verified_at: string;
  source_url: string | null;
  source_reference: string | null;
  actor_user_id: Uuid | null;
  actor_identity_snapshot: string | null;
  actor_system: string | null;
  details: Json;
  created_at: string;
}

export interface AuditLogRow {
  audit_log_id: Int8String;
  occurred_at: string;
  actor_user_id: Uuid | null;
  actor_identity_snapshot: string | null;
  actor_system: string | null;
  action: string;
  entity_type: EntityType;
  entity_id: string | null;
  before_data: Json | null;
  after_data: Json | null;
  request_id: Uuid | null;
  metadata: Json;
}

type InsertShape<Row, Required extends keyof Row> = Pick<Row, Required> &
  Partial<Omit<Row, Required>>;
type TableContract<Row, RequiredInsert extends keyof Row> = {
  Row: Row;
  Insert: InsertShape<Row, RequiredInsert>;
  Update: Partial<Row>;
};

export interface Phase2DatabaseContract {
  Tables: {
    software: TableContract<SoftwareRow, "software_id">;
    categories: TableContract<CategoryRow, "category_id">;
    software_categories: TableContract<SoftwareCategoryRow, "software_id" | "category_id">;
    affiliate_programs: TableContract<AffiliateProgramRow, "affiliate_program_id" | "software_id">;
    vendors: TableContract<VendorRow, "vendor_name" | "canonical_name" | "slug">;
    affiliate_links: TableContract<
      AffiliateLinkRow,
      "software_id" | "destination_url" | "canonical_destination_url"
    >;
    features: TableContract<FeatureRow, "feature_name" | "slug">;
    software_features: TableContract<SoftwareFeatureRow, "software_id" | "feature_id">;
    software_relationships: TableContract<
      SoftwareRelationshipRow,
      "source_software_id" | "target_software_id" | "relationship_type"
    >;
    comparison_pages: TableContract<ComparisonPageRow, "slug" | "title">;
    comparison_page_products: TableContract<
      ComparisonPageProductRow,
      "software_id" | "comparison_page_id"
    >;
    media_assets: TableContract<MediaAssetRow, "media_type">;
    user_roles: TableContract<UserRoleRow, "user_id" | "role">;
    affiliate_clicks: TableContract<AffiliateClickRow, "affiliate_link_id">;
    affiliate_conversions: TableContract<
      AffiliateConversionRow,
      "network" | "conversion_status" | "occurred_at"
    >;
    verification_events: TableContract<
      VerificationEventRow,
      "entity_type" | "entity_id" | "subject" | "result"
    >;
    audit_log: TableContract<AuditLogRow, "action" | "entity_type">;
  };
  Functions: {
    saaselephant_select_verified_affiliate_link: {
      Args: { requested_software_id: SoftwareId; at_time?: string };
      Returns: AffiliateLinkRow[];
    };
  };
}
