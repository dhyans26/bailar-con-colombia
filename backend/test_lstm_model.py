"""Live test harness for a trained LSTM move classifier (see train_lstm.py).

Loads a checkpoint saved by train_lstm.py and runs it continuously against
a rolling window of your live webcam pose, showing the predicted move plus
every class's probability on screen -- useful for sanity-checking the
model (and spotting confused/overlapping classes) before wiring it into
the actual app.

Run:
    python backend/test_lstm_model.py
    python backend/test_lstm_model.py --model backend/model/lstm_move_classifier.pt --camera 1
Press 'q' to quit.
"""

import argparse
from collections import deque
from pathlib import Path

import cv2
import numpy as np
import torch

import config
from lstm_model import ModelConfig, MoveLSTM, clip_to_features
from pose_utils import draw_skeleton, extract_keypoints, infer, load_model, open_camera

MODEL_DIR = Path(__file__).resolve().parent / "model"
DEFAULT_MODEL_PATH = MODEL_DIR / "lstm_move_classifier.pt"
MIN_FRAMES = 10  # don't predict until the rolling window has at least this many frames


def load_checkpoint(path: Path):
    ckpt = torch.load(path, weights_only=False, map_location="cpu")
    cfg = ModelConfig(**ckpt["config"])
    model = MoveLSTM(cfg)
    model.load_state_dict(ckpt["state_dict"])
    model.eval()
    return model, cfg, ckpt["feature_mean"], ckpt["feature_std"]


def predict(model, cfg, mean, std, frames_kpts_xy) -> np.ndarray:
    """Returns a (num_classes,) softmax probability array."""
    feats = clip_to_features(frames_kpts_xy, seq_len=cfg.seq_len)
    feats = (feats - mean) / std
    x = torch.from_numpy(feats.astype(np.float32)).unsqueeze(0)  # (1, seq_len, FEATURE_DIM)
    with torch.no_grad():
        logits = model(x)
        probs = torch.softmax(logits, dim=1).squeeze(0).numpy()
    return probs


def draw_predictions(frame, label_names, probs) -> None:
    x0, y0 = frame.shape[1] - 220, 30
    for i, name in enumerate(label_names):
        y = y0 + i * 22
        p = float(probs[i])
        bar_w = int(150 * p)
        cv2.rectangle(frame, (x0, y - 12), (x0 + 150, y + 4), (60, 60, 60), 1)
        cv2.rectangle(frame, (x0, y - 12), (x0 + bar_w, y + 4), (0, 200, 0), -1)
        cv2.putText(frame, f"{name} {p:.2f}", (x0 + 155, y),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)


def main():
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL_PATH)
    parser.add_argument("--camera", type=int, default=config.CAMERA_INDEX)
    parser.add_argument("--window", type=int, default=config.WINDOW_FRAMES,
                         help="how many recent raw frames to feed the model per prediction")
    args = parser.parse_args()

    if not args.model.exists():
        raise FileNotFoundError(
            f"no checkpoint at {args.model} -- train one first with train_lstm.py")

    lstm_model, cfg, mean, std = load_checkpoint(args.model)
    print(f"loaded model: classes={cfg.label_names}  seq_len={cfg.seq_len}")

    pose_model = load_model()
    cap = open_camera(args.camera)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open camera index {args.camera}")

    kpts_buffer = deque(maxlen=args.window)
    last_printed = None

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
        frame = cv2.resize(frame, None, fx=config.FRAME_SCALE, fy=config.FRAME_SCALE,
                            interpolation=cv2.INTER_AREA)

        result = infer(pose_model, frame)
        kpts_xy, kpts_conf = extract_keypoints(result)

        status = "no person detected"
        if kpts_xy is not None:
            draw_skeleton(frame, kpts_xy, kpts_conf, conf_thres=config.KPT_CONF_THRES)
            kpts_buffer.append(kpts_xy)

            if len(kpts_buffer) >= MIN_FRAMES:
                probs = predict(lstm_model, cfg, mean, std, list(kpts_buffer))
                top_idx = int(np.argmax(probs))
                top_name = cfg.label_names[top_idx]
                status = f"{top_name}  (p={probs[top_idx]:.2f})"
                draw_predictions(frame, cfg.label_names, probs)
                if top_name != last_printed:
                    print(f"[predicted] {status}")
                    last_printed = top_name
            else:
                status = f"collecting frames... ({len(kpts_buffer)}/{MIN_FRAMES})"

        cv2.putText(frame, status, (10, frame.shape[0] - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
        cv2.imshow("Salsa Buddy - LSTM model test", frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
