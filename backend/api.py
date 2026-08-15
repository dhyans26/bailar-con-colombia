# FastAPI service exposing the live webcam pipeline: YOLO pose-estimation
# keypoints and the rolling-window LSTM move prediction built on top of them.
#
# Pose estimation + LSTM inference are blocking (cv2 + torch), so they run on
# a background thread; the API just reads the latest cached result. This
# mirrors the loop in test_lstm_model.py, minus the cv2 GUI.
#
# Run with:
#   uvicorn api:app --reload --port 8000

import asyncio
import threading
import time
from collections import deque
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Dict, List, Optional

import cv2
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import config
from inference import DEFAULT_MODEL_PATH, load_checkpoint, predict
from pose_utils import KEYPOINT_NAMES, extract_keypoints, infer, load_model, open_camera

MIN_FRAMES = 10  # don't predict until the rolling window has at least this many frames


# --------------------------------------------------------------- schemas --

class Keypoint(BaseModel):
    name: str
    x: float
    y: float
    confidence: float
    visible: bool


class PoseResponse(BaseModel):
    person_detected: bool
    keypoints: List[Keypoint] = []
    timestamp: float


class PredictionResponse(BaseModel):
    ready: bool
    label: Optional[str] = None
    confidence: Optional[float] = None
    probabilities: Dict[str, float] = {}
    frames_collected: int
    frames_required: int
    timestamp: float


class StateResponse(BaseModel):
    pose: PoseResponse
    prediction: PredictionResponse


class HealthResponse(BaseModel):
    status: str
    camera_error: Optional[str] = None
    labels: List[str] = []


# ------------------------------------------------------------- pipeline ---

class PosePipeline:
    """Runs pose estimation + LSTM inference on a background thread and
    caches the latest results for the API to serve."""

    def __init__(self, camera_index: int, window_frames: int, model_path: Path):
        self.camera_index = camera_index
        self.window_frames = window_frames
        self.model_path = model_path

        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None

        self._pose_model = None
        self._lstm_model = None
        self._lstm_cfg = None
        self._feature_mean = None
        self._feature_std = None

        self._kpts_buffer: deque = deque(maxlen=window_frames)
        self._error: Optional[str] = None
        self._latest_pose = PoseResponse(person_detected=False, timestamp=time.time())
        self._latest_prediction = PredictionResponse(
            ready=False, frames_collected=0, frames_required=MIN_FRAMES, timestamp=time.time())
        # Bumped once per completed loop iteration (pose + prediction both
        # refreshed). /ws/state watches this instead of re-sending on a fixed
        # timer, so pushes happen exactly as fast as new results exist.
        self._version = 0

    def start(self) -> None:
        self._lstm_model, self._lstm_cfg, self._feature_mean, self._feature_std = \
            load_checkpoint(self.model_path)
        self._pose_model = load_model()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread is not None:
            self._thread.join(timeout=5)

    def get_pose(self) -> PoseResponse:
        with self._lock:
            return self._latest_pose

    def get_prediction(self) -> PredictionResponse:
        with self._lock:
            return self._latest_prediction

    def get_state(self) -> "tuple[PoseResponse, PredictionResponse, int]":
        with self._lock:
            return self._latest_pose, self._latest_prediction, self._version

    def get_error(self) -> Optional[str]:
        with self._lock:
            return self._error

    @property
    def label_names(self) -> List[str]:
        return self._lstm_cfg.label_names if self._lstm_cfg else []

    def _run(self) -> None:
        cap = open_camera(self.camera_index)
        if not cap.isOpened():
            with self._lock:
                self._error = f"could not open camera index {self.camera_index}"
            return
        try:
            while not self._stop_event.is_set():
                ret, frame = cap.read()
                if not ret:
                    continue
                frame = cv2.resize(frame, None, fx=config.FRAME_SCALE, fy=config.FRAME_SCALE,
                                    interpolation=cv2.INTER_AREA)

                result = infer(self._pose_model, frame)
                kpts_xy, kpts_conf = extract_keypoints(result)
                self._update_pose(kpts_xy, kpts_conf)

                if kpts_xy is not None:
                    self._kpts_buffer.append(kpts_xy)
                    self._update_prediction()
                else:
                    self._kpts_buffer.clear()
                    self._update_prediction()

                with self._lock:
                    self._version += 1
        finally:
            cap.release()

    def _update_pose(self, kpts_xy, kpts_conf) -> None:
        now = time.time()
        if kpts_xy is None:
            pose = PoseResponse(person_detected=False, timestamp=now)
        else:
            keypoints = [
                Keypoint(
                    name=KEYPOINT_NAMES[i],
                    x=float(kpts_xy[i, 0]),
                    y=float(kpts_xy[i, 1]),
                    confidence=float(kpts_conf[i]),
                    visible=bool(kpts_conf[i] >= config.KPT_CONF_THRES),
                )
                for i in range(len(KEYPOINT_NAMES))
            ]
            pose = PoseResponse(person_detected=True, keypoints=keypoints, timestamp=now)
        with self._lock:
            self._latest_pose = pose

    def _update_prediction(self) -> None:
        now = time.time()
        n = len(self._kpts_buffer)
        if n < MIN_FRAMES:
            prediction = PredictionResponse(
                ready=False, frames_collected=n, frames_required=MIN_FRAMES, timestamp=now)
        else:
            probs = predict(self._lstm_model, self._lstm_cfg, self._feature_mean,
                             self._feature_std, list(self._kpts_buffer))
            top_idx = int(np.argmax(probs))
            prediction = PredictionResponse(
                ready=True,
                label=self._lstm_cfg.label_names[top_idx],
                confidence=float(probs[top_idx]),
                probabilities={name: float(p) for name, p in zip(self._lstm_cfg.label_names, probs)},
                frames_collected=n,
                frames_required=MIN_FRAMES,
                timestamp=now,
            )
        with self._lock:
            self._latest_prediction = prediction


