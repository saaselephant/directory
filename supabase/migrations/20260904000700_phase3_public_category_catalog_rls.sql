-- SaaSElephant V1 Phase 3: least-privilege public category catalogue access.
-- Preparation only. Abort if production has unreviewed category policies.

begin;

do $$
declare
  category_policy pg_catalog.pg_policies%rowtype;
  relationship_policy pg_catalog.pg_policies%rowtype;
begin
  if not exists (
    select 1 from pg_catalog.pg_class c
    where c.oid = 'public.categories'::regclass and c.relrowsecurity
  ) then
    raise exception 'precondition failed: RLS is not enabled on public.categories';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_class c
    where c.oid = 'public.software_categories'::regclass and c.relrowsecurity
  ) then
    raise exception 'precondition failed: RLS is not enabled on public.software_categories';
  end if;

  select * into category_policy
  from pg_catalog.pg_policies
  where schemaname = 'public'
    and tablename = 'categories'
    and policyname = 'Public can view categories';

  if not found then
    raise exception 'precondition failed: expected legacy category policy';
  end if;

  if category_policy.permissive <> 'PERMISSIVE'
     or category_policy.cmd <> 'SELECT'
     or category_policy.with_check is not null
     or regexp_replace(category_policy.qual, '[()[:space:]]', '', 'g') <> 'true'
     or not category_policy.roles @> array['anon', 'authenticated']::name[]
     or cardinality(category_policy.roles) <> 2 then
    raise exception 'precondition failed: legacy category policy shape has drifted';
  end if;

  select * into relationship_policy
  from pg_catalog.pg_policies
  where schemaname = 'public'
    and tablename = 'software_categories'
    and policyname = 'Public can view software categories';

  if not found then
    raise exception 'precondition failed: expected legacy software/category policy';
  end if;

  if relationship_policy.permissive <> 'PERMISSIVE'
     or relationship_policy.cmd <> 'SELECT'
     or relationship_policy.with_check is not null
     or regexp_replace(relationship_policy.qual, '[()[:space:]]', '', 'g') <> 'true'
     or not relationship_policy.roles @> array['anon', 'authenticated']::name[]
     or cardinality(relationship_policy.roles) <> 2 then
    raise exception 'precondition failed: legacy software/category policy shape has drifted';
  end if;

  if (select count(*) from pg_catalog.pg_policies
      where schemaname = 'public' and tablename = 'categories') <> 1
     or (select count(*) from pg_catalog.pg_policies
         where schemaname = 'public' and tablename = 'software_categories') <> 1 then
    raise exception 'precondition failed: unexpected additional taxonomy policies exist';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'software'
      and policyname = 'saaselephant_public_read_published_software'
      and cmd = 'SELECT'
  ) then
    raise exception 'precondition failed: published software policy is missing';
  end if;

  if (select count(*) from public.categories) <> 43
     or (select count(*) from public.categories
         where publication_status = 'in_review') <> 43
     or exists (select 1 from public.categories where publication_status = 'published') then
    raise exception 'precondition failed: category transition 00650 is incomplete';
  end if;
end;
$$;

drop policy if exists "Public can view categories" on public.categories;
drop policy if exists "Public can view software categories" on public.software_categories;

revoke all privileges on table public.categories from anon, authenticated;
revoke all privileges on table public.software_categories from anon, authenticated;

grant select (
  category_id,
  slug,
  category_name,
  description,
  publication_status
) on table public.categories to anon, authenticated;

grant select (
  software_id,
  category_id
) on table public.software_categories to anon, authenticated;

create policy saaselephant_public_read_published_categories
on public.categories
for select
to anon, authenticated
using (publication_status = 'published');

