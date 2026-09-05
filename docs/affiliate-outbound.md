# V1 affiliate outbound flow

Public product CTAs use `/go/[slug]`. The server first reads the existing published-only
software repository, then calls `saaselephant_software_outbound(p_software_slug text)`.
Only the public Supabase API key is used, without user cookies or an alternate secret.

The RPC returns void and sets a 303 Location response, never URL JSON or affiliate rows.
Its narrow anon EXECUTE grant is deliberate: anyone can follow a public redirect.
Direct RPC access also produces only a redirect. Destinations are absent from normal
page HTML/data; a browser necessarily sees the destination when a redirect occurs.

This uses PostgREST's documented response headers/status mechanism:
https://postgrest.org/en/stable/references/transactions.html#response-headers

The server fetch uses `redirect: manual`, so it never follows the vendor redirect or
forwards API credentials to a vendor. It applies the existing strict HTTPS DNS validator
to Location, ignores browser query parameters, and returns no-store responses.
SQL applies conservative HTTPS DNS validation (no ports). Only fixed slug input is accepted.

Eligibility requires published software, a matching program/software relationship,
program status Active (case-insensitive), verified program and link with non-future
verification timestamps, active link status, and a current validity window. Highest
priority wins, with link ID as a deterministic tie-break. Catalogue verification is
independent. Program verification here records independently confirmed affiliate eligibility.

If no link qualifies, use the safe official website. Missing-function rollout errors and
transport failures also use the already-read safe official website. Explicit denial or
the RPC's own unavailable response fails closed. No stale affiliate response is cached.
A concurrent publication change is checked again by the RPC; network failures cannot
provide a stronger freshness guarantee than the initial published read.

Click tracking is deferred. No analytics writes or personal information collection exist,
and navigation has no dependency on analytics. Conversion ingestion is out of scope.

## Separate production activation (not performed by this batch)

1. Review and apply `20260905000200_phase3_affiliate_outbound.sql` separately. Verify
   effective permissions and 303/no-store/Location handling through the production API,
   including direct API calls, before adding a real destination.
2. Confirm the existing Pipedrive software ID, slug, program ID and association. Do not
   infer IDs or insert a duplicate program.
3. Independently record the confirmed active program approval as verified, including
   `verified_at` and existing evidence fields. Commercial terms remain private.
4. Insert one real `affiliate_links` row referencing that software and program, with the
   separately supplied approved referral destination, its canonical URL, active status,
   verified status, verification timestamp and reviewed validity window/priority. No URL
   is seeded or embedded in application code by this batch.
5. Software must be published through the existing separately authorized workflow before
   any /go route is usable. Software verification alone does not publish or activate links.
6. Confirm eligible routing, inactive/expired fallback, private-table denial and that
   public pages disclose neither referral URLs nor internal affiliate information.

No exact data INSERT/UPDATE is supplied because the real software/program IDs and
current row values have not been inspected here. The user-supplied Pipedrive approval
is business context, not an instruction for this batch to mutate production.

There is no isolated database permission-test runner in this repository. Local tests
cover application behavior and migration source contracts, not executed PostgreSQL
eligibility or gateway response behavior.
