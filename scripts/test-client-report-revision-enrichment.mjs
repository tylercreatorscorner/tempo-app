// Compile in-process so this fixture suite does not need an esbuild subprocess.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { runInThisContext } from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url);
function load(file) {
  const path = resolve(file), loaded = { exports: {} };
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const localRequire = name => name === '../src/lib/data/client-report-revision-enrichment' ? load('src/lib/data/client-report-revision-enrichment.ts') : require(name);
  runInThisContext(`(function(exports,require,module){${code}\n})`, { filename: path })(loaded.exports, localRequire, loaded);
  return loaded.exports;
}
load('scripts/test-client-report-revision-enrichment.ts');
