-- SaaSElephant V1 Phase 3: controlled public catalogue security transition.
-- Removes the reviewed legacy allow-all policy and grants only catalogue columns.

begin;

do $$
declare
  legacy_policy pg_catalog.pg_policies%rowtype;
begin
  if not exists (
    select 1 from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'software' and c.relrowsecurity
  ) then
    raise exception 'precondition failed: RLS is not enabled on public.software';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'vendors' and c.relrowsecurity
  ) then
    raise exception 'precondition failed: RLS is not enabled on public.vendors';
  end if;

  select * into legacy_policy
  from pg_catalog.pg_policies
  where schemaname = 'public'
    and tablename = 'software'
    and policyname = 'Public can view software';

  if not found then
    raise exception 'precondition failed: expected legacy policy Public can view software';
  end if;

  if legacy_policy.permissive <> 'PERMISSIVE'
     or legacy_policy.cmd <> 'SELECT'
     or legacy_policy.with_check is not null
     or regexp_replace(legacy_policy.qual, '[()[:space:]]', '', 'g') <> 'true'
     or not legacy_policy.roles @> array['anon', 'authenticated']::name[]
     or cardinality(legacy_policy.roles) <> 2 then
    raise exception 'precondition failed: legacy software policy shape has drifted';
  end if;

  if (select count(*) from pg_catalog.pg_policies
      where schemaname = 'public' and tablename = 'software') <> 1 then
    raise exception 'precondition failed: unexpected additional software policies exist';
  end if;

  if exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'vendors'
  ) then
    raise exception 'precondition failed: unexpected vendor policies exist';
  end if;

  if (select count(*) from public.software where publication_status = 'published') <> 0 then
    raise exception 'precondition failed: expected zero published software rows';
  end if;
end;
$$;

drop policy if exists "Public can view software" on public.software;

revoke all privileges on table public.software from anon, authenticated;

grant select (
  software_id,
  slug,
  software_name,
  short_description,
  best_for,
  pricing,
  free_plan,
  free_trial,
  website_url,
  vendor,
  vendor_id,
  publication_status
) on table public.software to anon, authenticated;

create policy saaselephant_public_read_published_software
on public.software
for select
to anon, authenticated
using (publication_status = 'published');

revoke all privileges on table public.vendors from anon, authenticated;

grant select (
  vendor_id,
  vendor_name,
  slug,
  website_url
) on table public.vendors to anon, authenticated;

create policy saaselephant_public_read_published_software_vendors
on public.vendors
for select
to anon, authenticated
using (
  status = 'active'
  and exists (
    select 1
    from public.software
    where software.vendor_id = vendors.vendor_id
      and software.publication_status = 'published'
  )
);

do $$
declare
  checked_role name;
  checked_table regclass;
  intended_columns text[];
begin
  if exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'software'
      and policyname = 'Public can view software'
  ) then
    raise exception 'postcondition failed: legacy software policy still exists';
  end if;

  if (select count(*) from pg_catalog.pg_policies
      where schemaname = 'public' and tablename = 'software') <> 1
     or not exists (
       select 1 from pg_catalog.pg_policies
       where schemaname = 'public'
         and tablename = 'software'
         and policyname = 'saaselephant_public_read_published_software'
         and permissive = 'PERMISSIVE'
         and cmd = 'SELECT'
         and with_check is null
         and regexp_replace(qual, '[()[:space:]]', '', 'g') =
           'publication_status=''published''::saaselephant_publication_status'
         and roles @> array['anon', 'authenticated']::name[]
         and cardinality(roles) = 2
     ) then
    raise exception 'postcondition failed: intended software policy is missing or unexpected';
  end if;

  if (select count(*) from pg_catalog.pg_policies
      where schemaname = 'public' and tablename = 'vendors') <> 1
     or not exists (
       select 1 from pg_catalog.pg_policies
       where schemaname = 'public'
         and tablename = 'vendors'
         and policyname = 'saaselephant_public_read_published_software_vendors'
         and permissive = 'PERMISSIVE'
         and cmd = 'SELECT'
         and with_check is null
         and roles @> array['anon', 'authenticated']::name[]
         and cardinality(roles) = 2
     ) then
    raise exception 'postcondition failed: intended vendor policy is missing or unexpected';
  end if;

  foreach checked_role in array array['anon', 'authenticated']::name[] loop
    if exists (
      select 1
      from unnest(array[
        'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
      ]) as privilege(privilege_name)
      where pg_catalog.has_table_privilege(
        checked_role, 'public.software', privilege.privilege_name
      )
    ) then
      raise exception 'postcondition failed: % retains a table privilege on software',
        checked_role;
    end if;

    if exists (
      select 1
      from unnest(array[
        'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
      ]) as privilege(privilege_name)
      where pg_catalog.has_table_privilege(
        checked_role, 'public.vendors', privilege.privilege_name
      )
    ) then
      raise exception 'postcondition failed: % retains a table privilege on vendors',
        checked_role;
    end if;

    foreach checked_table in array array[
      'public.software'::regclass,
      'public.vendors'::regclass
    ] loop
      if exists (
        select 1
        from pg_catalog.pg_attribute a
        where a.attrelid = checked_table
          and a.attnum > 0
          and not a.attisdropped
          and (
            pg_catalog.has_column_privilege(checked_role, checked_table, a.attname, 'INSERT')
            or pg_catalog.has_column_privilege(checked_role, checked_table, a.attname, 'UPDATE')
            or pg_catalog.has_column_privilege(
              checked_role, checked_table, a.attname, 'REFERENCES'
            )
          )
      ) then
        raise exception 'postcondition failed: % retains a column write privilege on %',
          checked_role, checked_table;
      end if;
    end loop;

    intended_columns := array[
      'software_id', 'slug', 'software_name', 'short_description', 'best_for',
      'pricing', 'free_plan', 'free_trial', 'website_url', 'vendor', 'vendor_id',
      'publication_status'
    ];

    if exists (
      select 1
      from pg_catalog.pg_attribute a
      where a.attrelid = 'public.software'::regclass
        and a.attnum > 0
        and not a.attisdropped
        and (
          (a.attname = any(intended_columns)) <>
          pg_catalog.has_column_privilege(
            checked_role, 'public.software', a.attname, 'SELECT'
          )
        )
    ) then
      raise exception 'postcondition failed: % software column SELECT privileges are not exact',
        checked_role;
    end if;

    intended_columns := array['vendor_id', 'vendor_name', 'slug', 'website_url'];

    if exists (
      select 1
      from pg_catalog.pg_attribute a
      where a.attrelid = 'public.vendors'::regclass
        and a.attnum > 0
        and not a.attisdropped
        and (
          (a.attname = any(intended_columns)) <>
          pg_catalog.has_column_privilege(
            checked_role, 'public.vendors', a.attname, 'SELECT'
          )
        )
    ) then
      raise exception 'postcondition failed: % vendor column SELECT privileges are not exact',
        checked_role;
    end if;
  end loop;

  if not (select relrowsecurity from pg_catalog.pg_class
          where oid = 'public.software'::regclass)
     or not (select relrowsecurity from pg_catalog.pg_class
             where oid = 'public.vendors'::regclass) then
    raise exception 'postcondition failed: RLS is no longer enabled';
  end if;

  if (select count(*) from public.software where publication_status = 'published') <> 0 then
    raise exception 'postcondition failed: expected zero published software rows';
  end if;
end;
$$;

commit;
