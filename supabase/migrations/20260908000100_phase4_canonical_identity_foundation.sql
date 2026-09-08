-- Phase 4: provider-neutral identity records and reviewed canonical claims.
-- Existing software, vendor and category identifiers remain canonical.

begin;

do $preflight$
begin
  if to_regclass('public.identity_providers') is not null
     or to_regclass('public.external_identities') is not null
     or to_regclass('public.canonical_identity_claims') is not null then
    raise exception 'identity foundation precondition failed: a target table already exists';
  end if;

  if (
    select format_type(attribute.atttypid, attribute.atttypmod)
    from pg_catalog.pg_attribute as attribute
    where attribute.attrelid = 'public.software'::regclass
      and attribute.attname = 'software_id'
      and not attribute.attisdropped
  ) is distinct from 'text' then
    raise exception 'identity foundation precondition failed: software.software_id is not text';
  end if;

  if (
    select format_type(attribute.atttypid, attribute.atttypmod)
    from pg_catalog.pg_attribute as attribute
    where attribute.attrelid = 'public.vendors'::regclass
      and attribute.attname = 'vendor_id'
      and not attribute.attisdropped
  ) is distinct from 'uuid' then
    raise exception 'identity foundation precondition failed: vendors.vendor_id is not uuid';
  end if;

  if (
    select format_type(attribute.atttypid, attribute.atttypmod)
    from pg_catalog.pg_attribute as attribute
    where attribute.attrelid = 'public.categories'::regclass
      and attribute.attname = 'category_id'
      and not attribute.attisdropped
  ) is distinct from 'text' then
    raise exception 'identity foundation precondition failed: categories.category_id is not text';
  end if;
end
$preflight$;

create table public.identity_providers (
  provider_id uuid primary key default gen_random_uuid(),
  provider_key text not null,
  display_name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saaselephant_identity_providers_key_normalized
    check (
      provider_key = lower(btrim(provider_key))
      and provider_key ~ '^[a-z0-9][a-z0-9_-]*$'
    ),
  constraint saaselephant_identity_providers_display_not_blank
    check (btrim(display_name) <> ''),
  constraint saaselephant_identity_providers_status
    check (status in ('active', 'inactive', 'retired'))
);

create unique index saaselephant_identity_providers_key_uq
  on public.identity_providers(lower(provider_key));

