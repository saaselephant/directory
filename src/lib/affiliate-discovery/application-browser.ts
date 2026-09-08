import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";

import { chromium, type BrowserContext, type Locator, type Page } from "playwright-core";

import type { ApplicationControlIdentity } from "./application";
import type { BrowserPrefillPrimitives } from "./application-prefill";
import type { RawApplicationControl, RawApplicationDomSnapshot } from "./application-capture";

export const SYSTEM_CHROME_PATH = String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`;

export function defaultPartnerStackProfilePath(localAppData = process.env.LOCALAPPDATA): string {
  if (!localAppData) {
    throw new Error("LOCALAPPDATA is required to locate the dedicated Chrome profile.");
  }
  return path.join(localAppData, "SaaSElephant", "partnerstack-chrome-profile");
}

export function chromeLaunchArguments(profilePath: string, debuggingPort: number): string[] {
  return [
    `--user-data-dir=${profilePath}`,
    `--remote-debugging-port=${debuggingPort}`,
    "--remote-debugging-address=127.0.0.1",
    "--no-first-run",
    "--no-default-browser-check",
    "--start-maximized",
    "about:blank",
  ];
}

async function availableLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Unable to allocate a local Chrome debugging port."));
        return;
      }
      server.close((error) => {
        if (error) reject(error);
        else resolve(address.port);
      });
    });
  });
}

async function waitForChromeEndpoint(child: ChildProcess, debuggingPort: number): Promise<string> {
  const endpoint = `http://127.0.0.1:${debuggingPort}`;
  const deadline = Date.now() + 20_000;
  let launchError: Error | null = null;
  child.once("error", (error) => {
    launchError = error;
  });
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${endpoint}/json/version`, {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok) {
        const version = (await response.json()) as { Browser?: unknown };
        if (typeof version.Browser === "string" && version.Browser.includes("Chrome/")) {
          return endpoint;
        }
      }
    } catch {
      // Chrome may take several seconds to initialize the dedicated profile.
    }
    if (launchError) throw launchError;
    if (child.exitCode !== null) {
      throw new Error(
        "Chrome exited before the helper could connect. Close any existing SaaSElephant PartnerStack Chrome window and retry.",
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(
    "Chrome did not expose its local debugging endpoint. Close any existing SaaSElephant PartnerStack Chrome window and retry.",
  );
}

export async function launchPartnerStackBrowser(
  beforeAttach?: () => Promise<void>,
): Promise<BrowserContext> {
  const profilePath = defaultPartnerStackProfilePath();
  mkdirSync(profilePath, { recursive: true });
  const debuggingPort = await availableLoopbackPort();
  const child = spawn(SYSTEM_CHROME_PATH, chromeLaunchArguments(profilePath, debuggingPort), {
    stdio: "ignore",
    windowsHide: false,
  });
  try {
    const endpoint = await waitForChromeEndpoint(child, debuggingPort);
    await beforeAttach?.();
    const browser = await chromium.connectOverCDP(endpoint);
    const context = browser.contexts()[0];
    if (!context) throw new Error("Chrome did not expose its user-controlled browser context.");
    if (context.pages().length === 0) await context.newPage();
    return context;
  } catch (error) {
    if (child.exitCode === null) child.kill();
    throw error;
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
