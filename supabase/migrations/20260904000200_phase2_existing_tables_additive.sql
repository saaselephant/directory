-- SaaSElephant V1 Phase 2: additive evolution of preserved tables plus vendors.
-- STOP if preflight reports an incompatible same-name column/object.
-- No row is backfilled, renamed, or deleted here.

begin;

create table public.vendors (
  vendor_id uuid primary key default gen_random_uuid(),
  vendor_name text not null,
  canonical_name text not null,
  slug text not null,
  website_url text,
  status public.saaselephant_record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saaselephant_vendors_name_not_blank check (btrim(vendor_name) <> ''),
  constraint saaselephant_vendors_canonical_not_blank check (btrim(canonical_name) <> ''),
  constraint saaselephant_vendors_slug_not_blank check (btrim(slug) <> ''),
  constraint saaselephant_vendors_canonical_uq unique (canonical_name),
  constraint saaselephant_vendors_slug_uq unique (slug),
  constraint saaselephant_vendors_website_http check (
    website_url is null or website_url ~* '^https?://'
  )
);

alter table public.vendors enable row level security;
revoke all on table public.vendors from anon, authenticated;

alter table public.software
  add column if not exists vendor_id uuid,
  add column if not exists slug text,
  add column if not exists publication_status public.saaselephant_publication_status,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz,
  add column if not exists verified_at timestamptz,
  add column if not exists verification_status public.saaselephant_verification_status,
  add column if not exists seo_title text,
  add column if not exists seo_meta_description text,
  add column if not exists logo_media_asset_id uuid,
  add column if not exists featured_media_asset_id uuid;

alter table public.categories
  add column if not exists slug text,
  add column if not exists publication_status public.saaselephant_publication_status,
  add column if not exists sort_order integer,
  add column if not exists seo_title text,
  add column if not exists seo_meta_description text,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;

alter table public.software_categories
  add column if not exists primary_category boolean,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;

alter table public.affiliate_programs
  add column if not exists network text,
  add column if not exists external_program_reference text,
  add column if not exists program_terms jsonb,
  add column if not exists verified_at timestamptz,
  add column if not exists verification_status public.saaselephant_verification_status,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;

alter table public.software
  add constraint saaselephant_software_vendor_fk
  foreign key (vendor_id) references public.vendors(vendor_id)
  on delete set null not valid;

create trigger saaselephant_vendors_updated_at
before update on public.vendors
for each row execute function public.saaselephant_set_updated_at();

commit;
