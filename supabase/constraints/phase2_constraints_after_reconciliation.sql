-- MANUAL/DEFERRED. Keep outside supabase/migrations until every preflight gate
-- passes on a production snapshot and immediately before production execution.
-- Plain index creation is acceptable for the current small baseline; use CREATE
-- UNIQUE INDEX CONCURRENTLY in separately managed steps if tables have grown.

begin;

do $$
begin
  if exists (select 1 from public.software where slug is null or btrim(slug) = '') then
    raise exception 'software slug reconciliation is incomplete';
  end if;
  if exists (select 1 from public.categories where slug is null or btrim(slug) = '') then
    raise exception 'category slug reconciliation is incomplete';
  end if;
  if exists (
    select 1 from public.software group by lower(slug) having count(*) > 1
  ) then raise exception 'duplicate software slugs remain'; end if;
  if exists (
    select 1 from public.categories group by lower(slug) having count(*) > 1
  ) then raise exception 'duplicate category slugs remain'; end if;
  if exists (
    select 1 from public.software_categories
    group by software_id, category_id having count(*) > 1
  ) then raise exception 'duplicate software/category pairs remain'; end if;
  if exists (
    select 1 from public.software_categories where primary_category is true
    group by software_id having count(*) > 1
  ) then raise exception 'multiple primary categories remain'; end if;
  if exists (
    select 1 from public.software_categories sc
    left join public.software s on s.software_id = sc.software_id
    where s.software_id is null
  ) then raise exception 'orphan software_categories.software_id rows remain'; end if;
  if exists (
    select 1 from public.software_categories sc
    left join public.categories c on c.category_id = sc.category_id
    where c.category_id is null
  ) then raise exception 'orphan software_categories.category_id rows remain'; end if;
  if exists (
    select 1 from public.affiliate_programs ap
    left join public.software s on s.software_id = ap.software_id
    where s.software_id is null
  ) then raise exception 'orphan affiliate_programs.software_id rows remain'; end if;
  if exists (
    select 1 from public.software s
    left join public.vendors v on v.vendor_id = s.vendor_id
    where s.vendor_id is not null and v.vendor_id is null
  ) then raise exception 'orphan software.vendor_id rows remain'; end if;
  if exists (
    select 1 from public.software s
    left join public.media_assets m on m.media_asset_id = s.logo_media_asset_id
    where s.logo_media_asset_id is not null and m.media_asset_id is null
  ) then raise exception 'orphan software.logo_media_asset_id rows remain'; end if;
  if exists (
    select 1 from public.software s
    left join public.media_assets m on m.media_asset_id = s.featured_media_asset_id
    where s.featured_media_asset_id is not null and m.media_asset_id is null
  ) then raise exception 'orphan software.featured_media_asset_id rows remain'; end if;
  if exists (
    select 1 from public.software
    where publication_status is null or verification_status is null
      or created_at is null or updated_at is null
  ) then raise exception 'software strict fields contain nulls'; end if;
  if exists (
    select 1 from public.categories
    where publication_status is null or sort_order is null
      or created_at is null or updated_at is null
  ) then raise exception 'category strict fields contain nulls'; end if;
  if exists (
    select 1 from public.software_categories
    where primary_category is null or created_at is null or updated_at is null
  ) then raise exception 'software_categories strict fields contain nulls'; end if;
end;
$$;

create unique index if not exists saaselephant_software_slug_uq
  on public.software(lower(slug));
create unique index if not exists saaselephant_categories_slug_uq
  on public.categories(lower(slug));
create unique index if not exists saaselephant_software_categories_pair_uq
  on public.software_categories(software_id, category_id);
