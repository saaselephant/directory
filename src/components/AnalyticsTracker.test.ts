import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const route = vi.hoisted(() => ({ pathname: "/software" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
vi.mock("react", () => ({ useEffect: (effect: () => void) => effect() }));
vi.mock("next/script", () => ({ default: () => null }));
import AnalyticsTracker from "./AnalyticsTracker";

beforeEach(() => {
  route.pathname = "/software";
  vi.stubGlobal("window", {
    location: { origin: "https://saaselephant.com", search: "?q=private", hash: "#private" },
  });
  vi.stubGlobal("document", { title: "Software directory" });
});
afterEach(() => vi.unstubAllGlobals());
const commands = () =>
  (window.dataLayer ?? []).map((entry) => Array.from(entry as ArrayLike<unknown>));
describe("explicit public analytics", () => {
  it("initializes once, suppresses automatic views, and avoids duplicate pathname events", () => {
    AnalyticsTracker();
    AnalyticsTracker();
    expect(commands().filter((entry) => entry[0] === "config")).toHaveLength(1);
    expect(commands().find((entry) => entry[0] === "config")?.[2]).toMatchObject({
      send_page_view: false,
    });
    expect(commands().filter((entry) => entry[0] === "event")).toHaveLength(1);
    route.pathname = "/privacy";
    AnalyticsTracker();
    expect(commands().filter((entry) => entry[0] === "event")).toHaveLength(2);
    expect(commands().at(-1)?.[2]).toMatchObject({
      page_location: "https://saaselephant.com/privacy",
      page_referrer: "https://saaselephant.com/software",
    });
    expect(JSON.stringify(commands())).not.toContain("private");
  });
  it("does not initialize or enqueue events for admin routes", () => {
    route.pathname = "/admin/sign-in";
    AnalyticsTracker();
    expect(commands()).toEqual([]);
  });
});
