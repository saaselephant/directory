/* Compile only the offline dependency graph using the existing TypeScript dependency. */
import ts from "typescript";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporaryRoot = fs.realpathSync(os.tmpdir());
const output = fs.mkdtempSync(path.join(temporaryRoot, "saaselephant-review-"));
try {
  const program = ts.createProgram([path.join(root, "src/lib/affiliate-discovery/cli.ts")], {
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
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length)
    throw new Error(
      ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCanonicalFileName: (file) => file,
        getCurrentDirectory: () => root,
        getNewLine: () => "\n",
      }),
    );
  const emitted = program.emit();
  if (emitted.emitSkipped) throw new Error("Offline report compilation failed.");
  const { run } = await import(pathToFileURL(path.join(output, "affiliate-discovery/cli.js")).href);
  run(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "Offline report failed."}\n`);
  process.exitCode = 1;
} finally {
  // Only the unique temporary directory created by this invocation may be removed.
  if (
    path.dirname(output) === temporaryRoot &&
    path.basename(output).startsWith("saaselephant-review-")
  ) {
    fs.rmSync(output, { recursive: true, force: true });
  }
}
