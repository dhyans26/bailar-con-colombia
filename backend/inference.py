# shared LSTM checkpoint loading + prediction helpers
# (used by test_lstm_model.py and api.py so the two don't drift apart)

from pathlib import Path
from typing import List, Tuple

import numpy as np
import torch

from lstm_model import ModelConfig, MoveLSTM, clip_to_features
from runtime_paths import frozen_base_dir

# In a PyInstaller build the checkpoint is bundled at the app's data root
# (api.spec adds "model" -> "model"); from source it lives next to this file.
_frozen = frozen_base_dir()
MODEL_DIR = (_frozen / "model") if _frozen else Path(__file__).resolve().parent / "model"
DEFAULT_MODEL_PATH = MODEL_DIR / "lstm_move_classifier.pt"


def load_checkpoint(path: Path = DEFAULT_MODEL_PATH) -> Tuple[MoveLSTM, ModelConfig, np.ndarray, np.ndarray]:
    if not path.exists():
        raise FileNotFoundError(
            f"no checkpoint at {path} -- train one first with train_lstm.py")
    ckpt = torch.load(path, weights_only=False, map_location="cpu")
    cfg = ModelConfig(**ckpt["config"])
    model = MoveLSTM(cfg)
    model.load_state_dict(ckpt["state_dict"])
    model.eval()
    return model, cfg, ckpt["feature_mean"], ckpt["feature_std"]


def predict(model: MoveLSTM, cfg: ModelConfig, mean: np.ndarray, std: np.ndarray,
            frames_kpts_xy: List[np.ndarray]) -> np.ndarray:
    """Returns a (num_classes,) softmax probability array."""
    feats = clip_to_features(frames_kpts_xy, seq_len=cfg.seq_len)
    feats = (feats - mean) / std
    x = torch.from_numpy(feats.astype(np.float32)).unsqueeze(0)  # (1, seq_len, FEATURE_DIM)
    with torch.no_grad():
        logits = model(x)
        probs = torch.softmax(logits, dim=1).squeeze(0).numpy()
    return probs
