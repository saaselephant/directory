import type { AffiliateNetwork } from "./types";

export const APPLICATION_WORKFLOW_STATES = [
  "DISCOVERED",
  "NEEDS_REVIEW",
  "READY_TO_APPLY",
  "SUBMITTED",
  "ON_HOLD_NETWORK_APPROVAL",
  "PENDING_PROGRAM_REVIEW",
  "JOINED",
  "REJECTED",
  "NEEDS_ACTION",
] as const;

export type ApplicationWorkflowState = (typeof APPLICATION_WORKFLOW_STATES)[number];

export const FORM_CAPTURE_STATES = [
  "CAPTURED",
  "FORM_NOT_CAPTURED",
  "FORM_NOT_FOUND",
  "AUTH_REQUIRED",
  "UNSUPPORTED_FORM",
  "CAPTURE_FAILED",
] as const;
export type FormCaptureState = (typeof FORM_CAPTURE_STATES)[number];

export const APPLICATION_READINESS_STATES = [
  "NOT_READY",
  "NEEDS_REVIEW",
  "READY_TO_APPLY",
] as const;
export type ApplicationReadinessState = (typeof APPLICATION_READINESS_STATES)[number];

export const APPLICATION_SEMANTIC_KEYS = [
  "BUSINESS_NAME",
  "BUSINESS_DESCRIPTION",
  "COUNTRY",
  "LOCATION",
  "WEBSITE",
  "LINKEDIN_URL",
  "PARTNER_TYPE",
  "PROMOTIONAL_MODEL",
  "PROMOTIONAL_METHODS",
  "PROMOTIONAL_CHANNELS",
  "PROMOTIONAL_PLAN",
  "PRIMARY_PROMOTIONAL_METHOD",
  "INDUSTRIES",
  "CUSTOMER_SEGMENTS",
  "BUSINESS_IDENTITY",
  "PREFERRED_COMMISSION_STRUCTURE",
  "RESELLER_DISTRIBUTOR",
  "AGENCY_CLIENT_MANAGEMENT",
  "LEGACY_AFFILIATE_EMAIL",
  "SUPPORT_RESOURCES",
  "AUDIENCE_DESCRIPTION",
  "AUDIENCE_GEOGRAPHY",
  "AUDIENCE_SIZE",
  "TRAFFIC",
  "REVENUE",
  "TERMS_ACCEPTANCE",
  "LEGAL_ATTESTATION",
] as const;

export type ApplicationSemanticKey = (typeof APPLICATION_SEMANTIC_KEYS)[number];
export type QuestionFieldType =
  | "text"
  | "email"
  | "url"
  | "textarea"
  | "select"
  | "radio"
  | "checkbox"
  | "unknown";

export type AffiliateApplicationProfileField =
  | "businessName"
  | "website"
  | "country"
  | "location"
  | "businessDescription"
  | "partnerType"
  | "promotionalModel"
  | "promotionalPlan"
  | "primaryPromotionalMethod"
  | "promotionalMethods"
  | "promotionalChannels"
  | "industries"
  | "customerSegments"
  | "audience.description"
  | "audience.geography"
  | "audience.size"
  | "linkedInUrl"
  | "businessIdentity"
  | "preferredCommissionStructure"
  | "supportResources"
  | "resellerDistributor"
  | "agencyClientManagement";

export interface AffiliateApplicationProfile {
  id: string;
  businessName?: string;
  website?: string;
  country?: string;
  location?: string;
  businessDescription?: string;
  partnerType?: string;
  promotionalModel?: string;
  promotionalPlan?: string;
  primaryPromotionalMethod?: string;
  promotionalMethods?: readonly string[];
  promotionalChannels?: readonly string[];
  industries?: readonly string[];
  customerSegments?: readonly string[];
  audience?: {
    description?: string;
    geography?: string;
    size?: string;
  };
  linkedInUrl?: string;
  businessIdentity?: string;
  preferredCommissionStructure?: string;
  supportResources?: string;
  resellerDistributor?: {
    operatesAsReseller: boolean;
    operatesAsDistributor: boolean;
    details?: string;
  };
  agencyClientManagement?: string;
  approvedFields: readonly AffiliateApplicationProfileField[];
  provenance: {
    reference: string;
    observedAt: string | null;
  };
}

