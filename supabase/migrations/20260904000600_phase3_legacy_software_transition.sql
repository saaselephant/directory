-- SaaSElephant V1 Phase 3: controlled transition of the reviewed 43 legacy records.
-- Preparation only. This migration creates vendors and initializes editorial state;
-- it does not publish software or replace any legacy field.

begin;

do $$
declare
  software_count bigint;
  vendor_count bigint;
  normalized_vendor_count bigint;
  generated_nonblank_slug_count bigint;
  generated_slug_count bigint;
begin
  select count(*) into software_count from public.software;
  if software_count <> 43 then
    raise exception 'expected 43 software rows, found %', software_count;
  end if;

  select count(*) into vendor_count from public.vendors;
  if vendor_count <> 0 then
    raise exception 'expected an empty vendors table, found % rows', vendor_count;
  end if;

  if exists (select 1 from public.software where status is distinct from 'Candidate') then
    raise exception 'expected every legacy software row to have status Candidate';
  end if;

  if exists (select 1 from public.software where vendor_id is not null) then
    raise exception 'expected every software.vendor_id to be null';
  end if;

  if exists (select 1 from public.software where publication_status is not null) then
    raise exception 'expected every software.publication_status to be null';
  end if;

  if exists (select 1 from public.software where verification_status is not null) then
    raise exception 'expected every software.verification_status to be null';
  end if;

  if exists (select 1 from public.software where vendor is null or btrim(vendor) = '') then
    raise exception 'all legacy software.vendor values must be nonblank';
  end if;

  select count(distinct lower(regexp_replace(btrim(vendor), '\s+', ' ', 'g')))
  into normalized_vendor_count
  from public.software;

  if normalized_vendor_count <> 41 then
    raise exception 'expected 41 normalized vendor groups, found %', normalized_vendor_count;
  end if;

  with canonical_vendors as (
    select distinct lower(regexp_replace(btrim(vendor), '\s+', ' ', 'g')) as canonical_name
    from public.software
  ), generated_slugs as (
    select
      trim(both '-' from regexp_replace(canonical_name, '[^a-z0-9]+', '-', 'g')) as slug
    from canonical_vendors
  )
  select
    count(*) filter (where nullif(slug, '') is not null),
    count(distinct slug)
  into generated_nonblank_slug_count, generated_slug_count
  from generated_slugs;

  if generated_nonblank_slug_count <> 41 then
    raise exception 'readable vendor slug generation did not produce 41 nonblank slugs';
  end if;

  if generated_slug_count <> 41 then
    raise exception 'readable vendor slug generation did not produce 41 unique slugs';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger
    where tgrelid = 'public.software'::regclass
      and tgname = 'saaselephant_software_updated_at'
      and not tgisinternal
      and tgenabled <> 'D'
  ) then
    raise exception 'expected enabled trigger saaselephant_software_updated_at';
  end if;
end;
$$;

create temporary table saaselephant_legacy_software_snapshot
on commit drop
as
select
  software_id,
  to_jsonb(software) - array[
    'vendor_id',
    'publication_status',
    'verification_status'
  ] as preserved_data
from public.software;

with vendor_candidates as (
  select distinct on (lower(regexp_replace(btrim(vendor), '\s+', ' ', 'g')))
    vendor as vendor_name,
    lower(regexp_replace(btrim(vendor), '\s+', ' ', 'g')) as canonical_name
  from public.software
  order by
    lower(regexp_replace(btrim(vendor), '\s+', ' ', 'g')),
    software_id
)
insert into public.vendors (
  vendor_name,
  canonical_name,
  slug,
  website_url,
  status
)
select
  vendor_name,
  canonical_name,
  trim(both '-' from regexp_replace(canonical_name, '[^a-z0-9]+', '-', 'g')),
  null,
  'active'::public.saaselephant_record_status
from vendor_candidates;

alter table public.software disable trigger saaselephant_software_updated_at;

update public.software as software
set vendor_id = vendors.vendor_id
from public.vendors as vendors
where software.vendor_id is null
  and lower(regexp_replace(btrim(software.vendor), '\s+', ' ', 'g')) = vendors.canonical_name;

update public.software
set
  publication_status = 'in_review'::public.saaselephant_publication_status,
  verification_status = 'needs_verification'::public.saaselephant_verification_status
where status = 'Candidate'
  and publication_status is null
  and verification_status is null;

alter table public.software enable trigger saaselephant_software_updated_at;

do $$
declare
  software_count bigint;
  vendor_count bigint;
begin
  select count(*) into software_count from public.software;
  if software_count <> 43 then
    raise exception 'postcondition failed: expected 43 software rows, found %', software_count;
  end if;

  select count(*) into vendor_count from public.vendors;
  if vendor_count <> 41 then
    raise exception 'postcondition failed: expected 41 vendors, found %', vendor_count;
  end if;

  if (select count(*) from public.software where vendor_id is not null) <> 43 then
    raise exception 'postcondition failed: not all software rows have vendor_id';
  end if;

  if exists (
    select 1
    from public.software as software
    left join public.vendors as vendors on vendors.vendor_id = software.vendor_id
    where software.vendor_id is not null and vendors.vendor_id is null
  ) then
    raise exception 'postcondition failed: orphan software.vendor_id detected';
  end if;

  if (select count(*) from public.software
      where status = 'Candidate' and publication_status = 'in_review') <> 43 then
    raise exception 'postcondition failed: Candidate publication transition is incomplete';
  end if;

  if (select count(*) from public.software
      where verification_status = 'needs_verification') <> 43 then
    raise exception 'postcondition failed: verification transition is incomplete';
  end if;

  if exists (select 1 from public.software where publication_status = 'published') then
    raise exception 'postcondition failed: software was automatically published';
  end if;

  if exists (select 1 from public.software where vendor is null or btrim(vendor) = '') then
    raise exception 'postcondition failed: a legacy vendor value is blank';
  end if;

  if exists (select 1 from public.software where slug is null or btrim(slug) = '') then
    raise exception 'postcondition failed: a legacy software slug is blank';
  end if;

  if exists (
    select software_id, preserved_data
    from saaselephant_legacy_software_snapshot
    except
    select
      software_id,
      to_jsonb(software) - array[
        'vendor_id',
        'publication_status',
        'verification_status'
      ]
    from public.software
  ) or exists (
    select
      software_id,
      to_jsonb(software) - array[
        'vendor_id',
        'publication_status',
        'verification_status'
      ]
    from public.software
    except
    select software_id, preserved_data
    from saaselephant_legacy_software_snapshot
  ) then
    raise exception 'postcondition failed: protected legacy software data changed';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger
    where tgrelid = 'public.software'::regclass
      and tgname = 'saaselephant_software_updated_at'
      and not tgisinternal
      and tgenabled <> 'D'
  ) then
    raise exception 'postcondition failed: software timestamp trigger is not enabled';
  end if;
end;
$$;

commit;
