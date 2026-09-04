-- READ-ONLY SaaSElephant Phase 2 preflight.
-- Run sections in order and archive the complete output. It performs no DDL/DML.

-- A. SCHEMA / OBJECT INVENTORY ------------------------------------------------

select current_database() as database_name, current_user as inspected_by, now() as inspected_at;

select n.nspname as schema_name, c.relname as object_name, c.relkind,
  c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'auth')
  and c.relname in (
    'software', 'categories', 'software_categories', 'affiliate_programs',
    'vendors', 'affiliate_links', 'features', 'software_features',
    'software_relationships', 'comparison_pages', 'comparison_page_products',
    'media_assets', 'user_roles', 'affiliate_clicks', 'affiliate_conversions',
    'verification_events', 'audit_log', 'users'
  )
order by n.nspname, c.relname;

select table_schema, table_name, ordinal_position, column_name, data_type,
  udt_schema, udt_name, is_nullable, column_default
from information_schema.columns
where table_schema in ('public', 'auth')
  and table_name in (
    'software', 'categories', 'software_categories', 'affiliate_programs',
    'vendors', 'affiliate_links', 'media_assets', 'users'
  )
order by table_schema, table_name, ordinal_position;

select conrelid::regclass as table_name, conname, contype,
  convalidated, pg_get_constraintdef(oid) as definition
from pg_constraint
where connamespace in ('public'::regnamespace, 'auth'::regnamespace)
  and conrelid::regclass::text in (
    'software', 'categories', 'software_categories', 'affiliate_programs',
    'public.software', 'public.categories', 'public.software_categories',
    'public.affiliate_programs', 'auth.users'
  )
order by conrelid::regclass::text, conname;

select event_object_schema, event_object_table, trigger_name,
  action_timing, event_manipulation, action_statement
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table in ('software', 'categories', 'software_categories', 'affiliate_programs')
order by event_object_table, trigger_name, event_manipulation;

select n.nspname as function_schema, p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as result_type
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (
    p.proname like 'saaselephant_%'
    or p.proname in ('set_updated_at', 'select_affiliate_link')
  )
order by p.proname, arguments;

select n.nspname as type_schema, t.typname as type_name, t.typtype,
  array_remove(array_agg(e.enumlabel order by e.enumsortorder), null) as enum_values
from pg_type t
join pg_namespace n on n.oid = t.typnamespace
left join pg_enum e on e.enumtypid = t.oid
where n.nspname = 'public' and t.typname like 'saaselephant_%'
group by n.nspname, t.typname, t.typtype
order by t.typname;

select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'software', 'categories', 'software_categories', 'affiliate_programs',
    'vendors', 'affiliate_links', 'features', 'software_features',
    'software_relationships', 'comparison_pages', 'comparison_page_products',
    'media_assets', 'user_roles', 'affiliate_clicks', 'affiliate_conversions',
    'verification_events', 'audit_log'
  )
order by tablename, policyname;

select grantee, table_schema, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'software', 'categories', 'software_categories', 'affiliate_programs',
    'vendors', 'affiliate_links', 'features', 'software_features',
    'software_relationships', 'comparison_pages', 'comparison_page_products',
    'media_assets', 'user_roles', 'affiliate_clicks', 'affiliate_conversions',
    'verification_events', 'audit_log'
  )
order by table_name, grantee, privilege_type;

select n.nspname as schema_name, c.relname as index_name,
  pg_get_indexdef(i.indexrelid) as definition
from pg_index i
join pg_class c on c.oid = i.indexrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname like 'saaselephant_%'
order by c.relname;

-- B. CONFIRMED-COLUMN / TYPE COMPATIBILITY ----------------------------------

with required(table_name, column_name) as (
  values
    ('software', 'software_id'), ('software', 'software_name'), ('software', 'vendor'),
    ('categories', 'category_id'), ('categories', 'category_name'),
    ('software_categories', 'software_id'), ('software_categories', 'category_id'),
    ('affiliate_programs', 'affiliate_program_id'),
    ('affiliate_programs', 'software_id'), ('affiliate_programs', 'affiliate_url')
)
select r.table_name, r.column_name,
  c.column_name is not null as column_exists,
  c.data_type, c.udt_schema, c.udt_name