export interface ApplicationQuestionOption {
  label: string;
  value: string;
  domIdentity?: ApplicationControlIdentity;
}

export interface ApplicationControlIdentity {
  id: string | null;
  name: string | null;
  order: number;
  tagName: string;
  inputType: string | null;
  kind?: "native" | "accessible-textbox" | "custom-combobox" | "custom-radio" | "custom-checkbox";
  role?: "textbox" | "combobox" | "radio" | "checkbox" | null;
  ariaName?: string | null;
  locatorIndex?: number;
  frameUrl?: string | null;
  frameIndex?: number;
}

export interface ApplicationCaptureDiagnostics {
  pageTitle: string | null;
  pageUrl: string | null;
  visibleFormCount: number;
  visibleRegionCount: number;
  controls: {
    nativeInputTypes: Readonly<Record<string, number>>;
    customRoles: Readonly<Record<string, number>>;
    textarea: number;
    select: number;
    combobox: number;
    radio: number;
    checkbox: number;
  };
  safeButtonTexts: readonly string[];
  safeLabels: readonly string[];
  ariaControls: readonly {
    role: string;
    name: string;
  }[];
  nearbyHeadings: readonly string[];
  iframes: {
    total: number;
    inspected: number;
    sameOrigin: number;
    partnerStack: number;
    blocked: number;
    statuses: readonly string[];
  };
  customControlIndicators: readonly string[];
}

export interface AffiliateApplicationQuestion {
  id: string;
  network: AffiliateNetwork;
  programId: string | null;
  programName: string;
  exactLabel: string;
  semanticKey: ApplicationSemanticKey | null;
  fieldType: QuestionFieldType;
  options: readonly ApplicationQuestionOption[] | null;
  required: boolean;
  legal: boolean;
  programSpecific: boolean;
  domIdentity?: ApplicationControlIdentity;
  provenance: {
    kind: "manual_capture" | "export" | "fixture";
    reference: string | null;
  };
  observedAt: string | null;
}

export interface AffiliateApplicationProgram {
  network: AffiliateNetwork;
  programId: string | null;
  programName: string;
  workflowState: ApplicationWorkflowState;
  formCaptureState: FormCaptureState;
  formCaptureReason: string | null;
  questions: readonly AffiliateApplicationQuestion[];
  sourceUrl?: string | null;
  capturedAt?: string | null;
  diagnostics?: ApplicationCaptureDiagnostics;
}

export type ApplicationAnswerValue = string | boolean | readonly string[] | null;
export type ApplicationAnswerApproval =
  | "APPROVED_PROFILE_VALUE"
  | "PENDING_REVIEW"
  | "HUMAN_APPROVED";

export interface PreparedApplicationAnswer {
  question: Pick<
    AffiliateApplicationQuestion,
    "id" | "network" | "programId" | "programName" | "exactLabel"
  >;
  value: ApplicationAnswerValue;
  profileField: AffiliateApplicationProfileField | null;
  provenance: {
    kind: "profile" | "none";
    reference: string | null;
    observedAt: string | null;
  };
  confidence: number;
  deterministic: boolean;
  generated: boolean;
  reviewRequired: boolean;
  reason: string;
  approval: ApplicationAnswerApproval;
}

export interface SubmissionAuthorization {
  authorized: boolean;
  authorizedBy: string | null;
  authorizedAt: string | null;
}

export interface MissingProfileInformation {
  profileField: AffiliateApplicationProfileField | null;
  questionId: string;
  reason: string;
}

export interface PreparedAffiliateApplication {
  network: AffiliateNetwork;
  programId: string | null;
  programName: string;
  workflowState: ApplicationWorkflowState;
  formCaptureState: FormCaptureState;
  readiness: ApplicationReadinessState;
  answers: readonly PreparedApplicationAnswer[];
  autoAnswers: readonly PreparedApplicationAnswer[];
  reviewQuestions: readonly PreparedApplicationAnswer[];
  missingProfileInfo: readonly MissingProfileInformation[];
  legalItems: readonly PreparedApplicationAnswer[];
  uncapturedForms: readonly string[];
  submissionAuthorization: SubmissionAuthorization;
}