create table public.external_identities (
  external_identity_id uuid primary key default gen_random_uuid(),
  provider_id uuid not null
    references public.identity_providers(provider_id) on delete restrict,
  external_object_type text not null,
  external_id text not null,
  display_name text,
  normalized_name text,
  external_slug text,
  normalized_domain text,
  software_id text references public.software(software_id) on delete set null,
  vendor_id uuid references public.vendors(vendor_id) on delete set null,
  category_id text references public.categories(category_id) on delete set null,
  match_state text not null default 'unmatched',
  match_method text,
  confidence numeric(5, 2),
  match_evidence jsonb not null default '{}'::jsonb,
  source_reference text,
  source_observed_at timestamptz,
  payload_digest text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  supersedes_external_identity_id uuid
    references public.external_identities(external_identity_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saaselephant_external_identity_object_not_blank
    check (
      external_object_type = lower(btrim(external_object_type))
      and external_object_type ~ '^[a-z0-9][a-z0-9_-]*$'
    ),
  constraint saaselephant_external_identity_id_not_blank
    check (external_id = btrim(external_id) and external_id <> ''),
  constraint saaselephant_external_identity_normalized_name_not_blank
    check (normalized_name is null or btrim(normalized_name) <> ''),
  constraint saaselephant_external_identity_slug_not_blank
    check (external_slug is null or btrim(external_slug) <> ''),
  constraint saaselephant_external_identity_domain_normalized
    check (
      normalized_domain is null
      or (
        normalized_domain = lower(btrim(normalized_domain))
        and normalized_domain !~ '[/@:]'
      )
    ),
  constraint saaselephant_external_identity_state
    check (
      match_state in (
        'unmatched',
        'ambiguous',
        'auto_matched',
        'reviewed_matched',
        'ignored',
        'retired'
      )
    ),
  constraint saaselephant_external_identity_method
    check (
      match_method is null
      or match_method in (
        'reviewed_binding',
        'provider_id',
        'product_domain',
        'alias',
        'name_vendor',
        'vendor_identity',
        'fuzzy_suggestion'
      )
    ),
  constraint saaselephant_external_identity_confidence
    check (confidence is null or confidence between 0 and 100),
  constraint saaselephant_external_identity_one_target
    check (num_nonnulls(software_id, vendor_id, category_id) <= 1),
  constraint saaselephant_external_identity_binding_state
    check (
      (
        match_state in ('auto_matched', 'reviewed_matched')
        and num_nonnulls(software_id, vendor_id, category_id) = 1
        and match_method is not null
      )
      or (
        match_state in ('unmatched', 'ambiguous', 'ignored')
        and num_nonnulls(software_id, vendor_id, category_id) = 0
      )
      or (
        match_state = 'retired'
        and num_nonnulls(software_id, vendor_id, category_id) <= 1
      )
    ),
  constraint saaselephant_external_identity_reviewed_binding
    check (
      (
        match_state <> 'reviewed_matched'
        or (match_method = 'reviewed_binding' and reviewed_at is not null)
      )
      and (
        match_method is distinct from 'reviewed_binding'
        or (
          match_state in ('reviewed_matched', 'retired')
          and reviewed_at is not null
        )
      )
    ),
  constraint saaselephant_external_identity_no_fuzzy_binding
    check (
      match_state not in ('auto_matched', 'reviewed_matched')
      or match_method <> 'fuzzy_suggestion'
    ),
  constraint saaselephant_external_identity_seen_order
    check (last_seen_at >= first_seen_at),
  constraint saaselephant_external_identity_not_self_superseding
    check (
      supersedes_external_identity_id is null
      or supersedes_external_identity_id <> external_identity_id
    ),
  constraint saaselephant_external_identity_provider_object_uq
    unique (provider_id, external_object_type, external_id)
);

create index saaselephant_external_identity_review_queue_idx
  on public.external_identities(match_state, provider_id, external_object_type);
create index saaselephant_external_identity_name_idx
  on public.external_identities(normalized_name)
  where normalized_name is not null;
create index saaselephant_external_identity_domain_idx
  on public.external_identities(normalized_domain)
  where normalized_domain is not null;
create index saaselephant_external_identity_software_idx
  on public.external_identities(software_id)
  where software_id is not null;
create index saaselephant_external_identity_vendor_idx
  on public.external_identities(vendor_id)
  where vendor_id is not null;
create index saaselephant_external_identity_category_idx
  on public.external_identities(category_id)
  where category_id is not null;

create table public.canonical_identity_claims (
  identity_claim_id uuid primary key default gen_random_uuid(),
  software_id text references public.software(software_id) on delete cascade,
  vendor_id uuid references public.vendors(vendor_id) on delete cascade,
  category_id text references public.categories(category_id) on delete cascade,
  claim_type text not null,
  claim_scope text not null,
  display_value text not null,
  normalized_value text not null,
  status text not null default 'active',
  verified_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  source_external_identity_id uuid
    references public.external_identities(external_identity_id) on delete set null,
  source_url text,
  source_reference text,
  valid_from timestamptz,
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saaselephant_identity_claim_one_target
    check (num_nonnulls(software_id, vendor_id, category_id) = 1),
  constraint saaselephant_identity_claim_type
    check (claim_type in ('name', 'slug', 'domain')),
  constraint saaselephant_identity_claim_scope
    check (
      claim_scope in ('canonical', 'official_vendor', 'product_specific', 'historical')
    ),
  constraint saaselephant_identity_claim_value_not_blank
    check (btrim(display_value) <> '' and btrim(normalized_value) <> ''),
  constraint saaselephant_identity_claim_domain_normalized
    check (
      claim_type <> 'domain'
      or (
        normalized_value = lower(btrim(normalized_value))
        and normalized_value !~ '[/@:[:space:]]'
      )
    ),
  constraint saaselephant_identity_claim_status
    check (status in ('active', 'historical', 'disputed')),
  constraint saaselephant_identity_claim_source_http
    check (source_url is null or source_url ~* '^https?://'),
  constraint saaselephant_identity_claim_valid_window
    check (valid_until is null or valid_from is null or valid_until > valid_from)
);

create unique index saaselephant_identity_claim_software_uq
  on public.canonical_identity_claims(
    software_id, claim_type, claim_scope, normalized_value
  )
  where software_id is not null;
create unique index saaselephant_identity_claim_vendor_uq
  on public.canonical_identity_claims(
    vendor_id, claim_type, claim_scope, normalized_value
  )
  where vendor_id is not null;
create unique index saaselephant_identity_claim_category_uq
  on public.canonical_identity_claims(
    category_id, claim_type, claim_scope, normalized_value
  )
  where category_id is not null;
create index saaselephant_identity_claim_lookup_idx
  on public.canonical_identity_claims(claim_type, normalized_value, status);

create function public.saaselephant_clear_removed_external_identity_target()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if num_nonnulls(old.software_id, old.vendor_id, old.category_id) = 1
     and num_nonnulls(new.software_id, new.vendor_id, new.category_id) = 0
     and old.match_state in ('auto_matched', 'reviewed_matched')
     and new.match_state is not distinct from old.match_state then
    new.match_state := 'unmatched';
    new.match_method := null;
    new.confidence := null;
    new.match_evidence := old.match_evidence || pg_catalog.jsonb_build_object(
      'canonical_target_removed_at',
      now()
    );
  end if;
  return new;
end;
$$;

revoke all on function public.saaselephant_clear_removed_external_identity_target()
  from public, anon, authenticated;

create trigger saaselephant_external_identity_clear_removed_target
before update of software_id, vendor_id, category_id
on public.external_identities
for each row execute function public.saaselephant_clear_removed_external_identity_target();

create trigger saaselephant_identity_providers_updated_at
before update on public.identity_providers
for each row execute function public.saaselephant_set_updated_at();
create trigger saaselephant_external_identities_updated_at
before update on public.external_identities
for each row execute function public.saaselephant_set_updated_at();
create trigger saaselephant_canonical_identity_claims_updated_at
before update on public.canonical_identity_claims
for each row execute function public.saaselephant_set_updated_at();

alter table public.identity_providers enable row level security;
alter table public.external_identities enable row level security;
alter table public.canonical_identity_claims enable row level security;

revoke all privileges on table public.identity_providers
  from public, anon, authenticated;
revoke all privileges on table public.external_identities
  from public, anon, authenticated;
revoke all privileges on table public.canonical_identity_claims
  from public, anon, authenticated;

-- Seed only current canonical names/slugs and vendor-level domains. These claims
-- remain unreviewed (verified_at is null), so they cannot authorize auto-binding.
with prepared as (
  select
    software_id,
    software_name as display_value,
    lower(
      regexp_replace(
        regexp_replace(normalize(btrim(software_name), NFKC), '&', ' and ', 'g'),
        '[^[:alnum:]]+',
        ' ',
        'g'
      )
    ) as normalized_value
  from public.software
  where nullif(btrim(software_name), '') is not null
)
insert into public.canonical_identity_claims (
  software_id, claim_type, claim_scope, display_value, normalized_value,
  source_reference
)
select
  software_id, 'name', 'canonical', display_value, btrim(normalized_value),
  'phase4_catalog_seed'
from prepared
where nullif(btrim(normalized_value), '') is not null
on conflict (
  software_id, claim_type, claim_scope, normalized_value
) where software_id is not null do nothing;

insert into public.canonical_identity_claims (
  software_id, claim_type, claim_scope, display_value, normalized_value,
  source_reference
)
select
  software_id, 'slug', 'canonical', slug, lower(btrim(slug)),
  'phase4_catalog_seed'
from public.software
where nullif(btrim(slug), '') is not null
on conflict (
  software_id, claim_type, claim_scope, normalized_value
) where software_id is not null do nothing;

with prepared as (
  select
    vendor_id,
    vendor_name as display_value,
    lower(
      regexp_replace(
        regexp_replace(normalize(btrim(vendor_name), NFKC), '&', ' and ', 'g'),
        '[^[:alnum:]]+',
        ' ',
        'g'
      )
    ) as normalized_value
  from public.vendors
  where nullif(btrim(vendor_name), '') is not null
)
insert into public.canonical_identity_claims (
  vendor_id, claim_type, claim_scope, display_value, normalized_value,
  source_reference
)
select
  vendor_id, 'name', 'canonical', display_value, btrim(normalized_value),
  'phase4_catalog_seed'
from prepared
where nullif(btrim(normalized_value), '') is not null
on conflict (
  vendor_id, claim_type, claim_scope, normalized_value
) where vendor_id is not null do nothing;

insert into public.canonical_identity_claims (
  vendor_id, claim_type, claim_scope, display_value, normalized_value,
  source_reference
)
select
  vendor_id, 'slug', 'canonical', slug, lower(btrim(slug)),
  'phase4_catalog_seed'
from public.vendors
where nullif(btrim(slug), '') is not null
on conflict (
  vendor_id, claim_type, claim_scope, normalized_value
) where vendor_id is not null do nothing;

with prepared as (
  select
    vendor_id,
    website_url as display_value,
    regexp_replace(
      substring(lower(btrim(website_url)) from '^https?://([^/:?#]+)'),
      '^www\.',
      ''
    ) as normalized_value
  from public.vendors
  where website_url ~* '^https?://'
)
insert into public.canonical_identity_claims (
  vendor_id, claim_type, claim_scope, display_value, normalized_value,
  source_reference
)
select
  vendor_id, 'domain', 'official_vendor', display_value, normalized_value,
  'phase4_catalog_seed'
from prepared
where nullif(btrim(normalized_value), '') is not null
on conflict (
  vendor_id, claim_type, claim_scope, normalized_value
) where vendor_id is not null do nothing;

with prepared as (
  select
    category_id,
    category_name as display_value,
    lower(
      regexp_replace(
        regexp_replace(normalize(btrim(category_name), NFKC), '&', ' and ', 'g'),
        '[^[:alnum:]]+',
        ' ',
        'g'
      )
    ) as normalized_value
  from public.categories
  where nullif(btrim(category_name), '') is not null
)
insert into public.canonical_identity_claims (
  category_id, claim_type, claim_scope, display_value, normalized_value,
  source_reference
)
select
  category_id, 'name', 'canonical', display_value, btrim(normalized_value),
  'phase4_catalog_seed'
from prepared
where nullif(btrim(normalized_value), '') is not null
on conflict (
  category_id, claim_type, claim_scope, normalized_value
) where category_id is not null do nothing;

insert into public.canonical_identity_claims (
  category_id, claim_type, claim_scope, display_value, normalized_value,
  source_reference
)
select
  category_id, 'slug', 'canonical', slug, lower(btrim(slug)),
  'phase4_catalog_seed'
from public.categories
where nullif(btrim(slug), '') is not null
on conflict (
  category_id, claim_type, claim_scope, normalized_value
) where category_id is not null do nothing;

comment on table public.external_identities is
  'Provider objects and review state; provider identifiers never replace SaaSElephant canonical IDs.';
comment on table public.canonical_identity_claims is
  'Canonical evidence. Only active claims with verified_at set may authorize automatic matching.';

commit;
