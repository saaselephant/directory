import { describe, expect, it } from "vitest";

import {
  APPLICATION_WORKFLOW_STATES,
  createAffiliateApplicationPreparationReport,
  prepareAffiliateApplication,
  type AffiliateApplicationProgram,
} from "../application";
import {
  OFFLINE_APPLICATION_FIXTURES,
  SYNTHETIC_APPLICATION_PROFILE_FIXTURE,
} from "../application-fixtures";

describe("offline affiliate application preparation", () => {
  it("uses the exact workflow vocabulary and keeps submission authorization separate", () => {
    expect(APPLICATION_WORKFLOW_STATES).toEqual([
      "DISCOVERED",
      "NEEDS_REVIEW",
      "READY_TO_APPLY",
      "SUBMITTED",
      "ON_HOLD_NETWORK_APPROVAL",
      "PENDING_PROGRAM_REVIEW",
      "JOINED",
      "REJECTED",
      "NEEDS_ACTION",
    ]);

    const report = createAffiliateApplicationPreparationReport(
      OFFLINE_APPLICATION_FIXTURES,
      SYNTHETIC_APPLICATION_PROFILE_FIXTURE,
    );
    expect(report.submissionAuthorization).toEqual({
      authorized: false,
      authorizedBy: null,
      authorizedAt: null,
    });
    expect(report.scope).toContain("does not authorize or execute submission");
    expect(report).not.toHaveProperty("submit");
  });

  it("preserves all supplied ActiveCampaign labels and does not invent other forms", () => {
    const [activeCampaign, ...uncaptured] = OFFLINE_APPLICATION_FIXTURES;
    expect(activeCampaign.questions.map((question) => question.exactLabel)).toEqual([
      "Country",
      "Website",
      "How do you plan to promote ActiveCampaign?",
      "What is your primary promotional method?",
      "If you selected Agency/Consultancy above, do you plan to maintain a relationship with your clients by managing their ActiveCampaign account or selling additional services?",
      "If you were a member of our legacy affiliate program, please provide the email address associated with your ActiveCampaign affiliate account:",
      "How can we best support your promotional efforts? Please tell us about the resources that would be most valuable to you.",
    ]);
    expect(uncaptured.map((program) => program.programName)).toEqual([
      "1Password",
      "FreshBooks",
      "monday.com",
    ]);
    expect(
      uncaptured.every(
        (program) =>
          program.formCaptureState === "FORM_NOT_CAPTURED" && program.questions.length === 0,
      ),
    ).toBe(true);
  });

  it("auto-fills only approved deterministic values and reports every held item", () => {
    const report = createAffiliateApplicationPreparationReport(
      OFFLINE_APPLICATION_FIXTURES,
      SYNTHETIC_APPLICATION_PROFILE_FIXTURE,
    );
    const activeCampaign = report.programs[0];

    expect(activeCampaign.autoAnswers.map((answer) => answer.profileField)).toEqual([
      "website",
      "promotionalPlan",
    ]);
    expect(activeCampaign.autoAnswers.every((answer) => answer.deterministic)).toBe(true);
    expect(activeCampaign.reviewQuestions.map((answer) => answer.question.id)).toEqual([
      "activecampaign-country",
      "activecampaign-primary-method",
      "activecampaign-agency-clients",
      "activecampaign-legacy-email",
      "activecampaign-support",
    ]);
    expect(activeCampaign.reviewQuestions.every((answer) => answer.reviewRequired)).toBe(true);
    expect(activeCampaign.missingProfileInfo).toEqual([
      expect.objectContaining({ questionId: "activecampaign-agency-clients" }),
      expect.objectContaining({ questionId: "activecampaign-legacy-email" }),
    ]);
    expect(report.uncapturedForms).toEqual(["1Password", "FreshBooks", "monday.com"]);
    expect(report.readinessSummary).toEqual({
      NOT_READY: 3,
      NEEDS_REVIEW: 1,
      READY_TO_APPLY: 0,
    });
  });

  it("requires an exact captured option for country and primary method", () => {
    const base = OFFLINE_APPLICATION_FIXTURES[0];
    const program: AffiliateApplicationProgram = {
      ...base,
      questions: base.questions.slice(0, 4).map((question) => ({
        ...question,
        options:
          question.semanticKey === "COUNTRY"
            ? [{ label: "India", value: "IN" }]
            : question.semanticKey === "PRIMARY_PROMOTIONAL_METHOD"
              ? [{ label: "Content", value: "content" }]
              : question.options,
      })),
    };
    const prepared = prepareAffiliateApplication(program, SYNTHETIC_APPLICATION_PROFILE_FIXTURE);

    expect(prepared.readiness).toBe("READY_TO_APPLY");
    expect(prepared.answers.map((answer) => answer.value)).toEqual([
      "IN",
      "https://example.com",
      SYNTHETIC_APPLICATION_PROFILE_FIXTURE.promotionalPlan,
      "content",
    ]);
    expect(prepared.answers.every((answer) => answer.approval === "APPROVED_PROFILE_VALUE")).toBe(
      true,
    );
    expect(prepared.submissionAuthorization.authorized).toBe(false);
    expect(prepared).not.toHaveProperty("submit");

    const unmatched = prepareAffiliateApplication(
      {
        ...program,
        questions: program.questions.map((question) =>
          question.semanticKey === "PRIMARY_PROMOTIONAL_METHOD"
            ? { ...question, options: [{ label: "Social", value: "social" }] }
            : question,
        ),
      },
      SYNTHETIC_APPLICATION_PROFILE_FIXTURE,
    );
    expect(unmatched.readiness).toBe("NEEDS_REVIEW");
    expect(
      unmatched.reviewQuestions.find(
        (answer) => answer.question.id === "activecampaign-primary-method",
      ),
    ).toMatchObject({ value: null, deterministic: false, approval: "PENDING_REVIEW" });
  });

  it("does not invent a missing profile value or choose an ambiguous dropdown option", () => {
    const base = OFFLINE_APPLICATION_FIXTURES[0];
    const missingWebsite = prepareAffiliateApplication(
      { ...base, questions: [base.questions[1]] },
      {
        ...SYNTHETIC_APPLICATION_PROFILE_FIXTURE,
        website: undefined,
        approvedFields: SYNTHETIC_APPLICATION_PROFILE_FIXTURE.approvedFields.filter(
          (field) => field !== "website",
        ),
      },
    );
    expect(missingWebsite.answers[0]).toMatchObject({
      value: null,
      deterministic: false,
      reviewRequired: true,
    });
    expect(missingWebsite.missingProfileInfo).toEqual([
      expect.objectContaining({ profileField: "website" }),
    ]);

    const ambiguousMethod = prepareAffiliateApplication(
      {
        ...base,
        questions: [
          {
            ...base.questions[3],
            options: [
              { label: "Content", value: "editorial-content" },
              { label: "Content", value: "educational-content" },
            ],
          },
        ],
      },
      SYNTHETIC_APPLICATION_PROFILE_FIXTURE,
    );
    expect(ambiguousMethod.answers[0]).toMatchObject({
      value: null,
      deterministic: false,
      reviewRequired: true,
    });
  });

  it("never auto-accepts legal, unusual, or program-specific questions", () => {
    const base = OFFLINE_APPLICATION_FIXTURES[0];
    const program: AffiliateApplicationProgram = {
      ...base,
      questions: [
        {
          ...base.questions[1],
          id: "terms",
          exactLabel: "I accept the terms",
          semanticKey: "TERMS_ACCEPTANCE",
          fieldType: "checkbox",
          legal: true,
        },
        {
          ...base.questions[1],
          id: "unusual",
          exactLabel: "Tell us something unusual",
          semanticKey: null,
          fieldType: "textarea",
        },
      ],
    };
    const prepared = prepareAffiliateApplication(program, SYNTHETIC_APPLICATION_PROFILE_FIXTURE);

    expect(prepared.autoAnswers).toHaveLength(0);
    expect(prepared.reviewQuestions.every((answer) => answer.value === null)).toBe(true);
    expect(prepared.legalItems.map((answer) => answer.question.id)).toEqual(["terms"]);
  });

  it("reuses the same approved answer without generated or fuzzy content", () => {
    const question = OFFLINE_APPLICATION_FIXTURES[0].questions[1];
    const programs: AffiliateApplicationProgram[] = ["program-a", "program-b"].map((programId) => ({
      network: "impact",
      programId,
      programName: programId,
      workflowState: "DISCOVERED",
      formCaptureState: "CAPTURED",
      formCaptureReason: null,
      questions: [
        {
          ...question,
          id: `${programId}-website`,
          network: "impact",
          programId,
          programName: programId,
        },
      ],
    }));
    const report = createAffiliateApplicationPreparationReport(
      programs,
      SYNTHETIC_APPLICATION_PROFILE_FIXTURE,
    );

    expect(report.autoAnswers.map((answer) => answer.value)).toEqual([
      "https://example.com",
      "https://example.com",
    ]);
    expect(report.autoAnswers.every((answer) => answer.generated === false)).toBe(true);
  });
});
