import cv2

def list_cameras(max_index=10):
    available = []
    for i in range(max_index):
        cap = cv2.VideoCapture(i, cv2.CAP_AVFOUNDATION)
        if cap.isOpened():
            ok, frame = cap.read()
            if ok:
                h, w = frame.shape[:2]
                available.append((i, w, h))
        cap.release()
    return available

for idx, w, h in list_cameras():
    print(f"index {idx}: {w}x{h}")
