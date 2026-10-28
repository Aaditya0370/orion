"""Optional YOLO detector and explicitly simulated coloured-marker fallback."""


class Detection(object):
    def __init__(self, box, confidence=None, label="simulated marker"):
        self.box = tuple(int(v) for v in box)
        self.center = (int((self.box[0] + self.box[2]) / 2), int((self.box[1] + self.box[3]) / 2))
        self.confidence = confidence
        self.label = label


class TargetDetector(object):
    def __init__(self, mode="opencv_marker", model_path="", hsv_low=(0, 90, 80), hsv_high=(25, 255, 255)):
        self.mode = mode
        self.hsv_low = tuple(hsv_low)
        self.hsv_high = tuple(hsv_high)
        self.model = None
        self.last_error = ""
        if mode == "yolo" and model_path:
            try:
                from ultralytics import YOLO
                self.model = YOLO(model_path)
            except Exception as exc:
                self.last_error = "YOLO unavailable: {}".format(exc)
        elif mode == "yolo":
            self.last_error = "YOLO model path is not configured"

    def detect(self, frame):
        if frame is None:
            return None
        if self.mode == "yolo" and self.model is not None:
            try:
                results = self.model.predict(frame, verbose=False)
                if not results or results[0].boxes is None or len(results[0].boxes) == 0:
                    return None
                boxes = results[0].boxes
                best = max(range(len(boxes)), key=lambda i: float(boxes.conf[i]))
                xyxy = boxes.xyxy[best].tolist()
                label = "YOLO target"
                return Detection(xyxy, float(boxes.conf[best]), label)
            except Exception as exc:
                self.last_error = "YOLO inference failed: {}".format(exc)
                return None
        try:
            import cv2
            import numpy as np
            hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
            mask = cv2.inRange(hsv, np.asarray(self.hsv_low, dtype=np.uint8),
                               np.asarray(self.hsv_high, dtype=np.uint8))
            contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            if not contours:
                return None
            contour = max(contours, key=cv2.contourArea)
            area = cv2.contourArea(contour)
            if area < 150:
                return None
            x, y, w, h = cv2.boundingRect(contour)
            # This is a marker heuristic, not fire recognition or a probability.
            return Detection((x, y, x + w, y + h), None, "simulated colour marker")
        except ImportError:
            self.last_error = "OpenCV is not installed"
            return None


class StableTarget(object):
    """Accept a detection only after spatially consistent consecutive frames."""
    def __init__(self, required_frames=4, tolerance_pixels=45):
        self.required_frames = max(1, int(required_frames))
        self.tolerance_pixels = int(tolerance_pixels)
        self._candidate = None
        self._count = 0

    @property
    def stable_count(self):
        return self._count

    def update(self, detection):
        if detection is None:
            self._candidate, self._count = None, 0
            return None
        if self._candidate is None:
            self._candidate, self._count = detection, 1
        else:
            dx = detection.center[0] - self._candidate.center[0]
            dy = detection.center[1] - self._candidate.center[1]
            if dx * dx + dy * dy <= self.tolerance_pixels ** 2:
                self._count += 1
                self._candidate = detection
            else:
                self._candidate, self._count = detection, 1
        return self._candidate if self._count >= self.required_frames else None
