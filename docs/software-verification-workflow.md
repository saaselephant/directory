# Software verification workflow

For SaaSElephant V1, **verified** means that a platform administrator checked the public
catalogue facts against current authoritative evidence at a recorded time and found them
reasonably supported. It is not certification, endorsement, warranty, security or legal
approval, or a guarantee of pricing or vendor claims.

Primary evidence is an official product or vendor website, official pricing page, official
documentation/help centre, or an official announcement. G2, Capterra, Reddit, independent
blogs, and affiliate-network material may supplement that evidence but are not sufficient on
their own. AI-generated summaries alone are not evidence.

The reviewer checks product and vendor identity, the canonical product URL, public catalogue
descriptions, category assignments, best-for claims, and any populated pricing/free-plan/free-
trial claims. Unknown optional facts may remain empty; unsupported claims should not be added.

Verification and publication remain independent in V1. Software verification does not verify
an affiliate link, affiliate approval, or commission terms. `verified_at` is the authoritative
timestamp for the latest successful verification. The legacy `last_verified` date remains
read-only compatibility data.

Each successful verification or return-to-verification transition is recorded atomically in
`verification_events`. The application never stores copied vendor-page content or exposes the
reviewing administrator's identity publicly.