create policy saaselephant_public_read_published_software_categories
on public.software_categories
for select
to anon, authenticated
using (
  exists (
    select 1 from public.categories
    where categories.category_id = software_categories.category_id
      and categories.publication_status = 'published'
  )
  and exists (
    select 1 from public.software
    where software.software_id = software_categories.software_id
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
      and ((tablename = 'categories' and policyname = 'Public can view categories')
        or (tablename = 'software_categories'
          and policyname = 'Public can view software categories'))
  ) then
    raise exception 'postcondition failed: a legacy taxonomy policy still exists';
  end if;

  if (select count(*) from pg_catalog.pg_policies
      where schemaname = 'public' and tablename = 'categories') <> 1
     or not exists (
       select 1 from pg_catalog.pg_policies
       where schemaname = 'public'
         and tablename = 'categories'
         and policyname = 'saaselephant_public_read_published_categories'
         and cmd = 'SELECT'
         and roles @> array['anon', 'authenticated']::name[]
         and cardinality(roles) = 2
     ) then
    raise exception 'postcondition failed: category policy is missing or unexpected';
  end if;

  if (select count(*) from pg_catalog.pg_policies
      where schemaname = 'public' and tablename = 'software_categories') <> 1
     or not exists (
       select 1 from pg_catalog.pg_policies
       where schemaname = 'public'
         and tablename = 'software_categories'
         and policyname = 'saaselephant_public_read_published_software_categories'
         and cmd = 'SELECT'
         and roles @> array['anon', 'authenticated']::name[]
         and cardinality(roles) = 2
     ) then
    raise exception 'postcondition failed: taxonomy relationship policy is missing or unexpected';
  end if;

  foreach checked_role in array array['anon', 'authenticated']::name[] loop
    foreach checked_table in array array[
      'public.categories'::regclass,
      'public.software_categories'::regclass
    ] loop
      if exists (
        select 1 from unnest(array[
          'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
        ]) privilege(privilege_name)
        where pg_catalog.has_table_privilege(
          checked_role, checked_table, privilege.privilege_name
        )
      ) then
        raise exception 'postcondition failed: % retains a table privilege on %',
          checked_role, checked_table;
      end if;

      if exists (
        select 1 from pg_catalog.pg_attribute a
        where a.attrelid = checked_table
          and a.attnum > 0 and not a.attisdropped
          and (
            pg_catalog.has_column_privilege(checked_role, checked_table, a.attname, 'INSERT')
            or pg_catalog.has_column_privilege(checked_role, checked_table, a.attname, 'UPDATE')
            or pg_catalog.has_column_privilege(
              checked_role, checked_table, a.attname, 'REFERENCES'
            )
          )
      ) then
        raise exception 'postcondition failed: % retains column write access on %',
          checked_role, checked_table;
      end if;
    end loop;

    intended_columns := array[
      'category_id', 'slug', 'category_name', 'description', 'publication_status'
    ];
    if exists (
      select 1 from pg_catalog.pg_attribute a
      where a.attrelid = 'public.categories'::regclass
        and a.attnum > 0 and not a.attisdropped
        and ((a.attname = any(intended_columns)) <>
          pg_catalog.has_column_privilege(
            checked_role, 'public.categories', a.attname, 'SELECT'
          ))
    ) then
      raise exception 'postcondition failed: % category SELECT columns are not exact', checked_role;
    end if;

    intended_columns := array['software_id', 'category_id'];
    if exists (
      select 1 from pg_catalog.pg_attribute a
      where a.attrelid = 'public.software_categories'::regclass
        and a.attnum > 0 and not a.attisdropped
        and ((a.attname = any(intended_columns)) <>
          pg_catalog.has_column_privilege(
            checked_role, 'public.software_categories', a.attname, 'SELECT'
          ))
    ) then
      raise exception 'postcondition failed: % relationship SELECT columns are not exact',
        checked_role;
    end if;
  end loop;

  if not (select relrowsecurity from pg_catalog.pg_class
          where oid = 'public.categories'::regclass)
     or not (select relrowsecurity from pg_catalog.pg_class
             where oid = 'public.software_categories'::regclass) then
    raise exception 'postcondition failed: taxonomy RLS is no longer enabled';
  end if;
end;
$$;

commit;
