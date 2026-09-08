import { createHash } from "node:crypto";

import type { ProductFactoryBatchResult, ProductFactoryReadyPayload } from "./product-factory";

const SQL_JSON_DELIMITER = "$product_factory_batch$";

interface PublicationCategory {
  categoryId: string;
  slug: string;
  primaryCategory: boolean;
}

interface PublicationProvenance {
  url: string;
  retrievedAt: string;
  sourceType: string;
}

export interface CatalogPublicationRecord {
  batchId: string;
  batchDigest: string;
  idempotencyKey: string;
  providerKey: string;
  externalObjectType: string;
  externalId: string;
  softwareId: string;
  softwareName: string;
  softwareSlug: string;
  vendorResolution: "existing" | "create";
  vendorId: string | null;
  vendorName: string;
  vendorCanonicalName: string;
  vendorSlug: string;
  vendorWebsiteUrl: string;
  websiteUrl: string;
  shortDescription: string;
  keyFeatures: string;
  pricing: string | null;
  categories: PublicationCategory[];
  provenance: PublicationProvenance[];
  sourceUrl: string;
  sourceObservedAt: string;
}

export interface CatalogPublicationBatch {
  batchId: string;
  batchDigest: string;
  records: CatalogPublicationRecord[];
}

function parseProviderKey(value: string): [string, string, string] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Product Factory idempotency key is not valid JSON.");
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length !== 3 ||
    parsed.some((item) => typeof item !== "string" || item.trim() === "")
  ) {
    throw new Error("Product Factory idempotency key must contain three nonblank strings.");
  }
  return parsed as [string, string, string];
}

function canonicalVendorName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

function stableSoftwareId(slug: string): string {
  const digest = createHash("sha256").update(slug, "utf8").digest("hex").slice(0, 24);
  return `PF-${digest}`;
}

function dedupeCategories(
  categories: ProductFactoryReadyPayload["categories"],
): PublicationCategory[] {
  const deduped = new Map<string, PublicationCategory>();
  for (const category of categories) {
    const prior = deduped.get(category.category_id);
    deduped.set(category.category_id, {
      categoryId: category.category_id,
      slug: category.slug,
      primaryCategory: Boolean(prior?.primaryCategory || category.primary_category),
    });
  }
  const result = [...deduped.values()].sort((left, right) =>
    left.categoryId.localeCompare(right.categoryId, "en"),
  );
  if (result.filter((category) => category.primaryCategory).length !== 1) {
    throw new Error("Each publication record must resolve to exactly one primary category.");
  }
  return result;
}

function recordFromPayload(
  idempotencyKey: string,
  payload: ProductFactoryReadyPayload,
): Omit<CatalogPublicationRecord, "batchId" | "batchDigest"> {
  const [providerKey, externalObjectType, externalId] = parseProviderKey(idempotencyKey);
  if (
    payload.software.publication_status !== "in_review" ||
    payload.software.verification_status !== "needs_verification" ||
    payload.software.software_id !== null ||
    payload.officialOutboundDestination !== payload.software.website_url
  ) {
    throw new Error(
      "Product Factory payload does not satisfy the controlled publication contract.",
    );
  }
  if (payload.provenance.length === 0) {
    throw new Error("Controlled publication requires first-party provenance.");
  }

  const provenance = payload.provenance
    .map((source) => ({ ...source }))
    .sort((left, right) => left.url.localeCompare(right.url, "en"));
  const sourceObservedAt = provenance.reduce(
    (latest, source) => (source.retrievedAt > latest ? source.retrievedAt : latest),
    provenance[0].retrievedAt,
  );

  return {
    idempotencyKey,
    providerKey,
    externalObjectType,
    externalId,
    softwareId: stableSoftwareId(payload.software.slug),
    softwareName: payload.software.software_name,
    softwareSlug: payload.software.slug,
    vendorResolution: payload.vendor.resolution,
    vendorId: payload.vendor.vendorId,
    vendorName: payload.vendor.vendor_name,
    vendorCanonicalName: canonicalVendorName(payload.vendor.vendor_name),
    vendorSlug: payload.vendor.slug,
    vendorWebsiteUrl: payload.vendor.website_url,
    websiteUrl: payload.software.website_url,
    shortDescription: payload.software.short_description,
    keyFeatures: payload.software.key_features,
    pricing: payload.software.pricing,
    categories: dedupeCategories(payload.categories),
    provenance,
    sourceUrl: provenance[0].url,
    sourceObservedAt,
  };
}

