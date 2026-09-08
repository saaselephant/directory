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

## Browser-assisted PartnerStack helper

The helper starts the installed system Chrome normally and then attaches through Chrome's
supported DevTools Protocol on a dynamically allocated localhost-only port. It does not use
Playwright's automated browser launcher, automation flags, stealth plugins, fingerprint
spoofing, CAPTCHA solvers, or Cloudflare workarounds.

Chrome uses a dedicated profile at
`%LOCALAPPDATA%\SaaSElephant\partnerstack-chrome-profile`. This avoids locking or modifying the
everyday Chrome profile while allowing PartnerStack and Cloudflare session cookies to persist
normally between helper runs. The profile is outside the repository, and neither its cookies
nor other browser storage enter capture files. Authentication and any Cloudflare verification
remain interactive and user-controlled. Do not save a PartnerStack password in this dedicated
profile.

Chrome records its dynamically assigned local debugging port in the dedicated profile's
`DevToolsActivePort` file. The helper treats that verified localhost endpoint—not the
short-lived Windows launcher process—as browser availability. A running dedicated instance is
reused when its endpoint is healthy. A stale port file is discarded before launch; Chrome
remains responsible for its own profile locks. For compatibility with earlier helper runs,
read-only Windows process metadata is checked for an exact dedicated-profile command line and
usable localhost endpoint; ordinary Chrome profiles are ignored.

The helper waits for the user to finish authentication before Playwright attaches to the
browser. After attachment, it performs only the documented capture or safe-prefill operations.
When the command finishes, it closes only this dedicated Chrome instance through Chrome's
supported DevTools protocol so the profile is flushed and can be reused safely.

Create a local output directory, then capture each application independently:

```powershell
$captures = Join-Path $env:LOCALAPPDATA "SaaSElephant\affiliate-captures"
New-Item -ItemType Directory -Force $captures
corepack pnpm run affiliate:applications capture --program "ActiveCampaign" --output "$captures\ActiveCampaign.json"
corepack pnpm run affiliate:applications capture --program "1Password" --output "$captures\1Password.json"
corepack pnpm run affiliate:applications capture --program "FreshBooks" --output "$captures\FreshBooks.json"
corepack pnpm run affiliate:applications capture --program "monday.com" --output "$captures\monday.json"
```

For each command, log in and navigate to that program's official application before pressing
Enter in the terminal. Capture detects application regions using visible forms, dialogs,
main/section regions, application headings, grouped controls, and a nearby “Submit
application” button as a marker only. The marker is never clicked. Same-origin and
PartnerStack frames may be inspected; unrelated third-party frame content is not. If an
application appears to be in an inaccessible third-party frame, the capture records an
explicit unsupported-frame diagnosis.

A capture contains only visible, enabled eligible controls. Alongside native
input/select/textarea elements, it supports accessible textboxes, textbox contenteditable
elements, comboboxes (including verified non-submit button triggers), radios/radiogroups, and
checkboxes. Labels may come from associated labels, `aria-label`, or `aria-labelledby`;
required attributes and accessible required markers are retained. Native option values may be
recorded when structural and non-secret. Custom option labels are canonical: the helper may
open only a verified choice trigger, observe visible `option`/`menuitemradio` labels (including
portal-rendered options), and close it with Escape without choosing an option.

Captures exclude hidden, password, file, submit, and reset controls and never read current
entered values, passwords, cookies, request headers, local/session storage, hidden fields, or
unrelated page text. They record safe identity, labels, ARIA role/name, control types, required
flags, choice labels, legal signals, a query/hash/credentials-free HTTPS PartnerStack URL, and
the timestamp. Safe structural diagnostics are retained even for unsupported or not-found
results: sanitized title/URL, visible form/region and control counts, safe labels and button
texts, nearby headings, ARIA summaries, custom-control indicators, and iframe status.

To log in once and capture all four forms sequentially in one dedicated browser session:

```powershell
corepack pnpm run affiliate:applications capture-batch --output-dir "$captures" "ActiveCampaign" "1Password" "FreshBooks" "monday.com"
```

This writes `activecampaign.json`, `1password.json`, `freshbooks.json`, and
`monday-com.json` in the capture directory. PartnerStack session state may remain in the
dedicated OS-local Chrome profile, but never in those capture files or the repository.

Prepare one review report from an explicitly approved profile:

```powershell
corepack pnpm run affiliate:applications prepare --profile "C:\path\approved-profile.json" --output "$captures\review.json" "$captures\ActiveCampaign.json" "$captures\1Password.json" "$captures\FreshBooks.json" "$captures\monday.json"
```

Safely prefill one captured form:

```powershell
corepack pnpm run affiliate:applications prefill --capture "$captures\ActiveCampaign.json" --profile "C:\path\approved-profile.json"
```

The prefill command opens visible Chrome, waits for the human to open the matching official
form, and applies only deterministic values from profile fields listed in `approvedFields`.
Exact captured options are required for native/custom selects and radios, and custom choices
must still have one exact visible option at prefill time. Every other field is reported as
`SKIPPED`. Legal, terms, acceptance, attestation, checkbox, ambiguous choice, unknown claim,
unapproved, and review-required values are never filled.

The browser adapter exposes only `fill`, `select`, and non-legal radio `check` primitives. It
has no general click or keyboard primitive and never presses Enter. Internally, `select` may
click only a captured, re-verified custom choice trigger and its single exact visible option;
`check` may click only a captured, re-verified custom radio. Arbitrary, submit, legal, and
checkbox controls remain unreachable. There is deliberately no submission command or
submission method. After prefill, Chrome stays open while the terminal waits so the human can
review and, if appropriate, submit manually.

Capture outcomes are explicit: `CAPTURED`, `FORM_NOT_CAPTURED`, `FORM_NOT_FOUND`,
`AUTH_REQUIRED`, `UNSUPPORTED_FORM`, or `CAPTURE_FAILED`. Every state other than `CAPTURED`
prepares as `NOT_READY`.
