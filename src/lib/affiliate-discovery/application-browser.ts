import { execFile, spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import { access, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { chromium, type BrowserContext, type Locator, type Page } from "playwright-core";

import type { ApplicationControlIdentity } from "./application";
import type { BrowserPrefillPrimitives } from "./application-prefill";
import type { RawApplicationControl, RawApplicationDomSnapshot } from "./application-capture";

export const SYSTEM_CHROME_PATH = String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`;
const execFileAsync = promisify(execFile);

export function defaultPartnerStackProfilePath(localAppData = process.env.LOCALAPPDATA): string {
  if (!localAppData) {
    throw new Error("LOCALAPPDATA is required to locate the dedicated Chrome profile.");
  }
  return path.join(localAppData, "SaaSElephant", "partnerstack-chrome-profile");
}

export function chromeLaunchArguments(profilePath: string): string[] {
  return [
    `--user-data-dir=${profilePath}`,
    "--remote-debugging-port=0",
    "--remote-debugging-address=127.0.0.1",
    "--no-first-run",
    "--no-default-browser-check",
    "--start-maximized",
    "about:blank",
  ];
}

interface ChromeEndpointPolling {
  readEndpoint: () => Promise<string | null>;
  probeEndpoint: (endpoint: string) => Promise<boolean>;
  sleep: (milliseconds: number) => Promise<void>;
  now: () => number;
}

export class ChromeEndpointTimeoutError extends Error {
  constructor() {
    super("Chrome did not expose a usable local DevTools endpoint before the timeout.");
    this.name = "ChromeEndpointTimeoutError";
  }
}

async function defaultSleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function devToolsActivePortPath(profilePath: string): string {
  return path.join(profilePath, "DevToolsActivePort");
}

export async function readDedicatedChromeEndpoint(profilePath: string): Promise<string | null> {
  let content: string;
  try {
    content = await readFile(devToolsActivePortPath(profilePath), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const port = Number.parseInt(content.split(/\r?\n/, 1)[0] ?? "", 10);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) return null;
  return `http://127.0.0.1:${port}`;
}

export async function probeChromeEndpoint(endpoint: string): Promise<boolean> {
  try {
    const response = await fetch(`${endpoint}/json/version`, {
      signal: AbortSignal.timeout(1_000),
    });
    if (!response.ok) return false;
    const version = (await response.json()) as {
      Browser?: unknown;
      webSocketDebuggerUrl?: unknown;
    };
    return (
      typeof version.Browser === "string" &&
      version.Browser.includes("Chrome/") &&
      typeof version.webSocketDebuggerUrl === "string" &&
      version.webSocketDebuggerUrl.startsWith("ws://127.0.0.1:")
    );
  } catch {
    return false;
  }
}

export async function discoverExistingPartnerStackChrome(
  profilePath: string,
  readEndpoint: () => Promise<string | null> = () => readDedicatedChromeEndpoint(profilePath),
  probeEndpoint: (endpoint: string) => Promise<boolean> = probeChromeEndpoint,
): Promise<string | null> {
  const endpoint = await readEndpoint();
  return endpoint && (await probeEndpoint(endpoint)) ? endpoint : null;
}

function commandLineArgument(commandLine: string, name: string): string | null {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`"--${escapedName}=([^"]+)"`, "i"),
    new RegExp(`--${escapedName}="([^"]+)"`, "i"),
    new RegExp(`--${escapedName}=([^\\s"]+)`, "i"),
  ];
  for (const pattern of patterns) {
    const match = commandLine.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

export function legacyChromeEndpointsFromCommandLines(
  profilePath: string,
  commandLines: readonly string[],
): string[] {
  const expectedProfile = path.resolve(profilePath).toLocaleLowerCase("en");
  const endpoints = new Set<string>();
  for (const commandLine of commandLines) {
    const userDataDirectory = commandLineArgument(commandLine, "user-data-dir");
    const rawPort = commandLineArgument(commandLine, "remote-debugging-port");
    if (!userDataDirectory || !rawPort) continue;
    if (path.resolve(userDataDirectory).toLocaleLowerCase("en") !== expectedProfile) continue;
    const port = Number.parseInt(rawPort, 10);
    if (Number.isInteger(port) && port > 0 && port <= 65_535) {
      endpoints.add(`http://127.0.0.1:${port}`);
    }
  }
  return [...endpoints];
}

async function discoverLegacyDedicatedChrome(profilePath: string): Promise<string | null> {
  if (process.platform !== "win32") return null;
  const command = [
    "$items = @(Get-CimInstance Win32_Process -Filter \"Name = 'chrome.exe'\" |",
    "Select-Object -ExpandProperty CommandLine | Where-Object { $_ });",
    "ConvertTo-Json -Compress -InputObject $items",
  ].join(" ");
  let commandLines: unknown;
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", command],
      { windowsHide: true, maxBuffer: 1024 * 1024 },
    );
    commandLines = JSON.parse(stdout) as unknown;
  } catch {
    return null;
  }
  if (!Array.isArray(commandLines) || !commandLines.every((item) => typeof item === "string")) {
    return null;
  }
  for (const endpoint of legacyChromeEndpointsFromCommandLines(profilePath, commandLines)) {
    if (await probeChromeEndpoint(endpoint)) return endpoint;
  }
  return null;
}