export function prepareCatalogPublicationBatch(
  result: ProductFactoryBatchResult,
): CatalogPublicationBatch {
  if (
    result.processed !== result.results.length ||
    result.ready !== result.results.filter((item) => item.decision === "READY").length ||
    result.exceptions !== result.results.filter((item) => item.decision === "EXCEPTION").length
  ) {
    throw new Error("Product Factory result counters are inconsistent.");
  }

  const prepared = result.results.flatMap((item) => {
    if (item.decision === "EXCEPTION") {
      if (item.payload !== null || item.reasons.length === 0) {
        throw new Error(`Exception candidate "${item.candidate}" is malformed.`);
      }
      return [];
    }
    if (item.payload === null || item.reasons.length > 0) {
      throw new Error(`Ready candidate "${item.candidate}" is malformed.`);
    }
    return [recordFromPayload(item.payload.idempotencyKey, item.payload)];
  });
  if (prepared.length === 0) {
    throw new Error("Publication batch has no READY products.");
  }
  const uniqueProviderObjects = new Set(
    prepared.map((record) =>
      JSON.stringify([record.providerKey, record.externalObjectType, record.externalId]),
    ),
  );
  const uniqueSoftwareIds = new Set(prepared.map((record) => record.softwareId));
  const uniqueSlugs = new Set(
    prepared.map((record) => record.softwareSlug.toLocaleLowerCase("en")),
  );
  const vendorNamesBySlug = new Map<string, Set<string>>();
  for (const record of prepared) {
    const vendorSlug = record.vendorSlug.toLocaleLowerCase("en");
    const names = vendorNamesBySlug.get(vendorSlug) ?? new Set<string>();
    names.add(record.vendorCanonicalName);
    vendorNamesBySlug.set(vendorSlug, names);
  }
  if (
    uniqueProviderObjects.size !== prepared.length ||
    uniqueSoftwareIds.size !== prepared.length ||
    uniqueSlugs.size !== prepared.length ||
    [...vendorNamesBySlug.values()].some((names) => names.size > 1)
  ) {
    throw new Error("Publication batch contains duplicate or conflicting identities.");
  }

  const contentDigest = createHash("sha256").update(JSON.stringify(prepared), "utf8").digest("hex");
  const batchId = `product_factory_${contentDigest.slice(0, 16)}`;
  return {
    batchId,
    batchDigest: contentDigest,
    records: prepared.map((record) => ({
      batchId,
      batchDigest: contentDigest,
      ...record,
    })),
  };
}

