"""Record a keypoint-sequence clip for one salsa move and save it to
backend/references/<move_name>.json, using a click-to-start/click-to-stop
RECORD button in the preview window (press 'r' as a keyboard alternative).

<move_name> can be anything filename-safe -- not limited to the 4 broad
categories move_classifier.py detects. Use as fine-grained a name as you
want (e.g. basic_step_left_foot, cross_body_lead_fast) to build up a
bigger library of reference clips than the classifier's categories alone.

These clips serve two purposes:
  1. Reference data the avatar will later loop as a "correct form" demo.
  2. Ground truth to check/tune the move_classifier.py thresholds in
     config.py against real movement -- after each stop, this script
     prints the same windowed measurements (net displacement, oscillation,
     cumulative rotation) the classifier uses, so you can compare what a
     real basic_step/turn/cross_body_lead actually measures against the
     current thresholds.

You can record multiple takes in one run -- each STOP saves over
backend/references/<move_name>.json, so just click RECORD again for
another take if the last one wasn't clean.

Run:
    python backend/record_reference.py basic_step
    python backend/record_reference.py basic_step_left_foot
    python backend/record_reference.py right_turn --camera 1

Controls: click the button (or press 'r') to start/stop recording.
Press 'q' to quit (auto-stops and saves first if still recording).
"""

import argparse
import json
import re
import time
from pathlib import Path

import cv2

import config
from features import FeatureBuffer, compute_frame_features
from pose_utils import draw_skeleton, extract_keypoints, infer, load_model, open_camera

SUGGESTED_MOVES = ["basic_step", "right_turn", "left_turn", "cross_body_lead"]
MOVE_NAME_RE = re.compile(r"^[A-Za-z0-9_-]+$")
REFERENCES_DIR = Path(__file__).resolve().parent / "references"
WINDOW_NAME = "Salsa Buddy - record reference"
BUTTON_RECT = (10, 10, 150, 50)  # x, y, w, h


def move_name_type(value: str) -> str:
    """argparse type= validator: any name works (e.g. 'basic_step_left_foot'),
    just restricted to filename-safe characters since it becomes
    backend/references/<value>.json."""
    if not MOVE_NAME_RE.match(value):
        raise argparse.ArgumentTypeError(
            f"invalid move name {value!r} -- use only letters, digits, '_' and '-'")
    return value


def point_in_rect(x: int, y: int, rect) -> bool:
    rx, ry, rw, rh = rect
    return rx <= x <= rx + rw and ry <= y <= ry + rh


def draw_button(frame, recording: bool) -> None:
    rx, ry, rw, rh = BUTTON_RECT
    color = (0, 0, 200) if recording else (0, 160, 0)
    label = "STOP" if recording else "RECORD"
    cv2.rectangle(frame, (rx, ry), (rx + rw, ry + rh), color, -1)
    cv2.rectangle(frame, (rx, ry), (rx + rw, ry + rh), (255, 255, 255), 2)
    cv2.putText(frame, label, (rx + 20, ry + rh - 16),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)


def make_mouse_callback(ui_state: dict):
    def on_mouse(event, x, y, flags, param):
        if event == cv2.EVENT_LBUTTONDOWN and point_in_rect(x, y, BUTTON_RECT):
            ui_state["toggle_requested"] = True
    return on_mouse


def summarize(frames) -> None:
    """Print windowed feature measurements for the whole clip, in the same
    units move_classifier.py reasons in, so they're directly comparable to
    the thresholds in config.py."""
    if len(frames) < 2:
        print("Not enough frames to summarize.")
        return

    buf = FeatureBuffer(maxlen=len(frames))
    for kpts_xy, _ in frames:
        buf.push(compute_frame_features(kpts_xy))

    dx, dy, disp = buf.net_hip_displacement()
    ox, oy = buf.hip_oscillation()
    rot = buf.cumulative_rotation()

    print("--- clip summary (body-scale units / degrees, matches config.py thresholds) ---")
    print(f"  net hip displacement: dx={dx:.2f} dy={dy:.2f} mag={disp:.2f}")
    print(f"  hip oscillation:      x_range={ox:.2f} y_range={oy:.2f}")
    print(f"  cumulative rotation:  {rot:.1f} deg")
    print("----------------------------------------------------------------------------")


def save_clip(move_name: str, frames, fps: float) -> Path:
    REFERENCES_DIR.mkdir(parents=True, exist_ok=True)
    path = REFERENCES_DIR / f"{move_name}.json"

    data = {
        "move": move_name,
        "fps": fps,
        "frame_count": len(frames),
        "frames": [
            {"kpts_xy": kpts_xy.tolist(), "kpts_conf": kpts_conf.tolist()}
            for kpts_xy, kpts_conf in frames
        ],
    }
    with open(path, "w") as f:
        json.dump(data, f)

    print(f"saved {len(frames)} frames ({fps:.1f} fps) -> {path}")
    return path


def stop_and_save(move_name: str, frames, record_start: float) -> None:
    elapsed = time.time() - record_start
    fps = len(frames) / elapsed if elapsed > 0 else 0.0
    print(f"recording stopped: {len(frames)} frames, {elapsed:.1f}s, {fps:.1f} fps")
    if not frames:
        print("no frames captured -- nothing saved")
        return
    summarize(frames)
    save_clip(move_name, frames, fps)


def main():
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "move", type=move_name_type,
        help=f"any filename-safe name, e.g. {', '.join(SUGGESTED_MOVES)}, "
             f"or a more specific variant like basic_step_left_foot")
    parser.add_argument("--camera", type=int, default=config.CAMERA_INDEX)
    args = parser.parse_args()

    model = load_model()
    cap = open_camera(args.camera)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open camera index {args.camera}")

    cv2.namedWindow(WINDOW_NAME)
    ui_state = {"toggle_requested": False}
    cv2.setMouseCallback(WINDOW_NAME, make_mouse_callback(ui_state))

    recording = False
    frames = []
    record_start = 0.0

    print(f"Target move: '{args.move}'. Click RECORD (or press 'r') when ready, "
          f"click STOP (or 'r') when done. Press 'q' to quit.")

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
        frame = cv2.resize(frame, None, fx=config.FRAME_SCALE, fy=config.FRAME_SCALE,
                            interpolation=cv2.INTER_AREA)

        result = infer(model, frame)
        kpts_xy, kpts_conf = extract_keypoints(result)
        if kpts_xy is not None:
            draw_skeleton(frame, kpts_xy, kpts_conf, conf_thres=config.KPT_CONF_THRES)

        key = cv2.waitKey(1) & 0xFF
        toggle = ui_state["toggle_requested"] or key == ord('r')
        ui_state["toggle_requested"] = False

        if toggle:
            if not recording:
                recording = True
                frames = []
                record_start = time.time()
                print("recording started")
            else:
                recording = False
                stop_and_save(args.move, frames, record_start)

        if recording and kpts_xy is not None:
            frames.append((kpts_xy, kpts_conf))

        if recording:
            elapsed = time.time() - record_start
            cv2.putText(frame, f"REC {elapsed:.1f}s  frames={len(frames)}",
                        (10, frame.shape[0] - 40), cv2.FONT_HERSHEY_SIMPLEX,
                        0.6, (0, 0, 255), 2)

        draw_button(frame, recording)
        cv2.putText(frame, f"move: {args.move}", (10, frame.shape[0] - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
        cv2.imshow(WINDOW_NAME, frame)

        if key == ord('q'):
            if recording:
                stop_and_save(args.move, frames, record_start)
            break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
