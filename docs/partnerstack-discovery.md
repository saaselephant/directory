# Offline PartnerStack marketplace review

This milestone reads local JSON and produces a private business review report. It does not authenticate, fetch network data, load application configuration, write a database, or enable any affiliate link. The existing matching core remains unchanged. Provider approval is evidence only; import, verification and activation remain separate authorized work.

## Run locally

From `C:\SaaSElephant`, with repository dependencies installed:

```powershell
node scripts/partnerstack-review.mjs src/lib/affiliate-discovery/__tests__/fixtures/partnerstack-marketplace.json src/lib/affiliate-discovery/__tests__/fixtures/software-inventory.json
```

For real inputs, substitute your local capture and current inventory paths. JSON goes to stdout; diagnostics go to stderr and failures exit nonzero. To save UTF-8 output in PowerShell:

```powershell
node scripts/partnerstack-review.mjs C:\private\marketplace.json C:\private\inventory.json | Set-Content -Encoding utf8 C:\private\review.json
```

The launcher uses the existing TypeScript dependency to compile only the offline dependency graph into a unique temporary directory, then removes that directory. No new dependency or application build is needed. Keep real captures/reports in a private local directory outside tracked/public assets. The committed fixtures contain synthetic data only.

## Capture format v1

This is our explicit local capture contract, **not a documented PartnerStack native export/API schema**. No authenticated response or actual export was supplied. Map captured marketplace fields into this structure in bulk; a future API client can map its response into the same record contract and call `createPartnerStackAdapter(source).normalize(record)`. Matching and reporting do not depend on transport or PartnerStack fields.

```json
{
  "schemaVersion": 1,
  "source": {
    "kind": "export",
    "reference": "your-local-capture-reference",
    "observedAt": "2026-09-08T10:00:00+05:30",
    "provenance": "Describe how this data was captured"
  },
  "programs": [
    {
      "name": "Captured marketplace display name",
      "programId": "captured-program-id",
      "companyId": "captured-company-id",
      "commission": { "text": "Verbatim captured proposition" }
    }
  ]
}
```

Only `schemaVersion`, `programs`, and a nonempty `name` for each valid record are required. Omit unavailable fields; do not manufacture IDs, timestamps, company names, commission values, or application states. Unknown fields are ignored. Invalid envelopes fail the command; malformed rows are retained with issues and held in category D.

Supported optional record fields:

| Fields                                                                 | Meaning                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `programId`, `companyId`                                               | Separate program/company identifiers; strings or nonnegative safe integers. Company identity never substitutes for program identity.                                                                                                                                                                                              |
| `vendorName`, `productName`, `softwareSlugHint`                        | Explicit captured identity evidence; hints require deterministic matching.                                                                                                                                                                                                                                                        |
| `description`                                                          | Captured program description.                                                                                                                                                                                                                                                                                                     |
| `programUrl`, `applicationUrl`, `destinationUrl`                       | Safe HTTPS URLs. Marketplace/application hosts are never used as official product domains. Destination must be the captured official landing URL, not a network tracking URL.                                                                                                                                                     |
| `domains`                                                              | Array of captured official product hosts or HTTPS URLs; no DNS/network lookup.                                                                                                                                                                                                                                                    |
| `commission.text`, `.model`, `.value`, `.recurring`, `.cookieDuration` | Strings retained without numeric guesses. A model label is mapped only when it exactly normalizes to Revenue Share, Revenue Sharing, CPL, CPA, CPC, or the supported cost-per labels. Mixed models/free prose remain `unknown`. If no model is supplied, a text consisting solely of one supported label can establish the model. |
| `commission.metadata`                                                  | Captured JSON object with additional terms.                                                                                                                                                                                                                                                                                       |
| `partnerTypes`                                                         | Captured string labels, without inferring acceptance from other fields.                                                                                                                                                                                                                                                           |
| `supportsSubIds`                                                       | Boolean; missing means unknown, distinct from false.                                                                                                                                                                                                                                                                              |
| `relationship`                                                         | Original text retained. Available/Not applied maps to available, Applied/Pending to applied, Approved to approved, Rejected to rejected; other values remain unknown. This is program application state, not Network Profile approval.                                                                                            |
| `source`                                                               | Optional per-row overrides of envelope provenance. Kind is export/api; timestamps require ISO format with timezone. Missing timestamps stay null.                                                                                                                                                                                 |

The original display name is retained. Exact `X by Y` syntax provides product X/vendor Y; `X (formerly Y)` provides current product X and former name Y. Ordinary display names serve as product names. Explicit conflicting product/vendor fields generate review evidence. No fuzzy matching, suffix guessing, or automatic former-name alias binding occurs.

## Inventory input

Provide a JSON array containing the **complete current catalog snapshot**, including unpublished software where applicable:

```json
[
  {
    "id": "actual-software-id",
    "slug": "actual-slug",
    "name": "Actual catalog name",
    "vendorName": null,
    "websiteUrl": null
  }
]
```

IDs, slugs and names are required; vendor and safe HTTPS website are optional. Duplicate IDs/slugs and malformed inventory fail the command. An empty inventory is allowed, but naturally yields no existing catalog matches. The report includes inventory count and input paths; its findings are relative to that supplied snapshot. It cannot establish absence from production using a partial snapshot.

## Review classifications

- **A — EXISTING_CATALOG_MATCH:** deterministic suggested match to supplied software. Human review is still required, even for a provider-approved program.
- **B — UNMATCHED_COMMERCIAL_OPPORTUNITY:** no deterministic catalog match; review commercial fit and inventory completeness before considering a listing. This is not a revenue forecast.
- **C — AMBIGUOUS_REVIEW_REQUIRED:** shared product families, conflicting exact identity evidence, conflicting reviewed bindings, or former names pointing to another existing catalog entry.
- **D — DUPLICATE_OR_INVALID:** malformed rows or every member of a duplicate fingerprint group. No copy is silently selected or merged. Fingerprints use the existing strongest-available evidence; different IDs are not automatically merged just because names match.

Each entry includes input index, reasons, normalized candidate, matched ID/slug where applicable, original commission proposition/metadata, model, partner types, Sub-ID support, application state and provenance. Output is deterministic and candidates are not mutated. The network-neutral report adds conservative conflict checks around the existing matcher without changing its precedence rules. Reviewed bindings can be passed to the report API; this CLI intentionally accepts only marketplace and inventory inputs.

## Fixture business review

All fixture IDs, terms, states and URLs are synthetic examples, not verified offers or a real production catalog export. The fixture timestamp is test provenance. The user's supplied business context identifies monday.com, ActiveCampaign and 1Password as current catalog products; actual IDs, slugs and current terms must come from real input.

The generated [sample report](partnerstack-fixture-review.md) demonstrates all four categories. The full evidence is reproducible with the command above. A real capture and complete current inventory are the next inputs required for an actionable acquisition list. Pipedrive's existing production affiliate flow is outside this milestone.
