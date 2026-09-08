import {
  prepareAffiliateApplication,
  type AffiliateApplicationProfile,
  type AffiliateApplicationProgram,
  type AffiliateApplicationQuestion,
  type ApplicationControlIdentity,
} from "./application";

export type PrefillPrimitive = "fill" | "select" | "check";

export interface PrefillAction {
  primitive: PrefillPrimitive;
  questionId: string;
  exactLabel: string;
  identity: ApplicationControlIdentity;
  value: string;
}

export interface PrefillSkip {
  questionId: string;
  exactLabel: string;
  reason: string;
}

export interface PrefillPlan {
  programName: string;
  captureState: AffiliateApplicationProgram["formCaptureState"];
  actions: readonly PrefillAction[];
  skipped: readonly PrefillSkip[];
}

export interface BrowserPrefillPrimitives {
  fill(identity: ApplicationControlIdentity, value: string): Promise<void>;
  select(identity: ApplicationControlIdentity, value: string): Promise<void>;
  check(identity: ApplicationControlIdentity, value: string): Promise<void>;
}

export interface PrefillExecutionResult {
  plan: PrefillPlan;
  applied: readonly PrefillAction[];
  failed: readonly (PrefillAction & { reason: string })[];
}

export function isSubmitLikeIdentity(identity: ApplicationControlIdentity): boolean {
  const tagName: string = identity.tagName;
  const verifiedChoiceButton =
    tagName === "button" &&
    identity.kind === "custom-combobox" &&
    identity.role === "combobox" &&
    identity.inputType === "button";
  return (
    (tagName === "button" && !verifiedChoiceButton) ||
    identity.inputType === "submit" ||
    (identity.inputType === "button" && !verifiedChoiceButton) ||
    identity.inputType === "reset" ||
    identity.inputType === "image"
  );
}

function actionForQuestion(
  question: AffiliateApplicationQuestion,
  value: string,
): PrefillAction | string {
  if (!question.domIdentity) return "The capture has no safe DOM identity.";
  if (question.domIdentity.frameIndex !== undefined && question.domIdentity.frameUrl === null) {
    return "Blank-frame controls require human review because their frame identity is unstable.";
  }
  if (isSubmitLikeIdentity(question.domIdentity))
    return "Submit-like controls are always rejected.";

  if (question.fieldType === "select") {
    return {
      primitive: "select",
      questionId: question.id,
      exactLabel: question.exactLabel,
      identity: question.domIdentity,
      value,
    };
  }

  if (question.fieldType === "radio") {
    const matches = (question.options ?? []).filter((option) => option.value === value);
    if (matches.length !== 1 || !matches[0].domIdentity) {
      return "The exact radio option has no unique safe DOM identity.";
    }
    if (isSubmitLikeIdentity(matches[0].domIdentity)) {
      return "Submit-like controls are always rejected.";
    }
    return {
      primitive: "check",
      questionId: question.id,
      exactLabel: question.exactLabel,
      identity: matches[0].domIdentity,
      value,
    };
  }

  if (
    question.fieldType === "text" ||
    question.fieldType === "email" ||
    question.fieldType === "url" ||
    question.fieldType === "textarea"
  ) {
    return {
      primitive: "fill",
      questionId: question.id,
      exactLabel: question.exactLabel,
      identity: question.domIdentity,
      value,
    };
  }

  return "This control type is not eligible for safe prefill.";
}

export function planApplicationPrefill(
  capture: AffiliateApplicationProgram,
  profile: AffiliateApplicationProfile,
): PrefillPlan {
  if (capture.formCaptureState !== "CAPTURED") {
    return {
      programName: capture.programName,
      captureState: capture.formCaptureState,
      actions: [],
      skipped: capture.questions.map((question) => ({
        questionId: question.id,
        exactLabel: question.exactLabel,
        reason: `Capture state ${capture.formCaptureState} is not eligible for prefill.`,
      })),
    };
  }

  const prepared = prepareAffiliateApplication(capture, profile);
  const answerByQuestion = new Map(prepared.answers.map((answer) => [answer.question.id, answer]));
  const actions: PrefillAction[] = [];
  const skipped: PrefillSkip[] = [];

  for (const question of capture.questions) {
    const answer = answerByQuestion.get(question.id);
    if (
      !answer ||
      answer.reviewRequired ||
      !answer.deterministic ||
      typeof answer.value !== "string"
    ) {
      skipped.push({
        questionId: question.id,
        exactLabel: question.exactLabel,
        reason: answer?.reason ?? "No deterministic approved answer is available.",
      });
      continue;
    }

    const action = actionForQuestion(question, answer.value);
    if (typeof action === "string") {
      skipped.push({
        questionId: question.id,
        exactLabel: question.exactLabel,
        reason: action,
      });
    } else {
      actions.push(action);
    }
  }

  return {
    programName: capture.programName,
    captureState: capture.formCaptureState,
    actions,
    skipped,
  };
}

export async function executeApplicationPrefill(
  plan: PrefillPlan,
  browser: BrowserPrefillPrimitives,
): Promise<PrefillExecutionResult> {
  const applied: PrefillAction[] = [];
  const failed: (PrefillAction & { reason: string })[] = [];

  for (const action of plan.actions) {
    if (isSubmitLikeIdentity(action.identity)) {
      failed.push({ ...action, reason: "Submit-like controls are always rejected." });
      continue;
    }
    try {
      if (action.primitive === "fill") await browser.fill(action.identity, action.value);
      else if (action.primitive === "select") await browser.select(action.identity, action.value);
      else await browser.check(action.identity, action.value);
      applied.push(action);
    } catch (error) {
      failed.push({
        ...action,
        reason: error instanceof Error ? error.message : "The browser primitive failed.",
      });
    }
  }

  return { plan, applied, failed };
}
