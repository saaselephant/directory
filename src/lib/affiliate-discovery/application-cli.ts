import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import {
  FORM_CAPTURE_STATES,
  createAffiliateApplicationPreparationReport,
  type AffiliateApplicationProfile,
  type AffiliateApplicationProgram,
} from "./application";
import {
  activePage,
  captureVisibleApplication,
  closePartnerStackBrowser,
  launchPartnerStackBrowser,
  PlaywrightPrefillPrimitives,
} from "./application-browser";
import { createCaptureFailure, normalizeApplicationDomSnapshot } from "./application-capture";
import { executeApplicationPrefill, planApplicationPrefill } from "./application-prefill";

interface ParsedArguments {
  command: string | null;
  options: Map<string, string>;
  positionals: string[];
}

function usage(): string {
  return [
    "Browser-assisted PartnerStack application helper",
    "",
    "Commands:",
    "  capture --program <name> --output <file>",
    "  capture-batch --output-dir <directory> <program...>",
    "  prepare --profile <file> --output <file> <capture...>",
    "  prefill --capture <file> --profile <file>",
  ].join("\n");
}

function parseArguments(argv: readonly string[]): ParsedArguments {
  const [command = null, ...rest] = argv;
  const options = new Map<string, string>();
  const positionals: string[] = [];
  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];
    if (!value.startsWith("--")) {
      positionals.push(value);
      continue;
    }
    const optionValue = rest[index + 1];
    if (!optionValue || optionValue.startsWith("--")) {
      throw new Error(`Missing value for ${value}.`);
    }
    options.set(value, optionValue);
    index += 1;
  }
  return { command, options, positionals };
}

function validateOptions(arguments_: ParsedArguments, allowed: readonly string[]): void {
  for (const option of arguments_.options.keys()) {
    if (!allowed.includes(option)) throw new Error(`Unknown option ${option}.`);
  }
}

function requiredOption(arguments_: ParsedArguments, name: string): string {
  const value = arguments_.options.get(name);
  if (!value) throw new Error(`Required option ${name} was not provided.`);
  return value;
}

async function readJson(file: string): Promise<unknown> {
  const content = await readFile(resolve(file), "utf8");
  return JSON.parse(content.replace(/^\uFEFF/, "")) as unknown;
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await writeFile(resolve(file), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function applicationProfile(value: unknown): AffiliateApplicationProfile {
  if (
    typeof value !== "object" ||
    value === null ||
    !("id" in value) ||
    typeof value.id !== "string" ||
    !("approvedFields" in value) ||
    !Array.isArray(value.approvedFields) ||
    !("provenance" in value) ||
    typeof value.provenance !== "object" ||
    value.provenance === null
  ) {
    throw new Error("The profile file is not a valid affiliate application profile.");
  }
  return value as AffiliateApplicationProfile;
}

function applicationCapture(value: unknown): AffiliateApplicationProgram {
  if (
    typeof value !== "object" ||
    value === null ||
    !("programName" in value) ||
    typeof value.programName !== "string" ||
    !("formCaptureState" in value) ||
    typeof value.formCaptureState !== "string" ||
    !FORM_CAPTURE_STATES.includes(value.formCaptureState as (typeof FORM_CAPTURE_STATES)[number]) ||
    !("questions" in value) ||
    !Array.isArray(value.questions)
  ) {
    throw new Error("The capture file is not a valid affiliate application capture.");
  }
  return value as AffiliateApplicationProgram;
}

function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Unknown browser capture failure.";
  const withoutUrls = error.message.replace(/https?:\/\/[^\s"'<>]+/gi, (rawUrl) => {
    try {
      const url = new URL(rawUrl);
      url.username = "";
      url.password = "";
      url.search = "";
      url.hash = "";
      return url.toString();
    } catch {
      return "[redacted-url]";
    }
  });
  return withoutUrls
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/([?&](?:token|code|key|secret|session)=[^&\s]*)/gi, "[redacted]")
    .slice(0, 500);
}

async function waitForUser(prompt: string): Promise<void> {
  const terminal = createInterface({ input: stdin, output: stdout });
  try {
    await terminal.question(prompt);
  } finally {
    terminal.close();
  }
}

async function captureCommand(arguments_: ParsedArguments): Promise<void> {
  validateOptions(arguments_, ["--program", "--output"]);
  const programName = requiredOption(arguments_, "--program");
  const output = requiredOption(arguments_, "--output");
  let capturedAt = new Date().toISOString();
  let context;
  try {
    context = await launchPartnerStackBrowser(async () => {
      console.log("In the dedicated Chrome window, authenticate with PartnerStack normally.");
      await waitForUser("Press Enter after authentication is complete: ");
    });
    await waitForUser(
      "Open the official application form, then press Enter to capture visible controls: ",
    );
    capturedAt = new Date().toISOString();
    const page = activePage(context);
    const snapshot = await captureVisibleApplication(page);
    const capture = normalizeApplicationDomSnapshot(snapshot, {
      programName,
      pageUrl: page.url(),
      capturedAt,
    });
    await writeJson(output, capture);
    console.log(`Wrote ${capture.formCaptureState} capture to ${resolve(output)}.`);
  } catch (error) {
    const failure = createCaptureFailure(
      { programName, pageUrl: "", capturedAt },
      errorMessage(error),
    );
    await writeJson(output, failure);
    throw new Error(`Capture failed; a structured failure was written to ${resolve(output)}.`);
  } finally {
    if (context) await closePartnerStackBrowser(context);
  }
}

