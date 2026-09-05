/**
 * Raw Supabase schema contract derived from the verified production inventory and
 * the applied Phase 2 migrations. Keep application view models in a separate file.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type SoftwareId = string;
export type CategoryId = string;
export type AffiliateProgramId = string;
export type Uuid = string;
export type ExactNumeric = string;
export type Int8String = string;

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
  software_name: string;
  vendor: string;
  website_url: string;
  short_description: string;
  full_description: string | null;
  best_for: string | null;
  key_features: string | null;
  pricing: string | null;
  free_plan: boolean | null;
  free_trial: boolean | null;
  status: string;
  last_verified: string | null;
  vendor_id: Uuid | null;
  slug: string;
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
  category_name: string;
  parent_category_id: CategoryId | null;
  level: number | null;
  slug: string;
  description: string | null;
  status: string;
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
  primary_category: boolean;
  verified_on: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface AffiliateProgramRow {
  affiliate_id: AffiliateProgramId;
  software_id: SoftwareId;
  program_name: string;
  affiliate_program_url: string | null;
  affiliate_network: string | null;
  commission_type: string | null;
  commission: string | null;
  recurring_commission: string | null;
  renewal_terms: string | null;
  cookie_duration: string | null;
  affiliate_url: string | null;
  status: string;
  last_verified: string | null;
  source_url: string | null;
  notes: string | null;
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
type DatabaseRelationship = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne: boolean;
  referencedRelation: string;
  referencedColumns: string[];
};
type TableContract<
  Row,
  RequiredInsert extends keyof Row,
  Relationships extends DatabaseRelationship[] = [],
> = {
  Row: Row;
  Insert: InsertShape<Row, RequiredInsert>;
  Update: Partial<Row>;
  Relationships: Relationships;
};

export interface Database {
  public: {
    Tables: {
      software: TableContract<
        SoftwareRow,
        "software_id",
        [
          {
            foreignKeyName: "saaselephant_software_vendor_fk";
            columns: ["vendor_id"];
            isOneToOne: false;
            referencedRelation: "vendors";
            referencedColumns: ["vendor_id"];
          },
        ]
      >;
      categories: TableContract<CategoryRow, "category_id">;
      software_categories: TableContract<SoftwareCategoryRow, "software_id" | "category_id">;
      affiliate_programs: TableContract<
        AffiliateProgramRow,
        "affiliate_id" | "software_id" | "program_name"
      >;
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
    Views: Record<string, never>;
    Functions: {
      saaselephant_software_outbound: {
        Args: { p_software_slug: string };
        Returns: undefined;
      };
      saaselephant_get_software_review: {
        Args: { p_software_id: string };
        Returns: SoftwareReviewRow[];
      };
      saaselephant_get_software_verification_history: {
        Args: { p_software_id: string };
        Returns: SoftwareReviewHistoryRow[];
      };
      saaselephant_verify_software: {
        Args: {
          p_software_id: SoftwareId;
          p_source_url: string;
          p_source_reference?: string | null;
          p_notes?: string | null;
        };
        Returns: string;
      };
      saaselephant_return_software_to_verification: {
        Args: { p_software_id: SoftwareId; p_reason: string };
        Returns: string;
      };
      saaselephant_select_verified_affiliate_link: {
        Args: { requested_software_id: SoftwareId; at_time?: string };
        Returns: AffiliateLinkRow[];
      };
    };
    Enums: {
      saaselephant_publication_status: PublicationStatus;
      saaselephant_verification_status: VerificationStatus;
      saaselephant_record_status: RecordStatus;
      saaselephant_platform_role: PlatformRole;
      saaselephant_entity_type: EntityType;
    };
    CompositeTypes: Record<string, never>;
  };
}

export interface SoftwareReviewRow {
  software_id: string;
  software_name: string;
  slug: string | null;
  vendor_name: string | null;
  legacy_vendor: string | null;
  website_url: string | null;
  short_description: string | null;
  full_description: string | null;
  best_for: string | null;
  pricing: string | null;
  free_plan: boolean | null;
  free_trial: boolean | null;
  publication_status: PublicationStatus | null;
  verification_status: VerificationStatus | null;
  verified_at: string | null;
  category_id: string | null;
  category_name: string | null;
  category_slug: string | null;
  category_publication_status: PublicationStatus | null;
}
export interface SoftwareReviewHistoryRow {
  result: VerificationStatus;
  verified_at: string;
  source_url: string | null;
  source_reference: string | null;
  notes: string | null;
  reason: string | null;
}
