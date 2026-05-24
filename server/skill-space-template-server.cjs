const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.SKILL_SPACE_TEMPLATE_PORT || 32218);
const CATALOG_PATH =
  process.env.SKILL_SPACE_CATALOG_PATH ||
  "/www/wwwroot/ailabing.cn/downloads/skill-space/templates/catalog.json";
const PACKAGE_ROOT =
  process.env.SKILL_SPACE_PACKAGE_ROOT ||
  path.join(path.dirname(CATALOG_PATH), "packages");
const OWNERS_PATH =
  process.env.SKILL_SPACE_OWNERS_PATH ||
  path.join(path.dirname(CATALOG_PATH), ".owners.json");
const PUBLIC_BASE_URL =
  (process.env.SKILL_SPACE_PUBLIC_BASE_URL || "https://ailabing.cn/downloads/skill-space/templates").replace(/\/+$/, "");
const MAX_BODY_BYTES = 10 * 1024 * 1024;
const MAX_PACKAGE_BYTES = 6 * 1024 * 1024;
const MAX_FILE_BYTES = 800 * 1024;
const MAX_FILE_COUNT = 320;

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function randomToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
    "access-control-allow-headers": "content-type"
  });
  res.end(`${JSON.stringify(body)}\n`);
}

function cleanString(input, key, max, fallback = "") {
  const value = String(input?.[key] ?? fallback)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .trim();
  return [...value].slice(0, max).join("");
}

function safeJsonClone(value) {
  return JSON.parse(JSON.stringify(value ?? {}));
}

