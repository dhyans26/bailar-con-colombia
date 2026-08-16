#!/usr/bin/env bash

# macOS only, and only produces an arm64 binary regardless of host arch
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "arm64" ]]; then
  echo "error: must run on Apple Silicon macOS (got $(uname -s)/$(uname -m))" >&2
  exit 1
fi

# Must be an interpreter with *exactly* requirements.txt installed and nothing else 
if [[ -n "${PYTHON_BIN:-}" ]]; then
  : # explicit override wins
elif [[ -x "../.venv/bin/python" ]]; then
  PYTHON_BIN="../.venv/bin/python"
else
  for conda_root in "$HOME/anaconda3" "$HOME/miniconda3" "$HOME/miniforge3" \
                    /opt/anaconda3 /opt/miniconda3 /opt/homebrew/anaconda3 \
                    /opt/homebrew/Caskroom/miniconda/base; do
    if [[ -x "$conda_root/envs/macondo/bin/python" ]]; then
      PYTHON_BIN="$conda_root/envs/macondo/bin/python"
      break
    fi
  done
fi

if [[ -z "${PYTHON_BIN:-}" ]]; then
  echo "error: no .venv and no conda env named 'macondo' found." >&2
  echo "       set PYTHON_BIN to the interpreter with requirements.txt installed." >&2
  exit 1
fi

echo "using interpreter: $PYTHON_BIN"
"$PYTHON_BIN" -m pip list --format=freeze > /tmp/macondo-build-env.txt
echo "  (full package list: /tmp/macondo-build-env.txt -- check it for surprises if the build looks too big)"
"$PYTHON_BIN" -m PyInstaller api.spec --noconfirm

echo "built: backend/dist/macondo-backend/macondo-backend"
