"""Tunable constants for Salsa Buddy.

Threshold values below are starting estimates, not measured -- tune them
empirically while testing move_classifier.py against real webcam footage.
"""

CAMERA_INDEX = 0
FRAME_SCALE = 0.5
KPT_CONF_THRES = 0.3

TARGET_FPS = 15
WINDOW_SECONDS = 2.0
WINDOW_FRAMES = int(TARGET_FPS * WINDOW_SECONDS)  # 30

# "near idle" thresholds -- all in body-scale units / degrees
IDLE_HIP_DISP = 0.30
IDLE_OSC = 0.30
IDLE_ROTATION_DEG = 12

# basic step: oscillates in place, little net movement or rotation
STEP_MIN_OSC = 0.35
STEP_MAX_ROTATION_DEG = 20
STEP_MAX_DISP = 0.35

# turns: big rotation, but roughly in place
TURN_MIN_ROTATION_DEG = 120
TURN_MAX_DISP = 0.5

# cross-body lead: big net translation AND a partial turn
CBL_MIN_DISP = 0.6
CBL_MIN_ROTATION_DEG = 60

AVATAR_PLAY_SECONDS = 2.5
