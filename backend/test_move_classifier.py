"""Manual test harness for the move classifier -- no avatar yet.

Shows the live camera feed with a skeleton overlay and the current
classifier state, and prints to the console every time a move is
recognized. Use this to sanity-check/tune the thresholds in config.py
before the avatar/recording pieces exist.

Run:
    python backend/test_move_classifier.py
Press 'q' to quit.
"""

import cv2

import config
from features import FeatureBuffer, compute_frame_features
from move_classifier import MoveClassifier
from pose_utils import draw_skeleton, extract_keypoints, infer, load_model, open_camera


def main():
    model = load_model()
    cap = open_camera(config.CAMERA_INDEX)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open camera index {config.CAMERA_INDEX}")

    buf = FeatureBuffer(maxlen=config.WINDOW_FRAMES)
    classifier = MoveClassifier()

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        frame = cv2.resize(frame, None, fx=config.FRAME_SCALE, fy=config.FRAME_SCALE,
                            interpolation=cv2.INTER_AREA)
        result = infer(model, frame)
        kpts_xy, kpts_conf = extract_keypoints(result)

        status = "no person detected"
        if kpts_xy is not None:
            draw_skeleton(frame, kpts_xy, kpts_conf, conf_thres=config.KPT_CONF_THRES)
            buf.push(compute_frame_features(kpts_xy))
            event = classifier.update(buf)
            if event is not None:
                print(f"[move detected] {event.value}")
            status = f"last move: {classifier.last_move.value}  ({classifier.state})"

        cv2.putText(frame, status, (10, frame.shape[0] - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
        cv2.imshow("Salsa Buddy - move classifier test", frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