function readJson(pathName, fallback) {
  try {
    return JSON.parse(fs.readFileSync(pathName, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(pathName, value) {
  fs.mkdirSync(path.dirname(pathName), { recursive: true });
  const tmpPath = `${pathName}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tmpPath, pathName);
}

function readCatalog() {
  const parsed = readJson(CATALOG_PATH, null);
  if (parsed && Array.isArray(parsed.templates)) {
    parsed.templates = parsed.templates.map(stripPrivateAndPackageFields);
    return parsed;
  }
  return {
    schemaVersion: "skillspace.marketplace.catalog.v1",
    generatedAt: new Date().toISOString(),
    templates: []
  };
}

function writeCatalog(catalog) {
  writeJson(CATALOG_PATH, {
    ...catalog,
    templates: catalog.templates.map(stripPrivateAndPackageFields)
  });
}

function readOwners() {
  const parsed = readJson(OWNERS_PATH, {});
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}

function writeOwners(owners) {
  writeJson(OWNERS_PATH, owners);
}

function stripPrivateAndPackageFields(input) {
  const next = { ...(input || {}) };
  delete next.packageFiles;
  delete next.deleteToken;
  delete next.deleteTokenHash;
  return next;
}

function normalizeVariable(variable) {
  if (!variable || typeof variable !== "object") {
    return null;
  }
  const key = cleanString(variable, "key", 64);
  if (!/^[a-zA-Z0-9_][a-zA-Z0-9_-]{0,63}$/.test(key)) {
    return null;
  }
  const rawKind = cleanString(variable, "kind", 12, "text");
  const kind = ["text", "path", "secret"].includes(rawKind) ? rawKind : "text";
  return {
    key,
    label: cleanString(variable, "label", 80, key),
    kind,
    placeholder: cleanString(variable, "placeholder", 120, `{{text.${key}}}`),
    example: cleanString(variable, "example", 160)
  };
}

function normalizeDependency(dependency) {
  if (!dependency || typeof dependency !== "object") {
    return null;
  }
  const id = cleanString(dependency, "id", 80);
  if (!/^[a-z0-9][a-z0-9_-]{1,79}$/i.test(id)) {
    return null;
  }
  return {
    id,
    name: cleanString(dependency, "name", 80, id),
    version: cleanString(dependency, "version", 30, "0.1.0"),
    reason: cleanString(dependency, "reason", 240),
    bundledPath: cleanString(dependency, "bundledPath", 180, `references/bundled-skills/${id}`)
  };
}

function normalizeTemplate(input) {
  const id = cleanString(input, "id", 80);
  if (!/^[a-z0-9][a-z0-9_-]{1,79}$/i.test(id)) {
    throw new Error("Invalid template id.");
  }

  const name = cleanString(input, "name", 80, id);
  const description = cleanString(input, "description", 800);
  if (!name || !description) {
    throw new Error("Template name and description are required.");
  }

  const runtimes = Array.isArray(input.runtimes)
    ? input.runtimes
        .map((runtime) => String(runtime).trim().toLowerCase())
        .filter((runtime) => /^[a-z0-9_-]{2,48}$/.test(runtime))
    : [];

  const requiredVariables = Array.isArray(input.requiredVariables)
    ? input.requiredVariables.map(normalizeVariable).filter(Boolean).slice(0, 80)
    : [];
  const dependencies = Array.isArray(input.dependencies)
    ? input.dependencies.map(normalizeDependency).filter(Boolean).slice(0, 80)
    : [];
  const safetyStatus = ["ready", "review_required"].includes(input.safetyStatus)
    ? input.safetyStatus
    : "review_required";

  const next = {
    id,
    name,
    description,
    version: cleanString(input, "version", 30, "1.0.0"),
    author: cleanString(input, "author", 60, "Community"),
    category: cleanString(input, "category", 40, "社区"),
    downloads: Math.max(0, Number.parseInt(input.downloads ?? 0, 10) || 0),
    rating: Math.max(0, Math.min(5, Number(input.rating ?? 0) || 0)),
    runtimes: [...new Set(runtimes.length > 0 ? runtimes : ["claude"])],
    requiredVariables,
    dependencies,
    safetyStatus,
    source: "remote",
    updatedAt: new Date().toISOString()
  };

  const templateMarkdown = cleanString(input, "templateMarkdown", 50000);
  if (templateMarkdown) {
    next.templateMarkdown = templateMarkdown;
  }

  if (input.requirements && typeof input.requirements === "object" && !Array.isArray(input.requirements)) {
    next.requirements = safeJsonClone(input.requirements);
  }

  return next;
}

function normalizePackageFiles(input) {
  const rawFiles = Array.isArray(input.packageFiles) ? input.packageFiles : [];
  if (rawFiles.length === 0) {
    return { files: [], totalBytes: 0 };
  }
  if (rawFiles.length > MAX_FILE_COUNT) {
    throw new Error(`Template package has too many files. Limit: ${MAX_FILE_COUNT}.`);
  }

  let totalBytes = 0;
  const files = rawFiles.flatMap((file) => {
    if (!file || typeof file !== "object") {
      return [];
    }
    const filePath = cleanString(file, "path", 220).replace(/\\/g, "/");
    if (!filePath || filePath.startsWith("/") || filePath.includes("..") || /^[A-Za-z]:/.test(filePath)) {
      throw new Error(`Unsafe package path: ${filePath || "(empty)"}.`);
    }
    const encoding = cleanString(file, "encoding", 8, "utf8");
    if (!["utf8", "base64"].includes(encoding)) {
      throw new Error(`Unsupported package encoding for ${filePath}.`);
    }
    const content = String(file.content ?? "");
    const fileBytes = Buffer.byteLength(content, "utf8");
    if (fileBytes > MAX_FILE_BYTES) {
      throw new Error(`Package file is too large: ${filePath}.`);
    }
    totalBytes += fileBytes;
    if (totalBytes > MAX_PACKAGE_BYTES) {
      throw new Error(`Template package is too large. Limit: ${Math.round(MAX_PACKAGE_BYTES / 1024 / 1024)} MB.`);
    }
    return [{ path: filePath, encoding, content }];
  });
  return { files, totalBytes };
}

function packagePathFor(templateId) {
  return path.join(PACKAGE_ROOT, `${templateId}.json`);
}

function packageUrlFor(templateId) {
  return `${PUBLIC_BASE_URL}/packages/${encodeURIComponent(templateId)}.json`;
}

function readRequestBody(req, callback) {
  let body = "";
  req.setEncoding("utf8");
  req.on("data", (chunk) => {
    body += chunk;
    if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) {
      req.destroy(new Error("Request body too large."));
    }
  });
  req.on("error", (error) => callback(error));
  req.on("end", () => callback(null, body));
}

function handleUpload(req, res) {
  readRequestBody(req, (error, body) => {
    if (error) {
      sendJson(res, 400, { ok: false, message: error.message });
      return;
    }
    try {
      const payload = JSON.parse(body || "{}");
      const source = payload.template ?? payload;
      const template = normalizeTemplate(source);
      const packageBundle = normalizePackageFiles(source);
      if (packageBundle.files.length === 0) {
        throw new Error("Template packageFiles are required for online upload.");
      }

      const packagePayload = {
        schemaVersion: "skillspace.template.package.v1",
        generatedAt: new Date().toISOString(),
        template: {
          ...template,
          packageFiles: packageBundle.files
        }
      };
      const packageJson = `${JSON.stringify(packagePayload, null, 2)}\n`;
      const packageHash = sha256(packageJson);
      const packagePath = packagePathFor(template.id);
      fs.mkdirSync(PACKAGE_ROOT, { recursive: true });
      fs.writeFileSync(packagePath, packageJson, "utf8");

      const deleteToken = randomToken();
      const owners = readOwners();
      owners[template.id] = {
        deleteTokenHash: sha256(deleteToken),
        packagePath,
        updatedAt: new Date().toISOString()
      };
      writeOwners(owners);

      const summary = stripPrivateAndPackageFields({
        ...template,
        packageUrl: packageUrlFor(template.id),
        packageSha256: packageHash,
        packageSize: Buffer.byteLength(packageJson, "utf8"),
        hasPackage: true
      });
      const catalog = readCatalog();
      catalog.schemaVersion = "skillspace.marketplace.catalog.v1";
      catalog.generatedAt = new Date().toISOString();
      catalog.templates = [
        summary,
        ...catalog.templates.filter((item) => item && item.id !== template.id)
      ].slice(0, 300);
      writeCatalog(catalog);
      sendJson(res, 200, {
        ok: true,
        message: "Template uploaded.",
        template: summary,
        deleteToken,
        count: catalog.templates.length
      });
    } catch (uploadError) {
      sendJson(res, 400, { ok: false, message: uploadError instanceof Error ? uploadError.message : String(uploadError) });
    }
  });
}

function handleDelete(req, res) {
  readRequestBody(req, (error, body) => {
    if (error) {
      sendJson(res, 400, { ok: false, message: error.message });
      return;
    }
    try {
      const payload = body ? JSON.parse(body) : {};
      const templateId = cleanString(payload, "templateId", 80);
      const deleteToken = cleanString(payload, "deleteToken", 160);
      if (!/^[a-z0-9][a-z0-9_-]{1,79}$/i.test(templateId)) {
        throw new Error("Invalid template id.");
      }
      if (!deleteToken) {
        throw new Error("Delete token is required.");
      }

      const owners = readOwners();
      const owner = owners[templateId];
      if (!owner?.deleteTokenHash || sha256(deleteToken) !== owner.deleteTokenHash) {
        sendJson(res, 403, { ok: false, deleted: false, message: "Delete token does not match this template." });
        return;
      }

      const catalog = readCatalog();
      const before = catalog.templates.length;
      catalog.templates = catalog.templates.filter((item) => item && item.id !== templateId);
      catalog.schemaVersion = "skillspace.marketplace.catalog.v1";
      catalog.generatedAt = new Date().toISOString();
      writeCatalog(catalog);
      delete owners[templateId];
      writeOwners(owners);

      const packagePath = packagePathFor(templateId);
      if (fs.existsSync(packagePath)) {
        fs.rmSync(packagePath, { force: true });
      }
      const deleted = catalog.templates.length < before;
      sendJson(res, 200, {
        ok: true,
        deleted,
        message: deleted ? "Template deleted." : "Template was not found.",
        count: catalog.templates.length
      });
    } catch (deleteError) {
      sendJson(res, 400, { ok: false, message: deleteError instanceof Error ? deleteError.message : String(deleteError) });
    }
  });
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }
  if (req.method === "GET" && req.url === "/health") {
    sendJson(res, 200, { ok: true, service: "skill-space-template-server" });
    return;
  }
  if (req.method === "POST" && req.url === "/upload") {
    handleUpload(req, res);
    return;
  }
  if ((req.method === "POST" || req.method === "DELETE") && req.url === "/delete") {
    handleDelete(req, res);
    return;
  }
  sendJson(res, 404, { ok: false, message: "Not found." });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Skill-Space template server listening on 127.0.0.1:${PORT}`);
});
