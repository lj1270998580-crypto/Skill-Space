const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "skill-space-marketplace-"));
const catalogPath = path.join(tempRoot, "catalog.json");
const packageRoot = path.join(tempRoot, "packages");
const ownersPath = path.join(tempRoot, "owners.json");
const port = 33000 + Math.floor(Math.random() * 2000);
const baseUrl = `http://127.0.0.1:${port}`;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until the child server is ready.
    }
    await wait(100);
  }
  throw new Error("Template server did not start.");
}

async function postJson(pathName, body) {
  const response = await fetch(`${baseUrl}${pathName}`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body)
  });
  const json = await response.json().catch(() => ({}));
  return { response, json };
}

async function main() {
  const child = spawn(process.execPath, [path.join(repoRoot, "server", "skill-space-template-server.cjs")], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      SKILL_SPACE_TEMPLATE_PORT: String(port),
      SKILL_SPACE_CATALOG_PATH: catalogPath,
      SKILL_SPACE_PACKAGE_ROOT: packageRoot,
      SKILL_SPACE_OWNERS_PATH: ownersPath,
      SKILL_SPACE_PUBLIC_BASE_URL: `${baseUrl}/templates`
    }
  });

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  try {
    await waitForServer();
    const template = {
      id: "smoke-template",
      name: "Smoke Template",
      description: "Marketplace protocol smoke test.",
      version: "1.0.0",
      author: "Skill-Space",
      category: "test",
      runtimes: ["claude"],
      requiredVariables: [{ key: "topic", label: "Topic", kind: "text", placeholder: "{{text.topic}}" }],
      dependencies: [{ id: "helper-skill", name: "Helper Skill", version: "0.1.0", reason: "Declared helper", bundledPath: "references/bundled-skills/helper-skill" }],
      requirements: { externalServices: ["openai"], cliTools: ["node"] },
      packageFiles: [
        { path: "SKILL.md", encoding: "utf8", content: "---\nname: smoke-template\n---\n# Smoke {{text.topic}}\n" },
        { path: ".skillspace/manifest.json", encoding: "utf8", content: "{}" }
      ]
    };

    const upload = await postJson("/upload", { template });
    assert.equal(upload.response.status, 200, JSON.stringify(upload.json));
    assert.equal(upload.json.ok, true);
    assert.equal(typeof upload.json.deleteToken, "string");
    assert.equal(upload.json.template.packageFiles, undefined);
    assert.equal(upload.json.template.hasPackage, true);
    assert.match(upload.json.template.packageUrl, /smoke-template\.json$/);
    assert.ok(fs.existsSync(path.join(packageRoot, "smoke-template.json")));

    const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
    assert.equal(catalog.templates.length, 1);
    assert.equal(catalog.templates[0].packageFiles, undefined);
    assert.equal(catalog.templates[0].packageSha256.length, 64);

    const oversized = await postJson("/upload", {
      template: {
        ...template,
        id: "oversized-template",
        packageFiles: [{ path: "SKILL.md", encoding: "utf8", content: "x".repeat(900 * 1024) }]
      }
    });
    assert.equal(oversized.response.status, 400);
    assert.equal(oversized.json.ok, false);

    const deniedDelete = await postJson("/delete", { templateId: "smoke-template" });
    assert.equal(deniedDelete.response.status, 400);
    assert.equal(deniedDelete.json.ok, false);

    const wrongDelete = await postJson("/delete", { templateId: "smoke-template", deleteToken: "wrong" });
    assert.equal(wrongDelete.response.status, 403);
    assert.equal(wrongDelete.json.deleted, false);

    const deleteResult = await postJson("/delete", { templateId: "smoke-template", deleteToken: upload.json.deleteToken });
    assert.equal(deleteResult.response.status, 200);
    assert.equal(deleteResult.json.deleted, true);
    const afterDelete = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
    assert.equal(afterDelete.templates.length, 0);
    assert.equal(fs.existsSync(path.join(packageRoot, "smoke-template.json")), false);
  } finally {
    child.kill();
    await wait(100);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  if (stderr.trim()) {
    process.stderr.write(stderr);
  }
  console.log("marketplace smoke test passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