pipeline = PosePipeline(
    camera_index=config.CAMERA_INDEX,
    window_frames=config.WINDOW_FRAMES,
    model_path=DEFAULT_MODEL_PATH,
)


# ------------------------------------------------------------------- app --

@asynccontextmanager
async def lifespan(app: FastAPI):
    pipeline.start()
    yield
    pipeline.stop()


app = FastAPI(title="Macondo Pose/LSTM API", version="0.1.0", lifespan=lifespan)

# Local desktop app (Vite dev server + packaged Electron) -- tighten to a
# specific origin list before exposing this beyond localhost.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", camera_error=pipeline.get_error(),
                           labels=pipeline.label_names)


@app.get("/api/pose", response_model=PoseResponse)
def get_pose() -> PoseResponse:
    """Latest YOLO pose-estimation keypoints for the current camera frame."""
    return pipeline.get_pose()


@app.get("/api/prediction", response_model=PredictionResponse)
def get_prediction() -> PredictionResponse:
    """Latest LSTM move prediction over the rolling keypoint window."""
    return pipeline.get_prediction()


@app.get("/api/state", response_model=StateResponse)
def get_state() -> StateResponse:
    """Pose + prediction in a single call, for polling clients."""
    return StateResponse(pose=pipeline.get_pose(), prediction=pipeline.get_prediction())


# Poll interval (seconds) for checking the pipeline's version counter from
# inside the websocket loop, not a send interval. A message only goes out
# when the version actually changed, so this just bounds the extra latency
# this layer can add (worst case) on top of however fast the background
# thread is producing new frames.
_WS_CHECK_INTERVAL = 0.01

@app.websocket("/ws/state")
async def ws_state(websocket: WebSocket) -> None:
    """Pushes {pose, prediction} the moment the background pipeline produces
    a new result, instead of making the client poll on a fixed timer."""
    await websocket.accept()
    last_version = -1
    try:
        while True:
            pose, prediction, version = pipeline.get_state()
            if version != last_version:
                last_version = version
                await websocket.send_json({
                    "pose": pose.model_dump(),
                    "prediction": prediction.model_dump(),
                })
            await asyncio.sleep(_WS_CHECK_INTERVAL)
    except WebSocketDisconnect:
        pass
