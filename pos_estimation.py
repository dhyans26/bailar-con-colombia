import cv2
from ultralytics import YOLO

model = YOLO('yolo26n-pose.pt')
cap = cv2.VideoCapture(0)

SCALE = 0.5

while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break

    frame = cv2.resize(frame, None, fx=SCALE, fy=SCALE, interpolation=cv2.INTER_AREA)

    results = model(frame, stream=True)

    for result in results:
        annotated_frame = result.plot()
        
    cv2.imshow('YOLO Pose Estimation', annotated_frame)
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