from required r
left join information_schema.columns c
  on c.table_schema = 'public'
 and c.table_name = r.table_name
 and c.column_name = r.column_name
order by r.table_name, r.column_name;

select
  s.atttypid = scs.atttypid and s.atttypmod = scs.atttypmod
    as software_relationship_type_compatible,
  c.atttypid = scc.atttypid and c.atttypmod = scc.atttypmod
    as category_relationship_type_compatible,
  s.atttypid = aps.atttypid and s.atttypmod = aps.atttypmod
    as affiliate_software_type_compatible,
  format_type(s.atttypid, s.atttypmod) as software_id_type,
  format_type(c.atttypid, c.atttypmod) as category_id_type,
  format_type(scs.atttypid, scs.atttypmod) as junction_software_id_type,
  format_type(scc.atttypid, scc.atttypmod) as junction_category_id_type,
  format_type(aps.atttypid, aps.atttypmod) as affiliate_software_id_type
from pg_attribute s
join pg_class st on st.oid = s.attrelid and st.oid = 'public.software'::regclass
join pg_attribute c on c.attrelid = 'public.categories'::regclass and c.attname = 'category_id'
join pg_attribute scs on scs.attrelid = 'public.software_categories'::regclass
  and scs.attname = 'software_id'
join pg_attribute scc on scc.attrelid = 'public.software_categories'::regclass
  and scc.attname = 'category_id'
join pg_attribute aps on aps.attrelid = 'public.affiliate_programs'::regclass
  and aps.attname = 'software_id'
where s.attname = 'software_id';

with expected(table_name, column_name, expected_type) as (
  values
    ('software', 'vendor_id', 'uuid'),
    ('software', 'slug', 'text'),
    ('software', 'publication_status', 'saaselephant_publication_status'),
    ('software', 'created_at', 'timestamp with time zone'),
    ('software', 'updated_at', 'timestamp with time zone'),
    ('software', 'verified_at', 'timestamp with time zone'),
    ('software', 'verification_status', 'saaselephant_verification_status'),
    ('software', 'seo_title', 'text'),
    ('software', 'seo_meta_description', 'text'),
    ('software', 'logo_media_asset_id', 'uuid'),
    ('software', 'featured_media_asset_id', 'uuid'),
    ('categories', 'slug', 'text'),
    ('categories', 'publication_status', 'saaselephant_publication_status'),
    ('categories', 'sort_order', 'integer'),
    ('categories', 'seo_title', 'text'),
    ('categories', 'seo_meta_description', 'text'),
    ('categories', 'created_at', 'timestamp with time zone'),
    ('categories', 'updated_at', 'timestamp with time zone'),
    ('software_categories', 'primary_category', 'boolean'),
    ('software_categories', 'created_at', 'timestamp with time zone'),
    ('software_categories', 'updated_at', 'timestamp with time zone'),
    ('affiliate_programs', 'network', 'text'),
    ('affiliate_programs', 'external_program_reference', 'text'),
    ('affiliate_programs', 'program_terms', 'jsonb'),
    ('affiliate_programs', 'verified_at', 'timestamp with time zone'),
    ('affiliate_programs', 'verification_status', 'saaselephant_verification_status'),
    ('affiliate_programs', 'created_at', 'timestamp with time zone'),
    ('affiliate_programs', 'updated_at', 'timestamp with time zone')
)
select e.table_name, e.column_name, e.expected_type,
  c.column_name is not null as already_exists,
  coalesce(c.udt_name, c.data_type) as actual_type,
  case
    when c.column_name is null then 'will_be_added'
    when c.data_type = e.expected_type or c.udt_name = e.expected_type then 'compatible'
    else 'STOP_incompatible_existing_column'
  end as compatibility
