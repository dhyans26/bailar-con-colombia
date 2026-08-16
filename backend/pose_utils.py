#utils


from pathlib import Path

import cv2
import numpy as np
import torch
from ultralytics import YOLO

from runtime_paths import frozen_base_dir

# In a PyInstaller build the weights are bundled at the app's data root
# (api.spec adds "../yolo26n-pose.pt" -> "."); from source they still live
# one level up, at the repo root.
_frozen = frozen_base_dir()
MODEL_PATH = (_frozen / "yolo26n-pose.pt") if _frozen else Path(__file__).resolve().parent.parent / "yolo26n-pose.pt"

if torch.backends.mps.is_available(): # mps if available (~40fps)
    DEVICE = "mps"
elif torch.cuda.is_available(): # cuda better
    DEVICE = "cuda"
else:
    DEVICE = "cpu" # cpu worst at ~10fps

KEYPOINT_NAMES = [
    "nose", "left_eye", "right_eye", "left_ear", "right_ear",
    "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
    "left_wrist", "right_wrist", "left_hip", "right_hip",
    "left_knee", "right_knee", "left_ankle", "right_ankle",
]
(NOSE, L_EYE, R_EYE, L_EAR, R_EAR, L_SHOULDER, R_SHOULDER, L_ELBOW, R_ELBOW,
 L_WRIST, R_WRIST, L_HIP, R_HIP, L_KNEE, R_KNEE, L_ANKLE, R_ANKLE) = range(17)

# 0-indexed conversion of ultralytics.utils.plotting.Annotator.skeleton
BONES = [
    (L_ANKLE, L_KNEE), (L_KNEE, L_HIP), (R_ANKLE, R_KNEE), (R_KNEE, R_HIP),
    (L_HIP, R_HIP), (L_SHOULDER, L_HIP), (R_SHOULDER, R_HIP),
    (L_SHOULDER, R_SHOULDER), (L_SHOULDER, L_ELBOW), (R_SHOULDER, R_ELBOW),
    (L_ELBOW, L_WRIST), (R_ELBOW, R_WRIST), (L_EYE, R_EYE), (NOSE, L_EYE),
    (NOSE, R_EYE), (L_EYE, L_EAR), (R_EYE, R_EAR),
]


def load_model() -> YOLO:
    model = YOLO(str(MODEL_PATH))
    model.to(DEVICE)
    return model


AUTO_CAMERA_INDEX = -1
_PROBE_FRAMES = 8
_PROBE_MAX_INDEX = 4
_LIVE_FRAME_DIFF = 0.05


def _frames_vary(cap: cv2.VideoCapture) -> bool:
    first = None
    for _ in range(_PROBE_FRAMES):
        ok, frame = cap.read()
        if not ok:
            continue
        if first is None:
            first = frame
        elif float(cv2.absdiff(first, frame).mean()) > _LIVE_FRAME_DIFF: # just check if theres a diff between frames
            return True
    return False


def resolve_camera_index() -> int:
    """Lowest camera index that is a live sensor rather than an idle virtual
    camera."""
    fallback = None
    for index in range(_PROBE_MAX_INDEX):
        cap = cv2.VideoCapture(index, cv2.CAP_AVFOUNDATION)
        try:
            if not cap.isOpened():
                break  # indices are contiguous, so the first gap is the end
            if fallback is None:
                fallback = index
            if _frames_vary(cap):
                return index
        finally:
            cap.release()
    return fallback if fallback is not None else 0


def open_camera(index: int = AUTO_CAMERA_INDEX) -> cv2.VideoCapture:
    if index < 0:
        index = resolve_camera_index()
    return cv2.VideoCapture(index, cv2.CAP_AVFOUNDATION)


def infer(model: YOLO, frame: np.ndarray):
    """Single-frame, non-streaming inference. Returns the one Results object."""
    return model(frame, verbose=False, device=DEVICE)[0]


def extract_keypoints(result):
    """Return (kpts_xy, kpts_conf) for the highest-mean-confidence detected
    person, as float32 (17, 2) / (17,) arrays, or (None, None) if nobody
    was detected."""
    kp = result.keypoints
    if kp is None or kp.shape[0] == 0:
        return None, None

    xy_all = kp.xy.cpu().numpy()
    if kp.conf is not None:
        conf_all = kp.conf.cpu().numpy()
    else:
        conf_all = np.ones(xy_all.shape[:2], dtype=np.float32)

    person_idx = int(np.argmax(conf_all.mean(axis=1)))
    return xy_all[person_idx].astype(np.float32), conf_all[person_idx].astype(np.float32)


def draw_skeleton(img, kpts_xy, kpts_conf=None, color=(0, 255, 0),
                   joint_color=(0, 0, 255), conf_thres=0.3, thickness=2,
                   radius=4, offset=(0, 0)):
    """Draw bones + joints onto img in place. Works on both the live camera
    frame and an avatar canvas (via offset)."""
    ox, oy = offset

    def visible(k):
        return kpts_conf is None or kpts_conf[k] >= conf_thres

    for i, j in BONES:
        if not (visible(i) and visible(j)):
            continue
        p1 = (int(kpts_xy[i, 0] + ox), int(kpts_xy[i, 1] + oy))
        p2 = (int(kpts_xy[j, 0] + ox), int(kpts_xy[j, 1] + oy))
        if p1[0] < 0 or p1[1] < 0 or p2[0] < 0 or p2[1] < 0:
            continue
        cv2.line(img, p1, p2, color, thickness, cv2.LINE_AA)

    for k in range(17):
        if not visible(k):
            continue
        x, y = int(kpts_xy[k, 0] + ox), int(kpts_xy[k, 1] + oy)
        if x >= 0 and y >= 0:
            cv2.circle(img, (x, y), radius, joint_color, -1, cv2.LINE_AA)

    return img
