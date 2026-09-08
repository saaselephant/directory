import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.env.SAASELEPHANT_ROOT = root;
for (const fileName of [".env.local", ".env"]) {
  const envPath = path.join(root, fileName);
  if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
}

const temporaryRoot = fs.realpathSync(os.tmpdir());
const output = fs.mkdtempSync(path.join(temporaryRoot, "saaselephant-logo-factory-"));

try {
  const program = ts.createProgram([path.join(root, "src/lib/logo-factory/cli.ts")], {
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
  if (emitted.emitSkipped) throw new Error("Logo Factory compilation failed.");
  const { run } = await import(pathToFileURL(path.join(output, "logo-factory/cli.js")).href);
  await run(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "Logo Factory failed."}\n`);
  process.exitCode = 1;
} finally {
  if (
    path.dirname(output) === temporaryRoot &&
    path.basename(output).startsWith("saaselephant-logo-factory-")
  ) {
    fs.rmSync(output, { recursive: true, force: true });
  }
}