function captureFileName(programName: string): string {
  const name = programName
    .trim()
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (!name) throw new Error("Program names must contain letters or numbers.");
  return `${name}.json`;
}

export function captureBatchPrompt(index: number, total: number, programName: string): string {
  return [
    "",
    `[${index + 1}/${total}] ${programName}`,
    `Open the ${programName} application in the dedicated Chrome window.`,
    "Press Enter when the form is visible: ",
  ].join("\n");
}

async function captureBatchCommand(arguments_: ParsedArguments): Promise<void> {
  validateOptions(arguments_, ["--output-dir"]);
  const outputDirectory = resolve(requiredOption(arguments_, "--output-dir"));
  const programs = arguments_.positionals.map((program) => program.trim()).filter(Boolean);
  if (programs.length === 0) throw new Error("capture-batch requires at least one program name.");
  const fileNames = programs.map(captureFileName);
  if (new Set(fileNames).size !== fileNames.length) {
    throw new Error("Program names must resolve to unique capture file names.");
  }

  await mkdir(outputDirectory, { recursive: true });
  const context = await launchPartnerStackBrowser(async () => {
    console.log("In the dedicated Chrome window, authenticate with PartnerStack normally.");
    await waitForUser("Press Enter after authentication is complete: ");
  });
  const failures: string[] = [];
  try {
    console.log("For each prompt, open that program's official application form.");
    for (let index = 0; index < programs.length; index += 1) {
      const programName = programs[index];
      const output = join(outputDirectory, fileNames[index]);
      await waitForUser(captureBatchPrompt(index, programs.length, programName));
      const capturedAt = new Date().toISOString();
      try {
        const page = activePage(context);
        const snapshot = await captureVisibleApplication(page);
        const capture = normalizeApplicationDomSnapshot(snapshot, {
          programName,
          pageUrl: page.url(),
          capturedAt,
        });
        await writeJson(output, capture);
        console.log(`Wrote ${capture.formCaptureState} capture to ${output}.`);
        if (capture.formCaptureState !== "CAPTURED") failures.push(programName);
      } catch (error) {
        const failure = createCaptureFailure(
          { programName, pageUrl: "", capturedAt },
          errorMessage(error),
        );
        await writeJson(output, failure);
        failures.push(programName);
        console.error(`Wrote CAPTURE_FAILED result for ${programName} to ${output}.`);
      }
    }
  } finally {
    await closePartnerStackBrowser(context);
  }
  if (failures.length) {
    throw new Error(`Capture did not complete for: ${failures.join(", ")}.`);
  }
}

async function prepareCommand(arguments_: ParsedArguments): Promise<void> {
  validateOptions(arguments_, ["--profile", "--output"]);
  const profile = applicationProfile(await readJson(requiredOption(arguments_, "--profile")));
  const output = requiredOption(arguments_, "--output");
  if (arguments_.positionals.length === 0) {
    throw new Error("prepare requires at least one capture file.");
  }
  const programs = await Promise.all(
    arguments_.positionals.map(async (file) => applicationCapture(await readJson(file))),
  );
  await writeJson(output, createAffiliateApplicationPreparationReport(programs, profile));
  console.log(`Wrote preparation report for ${programs.length} program(s) to ${resolve(output)}.`);
}

async function prefillCommand(arguments_: ParsedArguments): Promise<void> {
  validateOptions(arguments_, ["--capture", "--profile"]);
  const capture = applicationCapture(await readJson(requiredOption(arguments_, "--capture")));
  const profile = applicationProfile(await readJson(requiredOption(arguments_, "--profile")));
  const plan = planApplicationPrefill(capture, profile);
  if (capture.formCaptureState !== "CAPTURED") {
    throw new Error(`Capture state ${capture.formCaptureState} is not eligible for prefill.`);
  }
  if (!capture.sourceUrl) {
    throw new Error("A safe captured PartnerStack application URL is required for prefill.");
  }

  const context = await launchPartnerStackBrowser(async () => {
    console.log(
      `In the dedicated Chrome window, log in normally and open the official ${capture.programName} PartnerStack application.`,
    );
    await waitForUser("Press Enter after authentication and navigation are complete: ");
  });
  try {
    await waitForUser("Press Enter to apply the reviewed safe prefill plan: ");
    const page = activePage(context);
    const result = await executeApplicationPrefill(
      plan,
      new PlaywrightPrefillPrimitives(page, capture.sourceUrl ?? null),
    );
    for (const action of result.applied) {
      console.log(`FILLED ${action.questionId}: ${action.exactLabel}`);
    }
    for (const skipped of result.plan.skipped) {
      console.log(`SKIPPED ${skipped.questionId}: ${skipped.reason}`);
    }
    for (const failed of result.failed) {
      console.log(`SKIPPED ${failed.questionId}: ${failed.reason}`);
    }
    console.log(
      "The browser remains open for human review. This helper cannot submit the application.",
    );
    await waitForUser(
      "Review in Chrome and manually submit if appropriate; press Enter to close: ",
    );
  } finally {
    await closePartnerStackBrowser(context);
  }
}

export async function runAffiliateApplicationCli(argv: readonly string[]): Promise<void> {
  const arguments_ = parseArguments(argv);
  if (arguments_.command === null || arguments_.command === "help") console.log(usage());
  else if (arguments_.command === "capture") await captureCommand(arguments_);
  else if (arguments_.command === "capture-batch") await captureBatchCommand(arguments_);
  else if (arguments_.command === "prepare") await prepareCommand(arguments_);
  else if (arguments_.command === "prefill") await prefillCommand(arguments_);
  else throw new Error(usage());
}
