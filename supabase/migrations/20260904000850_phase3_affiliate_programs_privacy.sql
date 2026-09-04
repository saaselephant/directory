begin;

do $migration$
declare
  affiliate_programs_row_count_before bigint;
  affiliate_programs_row_count_after bigint;
  legacy_policy_count integer;
  affiliate_programs_policy_count integer;
  checked_role_name text;
  checked_privilege_name text;
  checked_column_name text;
  affiliate_programs_columns text;
  other_affiliate_security_before jsonb;
  other_affiliate_security_after jsonb;
begin
  if to_regclass('public.affiliate_programs') is null then
    raise exception
      '00850 precondition failed: public.affiliate_programs does not exist';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'affiliate_programs'
      and relation.relkind in ('r', 'p')
      and relation.relrowsecurity
  ) then
    raise exception
      '00850 precondition failed: RLS is not enabled on public.affiliate_programs';
  end if;

  select count(*)
  into legacy_policy_count
  from pg_catalog.pg_policies as policy
  where policy.schemaname = 'public'
    and policy.tablename = 'affiliate_programs'
    and policy.policyname = 'Public can view affiliate programs'
    and policy.permissive = 'PERMISSIVE'
    and policy.cmd = 'SELECT'
    and (
      select array_agg(policy_role order by policy_role)
      from unnest(policy.roles) as policy_role
    ) = array['anon', 'authenticated']::name[]
    and btrim(policy.qual) = 'true'
    and policy.with_check is null;

  if legacy_policy_count <> 1 then
    raise exception
      '00850 precondition failed: legacy affiliate-program policy is missing or has drifted';
  end if;

  select count(*)
  into affiliate_programs_policy_count
  from pg_catalog.pg_policies as policy
  where policy.schemaname = 'public'
    and policy.tablename = 'affiliate_programs';

  if affiliate_programs_policy_count <> 1 then
    raise exception
      '00850 precondition failed: unexpected additional policies exist on public.affiliate_programs';
  end if;

  foreach checked_role_name in array array['anon', 'authenticated']::text[] loop
    foreach checked_privilege_name in array array[
      'SELECT',
      'INSERT',
      'UPDATE',
      'DELETE',
      'TRUNCATE',
      'REFERENCES',
      'TRIGGER'
    ]::text[] loop
      if not pg_catalog.has_table_privilege(
        checked_role_name,
        'public.affiliate_programs',
        checked_privilege_name
      ) then
        raise exception
          '00850 precondition failed: role % no longer has the expected effective % privilege on public.affiliate_programs',
          checked_role_name,
          checked_privilege_name;
      end if;
    end loop;
  end loop;

  select count(*)
  into affiliate_programs_row_count_before
  from public.affiliate_programs;

  with target_roles(role_name) as (
    values ('anon'::text), ('authenticated'::text)
  ),
  target_tables(table_name) as (
    values
      ('affiliate_links'::text),
      ('affiliate_clicks'::text),
      ('affiliate_conversions'::text)
  ),
  table_privileges(privilege_name) as (
    values
      ('SELECT'::text),
      ('INSERT'::text),
      ('UPDATE'::text),
      ('DELETE'::text),
      ('TRUNCATE'::text),
      ('REFERENCES'::text),
      ('TRIGGER'::text)
  ),
  column_privileges(privilege_name) as (
    values
      ('SELECT'::text),
      ('INSERT'::text),
      ('UPDATE'::text),
      ('REFERENCES'::text)
  ),
  security_facts as (
    select
      'POLICY'::text as fact_scope,
      policy.tablename::text as table_name,
      policy.policyname::text as object_name,
      policy.cmd::text as privilege_name,
      null::text as role_name,
      null::text as column_name,
      concat_ws(
        '|',
        policy.permissive,
        policy.roles::text,
        policy.qual,
        policy.with_check
      ) as fact_value
    from pg_catalog.pg_policies as policy
    join target_tables
      on target_tables.table_name = policy.tablename
    where policy.schemaname = 'public'

    union all

    select
      'TABLE'::text,
      target_tables.table_name,
      null::text,
      table_privileges.privilege_name,
      target_roles.role_name,
      null::text,
      pg_catalog.has_table_privilege(
        target_roles.role_name,
        pg_catalog.format('public.%I', target_tables.table_name),
        table_privileges.privilege_name
      )::text
    from target_roles
    cross join target_tables
    cross join table_privileges

    union all

    select
      'COLUMN'::text,
      target_tables.table_name,
      null::text,
      column_privileges.privilege_name,
      target_roles.role_name,
      attribute.attname::text,
      pg_catalog.has_column_privilege(
        target_roles.role_name,
        pg_catalog.format('public.%I', target_tables.table_name),
        attribute.attname,
        column_privileges.privilege_name
      )::text
    from target_roles
    cross join target_tables
    cross join column_privileges
    join pg_catalog.pg_attribute as attribute
      on attribute.attrelid = pg_catalog.to_regclass(
        pg_catalog.format('public.%I', target_tables.table_name)
      )
     and attribute.attnum > 0
     and not attribute.attisdropped
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_array(
        security_facts.fact_scope,
        security_facts.table_name,
        security_facts.object_name,
        security_facts.privilege_name,
        security_facts.role_name,
        security_facts.column_name,
        security_facts.fact_value
      )
      order by
        security_facts.fact_scope,
        security_facts.table_name,
        security_facts.object_name,
        security_facts.privilege_name,
        security_facts.role_name,
        security_facts.column_name
    ),
    '[]'::jsonb
  )
  into other_affiliate_security_before
  from security_facts;

  drop policy "Public can view affiliate programs"
    on public.affiliate_programs;

  revoke all privileges on table public.affiliate_programs
    from anon, authenticated;

  select string_agg(format('%I', attribute.attname), ', ' order by attribute.attnum)
  into affiliate_programs_columns
  from pg_catalog.pg_attribute as attribute
  where attribute.attrelid = 'public.affiliate_programs'::regclass
    and attribute.attnum > 0
    and not attribute.attisdropped;

  foreach checked_privilege_name in array array[
    'SELECT',
    'INSERT',
    'UPDATE',
    'REFERENCES'
  ]::text[] loop
    execute format(
      'revoke %s (%s) on public.affiliate_programs from anon, authenticated',
      checked_privilege_name,
      affiliate_programs_columns
    );
  end loop;

  select count(*)
  into affiliate_programs_row_count_after
  from public.affiliate_programs;

  if affiliate_programs_row_count_after <> affiliate_programs_row_count_before then
    raise exception
      '00850 postcondition failed: affiliate_programs row count changed from % to %',
      affiliate_programs_row_count_before,
      affiliate_programs_row_count_after;
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policies as policy
    where policy.schemaname = 'public'
      and policy.tablename = 'affiliate_programs'
      and policy.policyname = 'Public can view affiliate programs'
  ) then
    raise exception
      '00850 postcondition failed: legacy affiliate-program policy still exists';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policies as policy
    where policy.schemaname = 'public'
      and policy.tablename = 'affiliate_programs'
  ) then
    raise exception
      '00850 postcondition failed: an unexpected policy exists on public.affiliate_programs';
  end if;

  foreach checked_role_name in array array['anon', 'authenticated']::text[] loop
    foreach checked_privilege_name in array array[
      'SELECT',
      'INSERT',
      'UPDATE',
      'DELETE',
      'TRUNCATE',
      'REFERENCES',
      'TRIGGER'
    ]::text[] loop
      if pg_catalog.has_table_privilege(
        checked_role_name,
        'public.affiliate_programs',
        checked_privilege_name
      ) then
        raise exception
          '00850 postcondition failed: role % retains effective % on public.affiliate_programs',
          checked_role_name,
          checked_privilege_name;
      end if;
    end loop;

    for checked_column_name in
      select attribute.attname
      from pg_catalog.pg_attribute as attribute
      where attribute.attrelid = 'public.affiliate_programs'::regclass
        and attribute.attnum > 0
        and not attribute.attisdropped
    loop
      foreach checked_privilege_name in array array[
        'SELECT',
        'INSERT',
        'UPDATE',
        'REFERENCES'
      ]::text[] loop
        if pg_catalog.has_column_privilege(
          checked_role_name,
          'public.affiliate_programs',
          checked_column_name,
          checked_privilege_name
        ) then
          raise exception
            '00850 postcondition failed: role % retains effective % on public.affiliate_programs.%',
            checked_role_name,
            checked_privilege_name,
            checked_column_name;
        end if;
      end loop;
    end loop;
  end loop;

  with target_roles(role_name) as (
    values ('anon'::text), ('authenticated'::text)
  ),
  target_tables(table_name) as (
    values
      ('affiliate_links'::text),
      ('affiliate_clicks'::text),
      ('affiliate_conversions'::text)
  ),
  table_privileges(privilege_name) as (
    values
      ('SELECT'::text),
      ('INSERT'::text),
      ('UPDATE'::text),
      ('DELETE'::text),
      ('TRUNCATE'::text),
      ('REFERENCES'::text),
      ('TRIGGER'::text)
  ),
  column_privileges(privilege_name) as (
    values
      ('SELECT'::text),
      ('INSERT'::text),
      ('UPDATE'::text),
      ('REFERENCES'::text)
  ),
  security_facts as (
    select
      'POLICY'::text as fact_scope,
      policy.tablename::text as table_name,
      policy.policyname::text as object_name,
      policy.cmd::text as privilege_name,
      null::text as role_name,
      null::text as column_name,
      concat_ws(
        '|',
        policy.permissive,
        policy.roles::text,
        policy.qual,
        policy.with_check
      ) as fact_value
    from pg_catalog.pg_policies as policy
    join target_tables
      on target_tables.table_name = policy.tablename
    where policy.schemaname = 'public'

    union all

    select
      'TABLE'::text,
      target_tables.table_name,
      null::text,
      table_privileges.privilege_name,
      target_roles.role_name,
      null::text,
      pg_catalog.has_table_privilege(
        target_roles.role_name,
        pg_catalog.format('public.%I', target_tables.table_name),
        table_privileges.privilege_name
      )::text
    from target_roles
    cross join target_tables
    cross join table_privileges

    union all

    select
      'COLUMN'::text,
      target_tables.table_name,
      null::text,
      column_privileges.privilege_name,
      target_roles.role_name,
      attribute.attname::text,
      pg_catalog.has_column_privilege(
        target_roles.role_name,
        pg_catalog.format('public.%I', target_tables.table_name),
        attribute.attname,
        column_privileges.privilege_name
      )::text
    from target_roles
    cross join target_tables
    cross join column_privileges
    join pg_catalog.pg_attribute as attribute
      on attribute.attrelid = pg_catalog.to_regclass(
        pg_catalog.format('public.%I', target_tables.table_name)
      )
     and attribute.attnum > 0
     and not attribute.attisdropped
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_array(
        security_facts.fact_scope,
        security_facts.table_name,
        security_facts.object_name,
        security_facts.privilege_name,
        security_facts.role_name,
        security_facts.column_name,
        security_facts.fact_value
      )
      order by
        security_facts.fact_scope,
        security_facts.table_name,
        security_facts.object_name,
        security_facts.privilege_name,
        security_facts.role_name,
        security_facts.column_name
    ),
    '[]'::jsonb
  )
  into other_affiliate_security_after
  from security_facts;

  if other_affiliate_security_after is distinct from other_affiliate_security_before then
    raise exception
      '00850 postcondition failed: policies or effective privileges changed on another affiliate table';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'affiliate_programs'
      and relation.relkind in ('r', 'p')
      and relation.relrowsecurity
  ) then
    raise exception
      '00850 postcondition failed: RLS is no longer enabled on public.affiliate_programs';
  end if;
end
$migration$;

commit;
