"""LSTM model + shared preprocessing for the salsa move classifier.

Preprocessing turns a raw recorded clip (variable-length sequence of the
17 COCO keypoints saved by dataset_recorder.py) into a fixed-length,
translation/scale-normalized feature sequence suitable for the LSTM:
  1. drop the 5 face keypoints (irrelevant to dance moves) -> 12 body joints
  2. center each frame on the hip midpoint and scale by torso length
     (matches the pose_utils/features.py convention -- removes how
     far/where you're standing from the camera as a nuisance variable)
  3. resample to a fixed number of frames via linear interpolation in time
     (clips are recorded at varying lengths/fps; what matters is the shape
     of the motion, not its absolute duration)
  4. append frame-to-frame velocity alongside position

This module is imported by both train_lstm.py (offline training) and,
later, the live inference script -- so preprocessing is guaranteed
identical between training and inference.
"""

from dataclasses import dataclass, field
from typing import List

import numpy as np
import torch
import torch.nn as nn

from pose_utils import L_HIP, L_SHOULDER, R_HIP, R_SHOULDER

# 12 body joints; face keypoints (nose/eyes/ears, indices 0-4) are dropped.
BODY_JOINTS = list(range(5, 17))
NUM_JOINTS = len(BODY_JOINTS)   # 12
POS_DIM = NUM_JOINTS * 2        # 24
FEATURE_DIM = POS_DIM * 2       # 48 (position + velocity)

DEFAULT_SEQ_LEN = 40


def normalize_frame(kpts_xy: np.ndarray) -> np.ndarray:
    """Center on hip midpoint, scale by torso length. kpts_xy: (17, 2)."""
    hip_c = (kpts_xy[L_HIP] + kpts_xy[R_HIP]) / 2.0
    sh_c = (kpts_xy[L_SHOULDER] + kpts_xy[R_SHOULDER]) / 2.0
    scale = max(float(np.linalg.norm(sh_c - hip_c)), 1e-3)
    return (kpts_xy - hip_c) / scale


def resample_sequence(seq: np.ndarray, seq_len: int) -> np.ndarray:
    """Linearly resample a (T_in, D) sequence to (seq_len, D) along time."""
    t_in = len(seq)
    if t_in == seq_len:
        return seq.astype(np.float32)
    x_old = np.linspace(0.0, 1.0, num=t_in)
    x_new = np.linspace(0.0, 1.0, num=seq_len)
    out = np.empty((seq_len, seq.shape[1]), dtype=np.float32)
    for d in range(seq.shape[1]):
        out[:, d] = np.interp(x_new, x_old, seq[:, d])
    return out


def clip_to_features(frames_kpts_xy: List[np.ndarray], seq_len: int = DEFAULT_SEQ_LEN) -> np.ndarray:
    """Turn a list of per-frame (17,2) keypoint arrays into a fixed-length
    (seq_len, FEATURE_DIM) position+velocity feature sequence."""
    positions = []
    for kpts_xy in frames_kpts_xy:
        norm = normalize_frame(kpts_xy)[BODY_JOINTS]  # (12, 2)
        positions.append(norm.flatten())              # (24,)
    positions = np.stack(positions).astype(np.float32)  # (T_in, 24)

    positions = resample_sequence(positions, seq_len)   # (seq_len, 24)

    velocity = np.zeros_like(positions)
    velocity[1:] = positions[1:] - positions[:-1]

    return np.concatenate([positions, velocity], axis=1)  # (seq_len, 48)


@dataclass
class ModelConfig:
    input_dim: int = FEATURE_DIM
    hidden_dim: int = 64
    num_layers: int = 1
    bidirectional: bool = False
    dropout: float = 0.4
    num_classes: int = 0
    seq_len: int = DEFAULT_SEQ_LEN
    label_names: List[str] = field(default_factory=list)


class MoveLSTM(nn.Module):
    """Small LSTM classifier: sized for tens-to-low-hundreds of takes per
    class, not a large dataset -- keep hidden_dim/num_layers small and
    lean on dropout rather than making this bigger."""

    def __init__(self, cfg: ModelConfig):
        super().__init__()
        self.cfg = cfg
        self.lstm = nn.LSTM(
            input_size=cfg.input_dim,
            hidden_size=cfg.hidden_dim,
            num_layers=cfg.num_layers,
            batch_first=True,
            dropout=cfg.dropout if cfg.num_layers > 1 else 0.0,
            bidirectional=cfg.bidirectional,
        )
        mult = 2 if cfg.bidirectional else 1
        self.dropout = nn.Dropout(cfg.dropout)
        self.fc = nn.Linear(cfg.hidden_dim * mult, cfg.num_classes)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (batch, seq_len, input_dim) -> logits: (batch, num_classes)
        out, _ = self.lstm(x)
        last = out[:, -1, :]
        return self.fc(self.dropout(last))