create unique index if not exists saaselephant_software_categories_one_primary_uq
  on public.software_categories(software_id) where primary_category is true;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.software'::regclass
      and conname = 'saaselephant_software_slug_nn'
  ) then
    alter table public.software add constraint saaselephant_software_slug_nn
      check (slug is not null) not valid;
    alter table public.software add constraint saaselephant_software_publication_nn
      check (publication_status is not null) not valid;
    alter table public.software add constraint saaselephant_software_verification_nn
      check (verification_status is not null) not valid;
    alter table public.software add constraint saaselephant_software_created_nn
      check (created_at is not null) not valid;
    alter table public.software add constraint saaselephant_software_updated_nn
      check (updated_at is not null) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.categories'::regclass
      and conname = 'saaselephant_categories_slug_nn'
  ) then
    alter table public.categories add constraint saaselephant_categories_slug_nn
      check (slug is not null) not valid;
    alter table public.categories add constraint saaselephant_categories_publication_nn
      check (publication_status is not null) not valid;
    alter table public.categories add constraint saaselephant_categories_sort_order_nn
      check (sort_order is not null) not valid;
    alter table public.categories add constraint saaselephant_categories_created_nn
      check (created_at is not null) not valid;
    alter table public.categories add constraint saaselephant_categories_updated_nn
      check (updated_at is not null) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.software_categories'::regclass
      and conname = 'saaselephant_software_categories_primary_nn'
  ) then
    alter table public.software_categories
      add constraint saaselephant_software_categories_primary_nn
      check (primary_category is not null) not valid;
    alter table public.software_categories
      add constraint saaselephant_software_categories_created_nn
      check (created_at is not null) not valid;
    alter table public.software_categories
      add constraint saaselephant_software_categories_updated_nn
      check (updated_at is not null) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.software_categories'::regclass
      and conname = 'saaselephant_software_categories_software_fk'
  ) then
    alter table public.software_categories
      add constraint saaselephant_software_categories_software_fk
      foreign key (software_id) references public.software(software_id) not valid;
    alter table public.software_categories
      add constraint saaselephant_software_categories_category_fk
      foreign key (category_id) references public.categories(category_id) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.affiliate_programs'::regclass
      and conname = 'saaselephant_affiliate_programs_software_fk'
  ) then
    alter table public.affiliate_programs
      add constraint saaselephant_affiliate_programs_software_fk
      foreign key (software_id) references public.software(software_id) not valid;
  end if;
end;
$$;

alter table public.software
  validate constraint saaselephant_software_slug_nn,
  validate constraint saaselephant_software_publication_nn,
  validate constraint saaselephant_software_verification_nn,
  validate constraint saaselephant_software_created_nn,
  validate constraint saaselephant_software_updated_nn,
  validate constraint saaselephant_software_vendor_fk,
  validate constraint saaselephant_software_logo_media_fk,
  validate constraint saaselephant_software_featured_media_fk;

alter table public.categories
  validate constraint saaselephant_categories_slug_nn,
  validate constraint saaselephant_categories_publication_nn,
  validate constraint saaselephant_categories_sort_order_nn,
  validate constraint saaselephant_categories_created_nn,
  validate constraint saaselephant_categories_updated_nn;

alter table public.software_categories
  validate constraint saaselephant_software_categories_primary_nn,
  validate constraint saaselephant_software_categories_created_nn,
  validate constraint saaselephant_software_categories_updated_nn,
  validate constraint saaselephant_software_categories_software_fk,
  validate constraint saaselephant_software_categories_category_fk;

alter table public.affiliate_programs
  validate constraint saaselephant_affiliate_programs_software_fk;

alter table public.software
  alter column slug set not null,
  alter column publication_status set not null,
  alter column verification_status set not null,
  alter column created_at set not null,
  alter column updated_at set not null;

commit;
alter table public.categories
  alter column slug set not null,
  alter column publication_status set not null,
  alter column sort_order set not null,
  alter column created_at set not null,
  alter column updated_at set not null;
alter table public.software_categories
  alter column primary_category set default false,
  alter column primary_category set not null,
  alter column created_at set not null,
  alter column updated_at set not null;
