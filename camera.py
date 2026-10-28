"""OpenCV webcam wrapper with explicit connection errors."""


class Camera(object):
    def __init__(self):
        self.capture = None
        self.error = ""

    @property
    def connected(self):
        return self.capture is not None and self.capture.isOpened()

    def connect(self, index=0, width=640, height=480, fps=30):
        self.disconnect()
        try:
            import cv2
            backend = getattr(cv2, "CAP_DSHOW", 0)
            self.capture = cv2.VideoCapture(int(index), backend)
            if not self.capture.isOpened():
                self.capture.release()
                self.capture = cv2.VideoCapture(int(index))
            if not self.capture.isOpened():
                self.error = "Camera {} is unavailable or occupied by another application.".format(index)
                self.capture.release()
                self.capture = None
                return False
            self.capture.set(cv2.CAP_PROP_FRAME_WIDTH, int(width))
            self.capture.set(cv2.CAP_PROP_FRAME_HEIGHT, int(height))
            self.capture.set(cv2.CAP_PROP_FPS, int(fps))
            self.error = ""
            return True
        except Exception as exc:
            self.error = "Camera connection failed: {}".format(exc)
            self.capture = None
            return False

    def read(self):
        if not self.connected:
            return None
        ok, frame = self.capture.read()
        if not ok:
            self.error = "Camera stopped returning frames; reconnect the camera."
            return None
        return frame

    def disconnect(self):
        if self.capture is not None:
            try:
                self.capture.release()
            except Exception:
                pass
        self.capture = None
