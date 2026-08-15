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

# Index permutation that swaps each left/right keypoint pair, for mirroring
# a raw (17, 2) frame left-to-right (nose maps to itself).
_LR_SWAP = [0, 2, 1, 4, 3, 6, 5, 8, 7, 10, 9, 12, 11, 14, 13, 16, 15]


def mirror_frame(kpts_xy: np.ndarray) -> np.ndarray:
    """Left-right flip a raw (17, 2) keypoint frame: swap L/R joints and
    negate x. Used for training-time augmentation -- doubles the effective
    dataset for moves that aren't inherently left/right-asymmetric, and is
    invariant to the hip-centering/scaling done in normalize_frame."""
    mirrored = kpts_xy[_LR_SWAP].copy()
    mirrored[:, 0] *= -1
    return mirrored


def augment_clip(frames_kpts_xy: List[np.ndarray], rng: np.random.Generator,
                  mirror_prob: float = 0.5, min_keep_frac: float = 0.75) -> List[np.ndarray]:
    """Randomly mirror and/or time-crop a clip's raw keypoint frames.
    Cropping to a random contiguous sub-range (then relying on
    resample_sequence to stretch it back to seq_len) simulates the move
    being performed slightly faster/slower or starting a beat later."""
    frames = frames_kpts_xy
    if rng.random() < mirror_prob:
        frames = [mirror_frame(f) for f in frames]
    n = len(frames)
    if n > 4:
        keep_n = max(4, int(round(n * rng.uniform(min_keep_frac, 1.0))))
        start = int(rng.integers(0, n - keep_n + 1))
        frames = frames[start:start + keep_n]
    return frames


def jitter_features(feats: np.ndarray, rng: np.random.Generator, std: float = 0.03) -> np.ndarray:
    """Add small Gaussian noise to a clip's normalized joint positions
    (post clip_to_features) and recompute velocity to match, so the noise
    is reflected consistently in both halves of the feature vector."""
    positions = feats[:, :POS_DIM] + rng.normal(0.0, std, size=(feats.shape[0], POS_DIM)).astype(np.float32)
    velocity = np.zeros_like(positions)
    velocity[1:] = positions[1:] - positions[:-1]
    return np.concatenate([positions, velocity], axis=1).astype(np.float32)


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


class MoveLSTM(nn.Module): # model for small datasets (0-100 per class)
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
