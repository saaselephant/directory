-- SaaSElephant V1 Phase 2: namespaced types and timestamp helper.
-- PREPARATION ONLY. Preflight must confirm these names are unused before execution.

begin;

create type public.saaselephant_publication_status as enum (
  'draft', 'in_review', 'published', 'archived'
);

create type public.saaselephant_verification_status as enum (
  'needs_verification', 'pending', 'verified', 'failed', 'stale'
);

create type public.saaselephant_record_status as enum (
  'active', 'inactive', 'archived'
);

create type public.saaselephant_platform_role as enum (
  'platform_admin', 'editor', 'affiliate_manager', 'analyst'
);

create type public.saaselephant_entity_type as enum (
  'software', 'category', 'vendor', 'affiliate_program', 'affiliate_link',
  'pricing', 'feature', 'comparison_page', 'media_asset', 'user_role',
  'affiliate_click', 'affiliate_conversion'
);

create function public.saaselephant_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.saaselephant_set_updated_at() is
  'Maintains timestamptz updated_at values for SaaSElephant Phase 2 objects.';

commit;
