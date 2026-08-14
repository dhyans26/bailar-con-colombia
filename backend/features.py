"""Per-frame feature extraction and a sliding-window buffer used by the
rule-based move classifier."""

from collections import deque
from dataclasses import dataclass

import numpy as np

import config
from pose_utils import L_HIP, L_SHOULDER, L_WRIST, R_HIP, R_SHOULDER, R_WRIST


@dataclass
class FrameFeatures:
    hip_center: np.ndarray
    shoulder_center: np.ndarray
    body_scale: float          # torso length, used to normalize everything else
    shoulder_angle_deg: float  # angle of the shoulder line vs horizontal
    left_wrist_rel_y: float    # + = wrist above shoulder, normalized by body_scale
    right_wrist_rel_y: float


def compute_frame_features(kpts_xy: np.ndarray) -> FrameFeatures:
    hip_c = (kpts_xy[L_HIP] + kpts_xy[R_HIP]) / 2.0
    sh_c = (kpts_xy[L_SHOULDER] + kpts_xy[R_SHOULDER]) / 2.0
    body_scale = max(float(np.linalg.norm(sh_c - hip_c)), 1e-3)

    dx = kpts_xy[R_SHOULDER, 0] - kpts_xy[L_SHOULDER, 0]
    dy = kpts_xy[R_SHOULDER, 1] - kpts_xy[L_SHOULDER, 1]
    shoulder_angle = float(np.degrees(np.arctan2(dy, dx)))

    l_wrist_rel = (sh_c[1] - kpts_xy[L_WRIST, 1]) / body_scale
    r_wrist_rel = (sh_c[1] - kpts_xy[R_WRIST, 1]) / body_scale

    return FrameFeatures(hip_c, sh_c, body_scale, shoulder_angle, l_wrist_rel, r_wrist_rel)


class FeatureBuffer:
    """Fixed-length sliding window of FrameFeatures, plus the windowed
    measurements the move classifier reasons over."""

    def __init__(self, maxlen: int):
        self.buf: "deque[FrameFeatures]" = deque(maxlen=maxlen)

    def push(self, ff: FrameFeatures) -> None:
        self.buf.append(ff)

    def clear(self) -> None:
        self.buf.clear()

    def is_full(self) -> bool:
        return len(self.buf) == self.buf.maxlen

    def _scale(self) -> float:
        return float(np.mean([f.body_scale for f in self.buf]))

    def net_hip_displacement(self):
        """Net (dx, dy, magnitude) of hip movement from window start to end,
        in body-scale units."""
        if len(self.buf) < 2:
            return 0.0, 0.0, 0.0
        s = self._scale()
        dx = (self.buf[-1].hip_center[0] - self.buf[0].hip_center[0]) / s
        dy = (self.buf[-1].hip_center[1] - self.buf[0].hip_center[1]) / s
        return dx, dy, float(np.hypot(dx, dy))

    def hip_oscillation(self):
        """(x range, y range) of hip movement across the window, in
        body-scale units -- high with no net displacement means stepping in
        place."""
        s = self._scale()
        xs = [f.hip_center[0] for f in self.buf]
        ys = [f.hip_center[1] for f in self.buf]
        return (max(xs) - min(xs)) / s, (max(ys) - min(ys)) / s

    def cumulative_rotation(self) -> float:
        """Total signed rotation of the shoulder line across the window, in
        degrees, unwrapped so a continuous spin isn't clipped at +-180."""
        angles = [f.shoulder_angle_deg for f in self.buf]
        unwrapped = np.degrees(np.unwrap(np.radians(angles)))
        return float(unwrapped[-1] - unwrapped[0])


def is_near_idle(buf: "FeatureBuffer") -> bool:
    """Shared "basically not moving" check used by move_classifier.py to
    decide when a classifier may fire again."""
    _, _, disp = buf.net_hip_displacement()
    rot = abs(buf.cumulative_rotation())
    ox, oy = buf.hip_oscillation()
    return (
        disp < config.IDLE_HIP_DISP
        and rot < config.IDLE_ROTATION_DEG
        and max(ox, oy) < config.IDLE_OSC
    )
