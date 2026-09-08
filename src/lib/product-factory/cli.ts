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
  reporting?: {
    categoryCountsBefore?: Record<string, number>;
    publishedCountBefore?: number;
    uncategorizedCountBefore?: number;
  };
}

interface ProductFactoryBatchReporting {
  publishedCountBefore: number;
  projectedPublishedCount: number;
  uncategorizedBefore: number;
  categoryCountsBefore: Record<string, number>;
  candidateCountsByCategory: Record<string, number>;
  readyCountsByCategory: Record<string, number>;
  projectedCountsByCategory: Record<string, number>;
  preExistingConflicts: number;
  identityConflicts: number;
  indiaRelevantCandidates: number;
  indiaRelevantReady: number;
  evidenceDocuments: number;
  successfulEvidenceDocuments: number;
  uniqueEvidenceUrls: number;
  http403: number;
  http429: number;
  duplicateDescriptions: number;
}

type ReportedProductFactoryBatchResult = ProductFactoryBatchResult & {
  reporting: ProductFactoryBatchReporting;
};

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
  result: ReportedProductFactoryBatchResult,
  candidates: readonly ProductFactoryCandidate[],
): string {
  const rows = result.results.map((item, index) => {
    const candidate = candidates[index];
    const source = item.review?.officialEvidence[0] ?? candidate?.evidence[0]?.url ?? "-";
    const vendor = item.review?.vendor ?? candidate?.vendorName.value ?? "-";
    const category = item.review?.primaryCategory ?? candidate?.primaryCategory.slug ?? "-";
    const monetization = item.monetizationClassification ?? "UNKNOWN";
    const exception =
      item.reasons.length === 0
        ? "-"
        : item.reasons.map((reason) => `${reason.code}: ${reason.message}`).join("<br>");
    const india = item.review?.indiaRelevance ? "YES" : "NO";
    return `| ${item.candidate} | ${vendor} | ${category} | ${source} | ${monetization} | ${india} | ${item.decision} | ${exception} |`;
  });
  const monetizationCounts = new Map<string, number>();
  for (const item of result.results) {
    const classification = item.monetizationClassification ?? "UNKNOWN";
    monetizationCounts.set(classification, (monetizationCounts.get(classification) ?? 0) + 1);
  }

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
- Published before: ${result.reporting.publishedCountBefore}
- Projected published after owner publication: ${result.reporting.projectedPublishedCount}
- Uncategorized before: ${result.reporting.uncategorizedBefore}

## Monetization discovery

${[...monetizationCounts.entries()]
  .sort(([left], [right]) => left.localeCompare(right, "en"))
  .map(([classification, count]) => `- ${classification}: ${count}`)
  .join("\n")}

## Scale quality

- Pre-existing conflicts: ${result.reporting.preExistingConflicts}
- Identity conflicts: ${result.reporting.identityConflicts}
- India-origin/relevant candidates: ${result.reporting.indiaRelevantCandidates}
- India-origin/relevant READY: ${result.reporting.indiaRelevantReady}
- Evidence documents: ${result.reporting.evidenceDocuments}
- Successful evidence documents: ${result.reporting.successfulEvidenceDocuments}
- Unique evidence URLs: ${result.reporting.uniqueEvidenceUrls}
- HTTP 403: ${result.reporting.http403}
- HTTP 429: ${result.reporting.http429}
- Duplicate descriptions: ${result.reporting.duplicateDescriptions}

| Category | Before | Candidates | READY | Projected |
|---|---:|---:|---:|---:|
${Object.keys(result.reporting.candidateCountsByCategory)
  .sort((left, right) => left.localeCompare(right, "en"))
  .map(
    (category) =>
      `| ${category} | ${result.reporting.categoryCountsBefore[category] ?? 0} | ${result.reporting.candidateCountsByCategory[category] ?? 0} | ${result.reporting.readyCountsByCategory[category] ?? 0} | ${result.reporting.projectedCountsByCategory[category] ?? 0} |`,
  )
  .join("\n")}

| Candidate | Vendor | Category | Official source | Monetization | India | Result | Exception |
|---|---|---|---|---|---|---|---|
${rows.join("\n")}

## READY payloads

${payloads || "None."}
`;
}

export function buildBatchReporting(
  result: ProductFactoryBatchResult,
  candidates: readonly ProductFactoryCandidate[],
  categoryCountsBefore: Readonly<Record<string, number>> = {},
  publishedCountBefore = 0,
  uncategorizedCountBefore?: number,
): ProductFactoryBatchReporting {
  const candidateCountsByCategory: Record<string, number> = {};
  const readyCountsByCategory: Record<string, number> = {};
  for (const candidate of candidates) {
    const category = candidate.primaryCategory.slug;
    candidateCountsByCategory[category] = (candidateCountsByCategory[category] ?? 0) + 1;
  }
  for (const item of result.results) {
    if (item.decision !== "READY" || !item.review) continue;
    readyCountsByCategory[item.review.primaryCategory] =
      (readyCountsByCategory[item.review.primaryCategory] ?? 0) + 1;
  }
  const projectedCountsByCategory = Object.fromEntries(
    Object.keys(candidateCountsByCategory).map((category) => [
      category,
      (categoryCountsBefore[category] ?? 0) + (readyCountsByCategory[category] ?? 0),
    ]),
  );
  const evidence = candidates.flatMap((candidate) => candidate.evidence);
  const descriptionCounts = new Map<string, number>();
  for (const candidate of candidates) {
    const description = candidate.description.value.trim().toLocaleLowerCase("en");
    descriptionCounts.set(description, (descriptionCounts.get(description) ?? 0) + 1);
  }

  return {
    publishedCountBefore,
    projectedPublishedCount: publishedCountBefore + result.ready,
    uncategorizedBefore:
      uncategorizedCountBefore ??
      Math.max(
        0,
        publishedCountBefore -
          Object.values(categoryCountsBefore).reduce((total, count) => total + count, 0),
      ),
    categoryCountsBefore: { ...categoryCountsBefore },
    candidateCountsByCategory,
    readyCountsByCategory,
    projectedCountsByCategory,
    preExistingConflicts: result.results.filter((item) =>
      item.reasons.some((reason) => reason.code === "DUPLICATE_EXISTING_PRODUCT"),
    ).length,
    identityConflicts: result.results.filter((item) =>
      item.reasons.some((reason) => reason.code === "AMBIGUOUS_IDENTITY"),
    ).length,
    indiaRelevantCandidates: candidates.filter((candidate) => candidate.indiaRelevance).length,
    indiaRelevantReady: result.results.filter(
      (item) => item.decision === "READY" && item.review?.indiaRelevance,
    ).length,
    evidenceDocuments: evidence.length,
    successfulEvidenceDocuments: evidence.filter((item) => item.httpStatus === 200).length,
    uniqueEvidenceUrls: new Set(evidence.map((item) => item.url)).size,
    http403: candidates.filter(
      (candidate) =>
        candidate.evidence.some((item) => item.httpStatus === 403) ||
        candidate.acquisitionException?.message.includes("HTTP 403"),
    ).length,
    http429: candidates.filter(
      (candidate) =>
        candidate.evidence.some((item) => item.httpStatus === 429) ||
        candidate.acquisitionException?.message.includes("HTTP 429"),
    ).length,
    duplicateDescriptions: [...descriptionCounts.values()].filter((count) => count > 1).length,
  };
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
  const factoryResult = runProductFactoryBatch(input.candidates, input.context);
  const result: ReportedProductFactoryBatchResult = {
    ...factoryResult,
    reporting: buildBatchReporting(
      factoryResult,
      input.candidates,
      input.reporting?.categoryCountsBefore,
      input.reporting?.publishedCountBefore,
      input.reporting?.uncategorizedCountBefore,
    ),
  };
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
