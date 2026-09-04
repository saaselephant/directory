# Phase 2: additive schema hardening

## Safety boundary

Phase 2 is preparation only. No SQL in this repository has been applied to Supabase. The production data, stable IDs, existing RLS, 43 currently known `software` rows, root `index.html`, and `CNAME` remain unchanged.

Stop before migration if preflight finds an incompatible column, identifier type, constraint, trigger, function, index, grant, policy, or object-name collision. Test the exact files on a recent production snapshot and take an approved backup before production execution.

## Preserved and new objects

The migrations preserve every column and row in `software`, `categories`, `software_categories`, and `affiliate_programs`. They add nullable V1 columns without backfilling. In particular, `software.vendor` and `affiliate_programs.affiliate_url` remain available throughout V1.

New tables are `vendors`, `affiliate_links`, `features`, `software_features`, `software_relationships`, `comparison_pages`, `comparison_page_products`, `media_assets`, `user_roles`, `affiliate_clicks`, `affiliate_conversions`, `verification_events`, and `audit_log`.

References to existing IDs are derived with `CREATE TABLE AS ... WITH NO DATA`. Preflight must still confirm that production ID expressions, domains/collations, and referenced PK/unique constraints are compatible. Generated Supabase types replace the provisional TypeScript contract only after that confirmation.

## Intended migration order

1. Run `supabase/preflight/phase2_preflight.sql` read-only and archive all sections.
2. Obtain schema/data-owner approval for every compatibility result.
3. On a disposable database restored from production, apply:
   1. `20260904000100_phase2_types_and_helpers.sql`
   2. `20260904000200_phase2_existing_tables_additive.sql`
   3. `20260904000300_phase2_new_core_tables.sql`
   4. `20260904000400_phase2_indexes_functions_and_triggers.sql`
4. Re-run the post-additive preflight sections.
5. Review and run a copy of `supabase/reconciliation/phase2_backfill_plan.sql`. Its checked-in form ends with `ROLLBACK`.
6. Re-run the post-backfill/pre-constraint checks and approve every exception explicitly.
7. Apply `supabase/constraints/phase2_constraints_after_reconciliation.sql` manually.
8. Generate Supabase types and replace provisional application types.
9. Add application grants and RLS policies in a separate, reviewed migration with allow/deny database tests.

## Publication and verification

Publication and verification are independent enums. Automatic schema migrations leave all new fields on existing rows null and cannot publish anything.

The manual reconciliation maps legacy `Candidate` to `in_review`, not `published`. Only a legacy value already explicitly equal to `published` maps to `published`; all other unknown software states map to `draft`. Active categories conservatively map to `in_review`. Editors must explicitly approve publication later.

Software and affiliate-link freshness use `verification_status` independently of general record status. Verification events record the subject, result, time, source, and actor context.

## Affiliate routing policy

`affiliate_programs` remains program metadata and retains `affiliate_url`. `affiliate_links` represents independently selectable CTA destinations.

`saaselephant_select_verified_affiliate_link` returns only a link that is:

- `active`;
- `verified` with a non-null `verified_at`;
- valid at the requested instant (`valid_from` inclusive and `valid_until` exclusive).

It orders by priority descending and UUID ascending for a deterministic final tie-break. If no link qualifies, the function returns no row. The future `/go/[affiliate-link-id]` route must not fall back to an unverified affiliate link. It may display no affiliate CTA or use the software website as an explicitly non-affiliate destination.

Legacy affiliate URLs are copied as `pending`; a later verification action is required before routing can select them.

## Slugs and vendor normalization

Software and category backfill uses a readable ASCII prefix with a fallback (`software` or `category`) plus the complete hex encoding of the stable existing ID. This is deterministic and injective for the ID text representation, including UUID, numeric, text, null-name, blank-name, and non-ASCII-name cases. Existing nonblank slugs are never overwritten. Uniqueness remains deferred until post-backfill checks pass.

Vendor canonical names collapse whitespace and case. `vendors.canonical_name` is the reconciliation key; `vendor_name` remains display text. A prospective vendor UUID is generated before insertion and its complete UUID disambiguates the vendor slug. `ON CONFLICT (canonical_name) DO NOTHING` permits safe reruns and preserves manually reviewed rows. `software.vendor` is never changed.

Affiliate URLs lowercase only scheme and host, preserve path/query case, and remove trailing slashes. `legacy_source_key` is derived from the complete affiliate-program ID. Backfill checks both the source key and canonical software/URL pair, and uses conflict handling for partial or repeated execution.

