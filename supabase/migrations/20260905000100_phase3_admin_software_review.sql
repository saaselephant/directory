-- Step 14: private, read-only software review. No table grants or data changes.
begin;

create function public.saaselephant_get_software_review(p_software_id text)
returns table (
  software_id text,
  software_name text,
  slug text,
  vendor_name text,
  legacy_vendor text,
  website_url text,
  short_description text,
  full_description text,
  best_for text,
  pricing text,
  free_plan boolean,
  free_trial boolean,
  publication_status public.saaselephant_publication_status,
  verification_status public.saaselephant_verification_status,
  verified_at timestamptz,
  category_id text,
  category_name text,
  category_slug text,
  category_publication_status public.saaselephant_publication_status
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.user_roles as role_row
    where role_row.user_id = auth.uid()
      and role_row.role = 'platform_admin'
      and role_row.revoked_at is null
  ) then
    raise exception 'Access unavailable' using errcode = '42501';
  end if;

  if p_software_id is null or btrim(p_software_id) = ''
     or length(p_software_id) > 200 then
    return;
  end if;

  -- One software, repeated only for its assigned categories; no public-policy filtering.
  return query
  select s.software_id::text, s.software_name::text, s.slug::text,
    v.vendor_name::text, s.vendor::text, s.website_url::text,
    s.short_description::text, s.full_description::text, s.best_for::text,
    s.pricing::text, s.free_plan, s.free_trial,
    s.publication_status, s.verification_status, s.verified_at,
    c.category_id::text, c.category_name::text, c.slug::text, c.publication_status
  from public.software as s
  left join public.vendors as v on v.vendor_id = s.vendor_id
  left join public.software_categories as sc on sc.software_id = s.software_id
  left join public.categories as c on c.category_id = sc.category_id
  where s.software_id = btrim(p_software_id)
  order by c.category_name asc, c.category_id asc;
end
$$;

create function public.saaselephant_get_software_verification_history(p_software_id text)
returns table (
  result public.saaselephant_verification_status,
  verified_at timestamptz,
  source_url text,
  source_reference text,
  notes text,
  reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.user_roles as role_row
    where role_row.user_id = auth.uid()
      and role_row.role = 'platform_admin'
      and role_row.revoked_at is null
  ) then
    raise exception 'Access unavailable' using errcode = '42501';
  end if;

  if p_software_id is null or btrim(p_software_id) = ''
     or length(p_software_id) > 200 then
    return;
  end if;

  return query
  select e.result, e.verified_at, e.source_url, e.source_reference,
    case when pg_catalog.jsonb_typeof(e.details -> 'notes') = 'string'
      then e.details ->> 'notes' else null end,
    case when pg_catalog.jsonb_typeof(e.details -> 'reason') = 'string'
      then e.details ->> 'reason' else null end
  from public.verification_events as e
  where e.entity_type = 'software'
    and e.subject = 'catalogue_information'
    and e.entity_id = btrim(p_software_id)
    and exists (
      select 1 from public.software as s where s.software_id = btrim(p_software_id)
    )
  order by e.verified_at desc, e.verification_event_id desc
  limit 50;
end
$$;

revoke all on function public.saaselephant_get_software_review(text) from public, anon;
revoke all on function public.saaselephant_get_software_verification_history(text) from public, anon;
grant execute on function public.saaselephant_get_software_review(text) to authenticated;
grant execute on function public.saaselephant_get_software_verification_history(text) to authenticated;

commit;
