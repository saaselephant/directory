-- SaaSElephant V1 Phase 3: atomic, least-privilege software verification workflow.

begin;

create temporary table saaselephant_step13_baseline on commit drop as
select
  (select count(*) from public.software) as software_count,
  (select count(*) from public.verification_events) as verification_event_count;

do $$
declare
  verification_values text[];
begin
  if to_regclass('public.software') is null
     or to_regclass('public.verification_events') is null
     or to_regclass('public.user_roles') is null then
    raise exception 'precondition failed: required verification tables are missing';
  end if;

  if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.software'::regclass)
     or not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.verification_events'::regclass)
     or not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.user_roles'::regclass) then
    raise exception 'precondition failed: RLS must remain enabled on verification tables';
  end if;

  select array_agg(enumlabel order by enumsortorder)
  into verification_values
  from pg_catalog.pg_enum
  where enumtypid = 'public.saaselephant_verification_status'::regtype;

  if verification_values <> array[
    'needs_verification', 'pending', 'verified', 'failed', 'stale'
  ]::text[] then
    raise exception 'precondition failed: verification status enum has drifted';
  end if;

  if to_regprocedure('public.saaselephant_verify_software(text,text,text,text)') is not null
     or to_regprocedure('public.saaselephant_return_software_to_verification(text,text)') is not null then
    raise exception 'precondition failed: Step 13 verification RPC already exists';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_trigger
    where tgrelid = 'public.software'::regclass
      and tgname = 'saaselephant_software_updated_at'
      and not tgisinternal and tgenabled <> 'D'
  ) then
    raise exception 'precondition failed: software updated_at trigger is unavailable';
  end if;

  if pg_catalog.has_column_privilege(
       'authenticated', 'public.software', 'verification_status', 'UPDATE'
     )
     or pg_catalog.has_column_privilege(
       'authenticated', 'public.software', 'verified_at', 'UPDATE'
     )
     or pg_catalog.has_column_privilege(
       'anon', 'public.software', 'verification_status', 'UPDATE'
     )
     or pg_catalog.has_column_privilege(
       'anon', 'public.software', 'verified_at', 'UPDATE'
     )
     or pg_catalog.has_table_privilege('authenticated', 'public.verification_events', 'INSERT')
     or pg_catalog.has_table_privilege('authenticated', 'public.verification_events', 'UPDATE')
     or pg_catalog.has_table_privilege('authenticated', 'public.verification_events', 'DELETE')
     or pg_catalog.has_table_privilege('anon', 'public.verification_events', 'INSERT')
     or pg_catalog.has_table_privilege('anon', 'public.verification_events', 'UPDATE')
     or pg_catalog.has_table_privilege('anon', 'public.verification_events', 'DELETE') then
    raise exception 'precondition failed: unexpected direct verification write access exists';
  end if;

  if (select count(*) from public.software) <> 43
     or (select count(*) from public.software where verification_status = 'needs_verification') <> 43
     or exists (
       select 1 from public.software
       where verification_status is distinct from 'needs_verification'
     ) then
    raise exception 'precondition failed: reviewed software verification baseline has drifted';
  end if;
end
$$;

