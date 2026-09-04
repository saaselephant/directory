-- SaaSElephant V1 Phase 3: authenticated admin reads and publication transitions.
-- Preparation only. This migration does not publish or modify catalogue rows.

begin;

do $$
begin
  if to_regclass('public.user_roles') is null then
    raise exception 'precondition failed: public.user_roles is missing';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_attribute
    where attrelid = 'public.user_roles'::regclass
      and attname = 'user_id' and atttypid = 'uuid'::regtype
      and attnotnull and not attisdropped
  ) or not exists (
    select 1 from pg_catalog.pg_attribute
    where attrelid = 'public.user_roles'::regclass
      and attname = 'role'
      and atttypid = 'public.saaselephant_platform_role'::regtype
      and attnotnull and not attisdropped
  ) or not exists (
    select 1 from pg_catalog.pg_attribute
    where attrelid = 'public.user_roles'::regclass
      and attname = 'revoked_at' and atttypid = 'timestamptz'::regtype
      and not attnotnull and not attisdropped
  ) then
    raise exception 'precondition failed: public.user_roles shape has drifted';
  end if;

  if (select count(*) from pg_catalog.pg_attribute
      where attrelid = 'public.user_roles'::regclass
        and attnum > 0 and not attisdropped) <> 5
     or not exists (
       select 1 from pg_catalog.pg_attribute
       where attrelid = 'public.user_roles'::regclass
         and attname = 'granted_by' and atttypid = 'uuid'::regtype
         and not attnotnull and not attisdropped
     )
     or not exists (
       select 1 from pg_catalog.pg_attribute
       where attrelid = 'public.user_roles'::regclass
         and attname = 'granted_at' and atttypid = 'timestamptz'::regtype
         and attnotnull and not attisdropped
     ) then
    raise exception 'precondition failed: public.user_roles columns have drifted';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.user_roles'::regclass
      and contype = 'p' and convalidated
      and pg_catalog.pg_get_constraintdef(oid, true) = 'PRIMARY KEY (user_id, role)'
  ) or (select count(*) from pg_catalog.pg_constraint
        where conrelid = 'public.user_roles'::regclass
          and contype = 'f' and confrelid = 'auth.users'::regclass
          and convalidated) <> 2
     or not exists (
       select 1 from pg_catalog.pg_constraint
       where conrelid = 'public.user_roles'::regclass
         and contype = 'c' and convalidated
         and pg_catalog.pg_get_constraintdef(oid, true) ilike '%revoked_at%'
         and pg_catalog.pg_get_constraintdef(oid, true) ilike '%granted_at%'
     ) then
    raise exception 'precondition failed: public.user_roles constraints have drifted';
  end if;

  if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.user_roles'::regclass)
     or not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.software'::regclass)
     or not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.categories'::regclass) then
    raise exception 'precondition failed: expected RLS is not enabled';
  end if;

  if exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and policyname in (
        'saaselephant_read_own_active_roles',
        'saaselephant_admin_read_software',
        'saaselephant_admin_publish_software',
        'saaselephant_admin_read_categories',
        'saaselephant_admin_publish_categories'
      )
  ) then
    raise exception 'precondition failed: an intended admin policy already exists';
  end if;

  if (select count(*) from pg_catalog.pg_policies
      where schemaname = 'public' and tablename = 'user_roles') <> 0 then
    raise exception 'precondition failed: unreviewed user_roles policies exist';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'software'
      and policyname = 'saaselephant_public_read_published_software'
      and permissive = 'PERMISSIVE' and cmd = 'SELECT'
      and roles @> array['anon', 'authenticated']::name[] and cardinality(roles) = 2
      and lower(qual) like '%publication_status%published%'
      and with_check is null
  ) or not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'categories'
      and policyname = 'saaselephant_public_read_published_categories'
      and permissive = 'PERMISSIVE' and cmd = 'SELECT'
      and roles @> array['anon', 'authenticated']::name[] and cardinality(roles) = 2
      and lower(qual) like '%publication_status%published%'
      and with_check is null
  ) then
    raise exception 'precondition failed: expected public catalogue policies are missing';
  end if;

  if (
    select array_agg(enum_value.enumlabel order by enum_value.enumsortorder)
    from pg_catalog.pg_type typ
    join pg_catalog.pg_namespace nsp on nsp.oid = typ.typnamespace
    join pg_catalog.pg_enum enum_value on enum_value.enumtypid = typ.oid
    where nsp.nspname = 'public' and typ.typname = 'saaselephant_platform_role'
  ) is distinct from array[
    'platform_admin', 'editor', 'affiliate_manager', 'analyst'
  ]::name[] then
    raise exception 'precondition failed: platform role enum has drifted';
  end if;

  if (select count(*) from public.software) <> 43
     or (select count(*) from public.software where publication_status = 'in_review') <> 43
     or exists (select 1 from public.software where publication_status = 'published')
     or (select count(*) from public.software
         where verification_status = 'needs_verification') <> 43
     or (select count(*) from public.categories) <> 43
     or (select count(*) from public.categories where publication_status = 'in_review') <> 43
     or exists (select 1 from public.categories where publication_status = 'published')
     or (select count(*) from public.software_categories) <> 71 then
    raise exception 'precondition failed: catalogue checkpoint state has drifted';
  end if;

  if exists (
    select 1
    from unnest(array['anon', 'authenticated']::name[]) checked_role(role_name)
    cross join unnest(array[
      'public.user_roles', 'public.software', 'public.categories'
    ]) checked_table(table_name)
    cross join unnest(array[
      'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
    ]) checked_privilege(privilege_name)
    where pg_catalog.has_table_privilege(
      checked_role.role_name, checked_table.table_name, checked_privilege.privilege_name
    )
  ) then
    raise exception 'precondition failed: an existing broad write privilege was detected';
  end if;

  if pg_catalog.has_table_privilege('authenticated', 'public.user_roles', 'SELECT')
     or pg_catalog.has_table_privilege('authenticated', 'public.software', 'SELECT')
     or pg_catalog.has_table_privilege('authenticated', 'public.categories', 'SELECT') then
    raise exception 'precondition failed: authenticated has an unexpected table SELECT privilege';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_attribute att
    where att.attrelid in ('public.software'::regclass, 'public.categories'::regclass)
      and att.attnum > 0 and not att.attisdropped
      and pg_catalog.has_column_privilege('authenticated', att.attrelid, att.attnum, 'UPDATE')
  ) then
    raise exception 'precondition failed: authenticated already has a column UPDATE privilege';
  end if;

  if exists (
    select 1 from information_schema.table_privileges table_grant
    where table_grant.table_schema = 'public'
      and table_grant.table_name in ('user_roles', 'software', 'categories')
      and table_grant.grantee = 'PUBLIC'
      and table_grant.privilege_type in (
        'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
      )
  ) or exists (
    select 1 from information_schema.column_privileges column_grant
    where column_grant.table_schema = 'public'
      and column_grant.table_name in ('user_roles', 'software', 'categories')
      and column_grant.grantee = 'PUBLIC'
      and column_grant.privilege_type in ('INSERT', 'UPDATE', 'REFERENCES')
  ) then
    raise exception 'precondition failed: PUBLIC has an existing write privilege';
  end if;
