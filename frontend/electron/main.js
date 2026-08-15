import { app, BrowserWindow } from "electron";
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
// and picking one up silently gives a window with a dead backend behind it.
// PYTHON_BIN still overrides, for anyone using conda or another env.
function resolvePython() {
  if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;
  const venv = path.join(__dirname, "../..", ".venv");
  const candidates = [
    path.join(venv, "bin", "python"),
    path.join(venv, "Scripts", "python.exe"),
  ];
  return candidates.find(existsSync) ?? "python";
}

const PYTHON_BIN = resolvePython();

let backendProcess = null;

function startBackend() {
  backendProcess = spawn(PYTHON_BIN, ["-m", "uvicorn", "api:app", "--host", "127.0.0.1", "--port", "8000"], {
    cwd: BACKEND_DIR,
  });

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
