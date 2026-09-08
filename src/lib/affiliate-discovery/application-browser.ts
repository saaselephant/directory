import { execFile, spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import { access, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import {
  chromium,
  type BrowserContext,
  type Frame,
  type Locator,
  type Page,
} from "playwright-core";

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
  const mainOrigin = new URL(page.url()).origin;
  const frameStatuses = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLIFrameElement>("iframe")).map((frame) => {
      const style = window.getComputedStyle(frame);
      const bounds = frame.getBoundingClientRect();
      const shown =
        !frame.hidden &&
        frame.getAttribute("aria-hidden") !== "true" &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        bounds.width > 0 &&
        bounds.height > 0;
      const hint = [frame.title, frame.name, frame.getAttribute("aria-label") ?? ""]
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 160);
      let blocked = false;
      try {
        const source = new URL(frame.src, window.location.href);
        blocked =
          source.origin !== window.location.origin &&
          source.hostname !== "partnerstack.com" &&
          !source.hostname.endsWith(".partnerstack.com");
      } catch {
        blocked = true;
      }
      return { shown, hint, blocked };
    }),
  );
  const inspectableFrames = page.frames().filter((frame) => {
    for (
      let current: Frame | null = frame;
      current && current !== page.mainFrame();
      current = current.parentFrame()
    ) {
      if (current.url() === "about:blank") continue;
      try {
        const url = new URL(current.url());
        if (
          url.origin !== mainOrigin &&
          url.hostname !== "partnerstack.com" &&
          !url.hostname.endsWith(".partnerstack.com")
        ) {
          return false;
        }
      } catch {
        return false;
      }
    }
    return true;
  });
  const snapshots: RawApplicationDomSnapshot[] = [];

  for (const frame of inspectableFrames) {
    const frameIndex = page.frames().indexOf(frame);
    let safeFrameUrl: string | null = null;
    try {
      safeFrameUrl =
        frame.url() === "about:blank" ? null : normalizedPartnerStackPageUrl(frame.url());
    } catch {
      if (frame.url() !== "about:blank" && new URL(frame.url()).origin !== mainOrigin) continue;
    }
    let snapshot: RawApplicationDomSnapshot;
    try {
      snapshot = await frame.evaluate(
        async ({ frameUrl, frameIndex }) => {
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
          const safeText = (value: string | null | undefined, maximum = 300): string =>
            (value ?? "").replace(/\s+/g, " ").trim().slice(0, maximum);
          const textFromIds = (ids: string | null, subject?: Element): string => {
            if (!ids) return "";
            return ids
              .split(/\s+/)
              .map((id) => {
                const labelledBy = document.getElementById(id);
                if (
                  !labelledBy ||
                  (subject &&
                    (labelledBy === subject ||
                      labelledBy.contains(subject) ||
                      subject.contains(labelledBy)))
                ) {
                  return "";
                }
                return safeText(labelledBy.textContent);
              })
              .filter(Boolean)
              .join(" ");
          };
          const accessibleName = (control: Element): string => {
            const labelledControl = control as
              | HTMLInputElement
              | HTMLTextAreaElement
              | HTMLSelectElement;
            const role =
              control.getAttribute("role") ??
              (control instanceof HTMLButtonElement &&
              ["listbox", "menu"].includes(control.getAttribute("aria-haspopup") ?? "")
                ? "combobox"
                : null);
            const mayContainEnteredValue =
              control instanceof HTMLInputElement ||
              control instanceof HTMLTextAreaElement ||
              control instanceof HTMLSelectElement ||
              role === "textbox" ||
              role === "combobox" ||
              control.getAttribute("contenteditable") === "true";
            const associated = Array.from(labelledControl.labels ?? [])
              .map((label) => label.textContent?.trim() ?? "")
              .filter(Boolean)
              .join(" ");
            const wrappingLabel = control.closest("label")?.textContent;
            return (
              textFromIds(control.getAttribute("aria-labelledby"), control) ||
              safeText(control.getAttribute("aria-label")) ||
              safeText(associated) ||
              (!mayContainEnteredValue ? safeText(wrappingLabel) : "") ||
              safeText(control.getAttribute("placeholder")) ||
              ("name" in labelledControl ? safeText(labelledControl.name) : "") ||
              (!mayContainEnteredValue ? safeText(control.textContent) : "") ||
              safeText(control.id) ||
              ""
            );
          };
          const radioGroupLabel = (control: Element): string => {
            const fieldset = control.closest("fieldset");
            const legend = fieldset?.querySelector(":scope > legend")?.textContent?.trim();
            if (legend) return legend;
            const group = control.closest('[role="radiogroup"]');
            return (
              textFromIds(group?.getAttribute("aria-labelledby") ?? null, control) ||
              group?.getAttribute("aria-label")?.trim() ||
              accessibleName(control)
            );
          };
          const required = (control: Element, label: string): boolean =>
            control.hasAttribute("required") ||
            control.getAttribute("aria-required") === "true" ||
            /\*\s*$|\brequired\b/i.test(label);
          const enabled = (control: Element): boolean =>
            !control.matches(":disabled") && control.getAttribute("aria-disabled") !== "true";
          const legal = (label: string): boolean =>
            /\b(agree|accept|terms|conditions|privacy|consent|certify|attest|authorize|authorise|legally|acknowledge)\b/i.test(
              label,
            );
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
          const eligibleNative = (
            control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
          ): boolean => {
            const type = control instanceof HTMLInputElement ? control.type.toLowerCase() : "";
            return (
              visible(control) &&
              enabled(control) &&
              !excludedTypes.has(type) &&
              (!(control instanceof HTMLInputElement) || supportedTypes.has(type)) &&
              (!(control instanceof HTMLInputElement) ||
                control.getAttribute("role") !== "combobox")
            );
          };
          const accessibleTextboxes = Array.from(
            new Set(
              document.querySelectorAll<HTMLElement>(
                '[role="textbox"]:not(input):not(textarea), [contenteditable="true"][role="textbox"]',
              ),
            ),
          ).filter((control) => visible(control) && enabled(control));
          const customChoices = Array.from(
            new Set(
              document.querySelectorAll<HTMLElement>(
                'input[role="combobox"]:not([type]), input[role="combobox"][type="text"], input[role="combobox"][type="search"], input[role="combobox"][type="email"], input[role="combobox"][type="url"], input[role="combobox"][type="tel"], input[role="combobox"][type="number"], [role="combobox"]:not(input):not(select):not(button), button[role="combobox"][type="button"], button[aria-haspopup="listbox"][type="button"], button[aria-haspopup="menu"][type="button"]',
              ),
            ),
          ).filter((control) => {
            if (!visible(control) || !enabled(control)) return false;
            if (control instanceof HTMLButtonElement) {
              return control.getAttribute("type")?.toLocaleLowerCase() === "button";
            }
            if (control instanceof HTMLInputElement) {
              return ["text", "search", "email", "url", "tel", "number"].includes(
                control.type.toLocaleLowerCase(),
              );
            }
            return true;
          });
          const unsafeChoiceButtons = Array.from(
            document.querySelectorAll<HTMLButtonElement>(
              'button[role="combobox"],button[aria-haspopup="listbox"],button[aria-haspopup="menu"]',
            ),
          ).filter(
            (control) =>
              visible(control) &&
              enabled(control) &&
              control.getAttribute("type")?.toLocaleLowerCase() !== "button",
          );
          const untypedContenteditables = Array.from(
            document.querySelectorAll<HTMLElement>(
              '[contenteditable="true"]:not([role="textbox"])',
            ),
          ).filter((control) => visible(control) && enabled(control));
          const customRadios = Array.from(
            document.querySelectorAll<HTMLElement>('[role="radio"]:not(input)'),
          ).filter((control) => visible(control) && enabled(control));
          const customCheckboxes = Array.from(
            document.querySelectorAll<HTMLElement>('[role="checkbox"]:not(input)'),
          ).filter((control) => visible(control) && enabled(control));
          const allEligible = [
            ...new Set([
              ...allControls.filter(eligibleNative),
              ...accessibleTextboxes,
              ...customChoices,
              ...customRadios,
              ...customCheckboxes,
            ]),
          ].sort((left, right) =>
            left === right
              ? 0
              : (left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
                ? -1
                : 1,
          );
          const passwordVisible = Array.from(
            document.querySelectorAll<HTMLInputElement>('input[type="password"]'),
          ).some(
            (control) =>
              visible(control) &&
              !control.matches(":disabled") &&
              control.getAttribute("aria-disabled") !== "true",
          );
          const forms = Array.from(document.querySelectorAll("form")).filter(visible);
          const applicationHeading = (root: Element): boolean =>
            Array.from(root.querySelectorAll("h1,h2,h3,[role=heading]"))
              .filter(visible)
              .some((heading) =>
                /\b(program application|apply to (?:the )?program|application)\b/i.test(
                  safeText(heading.textContent),
                ),
              );
          const submitMarker = (root: Element): boolean =>
            Array.from(root.querySelectorAll<HTMLElement>("button,input[type=submit]"))
              .filter(visible)
              .some((button) =>
                /\b(submit application|apply to (?:the )?program|apply now)\b/i.test(
                  safeText(button.textContent || button.getAttribute("aria-label")),
                ),
              );
          const regionCandidateSet = new Set(
            Array.from(
              document.querySelectorAll<HTMLElement>('form,[role="dialog"],main,section'),
            ).filter(visible),
          );
          const applicationMarkers = [
            ...Array.from(document.querySelectorAll<HTMLElement>("h1,h2,h3,[role=heading]")).filter(
              (heading) =>
                visible(heading) &&
                /\b(program application|apply to (?:the )?program|application)\b/i.test(
                  safeText(heading.textContent),
                ),
            ),
            ...Array.from(
              document.querySelectorAll<HTMLElement>("button,input[type=submit]"),
            ).filter(
              (button) =>
                visible(button) &&
                /\b(submit application|apply to (?:the )?program|apply now)\b/i.test(
                  safeText(button.textContent || button.getAttribute("aria-label")),
                ),
            ),
          ];
          for (const marker of applicationMarkers) {
            for (
              let candidate = marker.parentElement;
              candidate && candidate !== document.body;
              candidate = candidate.parentElement
            ) {
              if (
                visible(candidate) &&
                allEligible.some((control) => candidate.contains(control))
              ) {
                regionCandidateSet.add(candidate);
              }
            }
          }
          const regionCandidates = [...regionCandidateSet];
          if (
            regionCandidates.length === 0 &&
            applicationHeading(document.body) &&
            allEligible.length > 0
          ) {
            regionCandidates.push(document.body);
          }
          const region = regionCandidates
            .map((candidate) => {
              const controlCount = allEligible.filter((control) =>
                candidate.contains(control),
              ).length;
              const isForm = candidate.tagName.toLocaleLowerCase() === "form";
              const heading = applicationHeading(candidate);
              const submit = submitMarker(candidate);
              const grouped =
                Array.from(
                  candidate.querySelectorAll('fieldset,[role="group"],[role="radiogroup"]'),
                )
                  .filter(visible)
                  .some(
                    (group) => allEligible.filter((control) => group.contains(control)).length >= 2,
                  ) ||
                (candidate.getAttribute("role") === "dialog" && controlCount >= 2);
              let depth = 0;
              for (let parent = candidate.parentElement; parent; parent = parent.parentElement)
                depth += 1;
              const eligibleRegion = controlCount > 0 && (heading || submit);
              const evidenceTier =
                heading && submit ? 4 : isForm && submit ? 3 : submit ? 2 : heading ? 1 : 0;
              return {
                candidate,
                eligibleRegion,
                score:
                  evidenceTier * 1_000_000 +
                  (grouped ? 10_000 : 0) +
                  depth * 100 -
                  Math.min(controlCount, 99),
              };
            })
            .filter((candidate) => candidate.eligibleRegion)
            .sort((left, right) => right.score - left.score)[0]?.candidate;
          const headingElements = Array.from(
            document.querySelectorAll<HTMLElement>("h1,h2,h3,[role=heading]"),
          ).filter(visible);
          const precedingHeading = region
            ? headingElements
                .filter(
                  (heading) =>
                    (heading.compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING) !==
                    0,
                )
                .at(-1)
            : null;
          const headings = headingElements
            .filter(
              (heading) =>
                region?.contains(heading) ||
                heading === precedingHeading ||
                /\b(program application|apply to (?:the )?program|application)\b/i.test(
                  safeText(heading.textContent),
                ),
            )
            .map((heading) => safeText(heading.textContent))
            .filter(Boolean)
            .slice(0, 20);
          const regionControls = region
            ? allEligible.filter((control) => region.contains(control))
            : [];
          const labels = regionControls.map(accessibleName).filter(Boolean);
          const buttons = Array.from(document.querySelectorAll<HTMLElement>("button"))
            .filter(
              (button) =>
                visible(button) &&
                (region
                  ? region.contains(button)
                  : /\b(submit application|apply to (?:the )?program|apply now)\b/i.test(
                      safeText(button.textContent || button.getAttribute("aria-label")),
                    )) &&
                button.getAttribute("role") !== "combobox" &&
                !["listbox", "menu"].includes(button.getAttribute("aria-haspopup") ?? ""),
            )
            .map((button) => safeText(button.textContent || button.getAttribute("aria-label")))
            .filter(Boolean)
            .slice(0, 30);
          const nativeInputTypes: Record<string, number> = {};
          for (const input of Array.from(
            document.querySelectorAll<HTMLInputElement>("input"),
          ).filter(visible)) {
            const type = input.type.toLocaleLowerCase();
            nativeInputTypes[type] = (nativeInputTypes[type] ?? 0) + 1;
          }
          const ariaControls = Array.from(
            document.querySelectorAll<HTMLElement>(
              '[role="textbox"],[role="combobox"],[role="radio"],[role="radiogroup"],[role="checkbox"]',
            ),
          )
            .filter((control) => visible(control) && Boolean(region?.contains(control)))
            .map((control) => ({
              role: safeText(control.getAttribute("role"), 40),
              name: accessibleName(control),
            }))
            .filter((control) => control.role && control.name)
            .slice(0, 30);
          const diagnostics = {
            pageTitle: safeText(document.title) || null,
            pageUrl: frameUrl,
            visibleFormCount: forms.length,
            visibleRegionCount: regionCandidates.length,
            controls: {
              nativeInputTypes,
              customRoles: {
                textbox: accessibleTextboxes.length,
                combobox: customChoices.length + unsafeChoiceButtons.length,
                radio: customRadios.length,
                checkbox: customCheckboxes.length,
              },
              textarea: allControls.filter(
                (control) => control instanceof HTMLTextAreaElement && visible(control),
              ).length,
              select: allControls.filter(
                (control) => control instanceof HTMLSelectElement && visible(control),
              ).length,
              combobox: customChoices.length + unsafeChoiceButtons.length,
              radio: (nativeInputTypes.radio ?? 0) + customRadios.length,
              checkbox: (nativeInputTypes.checkbox ?? 0) + customCheckboxes.length,
            },
            safeButtonTexts: buttons,
            safeLabels: labels.slice(0, 40),
            ariaControls,
            nearbyHeadings: headings,
            iframes: {
              total: 0,
              inspected: 0,
              sameOrigin: 0,
              partnerStack: 0,
              blocked: 0,
              statuses: [] as string[],
            },
            customControlIndicators: [
              ...(accessibleTextboxes.length ? ["accessible-textbox"] : []),
              ...(customChoices.length ? ["custom-combobox"] : []),
              ...(customRadios.length ? ["custom-radio"] : []),
              ...(customCheckboxes.length ? ["custom-checkbox"] : []),
              ...(unsafeChoiceButtons.length ? ["unverified-choice-button"] : []),
              ...(untypedContenteditables.length ? ["untyped-contenteditable"] : []),
            ],
          };
          if (passwordVisible) {
            return {
              formFound: false,
              authRequired: true,
              unsupported: false,
              unsupportedReason: null,
              controls: [],
              diagnostics,
            };
          }
          if (!region) {
            const unsupportedApplicationControl =
              applicationHeading(document.body) &&
              (unsafeChoiceButtons.length > 0 || untypedContenteditables.length > 0);
            return {
              formFound: unsupportedApplicationControl,
              authRequired: false,
              unsupported: unsupportedApplicationControl,
              unsupportedReason: unsupportedApplicationControl
                ? "The application region contains custom controls that cannot be proven safe."
                : null,
              controls: [],
              diagnostics,
            };
          }

          const unsupportedNativeControl = allControls.some((control) => {
            if (!region.contains(control) || !visible(control) || !enabled(control)) return false;
            if (!(control instanceof HTMLInputElement)) return false;
            const type = control.type.toLowerCase();
            return !excludedTypes.has(type) && !supportedTypes.has(type);
          });
          const unsupportedCustomControl =
            unsafeChoiceButtons.some((control) => region.contains(control)) ||
            untypedContenteditables.some((control) => region.contains(control));
          const controls: RawApplicationControl[] = allControls
            .filter((control) => region.contains(control) && eligibleNative(control))
            .map((control) => {
              const isInput = control instanceof HTMLInputElement;
              const type = isInput ? control.type.toLowerCase() : null;
              return {
                order: allEligible.indexOf(control),
                tagName: control.tagName.toLowerCase(),
                inputType: type,
                id: control.id || null,
                name: control.name || null,
                label: accessibleName(control),
                required: required(control, accessibleName(control)),
                visible: true,
                enabled: true,
                kind: "native" as const,
                role:
                  control.getAttribute("role") === "textbox"
                    ? ("textbox" as const)
                    : control.getAttribute("role") === "radio"
                      ? ("radio" as const)
                      : control.getAttribute("role") === "checkbox"
                        ? ("checkbox" as const)
                        : null,
                ariaName: accessibleName(control),
                locatorIndex: allControls.indexOf(control),
                frameUrl,
                frameIndex,
                options:
                  control instanceof HTMLSelectElement
                    ? Array.from(control.options)
                        .filter((option) => !option.disabled && option.label.trim())
                        .map((option) => ({ label: option.label.trim(), value: option.value }))
                    : undefined,
                radioGroupLabel: isInput && type === "radio" ? radioGroupLabel(control) : null,
                radioOptionLabel: isInput && type === "radio" ? accessibleName(control) : null,
                radioOptionValue: isInput && type === "radio" ? control.value : null,
              };
            });
          for (const control of accessibleTextboxes.filter((item) => region.contains(item))) {
            const label = accessibleName(control);
            controls.push({
              order: allEligible.indexOf(control),
              tagName: control.tagName.toLocaleLowerCase(),
              inputType: control.getAttribute("aria-multiline") === "true" ? "textarea" : "text",
              id: control.id || null,
              name: null,
              label,
              required: required(control, label),
              visible: true,
              enabled: true,
              kind: "accessible-textbox",
              role: "textbox",
              ariaName: label,
              locatorIndex: accessibleTextboxes.indexOf(control),
              frameUrl,
              frameIndex,
            });
          }
          for (const control of customChoices.filter((item) => region.contains(item))) {
            const label = accessibleName(control);
            let optionRoot: Element | null = null;
            const controlledId = control.getAttribute("aria-controls");
            const controlled = controlledId ? document.getElementById(controlledId) : null;
            if (controlled) optionRoot = controlled;
            let options = optionRoot
              ? Array.from(
                  optionRoot.querySelectorAll<HTMLElement>(
                    '[role="option"],[role="menuitemradio"]',
                  ),
                ).filter(visible)
              : [];
            const safeTrigger =
              !legal(label) &&
              (!(control instanceof HTMLButtonElement) ||
                control.getAttribute("type")?.toLocaleLowerCase() === "button");
            if (options.length === 0 && safeTrigger) {
              const previouslyVisible = new Set(
                Array.from(
                  document.querySelectorAll<HTMLElement>('[role="option"],[role="menuitemradio"]'),
                ).filter(visible),
              );
              control.click();
              await new Promise((resolve) => window.setTimeout(resolve, 75));
              if (controlled) {
                options = Array.from(
                  controlled.querySelectorAll<HTMLElement>(
                    '[role="option"],[role="menuitemradio"]',
                  ),
                ).filter(visible);
              } else {
                const roots = Array.from(
                  document.querySelectorAll<HTMLElement>('[role="listbox"],[role="menu"]'),
                ).filter(visible);
                if (roots.length === 1) {
                  options = Array.from(
                    roots[0].querySelectorAll<HTMLElement>(
                      '[role="option"],[role="menuitemradio"]',
                    ),
                  ).filter((option) => visible(option) && !previouslyVisible.has(option));
                }
              }
              control.dispatchEvent(
                new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }),
              );
              document.dispatchEvent(
                new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }),
              );
            }
            const optionLabels = [
              ...new Set(options.map((option) => accessibleName(option)).filter(Boolean)),
            ];
            controls.push({
              order: allEligible.indexOf(control),
              tagName: control.tagName.toLocaleLowerCase(),
              inputType:
                control instanceof HTMLButtonElement
                  ? (control.getAttribute("type")?.toLocaleLowerCase() ?? null)
                  : control instanceof HTMLInputElement
                    ? control.type.toLocaleLowerCase()
                    : null,
              id: control.id || null,
              name: control instanceof HTMLInputElement ? control.name || null : null,
              label,
              required: required(control, label),
              visible: true,
              enabled: true,
              kind: "custom-combobox",
              role: "combobox",
              ariaName: label,
              locatorIndex: customChoices.indexOf(control),
              frameUrl,
              frameIndex,
              options: optionLabels.map((option) => ({ label: option, value: option })),
            });
          }
          for (const control of customRadios.filter((item) => region.contains(item))) {
            const label = accessibleName(control);
            const groupLabel = radioGroupLabel(control);
            const group = control.closest('[role="radiogroup"]');
            controls.push({
              order: allEligible.indexOf(control),
              tagName: control.tagName.toLocaleLowerCase(),
              inputType: "radio",
              id: control.id || null,
              name: group?.id || groupLabel || null,
              label,
              required: required(control, label) || group?.getAttribute("aria-required") === "true",
              visible: true,
              enabled: true,
              kind: "custom-radio",
              role: "radio",
              ariaName: label,
              locatorIndex: customRadios.indexOf(control),
              frameUrl,
              frameIndex,
              radioGroupLabel: groupLabel,
              radioOptionLabel: label,
              radioOptionValue: label,
            });
          }
          for (const control of customCheckboxes.filter((item) => region.contains(item))) {
            const label = accessibleName(control);
            controls.push({
              order: allEligible.indexOf(control),
              tagName: control.tagName.toLocaleLowerCase(),
              inputType: "checkbox",
              id: control.id || null,
              name: null,
              label,
              required: required(control, label),
              visible: true,
              enabled: true,
              kind: "custom-checkbox",
              role: "checkbox",
              ariaName: label,
              locatorIndex: customCheckboxes.indexOf(control),
              frameUrl,
              frameIndex,
            });
          }
          controls.sort((left, right) => left.order - right.order);

          return {
            formFound: true,
            authRequired: false,
            unsupported: unsupportedNativeControl || unsupportedCustomControl,
            unsupportedReason: unsupportedNativeControl
              ? "The application region contains an unsupported native input type."
              : unsupportedCustomControl
                ? "The application region contains a custom control that cannot be proven safe."
                : null,
            controls,
            diagnostics,
          };
        },
        { frameUrl: safeFrameUrl, frameIndex },
      );
    } catch {
      snapshots.push({
        formFound: true,
        authRequired: false,
        unsupported: true,
        unsupportedReason: "A PartnerStack application frame became inaccessible during capture.",
        controls: [],
        diagnostics: {
          pageTitle: null,
          pageUrl: safeFrameUrl,
          visibleFormCount: 0,
          visibleRegionCount: 0,
          controls: {
            nativeInputTypes: {},
            customRoles: {},
            textarea: 0,
            select: 0,
            combobox: 0,
            radio: 0,
            checkbox: 0,
          },
          safeButtonTexts: [],
          safeLabels: [],
          ariaControls: [],
          nearbyHeadings: [],
          iframes: {
            total: 1,
            inspected: 0,
            sameOrigin: 0,
            partnerStack: 1,
            blocked: 1,
            statuses: ["PartnerStack application frame became inaccessible during capture"],
          },
          customControlIndicators: [],
        },
      });
      continue;
    }
    snapshots.push(snapshot);
  }

  const best = snapshots
    .slice()
    .sort(
      (left, right) =>
        Number(right.formFound) - Number(left.formFound) ||
        Number(right.authRequired) - Number(left.authRequired) ||
        right.controls.length - left.controls.length,
    )[0] ?? {
    formFound: false,
    authRequired: false,
    unsupported: false,
    unsupportedReason: null,
    controls: [],
  };
  const visibleFrameCount = frameStatuses.filter((frame) => frame.shown).length;
  const visibleBlockedFrameCount = frameStatuses.filter(
    (frame) => frame.shown && frame.blocked,
  ).length;
  const blockedHints = frameStatuses
    .filter(
      (frame) =>
        frame.shown && frame.blocked && /\b(apply|application|program)\b/i.test(frame.hint),
    )
    .map((frame) => `blocked application iframe: ${frame.hint || "unnamed"}`);
  const diagnostics = best.diagnostics ?? {
    pageTitle: null,
    pageUrl: normalizedPartnerStackPageUrl(page.url()),
    visibleFormCount: 0,
    visibleRegionCount: 0,
    controls: {
      nativeInputTypes: {},
      customRoles: {},
      textarea: 0,
      select: 0,
      combobox: 0,
      radio: 0,
      checkbox: 0,
    },
    safeButtonTexts: [],
    safeLabels: [],
    ariaControls: [],
    nearbyHeadings: [],
    iframes: {
      total: 0,
      inspected: 0,
      sameOrigin: 0,
      partnerStack: 0,
      blocked: 0,
      statuses: [],
    },
    customControlIndicators: [],
  };
  diagnostics.iframes = {
    total: visibleFrameCount,
    inspected: Math.max(0, inspectableFrames.length - 1),
    sameOrigin: inspectableFrames.filter((frame) => {
      try {
        return frame !== page.mainFrame() && new URL(frame.url()).origin === mainOrigin;
      } catch {
        return false;
      }
    }).length,
    partnerStack: inspectableFrames.filter((frame) => {
      try {
        return (
          frame !== page.mainFrame() &&
          (new URL(frame.url()).hostname === "partnerstack.com" ||
            new URL(frame.url()).hostname.endsWith(".partnerstack.com"))
        );
      } catch {
        return false;
      }
    }).length,
    blocked: visibleBlockedFrameCount,
    statuses: [
      ...blockedHints,
      ...(visibleBlockedFrameCount
        ? [`${visibleBlockedFrameCount} unrelated cross-origin iframe(s) skipped`]
        : []),
    ],
  };
  const blockedApplicationFrame =
    blockedHints.length > 0 ||
    (visibleBlockedFrameCount > 0 &&
      diagnostics.nearbyHeadings.some((heading) =>
        /\b(program application|apply to (?:the )?program|application)\b/i.test(heading),
      ));
  if (!best.formFound && blockedApplicationFrame) {
    return {
      ...best,
      formFound: true,
      unsupported: true,
      unsupportedReason:
        "The application appears to be inside a cross-origin, non-PartnerStack iframe that cannot be safely inspected.",
      diagnostics,
    };
  }
  return { ...best, diagnostics };
}

function normalizedPartnerStackPageUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  const validHost =
    url.protocol === "https:" &&
    (url.hostname === "partnerstack.com" || url.hostname.endsWith(".partnerstack.com"));
  if (!validHost)
    throw new Error("Browser access is restricted to HTTPS pages on partnerstack.com.");
  url.username = "";
  url.password = "";
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

  #root(identity: ApplicationControlIdentity) {
    if (identity.frameUrl) {
      const matches = this.#page.frames().filter((frame) => {
        try {
          return normalizedPartnerStackPageUrl(frame.url()) === identity.frameUrl;
        } catch {
          return false;
        }
      });
      if (matches.length === 1) return matches[0];
      if (identity.frameIndex !== undefined) {
        const indexed = this.#page.frames()[identity.frameIndex];
        if (indexed && matches.includes(indexed)) return indexed;
      }
      throw new Error("The captured PartnerStack frame identity is no longer unambiguous.");
    }
    if (identity.frameIndex !== undefined) {
      if (identity.frameUrl === null) {
        throw new Error("Blank-frame controls are not eligible for automated prefill.");
      }
      const frame = this.#page.frames()[identity.frameIndex];
      if (!frame || (frame !== this.#page.mainFrame() && frame.url() !== "about:blank")) {
        throw new Error("The captured same-origin application frame has changed.");
      }
      return frame;
    }
    return this.#page;
  }

  async #resolve(identity: ApplicationControlIdentity): Promise<Locator> {
    assertPartnerStackPage(this.#page, this.#expectedSourceUrl);
    const root = this.#root(identity);
    const selector =
      identity.kind === "accessible-textbox"
        ? '[role="textbox"]:not(input):not(textarea), [contenteditable="true"][role="textbox"]'
        : identity.kind === "custom-combobox"
          ? 'input[role="combobox"]:not([type]), input[role="combobox"][type="text"], input[role="combobox"][type="search"], input[role="combobox"][type="email"], input[role="combobox"][type="url"], input[role="combobox"][type="tel"], input[role="combobox"][type="number"], [role="combobox"]:not(input):not(select):not(button), button[role="combobox"][type="button"], button[aria-haspopup="listbox"][type="button"], button[aria-haspopup="menu"][type="button"]'
          : identity.kind === "custom-radio"
            ? '[role="radio"]:not(input)'
            : identity.kind === "custom-checkbox"
              ? '[role="checkbox"]:not(input)'
              : "input, textarea, select";
    const locator = root.locator(selector).nth(identity.locatorIndex ?? identity.order);
    const actual = await locator.evaluate((element) => {
      const htmlElement = element as HTMLElement;
      const input = element instanceof HTMLInputElement ? element : null;
      const button = element instanceof HTMLButtonElement ? element : null;
      const buttonAncestor = element.closest("button");
      const labelledControl = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      const safeText = (value: string | null | undefined) =>
        (value ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
      const labelledBy = (element.getAttribute("aria-labelledby") ?? "")
        .split(/\s+/)
        .map((id) => {
          const labelledBy = document.getElementById(id);
          if (
            !labelledBy ||
            labelledBy === element ||
            labelledBy.contains(element) ||
            element.contains(labelledBy)
          ) {
            return "";
          }
          return safeText(labelledBy.textContent);
        })
        .filter(Boolean)
        .join(" ");
      const associated = Array.from(labelledControl.labels ?? [])
        .map((label) => safeText(label.textContent))
        .filter(Boolean)
        .join(" ");
      const actualRole =
        element.getAttribute("role") ??
        (button &&
        button.type.toLocaleLowerCase() === "button" &&
        ["listbox", "menu"].includes(button.getAttribute("aria-haspopup") ?? "")
          ? "combobox"
          : null);
      const mayContainEnteredValue =
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement ||
        actualRole === "textbox" ||
        actualRole === "combobox" ||
        element.getAttribute("contenteditable") === "true";
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
        inputType: input?.type.toLowerCase() ?? button?.type.toLowerCase() ?? null,
        role: actualRole,
        ariaName:
          labelledBy ||
          safeText(element.getAttribute("aria-label")) ||
          associated ||
          (!mayContainEnteredValue ? safeText(element.closest("label")?.textContent) : "") ||
          safeText(element.getAttribute("placeholder")) ||
          ("name" in labelledControl ? safeText(labelledControl.name) : "") ||
          (!mayContainEnteredValue ? safeText(element.textContent) : "") ||
          safeText(element.id) ||
          null,
        disabled: element.matches(":disabled") || element.getAttribute("aria-disabled") === "true",
        unsafeButtonAncestor:
          buttonAncestor !== null && buttonAncestor.type.toLocaleLowerCase() !== "button",
        visible:
          !htmlElement.hidden &&
          htmlElement.getAttribute("aria-hidden") !== "true" &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          bounds.width > 0 &&
          bounds.height > 0,
      };
    });
    const compareNativeProperties =
      identity.kind === undefined ||
      identity.kind === "native" ||
      identity.kind === "custom-combobox";
    if (
      actual.id !== identity.id ||
      actual.tagName !== identity.tagName ||
      (compareNativeProperties && actual.name !== identity.name) ||
      (compareNativeProperties && actual.inputType !== identity.inputType) ||
      (identity.role && actual.role !== identity.role) ||
      (identity.kind !== "native" && identity.ariaName && actual.ariaName !== identity.ariaName)
    ) {
      throw new Error("The live control no longer matches its captured DOM identity.");
    }
    if (actual.disabled || !actual.visible || actual.unsafeButtonAncestor) {
      throw new Error("The captured control is no longer visible and enabled.");
    }
    if (
      ["submit", "reset", "image", "file", "password", "hidden"].includes(actual.inputType ?? "") ||
      (actual.inputType === "button" &&
        !(
          identity.kind === "custom-combobox" &&
          identity.role === "combobox" &&
          actual.tagName === "button"
        ))
    ) {
      throw new Error("The live control type is forbidden.");
    }
    return locator;
  }

  async fill(identity: ApplicationControlIdentity, value: string): Promise<void> {
    const locator = await this.#resolve(identity);
    if (
      !["input", "textarea"].includes(identity.tagName) &&
      identity.kind !== "accessible-textbox"
    ) {
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
    if (identity.kind === "custom-combobox") {
      if (
        identity.tagName === "button" &&
        (identity.inputType !== "button" || identity.role !== "combobox")
      ) {
        throw new Error("The custom choice trigger is not a verified non-submit button.");
      }
      const root = this.#root(identity);
      const controlledId = await locator.getAttribute("aria-controls");
      if (!controlledId) {
        throw new Error("The custom choice has no uniquely associated popup.");
      }
      const optionRoot = root.locator(`[id=${JSON.stringify(controlledId)}]`);
      if ((await optionRoot.count()) !== 1) {
        throw new Error("The custom choice popup is no longer uniquely identifiable.");
      }
      await locator.click();
      await this.#page.waitForTimeout(75);
      const options = [
        optionRoot.getByRole("option", { name: value, exact: true }),
        optionRoot.getByRole("menuitemradio", { name: value, exact: true }),
      ];
      const visibleMatches: Locator[] = [];
      for (const matches of options) {
        for (let index = 0; index < (await matches.count()); index += 1) {
          const match = matches.nth(index);
          if (!(await match.isVisible())) continue;
          const safeOption = await match.evaluate((element) => {
            const input = element instanceof HTMLInputElement ? element : null;
            const button = element instanceof HTMLButtonElement ? element : null;
            const buttonAncestor = element.closest("button");
            return {
              disabled:
                element.matches(":disabled") ||
                element.getAttribute("aria-disabled") === "true" ||
                buttonAncestor?.matches(":disabled") === true ||
                buttonAncestor?.getAttribute("aria-disabled") === "true",
              submitLikeButton:
                (button !== null && button.type.toLocaleLowerCase() !== "button") ||
                (buttonAncestor !== null && buttonAncestor.type.toLocaleLowerCase() !== "button"),
              submitLikeInput:
                input !== null &&
                ["submit", "reset", "image", "button"].includes(input.type.toLocaleLowerCase()),
            };
          });
          if (!safeOption.disabled && !safeOption.submitLikeButton && !safeOption.submitLikeInput) {
            visibleMatches.push(match);
          }
        }
      }
      if (visibleMatches.length !== 1) {
        await locator.press("Escape");
        throw new Error("The exact custom option is not uniquely visible.");
      }
      await visibleMatches[0].click();
      return;
    }
    if (identity.tagName !== "select") {
      throw new Error("select is restricted to captured choice controls.");
    }
    const selected = await locator.selectOption({ value });
    if (selected.length !== 1 || selected[0] !== value) {
      throw new Error("The exact captured select option was not selected.");
    }
  }

  async check(identity: ApplicationControlIdentity, value: string): Promise<void> {
    const locator = await this.#resolve(identity);
    if (identity.kind === "custom-radio" && identity.role === "radio") {
      if (identity.ariaName !== value) {
        throw new Error("The live custom radio no longer matches the captured option.");
      }
      await locator.click();
      return;
    }
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
