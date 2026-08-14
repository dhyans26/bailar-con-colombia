import cv2

cap = cv2.VideoCapture(0)
print("Backend:", cap.getBackendName(), "| Opened:", cap.isOpened())

while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        print("frame read failed")
        break
    cv2.imshow('Raw Webcam Test (press q to quit)', frame)
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