create function public.saaselephant_verify_software(
  p_software_id text,
  p_source_url text,
  p_source_reference text default null,
  p_notes text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  authenticated_user_id uuid := auth.uid();
  normalized_software_id text := btrim(p_software_id);
  normalized_source_url text := btrim(p_source_url);
  normalized_source_reference text := nullif(btrim(p_source_reference), '');
  normalized_notes text := nullif(btrim(p_notes), '');
  previous_status public.saaselephant_verification_status;
  verification_time timestamptz := now();
begin
  if authenticated_user_id is null or not exists (
    select 1
    from public.user_roles
    where user_id = authenticated_user_id
      and role = 'platform_admin'
      and revoked_at is null
  ) then
    return 'unauthorized';
  end if;

  if normalized_software_id is null or normalized_software_id = ''
     or length(normalized_software_id) > 200
     or normalized_source_url is null or normalized_source_url = ''
     or length(normalized_source_url) > 2048
     or normalized_source_url !~* '^https://[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$'
     or length(coalesce(normalized_source_reference, '')) > 500
     or length(coalesce(normalized_notes, '')) > 2000 then
    return 'invalid_input';
  end if;

  select verification_status
  into previous_status
  from public.software
  where software_id = normalized_software_id
  for update;

  if not found then
    return 'not_found';
  end if;

  if previous_status not in ('needs_verification', 'failed', 'stale') then
    return 'invalid_transition';
  end if;

  update public.software
  set verification_status = 'verified',
      verified_at = verification_time
  where software_id = normalized_software_id
    and verification_status = previous_status;

  if not found then
    return 'invalid_transition';
  end if;

  insert into public.verification_events (
    entity_type, entity_id, subject, result, verified_at,
    source_url, source_reference, actor_user_id,
    actor_identity_snapshot, actor_system, details
  ) values (
    'software', normalized_software_id, 'catalogue_information', 'verified', verification_time,
    normalized_source_url, normalized_source_reference, authenticated_user_id,
    null, null, jsonb_strip_nulls(jsonb_build_object(
      'previous_status', previous_status,
      'notes', normalized_notes
    ))
  );

  return 'success';
exception
  when others then
    return 'unavailable';
end
$$;

create function public.saaselephant_return_software_to_verification(
  p_software_id text,
  p_reason text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  authenticated_user_id uuid := auth.uid();
  normalized_software_id text := btrim(p_software_id);
  normalized_reason text := btrim(p_reason);
  previous_status public.saaselephant_verification_status;
  transition_time timestamptz := now();
begin
  if authenticated_user_id is null or not exists (
    select 1
    from public.user_roles
    where user_id = authenticated_user_id
      and role = 'platform_admin'
      and revoked_at is null
  ) then
    return 'unauthorized';
  end if;

  if normalized_software_id is null or normalized_software_id = ''
     or length(normalized_software_id) > 200
     or normalized_reason is null or normalized_reason = ''
     or length(normalized_reason) > 2000 then
    return 'invalid_input';
  end if;

  select verification_status
  into previous_status
  from public.software
  where software_id = normalized_software_id
  for update;

  if not found then
    return 'not_found';
  end if;

  if previous_status <> 'verified' then
    return 'invalid_transition';
  end if;

  update public.software
  set verification_status = 'needs_verification'
  where software_id = normalized_software_id
    and verification_status = 'verified';

  if not found then
    return 'invalid_transition';
  end if;

  insert into public.verification_events (
    entity_type, entity_id, subject, result, verified_at,
    source_url, source_reference, actor_user_id,
    actor_identity_snapshot, actor_system, details
  ) values (
    'software', normalized_software_id, 'catalogue_information', 'needs_verification',
    transition_time, null, null, authenticated_user_id, null, null,
    jsonb_build_object('previous_status', previous_status, 'reason', normalized_reason)
  );

  return 'success';
exception
  when others then
    return 'unavailable';
end
$$;

revoke all on function public.saaselephant_verify_software(text, text, text, text)
  from public, anon;
revoke all on function public.saaselephant_return_software_to_verification(text, text)
  from public, anon;
grant execute on function public.saaselephant_verify_software(text, text, text, text)
  to authenticated;
grant execute on function public.saaselephant_return_software_to_verification(text, text)
  to authenticated;

do $$
begin
  if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.software'::regclass)
     or not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.verification_events'::regclass)
     or not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.user_roles'::regclass) then
    raise exception 'postcondition failed: RLS was disabled';
  end if;

  if not pg_catalog.has_function_privilege(
       'authenticated', 'public.saaselephant_verify_software(text,text,text,text)', 'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'authenticated', 'public.saaselephant_return_software_to_verification(text,text)', 'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'anon', 'public.saaselephant_verify_software(text,text,text,text)', 'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'anon', 'public.saaselephant_return_software_to_verification(text,text)', 'EXECUTE'
     ) then
    raise exception 'postcondition failed: verification RPC execution grants are incorrect';
  end if;

  if pg_catalog.has_column_privilege(
       'authenticated', 'public.software', 'verification_status', 'UPDATE'
     )
     or pg_catalog.has_column_privilege(
       'authenticated', 'public.software', 'verified_at', 'UPDATE'
     )
     or pg_catalog.has_column_privilege(
       'anon', 'public.software', 'verification_status', 'UPDATE'
     )
     or pg_catalog.has_column_privilege(
       'anon', 'public.software', 'verified_at', 'UPDATE'
     )
     or pg_catalog.has_table_privilege('authenticated', 'public.verification_events', 'INSERT')
     or pg_catalog.has_table_privilege('authenticated', 'public.verification_events', 'UPDATE')
     or pg_catalog.has_table_privilege('authenticated', 'public.verification_events', 'DELETE')
     or pg_catalog.has_table_privilege('anon', 'public.verification_events', 'INSERT')
     or pg_catalog.has_table_privilege('anon', 'public.verification_events', 'UPDATE')
     or pg_catalog.has_table_privilege('anon', 'public.verification_events', 'DELETE') then
    raise exception 'postcondition failed: direct verification writes became available';
  end if;

  if (select count(*) from public.software) <>
       (select software_count from saaselephant_step13_baseline)
     or (select count(*) from public.verification_events) <>
       (select verification_event_count from saaselephant_step13_baseline)
     or (select count(*) from public.software where verification_status = 'needs_verification') <> 43 then
    raise exception 'postcondition failed: migration changed verification data';
  end if;
end
$$;

commit;