export interface AffiliateApplicationPreparationReport {
  scope: string;
  reusableProfileFields: readonly AffiliateApplicationProfileField[];
  programs: readonly PreparedAffiliateApplication[];
  autoAnswers: readonly PreparedApplicationAnswer[];
  reviewQuestions: readonly PreparedApplicationAnswer[];
  missingProfileInfo: readonly MissingProfileInformation[];
  legalItems: readonly PreparedApplicationAnswer[];
  uncapturedForms: readonly string[];
  readinessSummary: Record<ApplicationReadinessState, number>;
  submissionAuthorization: SubmissionAuthorization;
}

const PROFILE_FIELD_BY_SEMANTIC_KEY: Partial<
  Record<ApplicationSemanticKey, AffiliateApplicationProfileField>
> = {
  BUSINESS_NAME: "businessName",
  BUSINESS_DESCRIPTION: "businessDescription",
  COUNTRY: "country",
  LOCATION: "location",
  WEBSITE: "website",
  LINKEDIN_URL: "linkedInUrl",
  PARTNER_TYPE: "partnerType",
  PROMOTIONAL_MODEL: "promotionalModel",
  PROMOTIONAL_METHODS: "promotionalMethods",
  PROMOTIONAL_CHANNELS: "promotionalChannels",
  PROMOTIONAL_PLAN: "promotionalPlan",
  PRIMARY_PROMOTIONAL_METHOD: "primaryPromotionalMethod",
  INDUSTRIES: "industries",
  CUSTOMER_SEGMENTS: "customerSegments",
  BUSINESS_IDENTITY: "businessIdentity",
  PREFERRED_COMMISSION_STRUCTURE: "preferredCommissionStructure",
  RESELLER_DISTRIBUTOR: "resellerDistributor",
  AGENCY_CLIENT_MANAGEMENT: "agencyClientManagement",
  SUPPORT_RESOURCES: "supportResources",
  AUDIENCE_DESCRIPTION: "audience.description",
  AUDIENCE_GEOGRAPHY: "audience.geography",
  AUDIENCE_SIZE: "audience.size",
};

const DETERMINISTIC_KEYS = new Set<ApplicationSemanticKey>([
  "BUSINESS_NAME",
  "BUSINESS_DESCRIPTION",
  "COUNTRY",
  "LOCATION",
  "WEBSITE",
  "LINKEDIN_URL",
  "PARTNER_TYPE",
  "PROMOTIONAL_MODEL",
  "PROMOTIONAL_PLAN",
  "PRIMARY_PROMOTIONAL_METHOD",
]);

const REUSABLE_FIELDS: readonly AffiliateApplicationProfileField[] = [
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
  "audience.description",
  "audience.geography",
  "audience.size",
  "linkedInUrl",
  "businessIdentity",
  "preferredCommissionStructure",
  "supportResources",
  "resellerDistributor",
  "agencyClientManagement",
];

function questionIdentity(question: AffiliateApplicationQuestion) {
  return {
    id: question.id,
    network: question.network,
    programId: question.programId,
    programName: question.programName,
    exactLabel: question.exactLabel,
  };
}

function profileValue(
  profile: AffiliateApplicationProfile,
  field: AffiliateApplicationProfileField,
): ApplicationAnswerValue {
  switch (field) {
    case "audience.description":
      return profile.audience?.description ?? null;
    case "audience.geography":
      return profile.audience?.geography ?? null;
    case "audience.size":
      return profile.audience?.size ?? null;
    case "resellerDistributor":
      return profile.resellerDistributor ? JSON.stringify(profile.resellerDistributor) : null;
    default: {
      const value = profile[field as keyof AffiliateApplicationProfile];
      return (value as ApplicationAnswerValue | undefined) ?? null;
    }
  }
}

function hasApprovedValue(
  profile: AffiliateApplicationProfile,
  field: AffiliateApplicationProfileField,
): boolean {
  const value = profileValue(profile, field);
  return (
    profile.approvedFields.includes(field) &&
    value !== null &&
    value !== undefined &&
    (!Array.isArray(value) || value.length > 0) &&
    (typeof value !== "string" || value.trim().length > 0)
  );
}

function isChoiceQuestion(question: AffiliateApplicationQuestion): boolean {
  return question.fieldType === "select" || question.fieldType === "radio";
}

