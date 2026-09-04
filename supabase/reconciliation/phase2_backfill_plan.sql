-- MANUAL/DEFERRED. This file is outside supabase/migrations and defaults to ROLLBACK.
-- Run only after archived preflight output, review, backup, and count approval.

begin;

create temporary table saaselephant_migration_count_guard on commit drop as
select count(*)::bigint as approved_software_count from public.software;

-- Stable full-ID hex is injective for the existing ID text representation. The
-- readable prefix has explicit null/non-ASCII fallbacks and is not the unique key.
update public.software
set slug = coalesce(
    nullif(trim(both '-' from regexp_replace(lower(coalesce(software_name, '')), '[^a-z0-9]+', '-', 'g')), ''),
    'software'
  ) || '--' || encode(convert_to(software_id::text, 'UTF8'), 'hex')
where slug is null or btrim(slug) = '';

update public.categories
set slug = coalesce(
    nullif(trim(both '-' from regexp_replace(lower(coalesce(category_name, '')), '[^a-z0-9]+', '-', 'g')), ''),
    'category'
  ) || '--' || encode(convert_to(category_id::text, 'UTF8'), 'hex')
where slug is null or btrim(slug) = '';

-- Conservative editorial mapping: no legacy row becomes published unless its
-- legacy status is already explicitly "published". Candidate becomes in_review.
update public.software
set publication_status = case
      when lower(coalesce(status::text, '')) = 'published'
        then 'published'::public.saaselephant_publication_status
      when lower(coalesce(status::text, '')) = 'archived'
        then 'archived'::public.saaselephant_publication_status
      when lower(coalesce(status::text, '')) = 'candidate'
        then 'in_review'::public.saaselephant_publication_status
      else 'draft'::public.saaselephant_publication_status
    end,
    verification_status = coalesce(
      verification_status,
      'needs_verification'::public.saaselephant_verification_status
    ),
    created_at = coalesce(created_at, now()),
    updated_at = coalesce(updated_at, now())
where publication_status is null
   or verification_status is null
   or created_at is null
   or updated_at is null;

update public.categories
set publication_status = case
      when lower(coalesce(status::text, '')) = 'published'
        then 'published'::public.saaselephant_publication_status
      when lower(coalesce(status::text, '')) = 'archived'
        then 'archived'::public.saaselephant_publication_status
      when lower(coalesce(status::text, '')) = 'active'
        then 'in_review'::public.saaselephant_publication_status
      else 'draft'::public.saaselephant_publication_status
    end,
    sort_order = coalesce(sort_order, 0),
    created_at = coalesce(created_at, now()),
    updated_at = coalesce(updated_at, now())
where publication_status is null
   or sort_order is null
   or created_at is null
   or updated_at is null;

update public.software_categories
set primary_category = coalesce(primary_category, false),
    created_at = coalesce(created_at, now()),
    updated_at = coalesce(updated_at, now())
where primary_category is null or created_at is null or updated_at is null;

-- Canonical vendor names collapse case and whitespace. A generated UUID is chosen
-- before insert and its complete value disambiguates the slug. Re-runs match the
-- canonical unique key and do not alter existing vendor rows.
with vendor_candidates as (
  select distinct on (lower(regexp_replace(btrim(s.vendor), '\s+', ' ', 'g')))
    btrim(regexp_replace(s.vendor, '\s+', ' ', 'g')) as vendor_name,
    lower(regexp_replace(btrim(s.vendor), '\s+', ' ', 'g')) as canonical_name
  from public.software s
  where s.vendor is not null and btrim(s.vendor) <> ''
  order by lower(regexp_replace(btrim(s.vendor), '\s+', ' ', 'g')), s.software_id::text
), prepared as (
  select gen_random_uuid() as vendor_id, vendor_name, canonical_name
  from vendor_candidates
)
insert into public.vendors (vendor_id, vendor_name, canonical_name, slug)
select vendor_id, vendor_name, canonical_name,
  coalesce(
    nullif(trim(both '-' from regexp_replace(lower(vendor_name), '[^a-z0-9]+', '-', 'g')), ''),
    'vendor'
  ) || '--' || replace(vendor_id::text, '-', '')
from prepared
on conflict (canonical_name) do nothing;

update public.software s
set vendor_id = v.vendor_id
from public.vendors v
where s.vendor_id is null
  and lower(regexp_replace(btrim(s.vendor), '\s+', ' ', 'g')) = v.canonical_name;

-- Canonical URLs preserve path/query case, lowercase scheme/host, and remove only
-- trailing slashes. A stable legacy_source_key plus canonical existence check makes
-- the copy safe after partial execution and on re-run. New links remain pending.
with source_urls as (
  select ap.*,
    btrim(ap.affiliate_url) as trimmed_url,
    substring(btrim(ap.affiliate_url) from '^([^:]+)://') as url_scheme,
    substring(btrim(ap.affiliate_url) from '^[^:]+://([^/?#]+)') as url_host,
    substring(btrim(ap.affiliate_url) from '^[^:]+://[^/?#]+(.*)$') as url_suffix
  from public.affiliate_programs ap
  where lower(coalesce(ap.status::text, '')) = 'active'
    and btrim(coalesce(ap.affiliate_url, '')) ~* '^https?://'
), canonical_urls as (
  select source_urls.*,
    lower(url_scheme) || '://' || lower(url_host)
      || regexp_replace(coalesce(url_suffix, ''), '/+$', '') as canonical_url
  from source_urls
), prepared_links as (
  select canonical_urls.*,
    'affiliate_program:'
      || encode(convert_to(affiliate_program_id::text, 'UTF8'), 'hex') as source_key
  from canonical_urls
)
insert into public.affiliate_links (
  software_id, affiliate_program_id, destination_url, canonical_destination_url,
  network, external_reference, legacy_source_key, priority, status,
  verification_status, verified_at
)
select software_id, affiliate_program_id, trimmed_url, canonical_url,
  network, external_program_reference, source_key, 100,
  'active'::public.saaselephant_record_status,
  'pending'::public.saaselephant_verification_status,
  null
from prepared_links p
where not exists (
  select 1 from public.affiliate_links al
  where al.legacy_source_key = p.source_key
     or (
       al.software_id = p.software_id
       and al.canonical_destination_url = p.canonical_url
     )
)
on conflict (legacy_source_key) do nothing;

-- Abort on unexpected loss. The approved count is captured at transaction start;
-- it is deliberately not hardcoded to the historical baseline of 43.
do $$
declare before_count bigint;
declare after_count bigint;
begin
  select approved_software_count into before_count
  from saaselephant_migration_count_guard;
  select count(*) into after_count from public.software;
  if after_count <> before_count then
    raise exception 'software row count changed: before %, after %', before_count, after_count;
  end if;
end;
$$;

-- Review post-backfill preflight output before changing this final ROLLBACK.
rollback;
