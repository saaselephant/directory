# Offline affiliate application preparation

`src/lib/affiliate-discovery/application.ts` prepares reviewable answers from one approved,
reusable business profile. It is pure TypeScript: it performs no network, authentication,
database, outbound-link, or submission operation.

The question contract retains network/program identity, the exact captured label, a semantic
key only when confidently recognized, field type, captured options, required/legal/program
flags, provenance, and observation time. The answer contract retains question identity,
value/profile source, provenance, confidence, deterministic/generated flags, review reason,
and approval state.

Only approved country, website, a sufficiently specific pre-authored promotional plan, and
primary method are deterministic. Choice fields require one exact label/value match. There is
no fuzzy matching. Legal/acceptance controls, unusual prompts, program-specific claims,
agency/client management, and unsupported or absent audience/traffic/revenue facts remain in
review with no fabricated value. An explicit approved program-specific value may be carried
only as a review draft.

Profile facts are optional until explicitly supplied and approved. Missing source identifiers,
form options, provenance timestamps, and PartnerStack program IDs remain `null`; fixture names
are never repurposed as provider identifiers.

The offline fixtures preserve the seven supplied ActiveCampaign labels. Choices that were not
observed remain `null`. The 1Password, FreshBooks, and monday.com forms are represented as
`FORM_NOT_CAPTURED` with no invented questions. Fixture profile values are clearly synthetic
test data, not SaaSElephant business facts.

The report lists reusable approved fields, deterministic answers, review questions, missing
profile information, legal items, uncaptured forms, and a per-program
`NOT_READY`/`NEEDS_REVIEW`/`READY_TO_APPLY` result. Submission authorization is a separate
object and defaults to false. `READY_TO_APPLY` is preparation status only; this module has no
submission executor.
