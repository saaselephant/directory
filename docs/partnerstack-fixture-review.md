# PartnerStack fixture business review

**SYNTHETIC DEMONSTRATION ONLY.** These are representative test records, not captured offers or a current production inventory. No term, rate, approval or software ID below is verified.

Input: 15 program rows; 7 synthetic catalog records. Source: synthetic-marketplace-fixture-v1; fixture timestamp: 2026-09-08T00:00:00Z.

Reproduce the complete JSON evidence with the local command in [the adapter guide](partnerstack-discovery.md).

## EXISTING_CATALOG_MATCH (6)

| Row | Program                    | Matched slug   | Commission proposition (synthetic)          | Model         | Partner types        | Sub-IDs | Application state | Evidence                                      |
| --- | -------------------------- | -------------- | ------------------------------------------- | ------------- | -------------------- | ------- | ----------------- | --------------------------------------------- |
| 0   | monday.com                 | monday         | Example only: 20% revenue share             | revenue_share | Affiliate, Publisher | true    | Not applied       | Matched the exact normalized official domain. |
| 1   | ActiveCampaign             | activecampaign | Example only: qualified lead reward         | cpl           | Referral Partner     | false   | Applied           | Matched the exact normalized official domain. |
| 2   | 1Password                  | 1password      | Example only: acquisition reward            | cpa           | Unknown              | Unknown | Approved          | Matched the exact normalized product name.    |
| 3   | Freshdesk by Freshworks    | freshdesk      | Example only: reward per click              | cpc           | Unknown              | Unknown | unknown           | Matched the exact normalized product name.    |
| 4   | Freshservice by Freshworks | freshservice   | Unknown                                     | unknown       | Unknown              | Unknown | unknown           | Matched the exact normalized product name.    |
| 5   | Kit (formerly ConvertKit)  | kit            | Earn up to a variable percentage; see terms | unknown       | Unknown              | Unknown | unknown           | Matched the exact normalized product name.    |

## UNMATCHED_COMMERCIAL_OPPORTUNITY (1)

| Row | Program                  | Matched slug | Commission proposition (synthetic) | Model   | Partner types | Sub-IDs | Application state | Evidence                                                                                                                    |
| --- | ------------------------ | ------------ | ---------------------------------- | ------- | ------------- | ------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 7   | Example Future Analytics | Unknown      | Contact the program for terms      | unknown | Publisher     | Unknown | unknown           | No deterministic match in the supplied inventory. Review commercial fit and catalog completeness before creating a listing. |

## AMBIGUOUS_REVIEW_REQUIRED (3)

| Row | Program                  | Matched slug | Commission proposition (synthetic) | Model   | Partner types | Sub-IDs | Application state | Evidence                                                                                                                      |
| --- | ------------------------ | ------------ | ---------------------------------- | ------- | ------------- | ------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 6   | Quo (formerly OpenPhone) | Unknown      | Unknown                            | unknown | Unknown       | Unknown | Waitlisted        | Former name matches existing catalog records: openphone. Review the rename before matching or adding a listing.               |
| 8   | Freshworks               | Unknown      | Unknown                            | unknown | Unknown       | Unknown | unknown           | Matched the exact normalized official domain. Multiple software records matched: freshdesk, freshservice.                     |
| 9   | ActiveCampaign           | Unknown      | Unknown                            | unknown | Unknown       | Unknown | unknown           | Conflicting exact identity evidence: domain monday.com; product ActiveCampaign. Matched the exact normalized official domain. |

## DUPLICATE_OR_INVALID (5)

| Row | Program           | Matched slug | Commission proposition (synthetic) | Model   | Partner types | Sub-IDs | Application state | Evidence                                                                                                         |
| --- | ----------------- | ------------ | ---------------------------------- | ------- | ------------- | ------- | ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| 10  | Example Duplicate | Unknown      | Unknown                            | unknown | Unknown       | Unknown | unknown           | Candidates share the same external-program-id fingerprint. Input indexes: 10, 11. All copies held for review.    |
| 11  | Example Duplicate | Unknown      | Updated terms                      | unknown | Unknown       | Unknown | unknown           | Candidates share the same external-program-id fingerprint. Input indexes: 10, 11. All copies held for review.    |
| 12  | (missing name)    | Unknown      | Unknown                            | unknown | Unknown       | Unknown | unknown           | name: A program display name is required.                                                                        |
| 13  | Malformed Program | Unknown      | Unknown                            | unknown | Unknown       | Unknown | unknown           | supportsSubIds: Expected true or false. destinationUrl: Expected a safe HTTPS URL. programId: Expected a string. |
| 14  | (missing name)    | Unknown      | Unknown                            | unknown | Unknown       | Unknown | unknown           | record: Program must be an object. name: A program display name is required.                                     |

## Commercial interpretation

The sample identifies monday.com, ActiveCampaign and 1Password as existing-catalog monetization review opportunities. Freshdesk, Freshservice and Kit also match the synthetic inventory, demonstrating distinct product handling; their actual production presence is not established here. Example Future Analytics demonstrates the future-listing queue. Quo is held for a rename review because the sample catalog contains OpenPhone; the report avoids proposing a duplicate listing. Freshworks family ambiguity and contradictory ActiveCampaign/monday.com evidence remain blocked for review. Both duplicate copies and all malformed rows are held.

Next, map one real local marketplace capture into the documented format and run it against a complete current SaaSElephant inventory export. Review category A for affiliate acquisition, category B for catalog expansion, and resolve C/D before any separately authorized import.
