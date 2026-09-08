import {
  type ApplicationCaptureDiagnostics,
  type AffiliateApplicationProgram,
  type AffiliateApplicationQuestion,
  type ApplicationControlIdentity,
  type ApplicationQuestionOption,
  type ApplicationSemanticKey,
  type FormCaptureState,
  type QuestionFieldType,
} from "./application";

export interface RawApplicationControl {
  order: number;
  tagName: string;
  inputType: string | null;
  id: string | null;
  name: string | null;
  label: string;
  required: boolean;
  visible?: boolean;
  enabled?: boolean;
  options?: readonly ApplicationQuestionOption[];
  radioGroupLabel?: string | null;
  radioOptionLabel?: string | null;
  radioOptionValue?: string | null;
  kind?: ApplicationControlIdentity["kind"];
  role?: ApplicationControlIdentity["role"];
  ariaName?: string | null;
  locatorIndex?: number;
  frameUrl?: string | null;
  frameIndex?: number;
}

export interface RawApplicationDomSnapshot {
  formFound: boolean;
  authRequired: boolean;
  unsupported: boolean;
  unsupportedReason: string | null;
  controls: readonly RawApplicationControl[];
  diagnostics?: ApplicationCaptureDiagnostics;
}

export interface CaptureMetadata {
  programName: string;
  pageUrl: string;
  capturedAt: string;
}

const EXCLUDED_INPUT_TYPES = new Set([
  "hidden",
  "password",
  "file",
  "button",
  "submit",
  "reset",
  "image",
]);
const SUPPORTED_INPUT_TYPES = new Set([
  "text",
  "search",
  "email",
  "url",
  "tel",
  "number",
  "radio",
  "checkbox",
]);