function exactChoiceValue(
  question: AffiliateApplicationQuestion,
  profileValue: string,
): string | null {
  if (!question.options) return null;
  const matches = question.options.filter(
    (option) => option.label === profileValue || option.value === profileValue,
  );
  return matches.length === 1 ? matches[0].value : null;
}

function isStrongPromotionalPlan(value: string, profile: AffiliateApplicationProfile): boolean {
  const normalized = value.toLocaleLowerCase();
  const hasMethod = (profile.promotionalMethods ?? []).some((method) =>
    normalized.includes(method.toLocaleLowerCase()),
  );
  const hasChannel = (profile.promotionalChannels ?? []).some((channel) =>
    normalized.includes(channel.toLocaleLowerCase()),
  );
  return value.trim().length >= 80 && hasMethod && hasChannel;
}

function reviewAnswer(
  question: AffiliateApplicationQuestion,
  profile: AffiliateApplicationProfile,
  profileField: AffiliateApplicationProfileField | null,
  reason: string,
  includeApprovedDraft = false,
): PreparedApplicationAnswer {
  const includeValue =
    includeApprovedDraft && profileField !== null && hasApprovedValue(profile, profileField);
  return {
    question: questionIdentity(question),
    value: includeValue ? profileValue(profile, profileField) : null,
    profileField,
    provenance: includeValue
      ? {
          kind: "profile",
          reference: profile.provenance.reference,
          observedAt: profile.provenance.observedAt,
        }
      : { kind: "none", reference: null, observedAt: null },
    confidence: includeValue ? 1 : 0,
    deterministic: false,
    generated: false,
    reviewRequired: true,
    reason,
    approval: "PENDING_REVIEW",
  };
}

function prepareQuestion(
  question: AffiliateApplicationQuestion,
  profile: AffiliateApplicationProfile,
): PreparedApplicationAnswer {
  const profileField = question.semanticKey
    ? (PROFILE_FIELD_BY_SEMANTIC_KEY[question.semanticKey] ?? null)
    : null;

  if (
    question.legal ||
    question.fieldType === "checkbox" ||
    question.semanticKey === "TERMS_ACCEPTANCE" ||
    question.semanticKey === "LEGAL_ATTESTATION"
  ) {
    return reviewAnswer(
      question,
      profile,
      profileField,
      "Legal, terms, attestation, and acceptance controls require explicit human review.",
    );
  }

  if (question.programSpecific) {
    return reviewAnswer(
      question,
      profile,
      profileField,
      "Program-specific claims require human review; an approved profile value is only a draft.",
      true,
    );
  }

  if (
    question.semanticKey === null ||
    !DETERMINISTIC_KEYS.has(question.semanticKey) ||
    profileField === null
  ) {
    return reviewAnswer(
      question,
      profile,
      profileField,
      "This question has no approved deterministic mapping and must not be fuzzy-filled.",
      true,
    );
  }

  if (!hasApprovedValue(profile, profileField)) {
    return reviewAnswer(
      question,
      profile,
      profileField,
      "The required approved profile value is absent.",
    );
  }

  const rawValue = profileValue(profile, profileField);
  if (typeof rawValue !== "string") {
    return reviewAnswer(
      question,
      profile,
      profileField,
      "The approved profile value is incompatible with this question.",
    );
  }

  if (question.semanticKey === "PROMOTIONAL_PLAN" && !isStrongPromotionalPlan(rawValue, profile)) {
    return reviewAnswer(
      question,
      profile,
      profileField,
      "The approved promotional plan is not sufficiently specific about both method and channel.",
      true,
    );
  }

  let answerValue = rawValue;
  if (isChoiceQuestion(question)) {
    const exactValue = exactChoiceValue(question, rawValue);
    if (exactValue === null) {
      return reviewAnswer(
        question,
        profile,
        profileField,
        "No single allowed option exactly corresponds to the approved profile value.",
      );
    }
    answerValue = exactValue;
  }

  return {
    question: questionIdentity(question),
    value: answerValue,
    profileField,
    provenance: {
      kind: "profile",
      reference: profile.provenance.reference,
      observedAt: profile.provenance.observedAt,
    },
    confidence: 1,
    deterministic: true,
    generated: false,
    reviewRequired: false,
    reason: "Copied from an explicitly approved reusable profile field.",
    approval: "APPROVED_PROFILE_VALUE",
  };
}

