# -*- mode: python ; coding: utf-8 -*-
#
# Builds the FastAPI backend into a standalone --onedir bundle so Electron's
# packaged builds don't depend on a system Python / project .venv (see
# frontend/electron/main.js, which spawns this binary when app.isPackaged).
#
# Run from backend/: pyinstaller api.spec
# Output: backend/dist/macondo-backend/macondo-backend (+ _internal/)
#
# PyInstaller does not cross-compile -- this must run on the target OS/arch.
# We only ship macOS arm64 (see build_standalone.sh), since current torch
# releases no longer publish macOS x86_64 wheels at all.

from PyInstaller.utils.hooks import collect_all

datas = [
    ("model", "model"),                 # LSTM checkpoint (inference.py)
    ("../yolo26n-pose.pt", "."),        # YOLO pose weights (pose_utils.py)
]
binaries = []
hiddenimports = []

# torch/ultralytics/cv2 all load assets and submodules dynamically in ways
# PyInstaller's static import analysis misses on its own.
for pkg in ("torch", "ultralytics", "cv2"):
    pkg_datas, pkg_binaries, pkg_hiddenimports = collect_all(pkg)
    datas += pkg_datas
    binaries += pkg_binaries
    hiddenimports += pkg_hiddenimports

a = Analysis(
    ["api.py"],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="macondo-backend",
    debug=False,
    strip=False,
    upx=False,
    console=True,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name="macondo-backend",
)