end;
$$;

grant select (user_id, role, revoked_at)
on table public.user_roles to authenticated;

create policy saaselephant_read_own_active_roles
on public.user_roles
for select
to authenticated
using (user_id = auth.uid() and revoked_at is null);

grant select (
  software_id, slug, software_name, vendor, publication_status, verification_status
) on table public.software to authenticated;
grant update (publication_status) on table public.software to authenticated;

grant select (
  category_id, slug, category_name, publication_status
) on table public.categories to authenticated;
grant update (publication_status) on table public.categories to authenticated;

create policy saaselephant_admin_read_software
on public.software
for select
to authenticated
using (
  exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'platform_admin' and revoked_at is null
  )
);

create policy saaselephant_admin_publish_software
on public.software
for update
to authenticated
using (
  publication_status in ('in_review', 'published')
  and exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'platform_admin' and revoked_at is null
  )
)
with check (
  publication_status in ('in_review', 'published')
  and exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'platform_admin' and revoked_at is null
  )
);

create policy saaselephant_admin_read_categories
on public.categories
for select
to authenticated
using (
  exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'platform_admin' and revoked_at is null
  )
);

create policy saaselephant_admin_publish_categories
on public.categories
for update
to authenticated
using (
  publication_status in ('in_review', 'published')
  and exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'platform_admin' and revoked_at is null
  )
)
with check (
  publication_status in ('in_review', 'published')
  and exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'platform_admin' and revoked_at is null
  )
);

