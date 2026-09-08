import fs from "node:fs";
import path from "node:path";

import {
  runProductFactoryBatch,
  type ProductFactoryBatchResult,
  type ProductFactoryCandidate,
  type ProductFactoryContext,
} from "./product-factory";
import { prepareCatalogPublicationBatch, renderCatalogPublicationSql } from "./catalog-publication";

interface ProductFactoryInputFile {
  candidates: ProductFactoryCandidate[];
  context: ProductFactoryContext;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInputFile(value: unknown): value is ProductFactoryInputFile {
  return (
    isRecord(value) &&
    Array.isArray(value.candidates) &&
    isRecord(value.context) &&
    Array.isArray(value.context.software) &&
    Array.isArray(value.context.vendors) &&
    Array.isArray(value.context.categories)
  );
}

function parseInput(value: unknown): ProductFactoryInputFile {
  if (!isInputFile(value)) {
    throw new Error(
      "Input must contain candidates plus software, vendor and category context arrays.",
    );
  }
  return value;
}

function argumentValue(args: readonly string[], name: string): string | null {
  const index = args.indexOf(name);
  return index === -1 ? null : (args[index + 1] ?? null);
}

function markdownReport(
  result: ProductFactoryBatchResult,
  candidates: readonly ProductFactoryCandidate[],
): string {
  const rows = result.results.map((item, index) => {
    const candidate = candidates[index];
    const source = candidate?.evidence[0]?.url ?? "-";
    const vendor = candidate?.vendorName.value ?? "-";
    const category = candidate?.primaryCategory.slug ?? "-";
    const exception =
      item.reasons.length === 0
        ? "-"
        : item.reasons.map((reason) => `${reason.code}: ${reason.message}`).join("<br>");
    return `| ${item.candidate} | ${vendor} | ${category} | ${source} | ${item.decision} | ${exception} |`;
  });

  const payloads = result.results
    .filter((item) => item.payload)
    .map(
      (item) =>
        `### ${item.candidate}\n\n\`\`\`json\n${JSON.stringify(item.payload, null, 2)}\n\`\`\``,
    )
    .join("\n\n");

  return `# Product Factory V1 batch review

- Processed: ${result.processed}
- READY: ${result.ready}
- EXCEPTION: ${result.exceptions}
- Duplicates detected: ${result.duplicatesDetected}
- Manual product-entry actions required: ${result.manualProductEntryActionsRequired}
- Production writes: 0

| Candidate | Vendor | Category | Official source | Result | Exception |
|---|---|---|---|---|---|
${rows.join("\n")}

## READY payloads

${payloads || "None."}
`;
}

export function run(args: readonly string[]): void {
  const inputPath = argumentValue(args, "--input");
  const outputPath = argumentValue(args, "--output");
  const reportPath = argumentValue(args, "--report");
  const publicationSqlPath = argumentValue(args, "--publication-sql");
  if (!inputPath || !outputPath || !reportPath) {
    throw new Error(
      "Usage: product-factory --input <batch.json> --output <result.json> --report <review.md>",
    );
  }

  const input = parseInput(JSON.parse(fs.readFileSync(path.resolve(inputPath), "utf8")) as unknown);
  const result = runProductFactoryBatch(input.candidates, input.context);
  fs.writeFileSync(path.resolve(outputPath), `${JSON.stringify(result, null, 2)}\n`, {
    encoding: "utf8",
    flag: "w",
  });
  fs.writeFileSync(path.resolve(reportPath), markdownReport(result, input.candidates), {
    encoding: "utf8",
    flag: "w",
  });
  if (publicationSqlPath) {
    const publicationBatch = prepareCatalogPublicationBatch(result);
    fs.writeFileSync(
      path.resolve(publicationSqlPath),
      renderCatalogPublicationSql(publicationBatch),
      {
        encoding: "utf8",
        flag: "w",
      },
    );
  }
  process.stdout.write(
    `Processed ${result.processed}: ${result.ready} READY, ${result.exceptions} EXCEPTION, ${result.duplicatesDetected} duplicate(s).\n`,
  );
}
