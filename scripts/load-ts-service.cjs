const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

module.exports = function loadTsService(relativePath) {
  const sourcePath = path.resolve(__dirname, "..", relativePath);
  const source = fs.readFileSync(sourcePath, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    },
    fileName: sourcePath
  });
  const module = { exports: {} };
  const fn = new Function("require", "module", "exports", "__dirname", "__filename", outputText);
  fn(require, module, module.exports, path.dirname(sourcePath), sourcePath);
  return module.exports;
};