from expected e
left join information_schema.columns c
  on c.table_schema = 'public'
 and c.table_name = e.table_name
 and c.column_name = e.column_name
order by e.table_name, e.column_name;

-- C. CONDITIONAL DATA-QUALITY CHECKS ----------------------------------------
-- to_jsonb avoids referencing optional Phase 2 columns directly.

select 43 as known_baseline, count(*) as observed_count,
  'informational_only' as enforcement
from public.software;

select lower(btrim(to_jsonb(s) ->> 'software_name')) as normalized_name,
  count(*) as duplicate_count
from public.software s
where nullif(btrim(to_jsonb(s) ->> 'software_name'), '') is not null
group by lower(btrim(to_jsonb(s) ->> 'software_name'))
having count(*) > 1
order by duplicate_count desc, normalized_name;

select to_jsonb(sc) ->> 'software_id' as software_id,
  to_jsonb(sc) ->> 'category_id' as category_id, count(*) as duplicate_count
from public.software_categories sc
group by to_jsonb(sc) ->> 'software_id', to_jsonb(sc) ->> 'category_id'
having count(*) > 1;

select count(*) as orphan_software_category_software_refs
from public.software_categories sc
where not exists (
  select 1 from public.software s
  where to_jsonb(s) ->> 'software_id' = to_jsonb(sc) ->> 'software_id'
);

select count(*) as orphan_software_category_category_refs
from public.software_categories sc
where not exists (
  select 1 from public.categories c
  where to_jsonb(c) ->> 'category_id' = to_jsonb(sc) ->> 'category_id'
);

select count(*) as orphan_affiliate_program_software_refs
from public.affiliate_programs ap
where not exists (
  select 1 from public.software s
  where to_jsonb(s) ->> 'software_id' = to_jsonb(ap) ->> 'software_id'
);

select to_jsonb(ap) ->> 'affiliate_program_id' as affiliate_program_id,
  to_jsonb(ap) ->> 'affiliate_url' as affiliate_url
from public.affiliate_programs ap
where nullif(btrim(to_jsonb(ap) ->> 'affiliate_url'), '') is not null
  and (to_jsonb(ap) ->> 'affiliate_url') !~* '^https?://';

select
  jsonb_typeof(to_jsonb(sc) -> 'primary_category') as json_value_type,
  to_jsonb(sc) ->> 'primary_category' as observed_value,
  count(*) as row_count,
  case
    when to_jsonb(sc) -> 'primary_category' is null then 'column_absent_or_null'
    when jsonb_typeof(to_jsonb(sc) -> 'primary_category') = 'boolean' then 'compatible'
    else 'STOP_non_boolean_value'
  end as compatibility
from public.software_categories sc
group by to_jsonb(sc) -> 'primary_category', to_jsonb(sc) ->> 'primary_category';

-- D. POST-ADDITIVE / PRE-BACKFILL CHECKS ------------------------------------

select check_name, issue_count
from (
  select 'software_nonnull_new_fields_before_backfill' as check_name, count(*) as issue_count
  from public.software s
  where nullif(btrim(to_jsonb(s) ->> 'slug'), '') is not null
     or nullif(btrim(to_jsonb(s) ->> 'publication_status'), '') is not null
     or nullif(btrim(to_jsonb(s) ->> 'verification_status'), '') is not null
  union all
  select 'category_nonnull_new_fields_before_backfill', count(*)
  from public.categories c
  where nullif(btrim(to_jsonb(c) ->> 'slug'), '') is not null
     or nullif(btrim(to_jsonb(c) ->> 'publication_status'), '') is not null
) checks;

select 'software_publication_status' as field,
  to_jsonb(s) ->> 'publication_status' as observed_value, count(*)
from public.software s
group by to_jsonb(s) ->> 'publication_status'
union all
select 'software_verification_status', to_jsonb(s) ->> 'verification_status', count(*)
from public.software s group by to_jsonb(s) ->> 'verification_status'
union all
select 'category_publication_status', to_jsonb(c) ->> 'publication_status', count(*)
from public.categories c group by to_jsonb(c) ->> 'publication_status';

