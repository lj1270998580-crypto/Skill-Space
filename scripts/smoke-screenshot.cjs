const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const targetUrl = process.argv[2] || "http://localhost:5173";
const outputPath = process.argv[3] || "D:\\Skill-Space\\artifacts\\skillspace-smoke.png";
const errorPath = "D:\\Skill-Space\\logs\\skillspace-smoke-error.log";

function recordError(error) {
  fs.mkdirSync(path.dirname(errorPath), { recursive: true });
  fs.writeFileSync(errorPath, `${error?.stack || error?.message || String(error)}\n`);
  console.error(error);
}

process.on("uncaughtException", (error) => {
  recordError(error);
  app.quit();
});

process.on("unhandledRejection", (error) => {
  recordError(error);
  app.quit();
});

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    show: false,
    width: 1440,
    height: 920,
    webPreferences: {
      preload: path.join(__dirname, "smoke-preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  await window.loadURL(targetUrl);
  await new Promise((resolve) => setTimeout(resolve, 2500));

  const text = await window.webContents.executeJavaScript("document.body.innerText");
  if (!text.includes("Skill-Space") || !text.includes("总览")) {
    throw new Error("Smoke render did not include expected UI text.");
  }

  const image = await window.webContents.capturePage();
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, image.toPNG());
  console.log(`screenshot=${outputPath}`);
  console.log(text.slice(0, 500));

  app.quit();
});