export function renderCatalogPublicationSql(batch: CatalogPublicationBatch): string {
  const serialized = JSON.stringify(batch.records);
  if (serialized.includes(SQL_JSON_DELIMITER)) {
    throw new Error("Publication data conflicts with the SQL JSON delimiter.");
  }

  return `-- SaaSElephant controlled Product Factory publication batch.
-- Batch: ${batch.batchId}
-- Digest: ${batch.batchDigest}
-- Run once in the authorized Supabase SQL Editor. Safe reruns are no-ops.

begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';
set local idle_in_transaction_session_timeout = '60s';

lock table public.vendors in share row exclusive mode;
lock table public.software in share row exclusive mode;
lock table public.software_categories in share row exclusive mode;
lock table public.identity_providers in share row exclusive mode;
lock table public.external_identities in share row exclusive mode;
lock table public.canonical_identity_claims in share row exclusive mode;

create temporary table saaselephant_pf_batch on commit drop as
select *
from pg_catalog.jsonb_to_recordset(
  ${SQL_JSON_DELIMITER}${serialized}${SQL_JSON_DELIMITER}::jsonb
) as record(
  "batchId" text,
  "batchDigest" text,
  "idempotencyKey" text,
  "providerKey" text,
  "externalObjectType" text,
  "externalId" text,
  "softwareId" text,
  "softwareName" text,
  "softwareSlug" text,
  "vendorResolution" text,
  "vendorId" uuid,
  "vendorName" text,
  "vendorCanonicalName" text,
  "vendorSlug" text,
  "vendorWebsiteUrl" text,
  "websiteUrl" text,
  "shortDescription" text,
  "keyFeatures" text,
  "pricing" text,
  "categories" jsonb,
  "provenance" jsonb,
  "sourceUrl" text,
  "sourceObservedAt" timestamptz
);

create temporary table saaselephant_pf_counts on commit drop as
select
  (select count(*) from public.software where publication_status = 'published') as public_before,
  (select count(*) from public.software) as software_before,
  (select count(*) from public.vendors) as vendors_before,
  (select count(*) from public.affiliate_programs) as programs_before,
  (select count(*) from public.affiliate_links) as links_before;

do $guard$
begin
  if (select count(*) from saaselephant_pf_batch) <> ${batch.records.length} then
    raise exception 'Product Factory batch row count changed during SQL decoding';
  end if;
  if exists (
    select 1 from saaselephant_pf_batch
    group by lower("providerKey"), lower("externalObjectType"), "externalId"
    having count(*) > 1
  ) or exists (
    select 1 from saaselephant_pf_batch group by lower("softwareSlug") having count(*) > 1
  ) or exists (
    select 1 from saaselephant_pf_batch group by "softwareId" having count(*) > 1
  ) then
    raise exception 'Product Factory batch contains duplicate identities';
  end if;
  if exists (
    select 1
    from saaselephant_pf_batch as batch
    cross join lateral pg_catalog.jsonb_to_recordset(batch."categories")
      as requested("categoryId" text, "slug" text, "primaryCategory" boolean)
    left join public.categories as category
      on category.category_id = requested."categoryId"
     and lower(category.slug) = lower(requested."slug")
     and category.publication_status = 'published'
    where category.category_id is null
  ) then
    raise exception 'A requested category is absent, renamed, or unpublished';
  end if;
  if exists (
    select 1
    from saaselephant_pf_batch as batch
    cross join lateral pg_catalog.jsonb_to_recordset(batch."categories")
      as requested("categoryId" text, "slug" text, "primaryCategory" boolean)
    group by batch."softwareId"
    having count(*) filter (where requested."primaryCategory") <> 1
       or count(*) <> count(distinct requested."categoryId")
  ) then
    raise exception 'Each product must have one primary category and no duplicate categories';
  end if;
end
$guard$;

create temporary table saaselephant_pf_decisions on commit drop as
select batch.*, 'READY'::text as disposition, null::text as reason
from saaselephant_pf_batch as batch;

update saaselephant_pf_decisions as decision
set disposition = case
      when identity.software_id is not null
       and lower(software.slug) = lower(decision."softwareSlug")
       and lower(regexp_replace(btrim(software.vendor), '\\s+', ' ', 'g'))
           = decision."vendorCanonicalName"
        then 'ALREADY_PRESENT'
      else 'EXCLUDED_IDENTITY_CONFLICT'
    end,
    reason = case
      when identity.software_id is not null
       and lower(software.slug) = lower(decision."softwareSlug")
       and lower(regexp_replace(btrim(software.vendor), '\\s+', ' ', 'g'))
           = decision."vendorCanonicalName"
        then 'Provider identity already resolves to this product.'
      else 'Provider identity was previously processed or resolves to another canonical product.'
    end
from public.identity_providers as provider
join public.external_identities as identity on identity.provider_id = provider.provider_id
left join public.software as software on software.software_id = identity.software_id
where decision.disposition = 'READY'
  and lower(provider.provider_key) = lower(decision."providerKey")
  and identity.external_object_type = lower(decision."externalObjectType")
  and identity.external_id = decision."externalId";

update saaselephant_pf_decisions as decision
set disposition = case
      when lower(regexp_replace(btrim(software.software_name), '\\s+', ' ', 'g'))
             = lower(regexp_replace(btrim(decision."softwareName"), '\\s+', ' ', 'g'))
       and lower(regexp_replace(btrim(software.vendor), '\\s+', ' ', 'g'))
             = decision."vendorCanonicalName"
        then 'ALREADY_PRESENT'
      else 'EXCLUDED_SOFTWARE_CONFLICT'
    end,
    reason = case
      when lower(regexp_replace(btrim(software.software_name), '\\s+', ' ', 'g'))
             = lower(regexp_replace(btrim(decision."softwareName"), '\\s+', ' ', 'g'))
       and lower(regexp_replace(btrim(software.vendor), '\\s+', ' ', 'g'))
             = decision."vendorCanonicalName"
        then 'Canonical software slug already exists for this product.'
      else 'Canonical software slug or generated software ID belongs to another product.'
    end
from public.software as software
where decision.disposition = 'READY'
  and (
    lower(software.slug) = lower(decision."softwareSlug")
    or software.software_id = decision."softwareId"
  );

update saaselephant_pf_decisions as decision
set disposition = 'ALREADY_PRESENT',
    reason = 'Exact normalized product name and vendor already exist.'
where decision.disposition = 'READY'
  and exists (
    select 1
    from public.software as software
    where lower(regexp_replace(btrim(software.software_name), '\\s+', ' ', 'g'))
            = lower(regexp_replace(btrim(decision."softwareName"), '\\s+', ' ', 'g'))
      and lower(regexp_replace(btrim(software.vendor), '\\s+', ' ', 'g'))
            = decision."vendorCanonicalName"
  );

update saaselephant_pf_decisions as decision
set disposition = 'EXCLUDED_AMBIGUOUS_IDENTITY',
    reason = 'Exact normalized product name exists under another vendor.'
where decision.disposition = 'READY'
  and exists (
    select 1
    from public.software as software
    where lower(regexp_replace(btrim(software.software_name), '\\s+', ' ', 'g'))
            = lower(regexp_replace(btrim(decision."softwareName"), '\\s+', ' ', 'g'))
      and lower(regexp_replace(btrim(software.vendor), '\\s+', ' ', 'g'))
            <> decision."vendorCanonicalName"
  );

update saaselephant_pf_decisions as decision
set disposition = 'EXCLUDED_SOFTWARE_CONFLICT',
    reason = 'Exact official product URL already belongs to another product.'
where decision.disposition = 'READY'
  and exists (
    select 1
    from public.software as software
    where lower(regexp_replace(btrim(software.website_url), '/+$', ''))
            = lower(regexp_replace(btrim(decision."websiteUrl"), '/+$', ''))
  );

update saaselephant_pf_decisions as decision
set disposition = 'EXCLUDED_IDENTITY_CONFLICT',
    reason = 'A reviewed canonical name or slug claim already resolves this identity.'
where decision.disposition = 'READY'
  and exists (
    select 1
    from public.canonical_identity_claims as claim
    where claim.software_id is not null
      and claim.status = 'active'
      and claim.verified_at is not null
      and (
        (claim.claim_type = 'slug'
          and claim.normalized_value = lower(decision."softwareSlug"))
        or
        (claim.claim_type = 'name'
          and claim.normalized_value = lower(
            regexp_replace(
              regexp_replace(normalize(btrim(decision."softwareName"), NFKC), '&', ' and ', 'g'),
              '[^[:alnum:]]+', ' ', 'g'
            )
          ))
      )
  );

update saaselephant_pf_decisions as decision
set disposition = 'EXCLUDED_VENDOR_CONFLICT',
    reason = 'Previously resolved canonical vendor is missing or no longer matches.'
where decision.disposition = 'READY'
  and decision."vendorResolution" = 'existing'
  and not exists (
    select 1
    from public.vendors as vendor
    where vendor.vendor_id = decision."vendorId"
      and btrim(lower(regexp_replace(
        regexp_replace(normalize(btrim(vendor.vendor_name), NFKC), '&', ' and ', 'g'),
        '[^[:alnum:]]+', ' ', 'g'
      ))) = btrim(lower(regexp_replace(
        regexp_replace(normalize(btrim(decision."vendorName"), NFKC), '&', ' and ', 'g'),
        '[^[:alnum:]]+', ' ', 'g'
      )))
  );

update saaselephant_pf_decisions as decision
set disposition = 'EXCLUDED_VENDOR_CONFLICT',
    reason = 'Vendor slug belongs to a differently named canonical vendor.'
where decision.disposition = 'READY'
  and decision."vendorResolution" = 'create'
  and exists (
    select 1
    from public.vendors as vendor
    where lower(vendor.slug) = lower(decision."vendorSlug")
      and lower(regexp_replace(btrim(vendor.canonical_name), '\\s+', ' ', 'g'))
            <> decision."vendorCanonicalName"
  );

update saaselephant_pf_decisions as decision
set disposition = 'EXCLUDED_VENDOR_CONFLICT',
    reason = 'Official vendor domain belongs to another canonical vendor.'
where decision.disposition = 'READY'
  and decision."vendorResolution" = 'create'
  and exists (
    select 1
    from public.canonical_identity_claims as claim
    join public.vendors as vendor on vendor.vendor_id = claim.vendor_id
    where claim.claim_type = 'domain'
      and claim.claim_scope = 'official_vendor'
      and claim.status = 'active'
      and claim.normalized_value = regexp_replace(
        substring(lower(decision."vendorWebsiteUrl") from '^https?://([^/:?#]+)'),
        '^www\\.', ''
      )
      and lower(regexp_replace(btrim(vendor.canonical_name), '\\s+', ' ', 'g'))
            <> decision."vendorCanonicalName"
  );

update saaselephant_pf_decisions as decision
set disposition = 'EXCLUDED_VENDOR_CONFLICT',
    reason = 'Existing vendor website domain belongs to another canonical vendor.'
where decision.disposition = 'READY'
  and decision."vendorResolution" = 'create'
  and exists (
    select 1
    from public.vendors as vendor
    where vendor.website_url ~* '^https?://'
      and regexp_replace(
            substring(lower(vendor.website_url) from '^https?://([^/:?#]+)'),
            '^www\\.', ''
          ) = regexp_replace(
            substring(lower(decision."vendorWebsiteUrl") from '^https?://([^/:?#]+)'),
            '^www\\.', ''
          )
      and lower(regexp_replace(btrim(vendor.canonical_name), '\\s+', ' ', 'g'))
            <> decision."vendorCanonicalName"
  );

do $guard$
begin
  if exists (
    select 1
    from saaselephant_pf_decisions
    where disposition = 'READY'
    group by "vendorCanonicalName"
    having count(distinct lower("vendorSlug")) > 1
  ) then
    raise exception 'Batch proposes conflicting slugs for one canonical vendor';
  end if;
end
$guard$;

create temporary table saaselephant_pf_new_vendors on commit drop as
select distinct on (decision."vendorCanonicalName")
  decision."vendorName" as vendor_name,
  decision."vendorCanonicalName" as canonical_name,
  decision."vendorSlug" as slug,
  decision."vendorWebsiteUrl" as website_url,
  decision."sourceUrl" as source_url,
  decision."batchId" as batch_id
from saaselephant_pf_decisions as decision
where decision.disposition = 'READY'
  and decision."vendorResolution" = 'create'
  and not exists (
    select 1 from public.vendors as vendor
    where lower(regexp_replace(btrim(vendor.canonical_name), '\\s+', ' ', 'g'))
          = decision."vendorCanonicalName"
  )
order by decision."vendorCanonicalName", decision."softwareSlug";

insert into public.vendors (
  vendor_name, canonical_name, slug, website_url, status
)
select
  vendor_name, canonical_name, slug, website_url,
  'active'::public.saaselephant_record_status
from saaselephant_pf_new_vendors
on conflict (canonical_name) do nothing;

create temporary table saaselephant_pf_ready on commit drop as
select decision.*, vendor.vendor_id
from saaselephant_pf_decisions as decision
join public.vendors as vendor
  on (
    decision."vendorResolution" = 'existing'
    and vendor.vendor_id = decision."vendorId"
  ) or (
    decision."vendorResolution" = 'create'
    and lower(regexp_replace(btrim(vendor.canonical_name), '\\s+', ' ', 'g'))
        = decision."vendorCanonicalName"
  )
where decision.disposition = 'READY';

do $guard$
begin
  if (select count(*) from saaselephant_pf_ready)
     <> (select count(*) from saaselephant_pf_decisions where disposition = 'READY') then
    raise exception 'Every READY product must resolve to exactly one vendor';
  end if;
end
$guard$;

insert into public.identity_providers (provider_key, display_name, status)
select distinct lower("providerKey"), 'Official web', 'active'
from saaselephant_pf_ready
on conflict (lower(provider_key)) do nothing;

insert into public.software (
  software_id, software_name, vendor, website_url, short_description,
  full_description, best_for, key_features, pricing, free_plan, free_trial,
  status, vendor_id, slug, publication_status, verification_status,
  verified_at, created_at, updated_at
)
select
  ready."softwareId", ready."softwareName", ready."vendorName", ready."websiteUrl",
  ready."shortDescription", null, null, ready."keyFeatures", ready."pricing",
  null, null, 'Candidate', ready.vendor_id, ready."softwareSlug",
  'in_review'::public.saaselephant_publication_status,
  'needs_verification'::public.saaselephant_verification_status,
  null, now(), now()
from saaselephant_pf_ready as ready;

insert into public.software_categories (
  software_id, category_id, primary_category, verified_on, created_at, updated_at
)
select
  ready."softwareId", requested."categoryId", requested."primaryCategory",
  null, now(), now()
from saaselephant_pf_ready as ready
cross join lateral pg_catalog.jsonb_to_recordset(ready."categories")
  as requested("categoryId" text, "slug" text, "primaryCategory" boolean);

insert into public.canonical_identity_claims (
  software_id, claim_type, claim_scope, display_value, normalized_value,
  source_url, source_reference
)
select
  ready."softwareId", 'name', 'canonical', ready."softwareName",
  btrim(lower(regexp_replace(
    regexp_replace(normalize(btrim(ready."softwareName"), NFKC), '&', ' and ', 'g'),
    '[^[:alnum:]]+', ' ', 'g'
  ))),
  ready."sourceUrl", ready."batchId"
from saaselephant_pf_ready as ready
union all
select
  ready."softwareId", 'slug', 'canonical', ready."softwareSlug",
  lower(btrim(ready."softwareSlug")), ready."sourceUrl", ready."batchId"
from saaselephant_pf_ready as ready
on conflict (
  software_id, claim_type, claim_scope, normalized_value
) where software_id is not null do nothing;

with proposed_vendor_claims as (
  select
    ready.vendor_id, 'name'::text as claim_type, 'canonical'::text as claim_scope,
    ready."vendorName" as display_value,
    btrim(lower(regexp_replace(
      regexp_replace(normalize(btrim(ready."vendorName"), NFKC), '&', ' and ', 'g'),
      '[^[:alnum:]]+', ' ', 'g'
    ))) as normalized_value,
    ready."sourceUrl" as source_url, ready."batchId" as source_reference
  from saaselephant_pf_ready as ready
  join saaselephant_pf_new_vendors as new_vendor
    on new_vendor.canonical_name = ready."vendorCanonicalName"
  union all
  select
    ready.vendor_id, 'slug', 'canonical', ready."vendorSlug",
    lower(btrim(ready."vendorSlug")), ready."sourceUrl", ready."batchId"
  from saaselephant_pf_ready as ready
  join saaselephant_pf_new_vendors as new_vendor
    on new_vendor.canonical_name = ready."vendorCanonicalName"
  union all
  select
    ready.vendor_id, 'domain', 'official_vendor', ready."vendorWebsiteUrl",
    regexp_replace(
      substring(lower(ready."vendorWebsiteUrl") from '^https?://([^/:?#]+)'),
      '^www\\.', ''
    ),
    ready."sourceUrl", ready."batchId"
  from saaselephant_pf_ready as ready
  join saaselephant_pf_new_vendors as new_vendor
    on new_vendor.canonical_name = ready."vendorCanonicalName"
), deduplicated_vendor_claims as (
  select distinct on (vendor_id, claim_type, claim_scope, normalized_value)
    vendor_id, claim_type, claim_scope, display_value, normalized_value,
    source_url, source_reference
  from proposed_vendor_claims
  order by vendor_id, claim_type, claim_scope, normalized_value, source_url
)
insert into public.canonical_identity_claims (
  vendor_id, claim_type, claim_scope, display_value, normalized_value,
  source_url, source_reference
)
select
  vendor_id, claim_type, claim_scope, display_value, normalized_value,
  source_url, source_reference
from deduplicated_vendor_claims
on conflict (
  vendor_id, claim_type, claim_scope, normalized_value
) where vendor_id is not null do nothing;

insert into public.external_identities (
  provider_id, external_object_type, external_id, display_name, normalized_name,
  external_slug, normalized_domain, software_id, match_state, match_method,
  confidence, match_evidence, source_reference, source_observed_at,
  payload_digest, first_seen_at, last_seen_at
)
select
  provider.provider_id,
  lower(ready."externalObjectType"),
  ready."externalId",
  ready."softwareName",
  btrim(lower(regexp_replace(
    regexp_replace(normalize(btrim(ready."softwareName"), NFKC), '&', ' and ', 'g'),
    '[^[:alnum:]]+', ' ', 'g'
  ))),
  lower(ready."softwareSlug"),
  regexp_replace(
    substring(lower(ready."websiteUrl") from '^https?://([^/:?#]+)'),
    '^www\\.', ''
  ),
  ready."softwareId",
  'auto_matched',
  'provider_id',
  100,
  pg_catalog.jsonb_build_object(
    'batch_id', ready."batchId",
    'idempotency_key', ready."idempotencyKey",
    'provenance', ready."provenance"
  ),
  ready."idempotencyKey",
  ready."sourceObservedAt",
  ready."batchDigest",
  now(),
  now()
from saaselephant_pf_ready as ready
join public.identity_providers as provider
  on lower(provider.provider_key) = lower(ready."providerKey");

update public.software as software
set publication_status = 'published'::public.saaselephant_publication_status
from saaselephant_pf_ready as ready
where software.software_id = ready."softwareId"
  and software.publication_status = 'in_review';

do $postcondition$
declare
  expected_new bigint;
begin
  select count(*) into expected_new from saaselephant_pf_ready;
  if (select count(*) from public.software)
       <> (select software_before + expected_new from saaselephant_pf_counts)
     or (select count(*) from public.software where publication_status = 'published')
       <> (select public_before + expected_new from saaselephant_pf_counts) then
    raise exception 'Software count postcondition failed';
  end if;
  if (select count(*) from public.vendors)
       <> (select vendors_before from saaselephant_pf_counts)
        + (select count(*) from saaselephant_pf_new_vendors) then
    raise exception 'Vendor count postcondition failed';
  end if;
  if exists (
    select 1
    from saaselephant_pf_ready as ready
    left join public.software as software on software.software_id = ready."softwareId"
    left join public.external_identities as identity
      on identity.software_id = ready."softwareId"
     and identity.external_id = ready."externalId"
    where software.publication_status <> 'published'
       or software.vendor_id <> ready.vendor_id
       or identity.external_identity_id is null
  ) then
    raise exception 'Published product or identity binding postcondition failed';
  end if;
  if exists (
    select 1
    from saaselephant_pf_ready as ready
    where (
      select count(*)
      from public.software_categories as relationship
      where relationship.software_id = ready."softwareId"
    ) <> pg_catalog.jsonb_array_length(ready."categories")
  ) then
    raise exception 'Software category postcondition failed';
  end if;
  if (select count(*) from public.affiliate_programs)
       <> (select programs_before from saaselephant_pf_counts)
     or (select count(*) from public.affiliate_links)
       <> (select links_before from saaselephant_pf_counts) then
    raise exception 'Affiliate records changed during Product Factory publication';
  end if;
end
$postcondition$;

select
  decision."softwareName" as product,
  case when decision.disposition = 'READY' then 'PUBLISHED' else decision.disposition end as result,
  decision.reason,
  case when decision.disposition = 'READY' then '/software/' || decision."softwareSlug" end
    as public_route,
  (select public_before from saaselephant_pf_counts) as public_count_before,
  (select count(*) from public.software where publication_status = 'published')
    as public_count_after
from saaselephant_pf_decisions as decision
order by decision."softwareName";

commit;
`;
}
