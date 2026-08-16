# Resolves paths to bundled data files (model checkpoints, weights) so they
# work identically whether the backend is running from source (repo layout)
# or as a PyInstaller-frozen build spawned by Electron (see api.spec and
# frontend/electron/main.js).

import sys
from pathlib import Path
from typing import Optional


def frozen_base_dir() -> Optional[Path]:
    """Root of the bundled data dir when running as a PyInstaller build,
    else None when running normally from source."""
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)
    return None