function normalizedLabel(label: string): string {
  return label
    .toLocaleLowerCase()
    .replace(/[*:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function exactOrQuestion(label: string, expressions: readonly RegExp[]): boolean {
  const normalized = normalizedLabel(label);
  return expressions.some((expression) => expression.test(normalized));
}

export function recognizeApplicationSemantic(label: string): ApplicationSemanticKey | null {
  if (exactOrQuestion(label, [/^(business|company|organization|organisation) name$/])) {
    return "BUSINESS_NAME";
  }
  if (
    exactOrQuestion(label, [
      /^(describe your (business|company|organization|organisation)|business description)$/,
      /^what does your (business|company|organization|organisation) do\??$/,
    ])
  ) {
    return "BUSINESS_DESCRIPTION";
  }
  if (exactOrQuestion(label, [/^country$/, /^country\/region$/, /^country of residence$/])) {
    return "COUNTRY";
  }
  if (exactOrQuestion(label, [/^(business )?location$/, /^city and (state|country)$/])) {
    return "LOCATION";
  }
  if (
    exactOrQuestion(label, [/^(company |business )?website( url)?$/, /^website$/, /^your website$/])
  ) {
    return "WEBSITE";
  }
  if (exactOrQuestion(label, [/^(company |your )?linkedin( profile)?( url)?$/])) {
    return "LINKEDIN_URL";
  }
  if (exactOrQuestion(label, [/^(partner|partnership) type$/, /^type of partner$/])) {
    return "PARTNER_TYPE";
  }
  if (exactOrQuestion(label, [/^(business|promotional|promotion) model$/])) {
    return "PROMOTIONAL_MODEL";
  }
  if (exactOrQuestion(label, [/^promotional methods?$/, /^promotion methods?$/])) {
    return "PROMOTIONAL_METHODS";
  }
  if (exactOrQuestion(label, [/^promotional channels?$/, /^promotion channels?$/])) {
    return "PROMOTIONAL_CHANNELS";
  }
  if (
    exactOrQuestion(label, [
      /^how do you plan to promote(?: .+)?\??$/,
      /^describe your promotional plan$/,
      /^promotion plan$/,
    ])
  ) {
    return "PROMOTIONAL_PLAN";
  }
  if (
    exactOrQuestion(label, [
      /^what is your primary promotional method\??$/,
      /^primary promotional method$/,
      /^primary promotion method$/,
    ])
  ) {
    return "PRIMARY_PROMOTIONAL_METHOD";
  }
  if (exactOrQuestion(label, [/^(business )?industr(y|ies)$/, /^industry focus$/])) {
    return "INDUSTRIES";
  }
  if (exactOrQuestion(label, [/^(target )?customer segments?$/, /^customer types?$/])) {
    return "CUSTOMER_SEGMENTS";
  }
  if (exactOrQuestion(label, [/^business identity$/, /^legal business type$/])) {
    return "BUSINESS_IDENTITY";
  }
  if (
    exactOrQuestion(label, [
      /^preferred commission structure$/,
      /^commission structure preference$/,
    ])
  ) {
    return "PREFERRED_COMMISSION_STRUCTURE";
  }
  if (
    exactOrQuestion(label, [
      /^are you a reseller or distributor\??$/,
      /^reseller\/distributor status$/,
    ])
  ) {
    return "RESELLER_DISTRIBUTOR";
  }
  if (
    exactOrQuestion(label, [
      /^if you selected agency\/consultancy above, do you plan to maintain a relationship with your clients by managing their .+ account or selling additional services\??$/,
      /^do you manage client accounts\??$/,
    ])
  ) {
    return "AGENCY_CLIENT_MANAGEMENT";
  }
  if (
    exactOrQuestion(label, [
      /^if you were a member of our legacy affiliate program, please provide the email address associated with your .+ affiliate account$/,
      /^legacy affiliate (account )?email$/,
    ])
  ) {
    return "LEGACY_AFFILIATE_EMAIL";
  }
  if (
    exactOrQuestion(label, [
      /^how can we best support your promotional efforts\?.*$/,
      /^what (support|resources) (?:would you like|do you need)\??$/,
      /^support resources$/,
    ])
  ) {
    return "SUPPORT_RESOURCES";
  }
  if (exactOrQuestion(label, [/^describe your audience$/, /^audience description$/])) {
    return "AUDIENCE_DESCRIPTION";
  }
  if (
    exactOrQuestion(label, [
      /^audience (location|geography)$/,
      /^where is your audience located\??$/,
    ])
  ) {
    return "AUDIENCE_GEOGRAPHY";
  }
  if (exactOrQuestion(label, [/^(estimated )?audience size$/, /^how large is your audience\??$/])) {
    return "AUDIENCE_SIZE";
  }
  if (exactOrQuestion(label, [/^(monthly )?(website )?traffic$/, /^monthly (visits|visitors)$/])) {
    return "TRAFFIC";
  }
  if (exactOrQuestion(label, [/^(annual|monthly) revenue$/, /^revenue range$/])) {
    return "REVENUE";
  }
  if (isLegalLabel(label)) {
    return /\b(terms|privacy|agreement|conditions)\b/i.test(label)
      ? "TERMS_ACCEPTANCE"
      : "LEGAL_ATTESTATION";
  }
  return null;
}

export function isLegalLabel(label: string): boolean {
  return /\b(agree|accept|terms|conditions|privacy|consent|certify|attest|authorize|authorise|legally|represent and warrant|acknowledge)\b/i.test(
    label,
  );
}

function safeIdentityValue(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (
    !trimmed ||
    trimmed.length > 160 ||
    /[\r\n]/.test(trimmed) ||
    /(cookie|token|authorization|bearer|csrf|xsrf|password|secret)/i.test(trimmed)
  ) {
    return null;
  }
  return trimmed;
}

function identity(control: RawApplicationControl): ApplicationControlIdentity {
  const tagName = control.tagName.toLocaleLowerCase();
  return {
    id: safeIdentityValue(control.id),
    name: safeIdentityValue(control.name),
    order: control.order,
    tagName,
    inputType: control.inputType?.toLocaleLowerCase() ?? null,
    ...(control.kind ? { kind: control.kind } : {}),
    ...(control.role !== undefined ? { role: control.role } : {}),
    ...(control.ariaName !== undefined ? { ariaName: safeIdentityValue(control.ariaName) } : {}),
    ...(control.locatorIndex !== undefined ? { locatorIndex: control.locatorIndex } : {}),
    ...(control.frameUrl !== undefined
      ? { frameUrl: safePartnerStackUrl(control.frameUrl ?? "") }
      : {}),
    ...(control.frameIndex !== undefined ? { frameIndex: control.frameIndex } : {}),
  };
}

function safeOption(option: ApplicationQuestionOption): ApplicationQuestionOption | null {
  const label = option.label.trim();
  const value = option.value.trim();
  if (!label || label.length > 300 || value.length > 300) return null;
  if (
    /(?:eyJ[A-Za-z0-9_-]{10,}\.|bearer\s+|access[_-]?token|refresh[_-]?token|csrf|session[_-]?token|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i.test(
      value,
    )
  ) {
    return null;
  }
  return option.domIdentity ? { label, value, domIdentity: option.domIdentity } : { label, value };
}

function fieldType(control: RawApplicationControl): QuestionFieldType | null {
  if (control.visible === false || control.enabled === false) return null;
  const tag = control.tagName.toLocaleLowerCase();
  const inputType = (control.inputType ?? "text").toLocaleLowerCase();
  if (control.kind === "accessible-textbox") {
    return control.role === "textbox" && control.inputType === "textarea" ? "textarea" : "text";
  }
  if (control.kind === "custom-combobox") return "select";
  if (control.kind === "custom-radio") return "radio";
  if (control.kind === "custom-checkbox") return "checkbox";
  if (!["input", "textarea", "select"].includes(tag)) return null;
  if (tag === "textarea") return "textarea";
  if (tag === "select") return "select";
  if (EXCLUDED_INPUT_TYPES.has(inputType) || !SUPPORTED_INPUT_TYPES.has(inputType)) return null;
  if (
    inputType === "radio" ||
    inputType === "checkbox" ||
    inputType === "email" ||
    inputType === "url"
  ) {
    return inputType;
  }
  return "text";
}

function safePartnerStackUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const validHost =
      url.hostname === "partnerstack.com" || url.hostname.endsWith(".partnerstack.com");
    if (url.protocol !== "https:" || !validHost) return null;
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function captureState(snapshot: RawApplicationDomSnapshot): {
  state: FormCaptureState;
  reason: string | null;
} {
  if (snapshot.authRequired) {
    return {
      state: "AUTH_REQUIRED",
      reason: "A login form is visible; authenticate before capture.",
    };
  }
  if (!snapshot.formFound) {
    return { state: "FORM_NOT_FOUND", reason: "No visible application form was found." };
  }
  if (snapshot.unsupported) {
    return {
      state: "UNSUPPORTED_FORM",
      reason: snapshot.unsupportedReason ?? "The visible form uses unsupported controls.",
    };
  }
  if (!snapshot.controls.some((control) => fieldType(control) !== null)) {
    return {
      state: "UNSUPPORTED_FORM",
      reason: "The visible form contains no supported, enabled application controls.",
    };
  }
  return { state: "CAPTURED", reason: null };
}

function questionId(programName: string, control: RawApplicationControl): string {
  const program = programName
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const stable =
    safeIdentityValue(control.id) ?? safeIdentityValue(control.name) ?? `control-${control.order}`;
  return `${program || "program"}-${stable.replace(/[^a-zA-Z0-9_-]+/g, "-")}-${control.order}`;
}

function normalizedQuestion(
  control: RawApplicationControl,
  metadata: CaptureMetadata,
): AffiliateApplicationQuestion | null {
  const type = fieldType(control);
  if (!type) return null;
  const exactLabel = control.label.trim();
  const semanticKey = recognizeApplicationSemantic(exactLabel);
  const options =
    type === "select"
      ? (control.options ?? [])
          .map(safeOption)
          .filter((item): item is ApplicationQuestionOption => item !== null)
      : null;

  return {
    id: questionId(metadata.programName, control),
    network: "partnerstack",
    programId: null,
    programName: metadata.programName,
    exactLabel,
    semanticKey,
    fieldType: type,
    options,
    required: control.required,
    legal: type === "checkbox" || isLegalLabel(exactLabel),
    programSpecific:
      semanticKey === "AGENCY_CLIENT_MANAGEMENT" || semanticKey === "LEGACY_AFFILIATE_EMAIL",
    domIdentity: identity(control),
    provenance: {
      kind: "manual_capture",
      reference: "visible-partnerstack-application-form",
    },
    observedAt: metadata.capturedAt,
  };
}

function normalizedRadioQuestion(
  controls: readonly RawApplicationControl[],
  metadata: CaptureMetadata,
): AffiliateApplicationQuestion | null {
  const first = controls[0];
  if (!first) return null;
  const exactLabel = (first.radioGroupLabel || first.label).trim();
  const options = controls
    .map((control) => {
      const label = (control.radioOptionLabel || control.label).trim();
      const value = control.radioOptionValue?.trim() || label;
      return safeOption({ label, value, domIdentity: identity(control) });
    })
    .filter((item): item is ApplicationQuestionOption => item !== null);
  const semanticKey = recognizeApplicationSemantic(exactLabel);
  return {
    id: questionId(metadata.programName, first),
    network: "partnerstack",
    programId: null,
    programName: metadata.programName,
    exactLabel,
    semanticKey,
    fieldType: "radio",
    options,
    required: controls.some((control) => control.required),
    legal: isLegalLabel(exactLabel),
    programSpecific:
      semanticKey === "AGENCY_CLIENT_MANAGEMENT" || semanticKey === "LEGACY_AFFILIATE_EMAIL",
    domIdentity: identity(first),
    provenance: {
      kind: "manual_capture",
      reference: "visible-partnerstack-application-form",
    },
    observedAt: metadata.capturedAt,
  };
}

export function normalizeApplicationDomSnapshot(
  snapshot: RawApplicationDomSnapshot,
  metadata: CaptureMetadata,
): AffiliateApplicationProgram {
  const capturedUrl = safePartnerStackUrl(metadata.pageUrl);
  const initialStatus = captureState(snapshot);
  const status =
    initialStatus.state === "CAPTURED" && capturedUrl === null
      ? {
          state: "CAPTURE_FAILED" as const,
          reason: "Capture is restricted to HTTPS pages on partnerstack.com.",
        }
      : initialStatus;
  const questions: AffiliateApplicationQuestion[] = [];
  const radioGroups = new Map<string, RawApplicationControl[]>();

  if (status.state === "CAPTURED") {
    for (const control of snapshot.controls) {
      if (fieldType(control) === "radio") {
        const group = safeIdentityValue(control.name) ?? `radio-${control.order}`;
        const members = radioGroups.get(group) ?? [];
        members.push(control);
        radioGroups.set(group, members);
        continue;
      }
      const question = normalizedQuestion(control, metadata);
      if (question) questions.push(question);
    }
    for (const controls of radioGroups.values()) {
      const question = normalizedRadioQuestion(controls, metadata);
      if (question) questions.push(question);
    }
    questions.sort(
      (left, right) => (left.domIdentity?.order ?? 0) - (right.domIdentity?.order ?? 0),
    );
  }

  return {
    network: "partnerstack",
    programId: null,
    programName: metadata.programName,
    workflowState: "DISCOVERED",
    formCaptureState: status.state,
    formCaptureReason: status.reason,
    questions,
    sourceUrl: capturedUrl,
    capturedAt: metadata.capturedAt,
    ...(snapshot.diagnostics
      ? { diagnostics: sanitizeDiagnostics(snapshot.diagnostics, capturedUrl) }
      : {}),
  };
}

export function createCaptureFailure(
  metadata: CaptureMetadata,
  reason: string,
  diagnostics?: ApplicationCaptureDiagnostics,
): AffiliateApplicationProgram {
  return {
    network: "partnerstack",
    programId: null,
    programName: metadata.programName,
    workflowState: "DISCOVERED",
    formCaptureState: "CAPTURE_FAILED",
    formCaptureReason: reason,
    questions: [],
    sourceUrl: safePartnerStackUrl(metadata.pageUrl),
    capturedAt: metadata.capturedAt,
    ...(diagnostics
      ? { diagnostics: sanitizeDiagnostics(diagnostics, safePartnerStackUrl(metadata.pageUrl)) }
      : {}),
  };
}

function safeDiagnosticText(value: string, maximum = 200): string | null {
  const text = value.replace(/\s+/g, " ").trim().slice(0, maximum);
  if (
    !text ||
    /(?:eyJ[A-Za-z0-9_-]{10,}\.|bearer\s+|access[_-]?token|refresh[_-]?token|csrf|xsrf|password|secret|session[_-]?token|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i.test(
      text,
    )
  ) {
    return null;
  }
  return text;
}

function sanitizeDiagnostics(
  diagnostics: ApplicationCaptureDiagnostics,
  capturedUrl: string | null,
): ApplicationCaptureDiagnostics {
  const safeList = (values: readonly string[]) =>
    [
      ...new Set(
        values
          .map((value) => safeDiagnosticText(value))
          .filter((value): value is string => value !== null),
      ),
    ].slice(0, 40);
  const safeCounts = (counts: Readonly<Record<string, number>>) =>
    Object.fromEntries(
      Object.entries(counts)
        .filter(
          ([key, count]) =>
            /^[a-z][a-z0-9-]{0,39}$/i.test(key) &&
            Number.isInteger(count) &&
            count >= 0 &&
            count < 10_000,
        )
        .slice(0, 40),
    );
  return {
    pageTitle: diagnostics.pageTitle ? safeDiagnosticText(diagnostics.pageTitle) : null,
    pageUrl: capturedUrl,
    visibleFormCount: Math.max(0, Math.trunc(diagnostics.visibleFormCount)),
    visibleRegionCount: Math.max(0, Math.trunc(diagnostics.visibleRegionCount)),
    controls: {
      nativeInputTypes: safeCounts(diagnostics.controls.nativeInputTypes),
      customRoles: safeCounts(diagnostics.controls.customRoles),
      textarea: Math.max(0, Math.trunc(diagnostics.controls.textarea)),
      select: Math.max(0, Math.trunc(diagnostics.controls.select)),
      combobox: Math.max(0, Math.trunc(diagnostics.controls.combobox)),
      radio: Math.max(0, Math.trunc(diagnostics.controls.radio)),
      checkbox: Math.max(0, Math.trunc(diagnostics.controls.checkbox)),
    },
    safeButtonTexts: safeList(diagnostics.safeButtonTexts),
    safeLabels: safeList(diagnostics.safeLabels),
    ariaControls: diagnostics.ariaControls
      .map(({ role, name }) => ({
        role: safeDiagnosticText(role, 40),
        name: safeDiagnosticText(name),
      }))
      .filter(
        (item): item is { role: string; name: string } => item.role !== null && item.name !== null,
      )
      .slice(0, 40),
    nearbyHeadings: safeList(diagnostics.nearbyHeadings),
    iframes: {
      total: Math.max(0, Math.trunc(diagnostics.iframes.total)),
      inspected: Math.max(0, Math.trunc(diagnostics.iframes.inspected)),
      sameOrigin: Math.max(0, Math.trunc(diagnostics.iframes.sameOrigin)),
      partnerStack: Math.max(0, Math.trunc(diagnostics.iframes.partnerStack)),
      blocked: Math.max(0, Math.trunc(diagnostics.iframes.blocked)),
      statuses: safeList(diagnostics.iframes.statuses),
    },
    customControlIndicators: safeList(diagnostics.customControlIndicators),
  };
}
