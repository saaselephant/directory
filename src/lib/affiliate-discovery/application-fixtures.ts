import type { AffiliateApplicationProfile, AffiliateApplicationProgram } from "./application";

const activeCampaignProgram = {
  network: "partnerstack",
  programId: null,
  programName: "ActiveCampaign",
} as const;

function activeCampaignQuestion(
  id: string,
  exactLabel: string,
  semanticKey:
    | "COUNTRY"
    | "WEBSITE"
    | "PROMOTIONAL_PLAN"
    | "PRIMARY_PROMOTIONAL_METHOD"
    | "AGENCY_CLIENT_MANAGEMENT"
    | "LEGACY_AFFILIATE_EMAIL"
    | "SUPPORT_RESOURCES",
  fieldType: "text" | "email" | "url" | "textarea" | "select" | "radio",
  required: boolean,
  programSpecific = false,
) {
  return {
    id,
    ...activeCampaignProgram,
    exactLabel,
    semanticKey,
    fieldType,
    options: null,
    required,
    legal: false,
    programSpecific,
    provenance: {
      kind: "fixture" as const,
      reference: "user-supplied-activecampaign-question-labels",
    },
    observedAt: null,
  };
}

/**
 * The labels are the supplied capture. Unobserved choices remain null rather than being guessed.
 */
export const OFFLINE_APPLICATION_FIXTURES: readonly AffiliateApplicationProgram[] = [
  {
    ...activeCampaignProgram,
    workflowState: "DISCOVERED",
    formCaptureState: "CAPTURED",
    formCaptureReason: null,
    questions: [
      activeCampaignQuestion("activecampaign-country", "Country", "COUNTRY", "select", true),
      activeCampaignQuestion("activecampaign-website", "Website", "WEBSITE", "url", true),
      activeCampaignQuestion(
        "activecampaign-promotion-plan",
        "How do you plan to promote ActiveCampaign?",
        "PROMOTIONAL_PLAN",
        "textarea",
        true,
      ),
      activeCampaignQuestion(
        "activecampaign-primary-method",
        "What is your primary promotional method?",
        "PRIMARY_PROMOTIONAL_METHOD",
        "select",
        true,
      ),
      activeCampaignQuestion(
        "activecampaign-agency-clients",
        "If you selected Agency/Consultancy above, do you plan to maintain a relationship with your clients by managing their ActiveCampaign account or selling additional services?",
        "AGENCY_CLIENT_MANAGEMENT",
        "radio",
        false,
        true,
      ),
      activeCampaignQuestion(
        "activecampaign-legacy-email",
        "If you were a member of our legacy affiliate program, please provide the email address associated with your ActiveCampaign affiliate account:",
        "LEGACY_AFFILIATE_EMAIL",
        "email",
        false,
        true,
      ),
      activeCampaignQuestion(
        "activecampaign-support",
        "How can we best support your promotional efforts? Please tell us about the resources that would be most valuable to you.",
        "SUPPORT_RESOURCES",
        "textarea",
        false,
      ),
    ],
  },
  ...["1Password", "FreshBooks", "monday.com"].map(
    (programName): AffiliateApplicationProgram => ({
      network: "partnerstack",
      programId: null,
      programName,
      workflowState: "DISCOVERED",
      formCaptureState: "FORM_NOT_CAPTURED",
      formCaptureReason: "No application form capture was supplied.",
      questions: [],
    }),
  ),
];

/** Synthetic values used only to exercise offline preparation; they are not SaaSElephant facts. */
export const SYNTHETIC_APPLICATION_PROFILE_FIXTURE: AffiliateApplicationProfile = {
  id: "synthetic-editorial-profile",
  businessName: "Example Software Research",
  website: "https://example.com",
  country: "India",
  location: "India",
  businessDescription:
    "An independent software research publisher producing educational product comparisons.",
  partnerType: "Affiliate",
  promotionalModel: "Editorial software education",
  promotionalPlan:
    "We publish independent product tutorials and comparison articles, then distribute them through our website and opt-in newsletter to software buyers researching suitable tools.",
  primaryPromotionalMethod: "Content",
  promotionalMethods: ["product tutorials", "comparison articles"],
  promotionalChannels: ["website", "opt-in newsletter"],
  industries: ["Software"],
  customerSegments: ["Software buyers"],
  preferredCommissionStructure: "Recurring revenue share",
  supportResources: "Accurate product documentation, approved brand assets, and release updates.",
  approvedFields: [
    "businessName",
    "website",
    "country",
    "location",
    "businessDescription",
    "partnerType",
    "promotionalModel",
    "promotionalPlan",
    "primaryPromotionalMethod",
    "promotionalMethods",
    "promotionalChannels",
    "industries",
    "customerSegments",
    "preferredCommissionStructure",
    "supportResources",
  ],
  provenance: {
    reference: "synthetic-test-profile",
    observedAt: null,
  },
};
