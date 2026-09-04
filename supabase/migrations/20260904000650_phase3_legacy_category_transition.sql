-- SaaSElephant V1 Phase 3: controlled transition of 43 legacy categories.
-- Updates only publication_status; no category is published by this migration.

begin;

do $$
begin
  if (select count(*) from public.categories) <> 43 then
    raise exception 'precondition failed: expected exactly 43 categories';
  end if;

  if (select count(*) from public.software_categories) <> 71 then
    raise exception 'precondition failed: expected exactly 71 software/category relationships';
  end if;

  if exists (select 1 from public.categories where publication_status is not null) then
    raise exception 'precondition failed: expected every category publication_status to be null';
  end if;

  if exists (
    select 1 from public.categories
    where category_id is null or btrim(category_id) = ''
      or category_name is null or btrim(category_name) = ''
      or slug is null or btrim(slug) = ''
  ) then
    raise exception 'precondition failed: category IDs, names, and slugs must be nonblank';
  end if;

  if (select count(distinct lower(btrim(slug))) from public.categories) <> 43 then
    raise exception 'precondition failed: category slugs are not case-insensitively unique';
  end if;

  if exists (
    select 1
    from public.categories child
    left join public.categories parent on parent.category_id = child.parent_category_id
    where child.parent_category_id is not null and parent.category_id is null
  ) then
    raise exception 'precondition failed: orphan parent_category_id detected';
  end if;

  if exists (
    select 1 from public.categories where category_id = parent_category_id
  ) then
    raise exception 'precondition failed: self-parent category detected';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_trigger
    where tgrelid = 'public.categories'::regclass
      and tgname = 'saaselephant_categories_updated_at'
      and not tgisinternal
      and tgenabled <> 'D'
  ) then
    raise exception 'precondition failed: expected enabled category timestamp trigger';
  end if;
end;
$$;

create temporary table saaselephant_legacy_category_snapshot
on commit drop
as
select
  category_id,
  to_jsonb(categories) - 'publication_status' as preserved_data
from public.categories;

create temporary table saaselephant_taxonomy_relationship_snapshot
on commit drop
as
select to_jsonb(software_categories) as preserved_data
from public.software_categories;

alter table public.categories disable trigger saaselephant_categories_updated_at;

update public.categories
set publication_status = 'in_review'::public.saaselephant_publication_status
where publication_status is null;

alter table public.categories enable trigger saaselephant_categories_updated_at;

do $$
begin
  if (select count(*) from public.categories) <> 43 then
    raise exception 'postcondition failed: expected exactly 43 categories';
  end if;

  if (select count(*) from public.software_categories) <> 71 then
    raise exception 'postcondition failed: relationship count changed';
  end if;

  if (select count(*) from public.categories where publication_status = 'in_review') <> 43 then
    raise exception 'postcondition failed: not all categories transitioned to in_review';
  end if;

  if exists (select 1 from public.categories where publication_status = 'published') then
    raise exception 'postcondition failed: a category was automatically published';
  end if;

  if exists (
    select category_id, preserved_data
    from saaselephant_legacy_category_snapshot
    except all
    select category_id, to_jsonb(categories) - 'publication_status'
    from public.categories
  ) or exists (
    select category_id, to_jsonb(categories) - 'publication_status'
    from public.categories
    except all
    select category_id, preserved_data
    from saaselephant_legacy_category_snapshot
  ) then
    raise exception 'postcondition failed: protected category data changed';
  end if;

  if exists (
    select preserved_data from saaselephant_taxonomy_relationship_snapshot
    except all
    select to_jsonb(software_categories) from public.software_categories
  ) or exists (
    select to_jsonb(software_categories) from public.software_categories
    except all
    select preserved_data from saaselephant_taxonomy_relationship_snapshot
  ) then
    raise exception 'postcondition failed: taxonomy relationship rows changed';
  end if;

  if exists (
    select 1
    from public.categories child
    left join public.categories parent on parent.category_id = child.parent_category_id
    where child.parent_category_id is not null and parent.category_id is null
  ) then
    raise exception 'postcondition failed: orphan parent_category_id detected';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_trigger
    where tgrelid = 'public.categories'::regclass
      and tgname = 'saaselephant_categories_updated_at'
      and not tgisinternal
      and tgenabled <> 'D'
  ) then
    raise exception 'postcondition failed: category timestamp trigger is not enabled';
  end if;
end;
$$;

commit;
