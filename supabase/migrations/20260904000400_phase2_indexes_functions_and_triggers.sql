-- SaaSElephant V1 Phase 2: safe non-unique indexes, routing function, and
-- namespaced timestamp triggers. No existing trigger is dropped or replaced.

begin;

create index saaselephant_software_vendor_idx on public.software(vendor_id);
create index saaselephant_software_publication_idx
  on public.software(publication_status, software_id);
create index saaselephant_software_verification_idx
  on public.software(verification_status, verified_at);
create index saaselephant_categories_publication_sort_idx
  on public.categories(publication_status, sort_order, category_id);
create index saaselephant_software_categories_category_idx
  on public.software_categories(category_id, software_id);
create index saaselephant_affiliate_programs_verification_idx
  on public.affiliate_programs(verification_status, verified_at);

create index saaselephant_affiliate_links_resolution_idx
  on public.affiliate_links(software_id, priority desc, affiliate_link_id)
  where status = 'active' and verification_status = 'verified';
create index saaselephant_affiliate_links_verification_idx
  on public.affiliate_links(verification_status, verified_at);
create index saaselephant_clicks_link_time_idx
  on public.affiliate_clicks(affiliate_link_id, occurred_at desc);
create index saaselephant_conversions_link_time_idx
  on public.affiliate_conversions(affiliate_link_id, occurred_at desc);
create unique index saaselephant_conversions_network_event_uq
  on public.affiliate_conversions(network, external_event_id)
  where external_event_id is not null;
create unique index saaselephant_conversions_network_digest_uq
  on public.affiliate_conversions(network, payload_digest)
  where payload_digest is not null;
create index saaselephant_conversions_order_idx
  on public.affiliate_conversions(network, order_id)
  where order_id is not null;
create index saaselephant_conversions_subscription_period_idx
  on public.affiliate_conversions(network, subscription_reference, commission_period_start)
  where subscription_reference is not null;
create index saaselephant_verification_entity_time_idx
  on public.verification_events(entity_type, entity_id, verified_at desc);
create index saaselephant_audit_entity_time_idx
  on public.audit_log(entity_type, entity_id, occurred_at desc);

create function public.saaselephant_select_verified_affiliate_link(
  requested_software_id public.software.software_id%type,
  at_time timestamptz default now()
)
returns setof public.affiliate_links
language sql
stable
security invoker
set search_path = ''
as $$
  select link.*
  from public.affiliate_links as link
  where link.software_id = requested_software_id
    and link.status = 'active'
    and link.verification_status = 'verified'
    and link.verified_at is not null
    and (link.valid_from is null or link.valid_from <= at_time)
    and (link.valid_until is null or link.valid_until > at_time)
  order by link.priority desc, link.affiliate_link_id asc
  limit 1;
$$;

revoke execute on function public.saaselephant_select_verified_affiliate_link
  from public, anon, authenticated;

create trigger saaselephant_software_updated_at
before update on public.software
for each row execute function public.saaselephant_set_updated_at();

commit;
create trigger saaselephant_categories_updated_at
before update on public.categories
for each row execute function public.saaselephant_set_updated_at();
create trigger saaselephant_software_categories_updated_at
before update on public.software_categories
for each row execute function public.saaselephant_set_updated_at();
create trigger saaselephant_affiliate_programs_updated_at
before update on public.affiliate_programs
for each row execute function public.saaselephant_set_updated_at();
create trigger saaselephant_affiliate_links_updated_at
before update on public.affiliate_links
for each row execute function public.saaselephant_set_updated_at();
create trigger saaselephant_features_updated_at
before update on public.features
for each row execute function public.saaselephant_set_updated_at();
create trigger saaselephant_media_assets_updated_at
before update on public.media_assets
for each row execute function public.saaselephant_set_updated_at();
create trigger saaselephant_software_features_updated_at
before update on public.software_features
for each row execute function public.saaselephant_set_updated_at();
create trigger saaselephant_software_relationships_updated_at
before update on public.software_relationships
for each row execute function public.saaselephant_set_updated_at();
create trigger saaselephant_comparison_pages_updated_at
before update on public.comparison_pages
for each row execute function public.saaselephant_set_updated_at();
create trigger saaselephant_comparison_products_updated_at
before update on public.comparison_page_products
for each row execute function public.saaselephant_set_updated_at();
