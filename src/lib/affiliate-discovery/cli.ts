import { readFileSync } from "node:fs";
import { parsePartnerStackMarketplace } from "./partnerstack";
import { createBusinessReviewReport, parseSoftwareInventory } from "./report";

/** Local files only. This entry point never loads application/database configuration. */
export function run(argv: string[]): void {
  if (argv.length !== 2)
    throw new Error("Usage: node scripts/partnerstack-review.mjs <capture.json> <inventory.json>");
  const readJson = (path: string): unknown =>
    JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
  const candidates = parsePartnerStackMarketplace(readJson(argv[0]));
  const inventory = parseSoftwareInventory(readJson(argv[1]));
  const report = createBusinessReviewReport(candidates, inventory);
  process.stdout.write(
    JSON.stringify(
      {
        inputs: { marketplaceFile: argv[0], inventoryFile: argv[1] },
        ...report,
      },
      null,
      2,
    ) + "\n",
  );
}