do $$
begin
  if (select count(*) from pg_catalog.pg_policies
      where schemaname = 'public'
        and policyname in (
          'saaselephant_read_own_active_roles',
          'saaselephant_admin_read_software',
          'saaselephant_admin_publish_software',
          'saaselephant_admin_read_categories',
          'saaselephant_admin_publish_categories'
        )) <> 5 then
    raise exception 'postcondition failed: expected admin policies are missing';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'user_roles'
      and policyname = 'saaselephant_read_own_active_roles'
      and permissive = 'PERMISSIVE' and cmd = 'SELECT'
      and roles @> array['authenticated']::name[] and cardinality(roles) = 1
      and lower(qual) like '%user_id%auth.uid()%'
      and lower(qual) like '%revoked_at%is null%'
      and with_check is null
  ) then
    raise exception 'postcondition failed: own-role policy definition is incorrect';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'software'
      and policyname = 'saaselephant_admin_read_software'
      and permissive = 'PERMISSIVE' and cmd = 'SELECT'
      and roles @> array['authenticated']::name[] and cardinality(roles) = 1
      and lower(qual) like '%user_roles%'
      and lower(qual) like '%user_id%auth.uid()%'
      and lower(qual) like '%platform_admin%'
      and lower(qual) like '%revoked_at%is null%'
      and with_check is null
  ) or not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'categories'
      and policyname = 'saaselephant_admin_read_categories'
      and permissive = 'PERMISSIVE' and cmd = 'SELECT'
      and roles @> array['authenticated']::name[] and cardinality(roles) = 1
      and lower(qual) like '%user_roles%'
      and lower(qual) like '%user_id%auth.uid()%'
      and lower(qual) like '%platform_admin%'
      and lower(qual) like '%revoked_at%is null%'
      and with_check is null
  ) then
    raise exception 'postcondition failed: admin read policy definition is incorrect';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'software'
      and policyname = 'saaselephant_admin_publish_software'
      and permissive = 'PERMISSIVE' and cmd = 'UPDATE'
      and roles @> array['authenticated']::name[] and cardinality(roles) = 1
      and lower(qual) like '%platform_admin%'
      and lower(qual) like '%user_id%auth.uid()%'
      and lower(qual) like '%revoked_at%is null%'
      and lower(qual) like '%in_review%' and lower(qual) like '%published%'
      and lower(with_check) like '%platform_admin%'
      and lower(with_check) like '%user_id%auth.uid()%'
      and lower(with_check) like '%revoked_at%is null%'
      and lower(with_check) like '%in_review%' and lower(with_check) like '%published%'
      and lower(qual) not like '%draft%' and lower(qual) not like '%archived%'
      and lower(with_check) not like '%draft%' and lower(with_check) not like '%archived%'
  ) or not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'categories'
      and policyname = 'saaselephant_admin_publish_categories'
      and permissive = 'PERMISSIVE' and cmd = 'UPDATE'
      and roles @> array['authenticated']::name[] and cardinality(roles) = 1
      and lower(qual) like '%platform_admin%'
      and lower(qual) like '%user_id%auth.uid()%'
      and lower(qual) like '%revoked_at%is null%'
      and lower(qual) like '%in_review%' and lower(qual) like '%published%'
      and lower(with_check) like '%platform_admin%'
      and lower(with_check) like '%user_id%auth.uid()%'
      and lower(with_check) like '%revoked_at%is null%'
      and lower(with_check) like '%in_review%' and lower(with_check) like '%published%'
      and lower(qual) not like '%draft%' and lower(qual) not like '%archived%'
      and lower(with_check) not like '%draft%' and lower(with_check) not like '%archived%'
  ) then
    raise exception 'postcondition failed: admin update policy definition is incorrect';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'software'
      and policyname = 'saaselephant_public_read_published_software'
      and permissive = 'PERMISSIVE' and cmd = 'SELECT'
      and roles @> array['anon', 'authenticated']::name[] and cardinality(roles) = 2
      and lower(qual) like '%publication_status%published%'
      and with_check is null
  ) or not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'categories'
      and policyname = 'saaselephant_public_read_published_categories'
      and permissive = 'PERMISSIVE' and cmd = 'SELECT'
      and roles @> array['anon', 'authenticated']::name[] and cardinality(roles) = 2
      and lower(qual) like '%publication_status%published%'
      and with_check is null
  ) then
    raise exception 'postcondition failed: an existing public policy is missing';
  end if;

  if exists (
    select 1
    from unnest(array['anon', 'authenticated']::name[]) checked_role(role_name)
    cross join unnest(array[
      'public.user_roles', 'public.software', 'public.categories'
    ]) checked_table(table_name)
    cross join unnest(array[
      'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
    ]) checked_privilege(privilege_name)
    where pg_catalog.has_table_privilege(
      checked_role.role_name, checked_table.table_name, checked_privilege.privilege_name
    )
  ) or pg_catalog.has_table_privilege('authenticated', 'public.user_roles', 'SELECT')
     or pg_catalog.has_table_privilege('authenticated', 'public.software', 'SELECT')
     or pg_catalog.has_table_privilege('authenticated', 'public.categories', 'SELECT') then
    raise exception 'postcondition failed: a broad table privilege exists';
  end if;

  if not pg_catalog.has_column_privilege(
       'authenticated', 'public.user_roles', 'user_id', 'SELECT'
     ) or not pg_catalog.has_column_privilege(
       'authenticated', 'public.user_roles', 'role', 'SELECT'
     ) or not pg_catalog.has_column_privilege(
       'authenticated', 'public.user_roles', 'revoked_at', 'SELECT'
     ) or not pg_catalog.has_column_privilege(
       'authenticated', 'public.software', 'publication_status', 'UPDATE'
     ) or not pg_catalog.has_column_privilege(
       'authenticated', 'public.categories', 'publication_status', 'UPDATE'
     ) then
    raise exception 'postcondition failed: required column privileges are missing';
  end if;

  if not pg_catalog.has_column_privilege(
       'authenticated', 'public.software', 'software_id', 'SELECT'
     ) or not pg_catalog.has_column_privilege(
       'authenticated', 'public.software', 'slug', 'SELECT'
     ) or not pg_catalog.has_column_privilege(
       'authenticated', 'public.software', 'software_name', 'SELECT'
     ) or not pg_catalog.has_column_privilege(
       'authenticated', 'public.software', 'vendor', 'SELECT'
     ) or not pg_catalog.has_column_privilege(
       'authenticated', 'public.software', 'publication_status', 'SELECT'
     ) or not pg_catalog.has_column_privilege(
       'authenticated', 'public.software', 'verification_status', 'SELECT'
     ) or not pg_catalog.has_column_privilege(
       'authenticated', 'public.categories', 'category_id', 'SELECT'
     ) or not pg_catalog.has_column_privilege(
       'authenticated', 'public.categories', 'slug', 'SELECT'
     ) or not pg_catalog.has_column_privilege(
       'authenticated', 'public.categories', 'category_name', 'SELECT'
     ) or not pg_catalog.has_column_privilege(
       'authenticated', 'public.categories', 'publication_status', 'SELECT'
     ) then
    raise exception 'postcondition failed: required admin SELECT columns are missing';
  end if;

  if exists (
    select 1 from pg_catalog.pg_attribute att
    where att.attnum > 0 and not att.attisdropped
      and pg_catalog.has_column_privilege(
        'authenticated', att.attrelid, att.attnum, 'SELECT'
      )
      and (
        (att.attrelid = 'public.user_roles'::regclass
         and att.attname <> all(array['user_id', 'role', 'revoked_at']))
        or (att.attrelid = 'public.software'::regclass
         and att.attname <> all(array[
           'software_id', 'slug', 'software_name', 'short_description', 'best_for',
           'pricing', 'free_plan', 'free_trial', 'website_url', 'vendor', 'vendor_id',
           'publication_status', 'verification_status'
         ]))
        or (att.attrelid = 'public.categories'::regclass
         and att.attname <> all(array[
           'category_id', 'slug', 'category_name', 'description', 'publication_status'
         ]))
      )
  ) then
    raise exception 'postcondition failed: an unapproved SELECT column is accessible';
  end if;

  if exists (
    select 1 from pg_catalog.pg_attribute
    where attrelid in ('public.software'::regclass, 'public.categories'::regclass)
      and attnum > 0 and not attisdropped and attname <> 'publication_status'
      and pg_catalog.has_column_privilege('authenticated', attrelid, attname, 'UPDATE')
  ) then
    raise exception 'postcondition failed: an unrelated catalogue column is writable';
  end if;

  if exists (
    select 1 from pg_catalog.pg_attribute att
    where att.attrelid in (
      'public.user_roles'::regclass, 'public.software'::regclass, 'public.categories'::regclass
    )
      and att.attnum > 0 and not att.attisdropped
      and (
        pg_catalog.has_column_privilege('anon', att.attrelid, att.attnum, 'INSERT')
        or pg_catalog.has_column_privilege('anon', att.attrelid, att.attnum, 'UPDATE')
        or pg_catalog.has_column_privilege('anon', att.attrelid, att.attnum, 'REFERENCES')
        or pg_catalog.has_column_privilege(
          'authenticated', att.attrelid, att.attnum, 'INSERT'
        )
        or pg_catalog.has_column_privilege(
          'authenticated', att.attrelid, att.attnum, 'REFERENCES'
        )
        or (
          att.attrelid = 'public.user_roles'::regclass
          and pg_catalog.has_column_privilege(
            'authenticated', att.attrelid, att.attnum, 'UPDATE'
          )
        )
      )
  ) then
    raise exception 'postcondition failed: an unrelated column write privilege exists';
  end if;

  if (select count(*) from public.software) <> 43
     or (select count(*) from public.software where publication_status = 'in_review') <> 43
     or exists (select 1 from public.software where publication_status = 'published')
     or (select count(*) from public.software
         where verification_status = 'needs_verification') <> 43
     or (select count(*) from public.categories) <> 43
     or (select count(*) from public.categories where publication_status = 'in_review') <> 43
     or exists (select 1 from public.categories where publication_status = 'published')
     or (select count(*) from public.software_categories) <> 71 then
    raise exception 'postcondition failed: catalogue checkpoint state changed';
  end if;

  if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.user_roles'::regclass)
     or not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.software'::regclass)
     or not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.categories'::regclass) then
    raise exception 'postcondition failed: RLS is no longer enabled';
  end if;
end;
$$;

commit;
