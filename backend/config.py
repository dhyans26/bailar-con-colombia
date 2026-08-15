import os

# -1 auto-picks the first camera that is a live sensor, skipping idle virtual
# cameras like OBS's -- see pose_utils.resolve_camera_index. Set the
# CAMERA_INDEX env var to a real index to pin one instead.
CAMERA_INDEX = int(os.environ.get("CAMERA_INDEX", -1))
FRAME_SCALE = 0.5
KPT_CONF_THRES = 0.3

TARGET_FPS = 15
WINDOW_SECONDS = 2.0
WINDOW_FRAMES = int(TARGET_FPS * WINDOW_SECONDS)  # 30: default rolling window for test_lstm_model.py