export async function assertPartnerStackChromeAvailable(
  endpoint: string,
  probeEndpoint: (endpoint: string) => Promise<boolean> = probeChromeEndpoint,
): Promise<void> {
  if (!(await probeEndpoint(endpoint))) {
    throw new Error("The dedicated Chrome browser closed before capture could attach.");
  }
}

export async function waitForPartnerStackChromeEndpoint(
  profilePath: string,
  timeoutMilliseconds = 60_000,
  polling: Partial<ChromeEndpointPolling> = {},
): Promise<string> {
  const readEndpoint = polling.readEndpoint ?? (() => readDedicatedChromeEndpoint(profilePath));
  const probeEndpoint = polling.probeEndpoint ?? probeChromeEndpoint;
  const sleep = polling.sleep ?? defaultSleep;
  const now = polling.now ?? Date.now;
  const deadline = now() + timeoutMilliseconds;

  while (now() < deadline) {
    const endpoint = await readEndpoint();
    if (endpoint && (await probeEndpoint(endpoint))) return endpoint;
    await sleep(250);
  }
  throw new ChromeEndpointTimeoutError();
}

async function removeStaleActivePortFile(profilePath: string): Promise<void> {
  try {
    await unlink(devToolsActivePortPath(profilePath));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

async function dedicatedProfileHasLock(profilePath: string): Promise<boolean> {
  const lockFiles = ["SingletonLock", "SingletonCookie", "SingletonSocket"];
  for (const file of lockFiles) {
    try {
      await access(path.join(profilePath, file));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return false;
}

function launchError(child: ChildProcess): Promise<never> {
  return new Promise((_, reject) => {
    child.once("error", reject);
  });
}

export async function launchPartnerStackBrowser(
  beforeAttach?: () => Promise<void>,
): Promise<BrowserContext> {
  const profilePath = defaultPartnerStackProfilePath();
  mkdirSync(profilePath, { recursive: true });
  let endpoint = await discoverExistingPartnerStackChrome(profilePath);
  endpoint ??= await discoverLegacyDedicatedChrome(profilePath);
  let child: ChildProcess | null = null;

  if (!endpoint) {
    await removeStaleActivePortFile(profilePath);
    child = spawn(SYSTEM_CHROME_PATH, chromeLaunchArguments(profilePath), {
      stdio: "ignore",
      windowsHide: false,
    });
    try {
      endpoint = await Promise.race([
        waitForPartnerStackChromeEndpoint(profilePath),
        launchError(child),
      ]);
    } catch (error) {
      if (child.exitCode === null) child.kill();
      if (error instanceof ChromeEndpointTimeoutError) {
        const profileLocked = await dedicatedProfileHasLock(profilePath);
        throw new Error(
          profileLocked
            ? "The dedicated SaaSElephant Chrome profile is locked or has stale lock artifacts but no usable DevTools endpoint. Close only a visible SaaSElephant PartnerStack Chrome window; if none is open, wait a few seconds and retry."
            : "Chrome opened, but no usable localhost DevTools endpoint appeared within 60 seconds.",
        );
      }
      throw error;
    }
  }

  try {
    await beforeAttach?.();
    await assertPartnerStackChromeAvailable(endpoint);
    const browser = await chromium.connectOverCDP(endpoint);
    const context = browser.contexts()[0];
    if (!context) throw new Error("Chrome did not expose its user-controlled browser context.");
    if (context.pages().length === 0) await context.newPage();
    return context;
  } catch {
    throw new Error("The dedicated Chrome browser became unavailable before capture could attach.");
  }
}

export async function closePartnerStackBrowser(context: BrowserContext): Promise<void> {
  const browser = context.browser();
  if (!browser || !browser.isConnected()) return;
  const session = await browser.newBrowserCDPSession();
  await session.send("Browser.close");
}

export function activePage(context: BrowserContext): Page {
  const pages = context.pages();
  const page = pages.at(-1);
  if (!page) throw new Error("Chrome did not expose an active page.");
  return page;
}

export async function captureVisibleApplication(page: Page): Promise<RawApplicationDomSnapshot> {
  assertPartnerStackPage(page);
  return page.evaluate(() => {
    const visible = (element: Element): boolean => {
      const htmlElement = element as HTMLElement;
      const style = window.getComputedStyle(htmlElement);
      const bounds = htmlElement.getBoundingClientRect();
      return (
        !htmlElement.hidden &&
        htmlElement.getAttribute("aria-hidden") !== "true" &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        bounds.width > 0 &&
        bounds.height > 0
      );
    };
    const textFromIds = (ids: string | null): string => {
      if (!ids) return "";
      return ids
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
        .filter(Boolean)
        .join(" ");
    };
    const labelFor = (
      control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
    ): string => {
      const associated = Array.from(control.labels ?? [])
        .map((label) => label.textContent?.trim() ?? "")
        .filter(Boolean)
        .join(" ");
      return (
        associated ||
        textFromIds(control.getAttribute("aria-labelledby")) ||
        control.getAttribute("aria-label")?.trim() ||
        control.getAttribute("placeholder")?.trim() ||
        control.name ||
        control.id ||
        ""
      );
    };
    const radioGroupLabel = (control: HTMLInputElement): string => {
      const fieldset = control.closest("fieldset");
      const legend = fieldset?.querySelector(":scope > legend")?.textContent?.trim();
      if (legend) return legend;
      const group = control.closest('[role="radiogroup"]');
      return (
        textFromIds(group?.getAttribute("aria-labelledby") ?? null) ||
        group?.getAttribute("aria-label")?.trim() ||
        labelFor(control)
      );
    };
    const excludedTypes = new Set([
      "hidden",
      "password",
      "file",
      "button",
      "submit",
      "reset",
      "image",
    ]);
    const supportedTypes = new Set([
      "text",
      "search",
      "email",
      "url",
      "tel",
      "number",
      "radio",
      "checkbox",
    ]);
    const allControls = Array.from(
      document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
        "input, textarea, select",
      ),
    );
    const eligible = (
      control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
    ): boolean => {
      const type = control instanceof HTMLInputElement ? control.type.toLowerCase() : "";
      return (
        visible(control) &&
        !control.matches(":disabled") &&
        control.getAttribute("aria-disabled") !== "true" &&
        !excludedTypes.has(type) &&
        (!(control instanceof HTMLInputElement) || supportedTypes.has(type))
      );
    };
    const passwordVisible = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[type="password"]'),
    ).some(
      (control) =>
        visible(control) &&
        !control.matches(":disabled") &&
        control.getAttribute("aria-disabled") !== "true",
    );
    if (passwordVisible) {
      return {
        formFound: false,
        authRequired: true,
        unsupported: false,
        unsupportedReason: null,
        controls: [],
      };
    }

    const forms = Array.from(document.querySelectorAll("form")).filter(visible);
    const form = forms
      .map((candidate) => ({
        candidate,
        count: allControls.filter((control) => candidate.contains(control) && eligible(control))
          .length,
      }))
      .sort((left, right) => right.count - left.count)[0]?.candidate;
    if (!form) {
      return {
        formFound: false,
        authRequired: false,
        unsupported: false,
        unsupportedReason: null,
        controls: [],
      };
    }

    const unsupportedControl = Array.from(
      form.querySelectorAll<HTMLElement>(
        '[contenteditable="true"], [role="textbox"], [role="combobox"]',
      ),
    ).some((control) => visible(control) && control.getAttribute("aria-disabled") !== "true");
    const unsupportedNativeControl = allControls.some((control) => {
      if (!form.contains(control) || !visible(control) || control.matches(":disabled"))
        return false;
      if (!(control instanceof HTMLInputElement)) return false;
      const type = control.type.toLowerCase();
      return !excludedTypes.has(type) && !supportedTypes.has(type);
    });
    const controls: RawApplicationControl[] = allControls
      .filter((control) => form.contains(control) && eligible(control))
      .map((control) => {
        const isInput = control instanceof HTMLInputElement;
        const type = isInput ? control.type.toLowerCase() : null;
        return {
          order: allControls.indexOf(control),
          tagName: control.tagName.toLowerCase(),
          inputType: type,
          id: control.id || null,
          name: control.name || null,
          label: labelFor(control),
          required: control.required || control.getAttribute("aria-required") === "true",
          visible: true,
          enabled: true,
          options:
            control instanceof HTMLSelectElement
              ? Array.from(control.options)
                  .filter((option) => !option.disabled && option.label.trim())
                  .map((option) => ({ label: option.label.trim(), value: option.value }))
              : undefined,
          radioGroupLabel: isInput && type === "radio" ? radioGroupLabel(control) : null,
          radioOptionLabel: isInput && type === "radio" ? labelFor(control) : null,
          radioOptionValue: isInput && type === "radio" ? control.value : null,
        };
      });

    return {
      formFound: true,
      authRequired: false,
      unsupported: unsupportedControl || unsupportedNativeControl,
      unsupportedReason: unsupportedControl
        ? "The selected form contains a custom editable or choice control."
        : unsupportedNativeControl
          ? "The selected form contains an unsupported native input type."
          : null,
      controls,
    };
  });
}

function normalizedPartnerStackPageUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  const validHost =
    url.protocol === "https:" &&
    (url.hostname === "partnerstack.com" || url.hostname.endsWith(".partnerstack.com"));
  if (!validHost)
    throw new Error("Browser access is restricted to HTTPS pages on partnerstack.com.");
  url.search = "";
  url.hash = "";
  return url.toString();
}

function assertPartnerStackPage(page: Page, expectedSourceUrl?: string | null): void {
  const currentUrl = normalizedPartnerStackPageUrl(page.url());
  if (expectedSourceUrl && currentUrl !== normalizedPartnerStackPageUrl(expectedSourceUrl)) {
    throw new Error("The open page does not match the captured PartnerStack application URL.");
  }
}

export class PlaywrightPrefillPrimitives implements BrowserPrefillPrimitives {
  readonly #page: Page;
  readonly #expectedSourceUrl: string | null;

  constructor(page: Page, expectedSourceUrl: string | null = null) {
    this.#page = page;
    this.#expectedSourceUrl = expectedSourceUrl;
  }

  async #resolve(identity: ApplicationControlIdentity): Promise<Locator> {
    assertPartnerStackPage(this.#page, this.#expectedSourceUrl);
    const locator = this.#page.locator("input, textarea, select").nth(identity.order);
    const actual = await locator.evaluate((element) => {
      const htmlElement = element as HTMLElement;
      const input = element instanceof HTMLInputElement ? element : null;
      const style = window.getComputedStyle(htmlElement);
      const bounds = htmlElement.getBoundingClientRect();
      return {
        id: element.id || null,
        name:
          element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement ||
          element instanceof HTMLSelectElement
            ? element.name || null
            : null,
        tagName: element.tagName.toLowerCase(),
        inputType: input?.type.toLowerCase() ?? null,
        disabled:
          !(
            element instanceof HTMLInputElement ||
            element instanceof HTMLTextAreaElement ||
            element instanceof HTMLSelectElement
          ) ||
          element.matches(":disabled") ||
          element.getAttribute("aria-disabled") === "true",
        visible:
          !htmlElement.hidden &&
          htmlElement.getAttribute("aria-hidden") !== "true" &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          bounds.width > 0 &&
          bounds.height > 0,
      };
    });
    if (
      actual.id !== identity.id ||
      actual.name !== identity.name ||
      actual.tagName !== identity.tagName ||
      actual.inputType !== identity.inputType
    ) {
      throw new Error("The live control no longer matches its captured DOM identity.");
    }
    if (actual.disabled || !actual.visible) {
      throw new Error("The captured control is no longer visible and enabled.");
    }
    if (
      ["submit", "button", "reset", "image", "file", "password", "hidden"].includes(
        actual.inputType ?? "",
      )
    ) {
      throw new Error("The live control type is forbidden.");
    }
    return locator;
  }

  async fill(identity: ApplicationControlIdentity, value: string): Promise<void> {
    const locator = await this.#resolve(identity);
    if (!["input", "textarea"].includes(identity.tagName)) {
      throw new Error("fill is restricted to text-entry controls.");
    }
    if (
      identity.tagName === "input" &&
      !["text", "search", "email", "url", "tel", "number"].includes(identity.inputType ?? "")
    ) {
      throw new Error("fill is restricted to safe text-like input types.");
    }
    await locator.fill(value);
  }

  async select(identity: ApplicationControlIdentity, value: string): Promise<void> {
    const locator = await this.#resolve(identity);
    if (identity.tagName !== "select") throw new Error("select is restricted to select controls.");
    const selected = await locator.selectOption({ value });
    if (selected.length !== 1 || selected[0] !== value) {
      throw new Error("The exact captured select option was not selected.");
    }
  }

  async check(identity: ApplicationControlIdentity, value: string): Promise<void> {
    const locator = await this.#resolve(identity);
    if (identity.tagName !== "input" || identity.inputType !== "radio") {
      throw new Error("check is restricted to captured non-legal radio options.");
    }
    const actualValue = await locator.getAttribute("value");
    if ((actualValue ?? "") !== value) {
      throw new Error("The live radio value no longer matches the captured option.");
    }
    await locator.check();
  }
}
