import { describe, expect, it, vi } from "vitest";

import {
  FORM_CAPTURE_STATES,
  prepareAffiliateApplication,
  type ApplicationCaptureDiagnostics,
  type AffiliateApplicationProgram,
  type ApplicationControlIdentity,
} from "../application";
import {
  assertPartnerStackChromeAvailable,
  chromeLaunchArguments,
  defaultPartnerStackProfilePath,
  discoverExistingPartnerStackChrome,
  legacyChromeEndpointsFromCommandLines,
  PlaywrightPrefillPrimitives,
  waitForPartnerStackChromeEndpoint,
} from "../application-browser";
import { captureBatchPrompt } from "../application-cli";
import { SYNTHETIC_APPLICATION_PROFILE_FIXTURE } from "../application-fixtures";
import {
  normalizeApplicationDomSnapshot,
  normalizeCapturedApplicationSemantics,
  recognizeApplicationSemantic,
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

const diagnostics: ApplicationCaptureDiagnostics = {
  pageTitle: "Program application",
  pageUrl: metadata.pageUrl,
  visibleFormCount: 0,
  visibleRegionCount: 2,
  controls: {
    nativeInputTypes: { text: 1, submit: 1 },
    customRoles: { textbox: 1, combobox: 2, radio: 2, checkbox: 1 },
    textarea: 1,
    select: 0,
    combobox: 2,
    radio: 2,
    checkbox: 1,
  },
  safeButtonTexts: ["Submit application", "Cancel"],
  safeLabels: [
    "Business name",
    "Promotion plan",
    "Country",
    "Partner type",
    "Primary promotional method",
  ],
  ariaControls: [
    { role: "combobox", name: "Country" },
    { role: "radiogroup", name: "Primary promotional method" },
  ],
  nearbyHeadings: ["Program application"],
  iframes: {
    total: 0,
    inspected: 0,
    sameOrigin: 0,
    partnerStack: 0,
    blocked: 0,
    statuses: [],
  },
  customControlIndicators: [
    "accessible-textbox",
    "custom-combobox",
    "custom-radio",
    "custom-checkbox",
  ],
};

const customRegionSnapshot: RawApplicationDomSnapshot = {
  formFound: true,
  authRequired: false,
  unsupported: false,
  unsupportedReason: null,
  diagnostics,
  controls: [
    {
      order: 0,
      tagName: "input",
      inputType: "text",
      id: "business-name",
      name: "businessName",
      label: "Business name",
      required: true,
      kind: "native",
      locatorIndex: 0,
    },
    {
      order: 1,
      tagName: "div",
      inputType: "textarea",
      id: "promotion-plan",
      name: null,
      label: "Promotion plan",
      required: true,
      kind: "accessible-textbox",
      role: "textbox",
      ariaName: "Promotion plan",
      locatorIndex: 0,
    },
    {
      order: 2,
      tagName: "div",
      inputType: null,
      id: "country",
      name: null,
      label: "Country",
      required: true,
      kind: "custom-combobox",
      role: "combobox",
      ariaName: "Country",
      locatorIndex: 0,
      options: [
        { label: "India", value: "India" },
        { label: "Canada", value: "Canada" },
      ],
    },
    {
      order: 3,
      tagName: "button",
      inputType: "button",
      id: "partner-type",
      name: null,
      label: "Partner type",
      required: true,
      kind: "custom-combobox",
      role: "combobox",
      ariaName: "Partner type",
      locatorIndex: 1,
      options: [
        { label: "Affiliate", value: "Affiliate" },
        { label: "Agency", value: "Agency" },
      ],
    },
    {
      order: 4,
      tagName: "div",
      inputType: "radio",
      id: "method-content",
      name: "method",
      label: "Content",
      required: true,
      kind: "custom-radio",
      role: "radio",
      ariaName: "Content",
      locatorIndex: 0,
      radioGroupLabel: "Primary promotional method",
      radioOptionLabel: "Content",
      radioOptionValue: "Content",
    },
    {
      order: 5,
      tagName: "div",
      inputType: "radio",
      id: "method-social",
      name: "method",
      label: "Social",
      required: true,
      kind: "custom-radio",
      role: "radio",
      ariaName: "Social",
      locatorIndex: 1,
      radioGroupLabel: "Primary promotional method",
      radioOptionLabel: "Social",
      radioOptionValue: "Social",
    },
    {
      order: 6,
      tagName: "div",
      inputType: "checkbox",
      id: "terms",
      name: null,
      label: "I agree to the terms",
      required: true,
      kind: "custom-checkbox",
      role: "checkbox",
      ariaName: "I agree to the terms",
      locatorIndex: 0,
    },
  ],
};

describe("PartnerStack application capture normalization", () => {
  it("recognizes PartnerStack's country placeholder as the reusable country field", () => {
    expect(recognizeApplicationSemantic("Select a country")).toBe("COUNTRY");
  });

  it("reclassifies preserved labels in captures created before a semantic rule existed", () => {
    const capture = normalizeApplicationDomSnapshot(snapshot, metadata);
    const historical = {
      ...capture,
      questions: capture.questions.map((question, index) =>
        index === 3 ? { ...question, exactLabel: "Select a country", semanticKey: null } : question,
      ),
    };

    expect(normalizeCapturedApplicationSemantics(historical).questions[3].semanticKey).toBe(
      "COUNTRY",
    );
  });

  it("uses an isolated OS-local Chrome profile without automation or security-bypass flags", () => {
    const profile = defaultPartnerStackProfilePath(String.raw`C:\Users\tester\AppData\Local`);
    const arguments_ = chromeLaunchArguments(profile);

    expect(profile).toBe(
      String.raw`C:\Users\tester\AppData\Local\SaaSElephant\partnerstack-chrome-profile`,
    );
    expect(arguments_).toContain(`--user-data-dir=${profile}`);
    expect(arguments_).toContain("--remote-debugging-port=0");
    expect(arguments_).toContain("--remote-debugging-address=127.0.0.1");
    expect(arguments_).not.toEqual(
      expect.arrayContaining([
        "--enable-automation",
        "--disable-blink-features=AutomationControlled",
        "--remote-allow-origins=*",
      ]),
    );
  });

  it("accepts CDP availability after the initial Windows launcher process exits", async () => {
    let attempts = 0;
    const launcherExited = true;
    const endpoint = await waitForPartnerStackChromeEndpoint("unused", 1_000, {
      readEndpoint: async () => {
        attempts += 1;
        return attempts < 2 ? null : "http://127.0.0.1:43123";
      },
      probeEndpoint: async () => true,
      sleep: async () => undefined,
      now: () => 0,
    });

    expect(launcherExited).toBe(true);
    expect(endpoint).toBe("http://127.0.0.1:43123");
  });

  it("keeps polling while Chrome's DevTools endpoint starts slowly", async () => {
    let attempts = 0;
    const endpoint = await waitForPartnerStackChromeEndpoint("unused", 10_000, {
      readEndpoint: async () => {
        attempts += 1;
        return attempts < 5 ? null : "http://127.0.0.1:43124";
      },
      probeEndpoint: async () => true,
      sleep: async () => undefined,
      now: () => 0,
    });

    expect(attempts).toBe(5);
    expect(endpoint).toBe("http://127.0.0.1:43124");
  });

  it("reports when no DevTools endpoint appears before the timeout", async () => {
    let now = 0;
    await expect(
      waitForPartnerStackChromeEndpoint("unused", 500, {
        readEndpoint: async () => null,
        probeEndpoint: async () => false,
        sleep: async (milliseconds) => {
          now += milliseconds;
        },
        now: () => now,
      }),
    ).rejects.toThrow("before the timeout");
  });

  it("reuses an existing dedicated Chrome endpoint", async () => {
    const probe = vi.fn(async () => true);
    await expect(
      discoverExistingPartnerStackChrome("unused", async () => "http://127.0.0.1:43125", probe),
    ).resolves.toBe("http://127.0.0.1:43125");
    expect(probe).toHaveBeenCalledWith("http://127.0.0.1:43125");
  });

  it("finds only a legacy Chrome process using the exact dedicated profile", () => {
    const profile = String.raw`C:\Users\tester\AppData\Local\SaaSElephant\partnerstack-chrome-profile`;
    expect(
      legacyChromeEndpointsFromCommandLines(profile, [
        String.raw`chrome.exe --user-data-dir="C:\Users\tester\AppData\Local\Google\Chrome\User Data" --remote-debugging-port=9000`,
        String.raw`chrome.exe "--user-data-dir=C:\Users\tester\AppData\Local\SaaSElephant\partnerstack-chrome-profile" --remote-debugging-port=43125`,
      ]),
    ).toEqual(["http://127.0.0.1:43125"]);
  });

  it("reports when the actual dedicated browser disappears", async () => {
    await expect(
      assertPartnerStackChromeAvailable("http://127.0.0.1:43126", async () => false),
    ).rejects.toThrow("closed before capture");
  });

  it("shows an indexed capture prompt after attachment", () => {
    expect(captureBatchPrompt(0, 4, "ActiveCampaign")).toBe(
      [
        "",
        "[1/4] ActiveCampaign",
        "Open the ActiveCampaign application in the dedicated Chrome window.",
        "Press Enter when the form is visible: ",
      ].join("\n"),
    );
  });

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

  it("captures a form-less application region with native and accessible custom controls", () => {
    const capture = normalizeApplicationDomSnapshot(customRegionSnapshot, metadata);

    expect(capture.formCaptureState).toBe("CAPTURED");
    expect(capture.diagnostics).toMatchObject({
      visibleFormCount: 0,
      visibleRegionCount: 2,
      controls: { textarea: 1, combobox: 2, radio: 2, checkbox: 1 },
      safeButtonTexts: ["Submit application", "Cancel"],
      nearbyHeadings: ["Program application"],
    });
    expect(capture.questions.map((question) => question.fieldType)).toEqual([
      "text",
      "textarea",
      "select",
      "select",
      "radio",
      "checkbox",
    ]);
    expect(capture.questions[1]).toMatchObject({
      exactLabel: "Promotion plan",
      required: true,
      domIdentity: { kind: "accessible-textbox", role: "textbox" },
    });
    expect(capture.questions[2].options).toEqual([
      { label: "India", value: "India" },
      { label: "Canada", value: "Canada" },
    ]);
    expect(capture.questions[3].domIdentity).toMatchObject({
      tagName: "button",
      inputType: "button",
      kind: "custom-combobox",
    });
    expect(capture.questions[4].options).toEqual([
      expect.objectContaining({
        label: "Content",
        value: "Content",
        domIdentity: expect.objectContaining({ kind: "custom-radio", role: "radio" }),
      }),
      expect.objectContaining({ label: "Social", value: "Social" }),
    ]);
    expect(capture.questions[5]).toMatchObject({
      fieldType: "checkbox",
      legal: true,
      required: true,
      domIdentity: { kind: "custom-checkbox", role: "checkbox" },
    });
  });

  it("preserves the safe native type of an input-backed custom combobox", () => {
    const capture = normalizeApplicationDomSnapshot(
      {
        ...customRegionSnapshot,
        controls: [
          {
            order: 0,
            tagName: "input",
            inputType: "text",
            id: "country",
            name: "country",
            label: "Country",
            required: true,
            kind: "custom-combobox",
            role: "combobox",
            ariaName: "Country",
            locatorIndex: 0,
            options: [{ label: "India", value: "India" }],
          },
        ],
      },
      metadata,
    );

    expect(capture.questions[0].domIdentity).toMatchObject({
      kind: "custom-combobox",
      tagName: "input",
      inputType: "text",
      role: "combobox",
    });
  });

  it("keeps submit text diagnostic-only and sanitizes diagnostic URLs and secret-like text", () => {
    const capture = normalizeApplicationDomSnapshot(
      {
        ...customRegionSnapshot,
        diagnostics: {
          ...diagnostics,
          pageTitle: "Program application access_token=do-not-store",
          safeLabels: [...diagnostics.safeLabels, "password secret", "owner@example.com"],
        },
      },
      metadata,
    );
    const serialized = JSON.stringify(capture);

    expect(capture.questions.some((question) => /submit/i.test(question.exactLabel))).toBe(false);
    expect(capture.diagnostics?.pageUrl).toBe("https://app.partnerstack.com/application/example");
    expect(capture.diagnostics?.pageTitle).toBeNull();
    expect(capture.diagnostics?.safeLabels).not.toContain("password secret");
    expect(capture.diagnostics?.safeLabels).not.toContain("owner@example.com");
    expect(serialized).not.toContain("not-retained");
    expect(serialized).not.toContain("do-not-store");
  });

  it("records an explicit unsupported diagnosis for an inaccessible application iframe", () => {
    const capture = normalizeApplicationDomSnapshot(
      {
        formFound: true,
        authRequired: false,
        unsupported: true,
        unsupportedReason:
          "The application appears to be inside a cross-origin, non-PartnerStack iframe that cannot be safely inspected.",
        controls: [],
        diagnostics: {
          ...diagnostics,
          visibleRegionCount: 0,
          iframes: {
            total: 1,
            inspected: 0,
            sameOrigin: 0,
            partnerStack: 0,
            blocked: 1,
            statuses: ["blocked application iframe: Program application"],
          },
        },
      },
      metadata,
    );

    expect(capture.formCaptureState).toBe("UNSUPPORTED_FORM");
    expect(capture.formCaptureReason).toContain("cross-origin");
    expect(capture.diagnostics?.iframes).toMatchObject({ total: 1, blocked: 1 });
  });

  it("records diagnostics when no application region is found", () => {
    const capture = normalizeApplicationDomSnapshot(
      {
        formFound: false,
        authRequired: false,
        unsupported: false,
        unsupportedReason: null,
        controls: [],
        diagnostics: {
          ...diagnostics,
          visibleFormCount: 0,
          visibleRegionCount: 1,
          nearbyHeadings: ["Partner directory"],
        },
      },
      metadata,
    );

    expect(capture.formCaptureState).toBe("FORM_NOT_FOUND");
    expect(capture.questions).toEqual([]);
    expect(capture.diagnostics?.nearbyHeadings).toEqual(["Partner directory"]);
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

  it("plans exact accessible textbox, portal-style choice, button choice, and custom radio actions", () => {
    const capture = normalizeApplicationDomSnapshot(customRegionSnapshot, metadata);
    const plan = planApplicationPrefill(capture, SYNTHETIC_APPLICATION_PROFILE_FIXTURE);

    expect(
      plan.actions.map((action) => [
        action.primitive,
        action.exactLabel,
        action.value,
        action.identity.kind,
      ]),
    ).toEqual([
      ["fill", "Business name", "Example Software Research", "native"],
      [
        "fill",
        "Promotion plan",
        SYNTHETIC_APPLICATION_PROFILE_FIXTURE.promotionalPlan,
        "accessible-textbox",
      ],
      ["select", "Country", "India", "custom-combobox"],
      ["select", "Partner type", "Affiliate", "custom-combobox"],
      ["check", "Primary promotional method", "Content", "custom-radio"],
    ]);
    expect(plan.skipped).toEqual([expect.objectContaining({ exactLabel: "I agree to the terms" })]);
  });

  it("keeps unstable blank-frame controls out of automated prefill", () => {
    const capture = normalizeApplicationDomSnapshot(
      {
        ...customRegionSnapshot,
        controls: customRegionSnapshot.controls.map((control, index) =>
          index === 0 ? { ...control, frameIndex: 1, frameUrl: null } : control,
        ),
      },
      metadata,
    );
    const plan = planApplicationPrefill(capture, SYNTHETIC_APPLICATION_PROFILE_FIXTURE);

    expect(plan.actions.some((action) => action.exactLabel === "Business name")).toBe(false);
    expect(plan.skipped).toContainEqual(
      expect.objectContaining({
        exactLabel: "Business name",
        reason: expect.stringContaining("Blank-frame"),
      }),
    );
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
