const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const outputDir = path.join(root, "docs", "assets", "screenshots");

function runAsNode() {
  const electron = require("electron");
  const result = spawnSync(electron, [__filename, "--electron-child"], {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      SKILL_SPACE_README_SCREENSHOTS: "1"
    }
  });
  process.exit(result.status ?? 1);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function clickByText(webContents, labels) {
  const clicked = await webContents.executeJavaScript(`
    (() => {
      const labels = ${JSON.stringify(labels)};
      const candidates = Array.from(document.querySelectorAll("button, [role='button'], a"));
      const target = candidates.find((node) => labels.some((label) => (node.textContent || "").includes(label)));
      if (!target) return false;
      target.click();
      return true;
    })()
  `);
  await wait(clicked ? 900 : 300);
  return clicked;
}

async function captureWindow(win, name, masks = []) {
  if (masks.length) {
    await win.webContents.executeJavaScript(`
      (() => {
        document.querySelectorAll("[data-readme-mask='true']").forEach((node) => node.remove());
        const masks = ${JSON.stringify(masks)};
        for (const mask of masks) {
          const node = document.createElement("div");
          node.dataset.readmeMask = "true";
          Object.assign(node.style, {
            position: "fixed",
            left: mask.x + "px",
            top: mask.y + "px",
            width: mask.w + "px",
            height: mask.h + "px",
            borderRadius: "16px",
            zIndex: "2147483647",
            background: "linear-gradient(135deg, rgba(119, 224, 213, .42), rgba(8, 20, 24, .78))",
            border: "1px solid rgba(230, 255, 252, .42)",
            boxShadow: "0 18px 55px rgba(0, 0, 0, .28)",
            backdropFilter: "blur(18px) saturate(1.45)"
          });
          document.body.appendChild(node);
        }
      })()
    `);
    await wait(120);
  }
  const image = await win.webContents.capturePage();
  const filePath = path.join(outputDir, `${name}.png`);
  fs.writeFileSync(filePath, image.toPNG());
  await win.webContents.executeJavaScript(`
    document.querySelectorAll("[data-readme-mask='true']").forEach((node) => node.remove());
  `);
  console.log(`Captured ${filePath}`);
}

async function runInElectron() {
  const { app, BrowserWindow } = require("electron");
  await app.whenReady();
  fs.mkdirSync(outputDir, { recursive: true });

  const win = new BrowserWindow({
    width: 1500,
    height: 950,
    show: false,
    backgroundColor: "#081417",
    webPreferences: {
      preload: path.join(root, "scripts", "readme-screenshot-preload.cjs"),
      contextIsolation: false,
      nodeIntegration: false
    }
  });

  await win.loadFile(path.join(root, "out", "renderer", "index.html"));
  await wait(1600);

  await captureWindow(win, "dashboard", [
    { x: 1120, y: 185, w: 300, h: 85 },
    { x: 1120, y: 670, w: 270, h: 70 }
  ]);

  await clickByText(win.webContents, ["技能"]);
  await captureWindow(win, "skills", [
    { x: 1120, y: 185, w: 300, h: 85 },
    { x: 274, y: 430, w: 360, h: 86 }
  ]);

  await clickByText(win.webContents, ["工作流库"]);
  await captureWindow(win, "workflow-library", [
    { x: 285, y: 520, w: 330, h: 95 },
    { x: 1130, y: 430, w: 300, h: 95 },
    { x: 1130, y: 800, w: 300, h: 70 }
  ]);

  await clickByText(win.webContents, ["运行"]);
  await captureWindow(win, "run-console", [
    { x: 1100, y: 170, w: 315, h: 100 }
  ]);

  await clickByText(win.webContents, ["飞书"]);
  await captureWindow(win, "feishu", [
    { x: 835, y: 430, w: 260, h: 64 },
    { x: 1130, y: 435, w: 300, h: 52 }
  ]);

  await win.close();
  await app.quit();
}

if (!process.versions.electron) {
  runAsNode();
} else {
  runInElectron().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
