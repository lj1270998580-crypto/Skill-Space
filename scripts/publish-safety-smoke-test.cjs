const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const mainSource = fs.readFileSync(path.join(repoRoot, "src", "main", "index.ts"), "utf8");

assert.match(mainSource, /async function auditPreparedTemplatePackage/, "Publish package flow must audit generated templates.");
assert.match(mainSource, /Windows 用户路径/, "Publish audit must detect Windows user paths.");
assert.match(mainSource, /明文敏感配置/, "Publish audit must detect obvious plaintext credentials.");
assert.match(mainSource, /具体账号或公众号信息/, "Publish audit must flag account-like fields that were not templated.");
assert.match(mainSource, /review_required/, "Publish flow must mark packages that still need review.");
assert.match(mainSource, /isPathInside\(targetRoot, targetPath, true\)/, "Marketplace install and packaging paths should keep path traversal checks.");

console.log("publish safety smoke test passed");