function missingInformation(
  question: AffiliateApplicationQuestion,
  answer: PreparedApplicationAnswer,
  profile: AffiliateApplicationProfile,
): MissingProfileInformation | null {
  if (!answer.reviewRequired || answer.value !== null) return null;
  if (answer.profileField && !hasApprovedValue(profile, answer.profileField)) {
    return {
      profileField: answer.profileField,
      questionId: question.id,
      reason: "No approved reusable profile value is available.",
    };
  }
  if (
    question.semanticKey === "TRAFFIC" ||
    question.semanticKey === "REVENUE" ||
    question.semanticKey === "LEGACY_AFFILIATE_EMAIL"
  ) {
    return {
      profileField: null,
      questionId: question.id,
      reason: `No verified ${question.semanticKey.toLocaleLowerCase().replaceAll("_", " ")} value is available.`,
    };
  }
  return null;
}

export function prepareAffiliateApplication(
  program: AffiliateApplicationProgram,
  profile: AffiliateApplicationProfile,
): PreparedAffiliateApplication {
  if (program.formCaptureState !== "CAPTURED") {
    return {
      network: program.network,
      programId: program.programId,
      programName: program.programName,
      workflowState: program.workflowState,
      formCaptureState: program.formCaptureState,
      readiness: "NOT_READY",
      answers: [],
      autoAnswers: [],
      reviewQuestions: [],
      missingProfileInfo: [],
      legalItems: [],
      uncapturedForms: [program.programName],
      submissionAuthorization: {
        authorized: false,
        authorizedBy: null,
        authorizedAt: null,
      },
    };
  }

  const answers = program.questions.map((question) => prepareQuestion(question, profile));
  const reviewQuestions = answers.filter((answer) => answer.reviewRequired);
  const missingProfileInfo = program.questions
    .map((question, index) => missingInformation(question, answers[index], profile))
    .filter((item): item is MissingProfileInformation => item !== null);
  const legalQuestionIds = new Set(
    program.questions
      .filter(
        (question) =>
          question.legal ||
          question.fieldType === "checkbox" ||
          question.semanticKey === "TERMS_ACCEPTANCE" ||
          question.semanticKey === "LEGAL_ATTESTATION",
      )
      .map((question) => question.id),
  );

  return {
    network: program.network,
    programId: program.programId,
    programName: program.programName,
    workflowState: program.workflowState,
    formCaptureState: program.formCaptureState,
    readiness: reviewQuestions.length ? "NEEDS_REVIEW" : "READY_TO_APPLY",
    answers,
    autoAnswers: answers.filter((answer) => !answer.reviewRequired),
    reviewQuestions,
    missingProfileInfo,
    legalItems: answers.filter((answer) => legalQuestionIds.has(answer.question.id)),
    uncapturedForms: [],
    submissionAuthorization: {
      authorized: false,
      authorizedBy: null,
      authorizedAt: null,
    },
  };
}

export function createAffiliateApplicationPreparationReport(
  programs: readonly AffiliateApplicationProgram[],
  profile: AffiliateApplicationProfile,
): AffiliateApplicationPreparationReport {
  const prepared = programs.map((program) => prepareAffiliateApplication(program, profile));
  return {
    scope:
      "Offline application preparation only. READY_TO_APPLY does not authorize or execute submission.",
    reusableProfileFields: REUSABLE_FIELDS.filter((field) => hasApprovedValue(profile, field)),
    programs: prepared,
    autoAnswers: prepared.flatMap((program) => program.autoAnswers),
    reviewQuestions: prepared.flatMap((program) => program.reviewQuestions),
    missingProfileInfo: prepared.flatMap((program) => program.missingProfileInfo),
    legalItems: prepared.flatMap((program) => program.legalItems),
    uncapturedForms: prepared.flatMap((program) => program.uncapturedForms),
    readinessSummary: Object.fromEntries(
      APPLICATION_READINESS_STATES.map((state) => [
        state,
        prepared.filter((program) => program.readiness === state).length,
      ]),
    ) as Record<ApplicationReadinessState, number>,
    submissionAuthorization: {
      authorized: false,
      authorizedBy: null,
      authorizedAt: null,
    },
  };
}
