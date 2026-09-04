-- SaaSElephant V1 Phase 2: new core tables, created empty and deny-by-default.
-- CTAS inherits existing identifier expression types instead of guessing them.

begin;

create table public.features (
  feature_id uuid primary key default gen_random_uuid(),
  feature_name text not null,
  slug text not null,
  description text,
  status public.saaselephant_record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saaselephant_features_name_not_blank check (btrim(feature_name) <> ''),
  constraint saaselephant_features_slug_not_blank check (btrim(slug) <> ''),
  constraint saaselephant_features_slug_uq unique (slug)
);
alter table public.features enable row level security;
revoke all on table public.features from anon, authenticated;

create table public.media_assets (
  media_asset_id uuid primary key default gen_random_uuid(),
  storage_bucket text,
  storage_path text,
  external_url text,
  media_type text not null,
  alt_text text,
  width integer,
  height integer,
  metadata jsonb not null default '{}'::jsonb,
  status public.saaselephant_record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saaselephant_media_location_present check (
    (storage_bucket is not null and storage_path is not null) or external_url is not null
  ),
  constraint saaselephant_media_external_http check (
    external_url is null or external_url ~* '^https?://'
  ),
  constraint saaselephant_media_dimensions_positive check (
    (width is null or width > 0) and (height is null or height > 0)
  )
);
alter table public.media_assets enable row level security;
revoke all on table public.media_assets from anon, authenticated;

create table public.affiliate_links as
select s.software_id, a.affiliate_id as affiliate_program_id
from public.software as s
cross join public.affiliate_programs as a
with no data;

alter table public.affiliate_links
  alter column software_id set not null,
  add column affiliate_link_id uuid not null default gen_random_uuid(),
  add column destination_url text not null,
  add column canonical_destination_url text not null,
  add column network text,
  add column external_reference text,
  add column legacy_source_key text,
  add column tracking_metadata jsonb not null default '{}'::jsonb,
  add column priority integer not null default 0,
  add column status public.saaselephant_record_status not null default 'active',
  add column verification_status public.saaselephant_verification_status not null default 'pending',
  add column valid_from timestamptz,
  add column valid_until timestamptz,
  add column verified_at timestamptz,
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now(),
  add primary key (affiliate_link_id),
  add constraint saaselephant_affiliate_links_destination_http
    check (destination_url ~* '^https?://'),
  add constraint saaselephant_affiliate_links_canonical_http
    check (canonical_destination_url ~* '^https?://'),
  add constraint saaselephant_affiliate_links_valid_window
    check (valid_until is null or valid_from is null or valid_until > valid_from),
  add constraint saaselephant_affiliate_links_verified_time
    check (verification_status <> 'verified' or verified_at is not null),
  add constraint saaselephant_affiliate_links_legacy_source_uq unique (legacy_source_key),
  add constraint saaselephant_affiliate_links_software_fk foreign key (software_id)
    references public.software(software_id) on delete cascade,
  add constraint saaselephant_affiliate_links_program_fk foreign key (affiliate_program_id)
    references public.affiliate_programs(affiliate_id) on delete set null;
alter table public.affiliate_links enable row level security;
revoke all on table public.affiliate_links from anon, authenticated;

create table public.software_features as
select software_id from public.software with no data;
alter table public.software_features
  alter column software_id set not null,
  add column feature_id uuid not null,
  add column notes text,
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now(),
  add primary key (software_id, feature_id),
  add constraint saaselephant_software_features_software_fk foreign key (software_id)
    references public.software(software_id) on delete cascade,
  add constraint saaselephant_software_features_feature_fk foreign key (feature_id)
    references public.features(feature_id) on delete cascade;
alter table public.software_features enable row level security;
revoke all on table public.software_features from anon, authenticated;

create table public.software_relationships as
select software_id as source_software_id, software_id as target_software_id
from public.software with no data;
alter table public.software_relationships
  alter column source_software_id set not null,
  alter column target_software_id set not null,
  add column software_relationship_id uuid not null default gen_random_uuid(),
  add column relationship_type text not null,
  add column rank integer not null default 0,
  add column metadata jsonb not null default '{}'::jsonb,
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now(),
  add primary key (software_relationship_id),
  add constraint saaselephant_relationship_distinct
    check (source_software_id <> target_software_id),
  add constraint saaselephant_relationship_source_fk foreign key (source_software_id)
    references public.software(software_id) on delete cascade,
  add constraint saaselephant_relationship_target_fk foreign key (target_software_id)
    references public.software(software_id) on delete cascade,
  add constraint saaselephant_relationship_uq unique (
    source_software_id, target_software_id, relationship_type
  );
alter table public.software_relationships enable row level security;
revoke all on table public.software_relationships from anon, authenticated;

create table public.comparison_pages (
  comparison_page_id uuid primary key default gen_random_uuid(),
  slug text not null,
  title text not null,
  summary text,
  publication_status public.saaselephant_publication_status not null default 'draft',
  seo_title text,
  seo_meta_description text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saaselephant_comparison_slug_uq unique (slug),
  constraint saaselephant_comparison_slug_not_blank check (btrim(slug) <> '')
);
alter table public.comparison_pages enable row level security;
revoke all on table public.comparison_pages from anon, authenticated;

