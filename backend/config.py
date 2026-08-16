import os

# -1 autopicks
CAMERA_INDEX = int(os.environ.get("CAMERA_INDEX", -1))
FRAME_SCALE = 0.5
KPT_CONF_THRES = 0.3

TARGET_FPS = 15
WINDOW_SECONDS = 2.0
WINDOW_FRAMES = int(TARGET_FPS * WINDOW_SECONDS)  # 30: default rolling window for test_lstm_model.py
