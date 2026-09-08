import { describe, expect, it, vi } from "vitest";

import {
  FORM_CAPTURE_STATES,
  prepareAffiliateApplication,
  type AffiliateApplicationProgram,
  type ApplicationControlIdentity,
} from "../application";
import { PlaywrightPrefillPrimitives } from "../application-browser";
import { SYNTHETIC_APPLICATION_PROFILE_FIXTURE } from "../application-fixtures";
import {
  normalizeApplicationDomSnapshot,
  type CaptureMetadata,
  type RawApplicationControl,
  type RawApplicationDomSnapshot,
} from "../application-capture";
import {
  executeApplicationPrefill,
  planApplicationPrefill,
  type BrowserPrefillPrimitives,
  type PrefillPlan,
} from "../application-prefill";

const metadata: CaptureMetadata = {
  programName: "Synthetic Program",
  pageUrl: "https://app.partnerstack.com/application/example?secret=not-retained#section",
  capturedAt: "2026-09-08T00:00:00.000Z",
};

const controls: RawApplicationControl[] = [
  {
    order: 0,
    tagName: "input",
    inputType: "text",
    id: "business-name",
    name: "businessName",
    label: "Business name",
    required: true,
  },
  {
    order: 1,
    tagName: "input",
    inputType: "url",
    id: "website",
    name: "website",
    label: "Website",
    required: true,
  },
  {
    order: 2,
    tagName: "textarea",
    inputType: null,
    id: "plan",
    name: "plan",
    label: "How do you plan to promote Synthetic Program?",
    required: true,
  },
  {
    order: 3,
    tagName: "select",
    inputType: null,
    id: "country",
    name: "country",
    label: "Country",
    required: true,
    options: [
      { label: "India", value: "IN" },
      { label: "Canada", value: "CA" },
    ],
  },
  {
    order: 4,
    tagName: "input",
    inputType: "radio",
    id: "method-content",
    name: "method",
    label: "Content",
    radioGroupLabel: "What is your primary promotional method?",
    radioOptionLabel: "Content",
    radioOptionValue: "content",
    required: true,
  },
  {
    order: 5,
    tagName: "input",
    inputType: "radio",
    id: "method-social",
    name: "method",
    label: "Social",
    radioGroupLabel: "What is your primary promotional method?",
    radioOptionLabel: "Social",
    radioOptionValue: "social",
    required: true,
  },
  {
    order: 6,
    tagName: "input",
    inputType: "checkbox",
    id: "terms",
    name: "terms",
    label: "I agree to the terms and certify this application",
    required: true,
  },
  {
    order: 7,
    tagName: "textarea",
    inputType: null,
    id: "claim",
    name: "claim",
    label: "How many customers did you refer last year?",
    required: false,
  },
  {
    order: 8,
    tagName: "input",
    inputType: "hidden",
    id: "csrf",
    name: "csrf",
    label: "",
    required: false,
  },
  {
    order: 9,
    tagName: "input",
    inputType: "submit",
    id: "submit",
    name: null,
    label: "Apply",
    required: false,
  },
  {
    order: 10,
    tagName: "input",
    inputType: "text",
    id: "disabled-visible-control",
    name: "disabled",
    label: "Disabled control",
    required: false,
    enabled: false,
  },
];

const snapshot: RawApplicationDomSnapshot = {
  formFound: true,
  authRequired: false,
  unsupported: false,
  unsupportedReason: null,
  controls,
};

describe("PartnerStack application capture normalization", () => {
  it("captures supported controls, identity, options, required and legal signals without values", () => {
    const capture = normalizeApplicationDomSnapshot(snapshot, metadata);

    expect(capture.formCaptureState).toBe("CAPTURED");
    expect(capture.sourceUrl).toBe("https://app.partnerstack.com/application/example");
    expect(capture.capturedAt).toBe(metadata.capturedAt);
    expect(capture.questions.map((question) => question.fieldType)).toEqual([
      "text",
      "url",
      "textarea",
      "select",
      "radio",
      "checkbox",
      "textarea",
    ]);
    expect(capture.questions[0]).toMatchObject({
      required: true,
      semanticKey: "BUSINESS_NAME",
      domIdentity: { id: "business-name", name: "businessName", order: 0 },
    });
    expect(capture.questions[3].options).toEqual([
      { label: "India", value: "IN" },
      { label: "Canada", value: "CA" },
    ]);
    expect(capture.questions[4]).toMatchObject({
      exactLabel: "What is your primary promotional method?",
      semanticKey: "PRIMARY_PROMOTIONAL_METHOD",
      required: true,
    });
    expect(capture.questions[4].options).toEqual([
      expect.objectContaining({ label: "Content", value: "content" }),
      expect.objectContaining({ label: "Social", value: "social" }),
    ]);
    expect(capture.questions[5]).toMatchObject({
      fieldType: "checkbox",
      legal: true,
      semanticKey: "TERMS_ACCEPTANCE",
    });
    expect(capture.questions[6].semanticKey).toBeNull();
    expect(JSON.stringify(capture)).not.toContain("not-retained");
    expect(JSON.stringify(capture)).not.toContain("csrf");
    expect(capture.questions.every((question) => !("currentValue" in question))).toBe(true);
  });

  it.each([
    ["FORM_NOT_FOUND", { formFound: false }],
    ["AUTH_REQUIRED", { authRequired: true }],
    ["UNSUPPORTED_FORM", { unsupported: true }],
  ] as const)("produces explicit %s state", (expected, override) => {
    const capture = normalizeApplicationDomSnapshot({ ...snapshot, ...override }, metadata);
    expect(capture.formCaptureState).toBe(expected);
    expect(capture.questions).toEqual([]);
  });

  it("rejects a capture from outside HTTPS PartnerStack", () => {
    const capture = normalizeApplicationDomSnapshot(snapshot, {
      ...metadata,
      pageUrl: "http://partnerstack.com/application/example?token=secret",
    });
    expect(capture.formCaptureState).toBe("CAPTURE_FAILED");
    expect(capture.sourceUrl).toBeNull();
    expect(capture.questions).toEqual([]);
  });

  it("keeps four sequential program captures isolated", () => {
    const captures = ["ActiveCampaign", "1Password", "FreshBooks", "monday.com"].map(
      (programName) => normalizeApplicationDomSnapshot(snapshot, { ...metadata, programName }),
    );
    expect(captures.map((capture) => capture.programName)).toEqual([
      "ActiveCampaign",
      "1Password",
      "FreshBooks",
      "monday.com",
    ]);
    expect(new Set(captures.map((capture) => capture.questions[0].id)).size).toBe(4);
    expect(captures.every((capture) => capture.questions.length === 7)).toBe(true);
  });

  it("marks every non-captured state NOT_READY during existing preparation", () => {
    for (const state of FORM_CAPTURE_STATES.filter((state) => state !== "CAPTURED")) {
      const program: AffiliateApplicationProgram = {
        ...normalizeApplicationDomSnapshot(snapshot, metadata),
        formCaptureState: state,
      };
      expect(
        prepareAffiliateApplication(program, SYNTHETIC_APPLICATION_PROFILE_FIXTURE).readiness,
      ).toBe("NOT_READY");
    }
  });
});

