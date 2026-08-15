# dataset recorder
# space to pause/start recording
# type in the class
# misc data on the bottom left

import argparse
import json
import re
import time
from pathlib import Path

import cv2

import config
from pose_utils import draw_skeleton, extract_keypoints, infer, load_model, open_camera

DATASET_DIR = Path(__file__).resolve().parent / "dataset"
WINDOW_NAME = "Dataset recorder"
BUTTON_RECT = (10, 55, 170, 45)  # x, y, w, h
LABEL_CHAR_RE = re.compile(r"[A-Za-z0-9_-]")


def point_in_rect(x: int, y: int, rect) -> bool:
    rx, ry, rw, rh = rect
    return rx <= x <= rx + rw and ry <= y <= ry + rh


def draw_button(frame, recording: bool, enabled: bool) -> None:
    rx, ry, rw, rh = BUTTON_RECT
    if not enabled:
        color = (80, 80, 80)
    else:
        color = (0, 0, 200) if recording else (0, 160, 0)
    label = "STOP (space)" if recording else "RECORD (space)"
    cv2.rectangle(frame, (rx, ry), (rx + rw, ry + rh), color, -1)
    cv2.rectangle(frame, (rx, ry), (rx + rw, ry + rh), (255, 255, 255), 2)
    cv2.putText(frame, label, (rx + 8, ry + rh - 16),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)


def make_mouse_callback(ui_state: dict):
    def on_mouse(event, x, y, flags, param):
        if event == cv2.EVENT_LBUTTONDOWN and point_in_rect(x, y, BUTTON_RECT):
            ui_state["toggle_requested"] = True
    return on_mouse


def existing_takes(move_name: str):
    move_dir = DATASET_DIR / move_name
    if not move_dir.exists():
        return []
    return sorted(move_dir.glob("*.json"))


def next_take_path(move_name: str) -> Path:
    takes = existing_takes(move_name)
    next_idx = 1
    if takes:
        try:
            next_idx = int(takes[-1].stem) + 1
        except ValueError:
            next_idx = len(takes) + 1
    move_dir = DATASET_DIR / move_name
    move_dir.mkdir(parents=True, exist_ok=True)
    return move_dir / f"{next_idx:03d}.json"


def save_take(move_name: str, frames, fps: float) -> Path:
    path = next_take_path(move_name)
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


def undo_last_take(move_name: str) -> None:
    takes = existing_takes(move_name)
    if not takes:
        print(f"no takes to undo for '{move_name}'")
        return
    last = takes[-1]
    last.unlink()
    print(f"deleted {last}")


def stop_recording(label: str, frames, record_start: float) -> None:
    elapsed = time.time() - record_start
    fps = len(frames) / elapsed if elapsed > 0 else 0.0
    print(f"recording stopped: {len(frames)} frames, {elapsed:.1f}s, {fps:.1f} fps")
    if frames:
        save_take(label, frames, fps)
    else:
        print("no frames captured -- nothing saved")


def main():
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--camera", type=int, default=config.CAMERA_INDEX)
    args = parser.parse_args()

    model = load_model()
    cap = open_camera(args.camera)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open camera index {args.camera}")

    cv2.namedWindow(WINDOW_NAME)
    ui_state = {"toggle_requested": False}
    cv2.setMouseCallback(WINDOW_NAME, make_mouse_callback(ui_state))

    label = ""
    recording = False
    frames = []
    record_start = 0.0

    print("Type a move name, SPACE (or click) to record/stop, 'u' to undo last take, 'q' to quit.")

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
        toggle = ui_state["toggle_requested"] or key == ord(' ')
        ui_state["toggle_requested"] = False

        if not recording:
            if key in (8, 127):  # backspace / delete
                label = label[:-1]
            elif key == ord('u'):
                if label:
                    undo_last_take(label)
            elif 32 < key < 127:
                ch = chr(key)
                if LABEL_CHAR_RE.fullmatch(ch):
                    label += ch

        if toggle and label:
            if not recording:
                recording = True
                frames = []
                record_start = time.time()
                print(f"recording '{label}' started")
            else:
                recording = False
                stop_recording(label, frames, record_start)

        if recording and kpts_xy is not None:
            frames.append((kpts_xy, kpts_conf))

        # --- overlay ---
        label_display = label if label else "(type a move name...)"
        cv2.putText(frame, f"label: {label_display}", (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7,
                    (0, 0, 255) if recording else (255, 255, 255), 2)
        draw_button(frame, recording, enabled=bool(label))
        take_count = len(existing_takes(label)) if label else 0
        cv2.putText(frame, f"{take_count} take(s) saved for this move",
                    (10, frame.shape[0] - 40), cv2.FONT_HERSHEY_SIMPLEX,
                    0.55, (200, 200, 200), 1)
        if recording:
            elapsed = time.time() - record_start
            cv2.putText(frame, f"REC {elapsed:.1f}s  frames={len(frames)}",
                        (BUTTON_RECT[0] + BUTTON_RECT[2] + 15, BUTTON_RECT[1] + 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
        cv2.putText(frame, "type name | space=rec/stop | u=undo | q=quit",
                    (10, frame.shape[0] - 10), cv2.FONT_HERSHEY_SIMPLEX,
                    0.5, (150, 150, 150), 1)

        cv2.imshow(WINDOW_NAME, frame)

        if key == ord('q'):
            if recording:
                stop_recording(label, frames, record_start)
            break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
