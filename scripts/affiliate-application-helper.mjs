import ts from "typescript";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporaryRoot = path.join(root, "node_modules", ".cache");
fs.mkdirSync(temporaryRoot, { recursive: true });
const output = fs.mkdtempSync(path.join(temporaryRoot, "saaselephant-applications-"));

try {
  const program = ts.createProgram(
    [path.join(root, "src/lib/affiliate-discovery/application-cli.ts")],
    {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      strict: true,
      skipLibCheck: true,
      esModuleInterop: true,
      noEmitOnError: true,
      rootDir: path.join(root, "src/lib"),
      outDir: output,
      types: ["node"],
      typeRoots: [path.join(root, "node_modules/@types")],
    },
  );
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length) {
    throw new Error(
      ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCanonicalFileName: (file) => file,
        getCurrentDirectory: () => root,
        getNewLine: () => "\n",
      }),
    );
  }
  const emitted = program.emit();
  if (emitted.emitSkipped) throw new Error("Browser helper compilation failed.");
  const entry = path.join(output, "affiliate-discovery/application-cli.js");
  const { runAffiliateApplicationCli } = await import(pathToFileURL(entry).href);
  await runAffiliateApplicationCli(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "Browser helper failed."}\n`);
  process.exitCode = 1;
} finally {
  if (
    path.dirname(output) === temporaryRoot &&
    path.basename(output).startsWith("saaselephant-applications-")
  ) {
    fs.rmSync(output, { recursive: true, force: true });
  }
}