-- These optional-table checks emit notices rather than failing when Phase 2 tables
-- have not been created yet.
do $$
declare issue_count bigint;
begin
  if to_regclass('public.vendors') is not null then
    execute $sql$
      select count(*) from public.software s
      where nullif(to_jsonb(s) ->> 'vendor_id', '') is not null
        and not exists (
          select 1 from public.vendors v
          where v.vendor_id::text = to_jsonb(s) ->> 'vendor_id'
        )
    $sql$ into issue_count;
    raise notice 'software vendor orphan count: %', issue_count;
  else
    raise notice 'vendors table absent; vendor orphan check skipped';
  end if;

  if to_regclass('public.media_assets') is not null then
    execute $sql$
      select count(*) from public.software s
      where (
        nullif(to_jsonb(s) ->> 'logo_media_asset_id', '') is not null
        and not exists (
          select 1 from public.media_assets m
          where m.media_asset_id::text = to_jsonb(s) ->> 'logo_media_asset_id'
        )
      ) or (
        nullif(to_jsonb(s) ->> 'featured_media_asset_id', '') is not null
        and not exists (
          select 1 from public.media_assets m
          where m.media_asset_id::text = to_jsonb(s) ->> 'featured_media_asset_id'
        )
      )
    $sql$ into issue_count;
    raise notice 'software media orphan count: %', issue_count;
  else
    raise notice 'media_assets table absent; media orphan check skipped';
  end if;
end;
$$;

-- E. POST-BACKFILL / PRE-CONSTRAINT CHECKS ----------------------------------

select 'software_null_or_blank_slug' as check_name, count(*) as issue_count
from public.software s where nullif(btrim(to_jsonb(s) ->> 'slug'), '') is null
union all
select 'software_duplicate_slug', count(*) from (
  select lower(to_jsonb(s) ->> 'slug') from public.software s
  where nullif(btrim(to_jsonb(s) ->> 'slug'), '') is not null
  group by lower(to_jsonb(s) ->> 'slug') having count(*) > 1
) d
union all
select 'category_null_or_blank_slug', count(*)
from public.categories c where nullif(btrim(to_jsonb(c) ->> 'slug'), '') is null
union all
select 'category_duplicate_slug', count(*) from (
  select lower(to_jsonb(c) ->> 'slug') from public.categories c
  where nullif(btrim(to_jsonb(c) ->> 'slug'), '') is not null
  group by lower(to_jsonb(c) ->> 'slug') having count(*) > 1
) d
union all
select 'multiple_primary_categories', count(*) from (
  select to_jsonb(sc) ->> 'software_id'
  from public.software_categories sc
  where jsonb_typeof(to_jsonb(sc) -> 'primary_category') = 'boolean'
    and to_jsonb(sc) -> 'primary_category' = 'true'::jsonb
  group by to_jsonb(sc) ->> 'software_id' having count(*) > 1
) d
union all
select 'software_missing_strict_fields', count(*) from public.software s
where nullif(to_jsonb(s) ->> 'publication_status', '') is null
   or nullif(to_jsonb(s) ->> 'verification_status', '') is null
   or nullif(to_jsonb(s) ->> 'created_at', '') is null
   or nullif(to_jsonb(s) ->> 'updated_at', '') is null
union all
select 'categories_missing_strict_fields', count(*) from public.categories c
where nullif(to_jsonb(c) ->> 'publication_status', '') is null
   or nullif(to_jsonb(c) ->> 'sort_order', '') is null
   or nullif(to_jsonb(c) ->> 'created_at', '') is null
   or nullif(to_jsonb(c) ->> 'updated_at', '') is null
union all
select 'software_categories_missing_strict_fields', count(*)
from public.software_categories sc
where to_jsonb(sc) -> 'primary_category' is null
   or nullif(to_jsonb(sc) ->> 'created_at', '') is null
   or nullif(to_jsonb(sc) ->> 'updated_at', '') is null;