describe("safe deterministic prefill", () => {
  it("exposes no click or submission method on the browser executor", () => {
    expect(Object.getOwnPropertyNames(PlaywrightPrefillPrimitives.prototype).sort()).toEqual([
      "check",
      "constructor",
      "fill",
      "select",
    ]);
  });

  it("turns a normalized capture into fill, select and check primitives", () => {
    const capture = normalizeApplicationDomSnapshot(snapshot, metadata);
    const prepared = prepareAffiliateApplication(capture, SYNTHETIC_APPLICATION_PROFILE_FIXTURE);
    const plan = planApplicationPrefill(capture, SYNTHETIC_APPLICATION_PROFILE_FIXTURE);

    expect(prepared.formCaptureState).toBe("CAPTURED");
    expect(prepared.autoAnswers.map((answer) => answer.value)).toEqual(
      expect.arrayContaining(["Example Software Research", "https://example.com", "IN", "content"]),
    );
    expect(
      plan.actions.map((action) => [action.primitive, action.exactLabel, action.value]),
    ).toEqual([
      ["fill", "Business name", "Example Software Research"],
      ["fill", "Website", "https://example.com"],
      [
        "fill",
        "How do you plan to promote Synthetic Program?",
        SYNTHETIC_APPLICATION_PROFILE_FIXTURE.promotionalPlan,
      ],
      ["select", "Country", "IN"],
      ["check", "What is your primary promotional method?", "content"],
    ]);
    expect(plan.skipped).toEqual([
      expect.objectContaining({ exactLabel: "I agree to the terms and certify this application" }),
      expect.objectContaining({ exactLabel: "How many customers did you refer last year?" }),
    ]);
  });

  it("skips ambiguous dropdowns, legal checkboxes, and unknown factual claims", () => {
    const ambiguous = {
      ...snapshot,
      controls: snapshot.controls.map((control) =>
        control.id === "country"
          ? {
              ...control,
              options: [
                { label: "India", value: "IN-1" },
                { label: "India", value: "IN-2" },
              ],
            }
          : control,
      ),
    };
    const plan = planApplicationPrefill(
      normalizeApplicationDomSnapshot(ambiguous, metadata),
      SYNTHETIC_APPLICATION_PROFILE_FIXTURE,
    );

    expect(plan.actions.some((action) => action.exactLabel === "Country")).toBe(false);
    expect(plan.skipped.map((item) => item.exactLabel)).toEqual(
      expect.arrayContaining([
        "Country",
        "I agree to the terms and certify this application",
        "How many customers did you refer last year?",
      ]),
    );
  });

  it("rejects a submit-like action without invoking any browser primitive", async () => {
    const identity = {
      id: "apply",
      name: null,
      order: 10,
      tagName: "input",
      inputType: "submit",
    } as ApplicationControlIdentity;
    const plan: PrefillPlan = {
      programName: "Synthetic Program",
      captureState: "CAPTURED",
      actions: [
        {
          primitive: "fill",
          questionId: "malformed-submit",
          exactLabel: "Apply",
          identity,
          value: "must-not-be-used",
        },
      ],
      skipped: [],
    };
    const browser: BrowserPrefillPrimitives = {
      fill: vi.fn(),
      select: vi.fn(),
      check: vi.fn(),
    };

    const result = await executeApplicationPrefill(plan, browser);

    expect(result.applied).toEqual([]);
    expect(result.failed).toEqual([
      expect.objectContaining({
        questionId: "malformed-submit",
        reason: expect.stringContaining("rejected"),
      }),
    ]);
    expect(browser.fill).not.toHaveBeenCalled();
    expect(browser.select).not.toHaveBeenCalled();
    expect(browser.check).not.toHaveBeenCalled();
    expect(browser).not.toHaveProperty("click");
  });
});
