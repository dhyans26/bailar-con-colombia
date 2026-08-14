import cv2

for idx in range(3):
    cap = cv2.VideoCapture(idx, cv2.CAP_AVFOUNDATION)
    if not cap.isOpened():
        print(f"index {idx}: could not open")
        cap.release()
        continue

    # Warm up a few frames — first read after opening is often stale/blank
    frame = None
    for _ in range(5):
        ret, frame = cap.read()

    if ret and frame is not None:
        mean, std = frame.mean(), frame.std()
        path = f"/Users/vedpatel/code/Macondo/cam_index_{idx}.png"
        cv2.imwrite(path, frame)
        print(f"index {idx}: shape={frame.shape} mean={mean:.1f} std={std:.1f} -> saved {path}")
    else:
        print(f"index {idx}: opened but read failed")

    cap.release()
