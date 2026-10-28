// Lets plain Node load the project's TypeScript helpers (extensionless imports
// included) by compiling each .ts file with the project's own TypeScript.
const fs = require("node:fs");
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  module._compile(out, filename);
};

module.exports = (path) => require(path);
