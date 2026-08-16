import { app, BrowserWindow, dialog } from "electron";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

// frontend/electron/main.js -> ../../backend
const BACKEND_DIR = path.join(__dirname, "../../backend");

// The repo's own .venv wins over whatever `python` happens to be first on
// PATH -- a machine-wide interpreter is unlikely to have torch/ultralytics,
// and picking one up silently gives a window with a dead backend behind it
// (or, worse, a *different* torch/ultralytics version than requirements.txt
// pins -- see build_standalone.sh for the packaging-time version of this).
// PYTHON_BIN still overrides, for anyone using an env named something else.
function resolvePython() {
  if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;
  const repoRoot = path.join(__dirname, "../..");
  const home = process.env.HOME || process.env.USERPROFILE || "";
  const candidates = [
    path.join(repoRoot, ".venv", "bin", "python"),
    path.join(repoRoot, ".venv", "Scripts", "python.exe"),
    ...["anaconda3", "miniconda3", "miniforge3"].map((d) => path.join(home, d, "envs", "macondo", "bin", "python")),
    "/opt/anaconda3/envs/macondo/bin/python",
    "/opt/miniconda3/envs/macondo/bin/python",
    "/opt/homebrew/anaconda3/envs/macondo/bin/python",
    "/opt/homebrew/Caskroom/miniconda/base/envs/macondo/bin/python",
  ];
  return candidates.find(existsSync) ?? "python";
}

const PYTHON_BIN = resolvePython();

let backendProcess = null;

// Packaged builds ship a PyInstaller-frozen binary instead of relying on a
// system Python (see backend/api.spec, backend/build_standalone.sh) --
// electron-builder places it under extraResources at resources/backend/.
function resolveBackendCommand() {
  if (app.isPackaged) {
    const bin = path.join(process.resourcesPath, "backend", "macondo-backend");
    return { cmd: bin, args: [], cwd: path.dirname(bin) };
  }
  return {
    cmd: PYTHON_BIN,
    args: ["-m", "uvicorn", "api:app", "--host", "127.0.0.1", "--port", "8000"],
    cwd: BACKEND_DIR,
  };
}

function startBackend() {
  const { cmd, args, cwd } = resolveBackendCommand();
  backendProcess = spawn(cmd, args, { cwd });

  backendProcess.stdout.on("data", (data) => process.stdout.write(`[backend] ${data}`));
  backendProcess.stderr.on("data", (data) => process.stderr.write(`[backend] ${data}`));
  backendProcess.on("error", (err) => console.error("[backend] failed to start:", err));
  backendProcess.on("exit", (code) => {
    console.log(`[backend] exited with code ${code}`);
    backendProcess = null;
  });
}

function stopBackend() {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

app.whenReady().then(() => {
  // The packaged backend is an arm64-only PyInstaller build (current torch
  // releases no longer ship macOS x86_64 wheels at all), so it won't run
  // under Rosetta on an Intel Mac -- fail with a clear message instead of a
  // window sitting behind a silently-dead backend process.
  if (app.isPackaged && process.platform === "darwin" && process.arch !== "arm64") {
    dialog.showErrorBox(
      "Apple Silicon required",
      "This build only runs on Apple Silicon (M-series) Macs."
    );
    app.quit();
    return;
  }

  startBackend();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  stopBackend();
});
