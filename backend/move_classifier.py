"""Rule-based salsa move classifier.

Looks at a windowed FeatureBuffer and fires a Move event once per performed
move, then requires the dancer to settle back near-idle before it will fire
again (debounce).
"""

from enum import Enum
from typing import Optional

import config
from features import FeatureBuffer, is_near_idle


class Move(Enum):
    IDLE = "idle"
    BASIC_STEP = "basic_step"
    RIGHT_TURN = "right_turn"
    LEFT_TURN = "left_turn"
    CROSS_BODY_LEAD = "cross_body_lead"


class MoveClassifier:
    def __init__(self):
        self.state = "ARMED"   # ARMED -> can fire; COOLDOWN -> must return near-idle first
        self.last_move = Move.IDLE

    def update(self, buf: FeatureBuffer) -> Optional[Move]:
        """Call once per frame after pushing that frame's features into buf.
        Returns a Move the moment one is newly recognized, else None."""
        if not buf.is_full():
            return None

        if self.state == "COOLDOWN":
            if is_near_idle(buf):
                self.state = "ARMED"
            return None

        _, _, disp = buf.net_hip_displacement()
        # Signed: which direction (+/-) is "right" vs "left" turn depends on
        # webcam mirroring -- verify against real footage, see test script.
        rot = buf.cumulative_rotation()
        ox, oy = buf.hip_oscillation()

        move = None
        if disp > config.CBL_MIN_DISP and abs(rot) > config.CBL_MIN_ROTATION_DEG:
            move = Move.CROSS_BODY_LEAD
        elif rot > config.TURN_MIN_ROTATION_DEG and disp < config.TURN_MAX_DISP:
            move = Move.RIGHT_TURN
        elif rot < -config.TURN_MIN_ROTATION_DEG and disp < config.TURN_MAX_DISP:
            move = Move.LEFT_TURN
        elif (
            max(ox, oy) > config.STEP_MIN_OSC
            and abs(rot) < config.STEP_MAX_ROTATION_DEG
            and disp < config.STEP_MAX_DISP
        ):
            move = Move.BASIC_STEP

        if move is not None:
            self.last_move = move
            self.state = "COOLDOWN"

        return move