create table public.comparison_page_products as
select software_id from public.software with no data;
alter table public.comparison_page_products
  alter column software_id set not null,
  add column comparison_page_id uuid not null,
  add column sort_order integer not null default 0,
  add column editorial_note text,
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now(),
  add primary key (comparison_page_id, software_id),
  add constraint saaselephant_comparison_products_page_fk foreign key (comparison_page_id)
    references public.comparison_pages(comparison_page_id) on delete cascade,
  add constraint saaselephant_comparison_products_software_fk foreign key (software_id)
    references public.software(software_id) on delete cascade;
alter table public.comparison_page_products enable row level security;
revoke all on table public.comparison_page_products from anon, authenticated;

create table public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.saaselephant_platform_role not null,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (user_id, role),
  constraint saaselephant_user_roles_revocation_order
    check (revoked_at is null or revoked_at >= granted_at)
);
alter table public.user_roles enable row level security;
revoke all on table public.user_roles from anon, authenticated;

create table public.affiliate_clicks (
  affiliate_click_id uuid primary key default gen_random_uuid(),
  affiliate_link_id uuid not null references public.affiliate_links(affiliate_link_id),
  occurred_at timestamptz not null default now(),
  attribution_id uuid not null default gen_random_uuid(),
  session_reference text,
  referrer_url text,
  landing_path text,
  user_agent_family text,
  ip_hash text,
  ip_hash_expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint saaselephant_clicks_attribution_uq unique (attribution_id),
  constraint saaselephant_clicks_ip_retention
    check (ip_hash is null or ip_hash_expires_at is not null)
);
comment on column public.affiliate_clicks.ip_hash is
  'Optional keyed hash for short-lived abuse prevention; never store a raw IP address.';
alter table public.affiliate_clicks enable row level security;
revoke all on table public.affiliate_clicks from anon, authenticated;

create table public.affiliate_conversions (
  affiliate_conversion_id uuid primary key default gen_random_uuid(),
  affiliate_click_id uuid references public.affiliate_clicks(affiliate_click_id) on delete set null,
  affiliate_link_id uuid references public.affiliate_links(affiliate_link_id) on delete set null,
  network text not null,
  external_event_id text,
  external_reference text,
  order_id text,
  subscription_reference text,
  customer_reference text,
  is_recurring boolean not null default false,
  commission_period_start date,
  commission_period_end date,
  installment_sequence integer,
  commission_amount numeric(20, 6),
  commission_currency text,
  conversion_status text not null,
  import_batch_id uuid,
  payload_digest text,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint saaselephant_conversions_identity_present
    check (external_event_id is not null or payload_digest is not null),
  constraint saaselephant_conversions_amount_nonnegative
    check (commission_amount is null or commission_amount >= 0),
  constraint saaselephant_conversions_currency_code
    check (commission_currency is null or commission_currency ~ '^[A-Z]{3}$'),
  constraint saaselephant_conversions_period_order
    check (commission_period_end is null or commission_period_start is null
      or commission_period_end >= commission_period_start),
  constraint saaselephant_conversions_installment_positive
    check (installment_sequence is null or installment_sequence > 0)
);
alter table public.affiliate_conversions enable row level security;
revoke all on table public.affiliate_conversions from anon, authenticated;

create table public.verification_events (
  verification_event_id uuid primary key default gen_random_uuid(),
  entity_type public.saaselephant_entity_type not null,
  entity_id text not null,
  subject text not null,
  result public.saaselephant_verification_status not null,
  verified_at timestamptz not null default now(),
  source_url text,
  source_reference text,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_identity_snapshot text,
  actor_system text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint saaselephant_verification_entity_id_not_blank check (btrim(entity_id) <> ''),
  constraint saaselephant_verification_source_http
    check (source_url is null or source_url ~* '^https?://')
);
comment on column public.verification_events.entity_id is
  'Polymorphic historical reference; it may intentionally outlive its source row.';
alter table public.verification_events enable row level security;
revoke all on table public.verification_events from anon, authenticated;

create table public.audit_log (
  audit_log_id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_identity_snapshot text,
  actor_system text,
  action text not null,
  entity_type public.saaselephant_entity_type not null,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  request_id uuid,
  metadata jsonb not null default '{}'::jsonb
);
comment on column public.audit_log.entity_id is
  'Polymorphic historical reference; audit history intentionally survives source deletion.';
alter table public.audit_log enable row level security;
revoke all on table public.audit_log from anon, authenticated;
revoke all on sequence public.audit_log_audit_log_id_seq from anon, authenticated;

alter table public.software
  add constraint saaselephant_software_logo_media_fk foreign key (logo_media_asset_id)
    references public.media_assets(media_asset_id) on delete set null not valid,
  add constraint saaselephant_software_featured_media_fk foreign key (featured_media_asset_id)
    references public.media_assets(media_asset_id) on delete set null not valid;

commit;