## Clicks, conversions, and money

`affiliate_clicks` supports `/go/[affiliate-link-id]`, a database-unique first-party attribution UUID, optional session/browser context, and an optional short-lived keyed IP hash. Raw IP addresses are not modeled or required. Operational retention must delete expired hashes.

`affiliate_conversions` separates event identity from commercial identity. It supports network, external event/reference, order, subscription/customer reference, recurring indicator, commission period, installment sequence, exact `numeric(20,6)` money, ISO currency, status, import batch, payload digest, occurrence time, and receipt time.

Idempotency is enforced per network and external event ID, and independently per network and payload digest. Recurring installments may share an order/subscription while using distinct event IDs or payload digests, so the original order does not incorrectly deduplicate later commissions.

## Security, roles, and future access

Each new table enables RLS and revokes all `anon`/`authenticated` table access in the same migration file immediately after creation. Existing-table RLS, grants, and policies are never altered. The affiliate selection function also starts without public/API execute permission.

`user_roles` references `auth.users` and supports only `platform_admin`, `editor`, `affiliate_manager`, and `analyst`. It creates no public profile or signup model.

Future browser or Next.js user-scoped access requires a separate migration that grants only required operations and adds operation-specific policies using `auth.uid()`/role checks. Future trusted server jobs should use a narrowly scoped database role or reviewed server credential; this phase neither stores nor uses a service-role key. Grants and policies must be tested for both `anon` and `authenticated` before deployment.

## Audit and polymorphic history

`verification_events` and `audit_log` use a restricted entity-type enum. Their text `entity_id` is intentionally polymorphic because one immutable history stream spans several tables with different ID types. These references may outlive deleted source records and therefore deliberately do not use a polymorphic foreign key.

Direct relationships use real foreign keys wherever practical, including links, clicks, conversions, software features, comparisons, media, vendors, roles, and Auth actors. Auth actor IDs use `ON DELETE SET NULL`; `actor_identity_snapshot` and `actor_system` preserve historical context without a check that could block Auth user deletion.

## Count reconciliation

Forty-three is informational: it is the currently approved observation, not a schema invariant. The preflight reports 43 beside the observed count.

Immediately before an approved backfill, capture and sign off the actual count. The manual script records that count in a transaction-local temporary guard and aborts if the ending count differs. A deployment record should retain the approved before/after counts. No reusable constraint or schema object depends on 43.

## Constraint rollout

The strict script remains outside automatic migrations. It checks every proposed strict field, duplicate slug/pair, multiple primary category, and vendor/media/software/category/program orphan before proceeding.

Eligible foreign keys and not-null checks are added `NOT VALID`, validated separately, then columns become `NOT NULL`. Unique enforcement occurs only after explicit duplicate checks. For the current small baseline, plain index creation is acceptable during an approved maintenance window. If tables have materially grown, build unique indexes with `CREATE UNIQUE INDEX CONCURRENTLY` as individually monitored, non-transactional steps, then attach constraints where appropriate.

## Safest stopping points and recovery

- Before `001`: no change.
- After `001`: namespaced types/helper exist but no table data or behavior changed.
- After `002`: new empty locked-down `vendors` and nullable existing-table columns exist; the legacy application remains usable.
- After `003`: all new tables exist empty and locked down.
- After `004`: indexes and namespaced `updated_at` triggers are active; stop only after verifying trigger behavior.
- After reconciliation but before strict constraints: additive data exists and should be forward-corrected rather than discarded.
- After strict constraints: roll forward unless a tested structural rollback is explicitly approved.

Structural rollback before use can remove new triggers, functions, tables, nullable columns, and types in reverse dependency order. No automated destructive rollback is supplied. Once new tables contain clicks, conversions, verification, or audit history, dropping them is unacceptable. Original `software` rows and IDs must never be deleted during rollback; recovery restores compatible schema behavior around those rows or restores the full approved backup.

## Production requirements still deferred

- Actual schema/type/constraint/object compatibility.
- Resolution of duplicates, orphans, malformed URLs, and ambiguous primary categories.
- Migration testing against a recent production snapshot.
- Lock-duration measurement and final concurrent-index decision.
- Application RLS policies, minimal grants, and database security tests.
- Generated Supabase TypeScript types.
- Explicit editorial publication and affiliate-link verification workflows.
- Production execution, backfill, and all public application dependencies.
