"""PySide6 engineering dashboard for the offline ORION demonstration."""
import math

from PySide6.QtCore import Qt, QTimer
from PySide6.QtGui import QColor, QImage, QPainter, QPen, QPixmap
from PySide6.QtWidgets import (QComboBox, QFormLayout, QGridLayout,
    QGroupBox, QHBoxLayout, QLabel, QMainWindow, QMessageBox, QPushButton,
    QPlainTextEdit, QSpinBox, QVBoxLayout, QWidget, QInputDialog)

from .camera import Camera
from .config import load_config, save_config
from .detection import Detection, StableTarget, TargetDetector
from .geometry import camera_to_world, compose_orientation, pan_elevation, servo_command, world_to_turret
from .mapping import PlaneCalibration
from .serial_link import SerialLink
from .storage import SettingsStore


class RoomGrid(QWidget):
    def __init__(self, parent=None):
        QWidget.__init__(self, parent)
        self.setMinimumSize(270, 200)
        self.plane = "back_wall"
        self.columns = 8
        self.rows = 5
        self.cell = None
        self.points = []

    def set_target(self, plane, columns, rows, cell, points):
        self.plane = plane
        self.columns, self.rows = max(1, int(columns)), max(1, int(rows))
        self.cell, self.points = cell, points
        self.update()

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.fillRect(self.rect(), QColor("#171d24"))
        painter.setRenderHint(QPainter.Antialiasing)
        rect = self.rect().adjusted(24, 28, -18, -22)
        painter.setPen(QColor("#d9e2ec"))
        painter.drawText(18, 20, "{} plane — calibrated grid view".format(self.plane.replace("_", " ").title()))
        painter.setPen(QPen(QColor("#536273"), 1))
        for col in range(self.columns + 1):
            x = rect.left() + rect.width() * col / float(self.columns)
            painter.drawLine(int(x), rect.top(), int(x), rect.bottom())
        for row in range(self.rows + 1):
            y = rect.top() + rect.height() * row / float(self.rows)
            painter.drawLine(rect.left(), int(y), rect.right(), int(y))
        for point in self.points:
            px, py = point
            painter.setBrush(QColor("#55c2a5"))
            painter.setPen(Qt.NoPen)
            painter.drawEllipse(int(rect.left() + px * rect.width()), int(rect.top() + py * rect.height()), 7, 7)
        if self.cell is not None:
            col, row = self.cell
            cw, ch = rect.width() / float(self.columns), rect.height() / float(self.rows)
            painter.fillRect(int(rect.left() + col * cw), int(rect.top() + row * ch), int(cw), int(ch), QColor(240, 165, 60, 115))
            painter.setPen(QPen(QColor("#f0a53c"), 2))
            painter.drawRect(int(rect.left() + col * cw), int(rect.top() + row * ch), int(cw), int(ch))


class FireguardWindow(QMainWindow):
    def __init__(self):
        QMainWindow.__init__(self)
        self.setWindowTitle("ORION FIREGUARD | Vision & Aiming Demonstrator")
        self.resize(1250, 820)
        self.setStyleSheet("""
            QMainWindow, QWidget { background: #202830; color: #e6edf3; font: 10pt 'Segoe UI'; }
            QGroupBox { border: 1px solid #42505e; border-radius: 6px; margin-top: 10px; padding: 9px; font-weight: 600; }
            QGroupBox::title { subcontrol-origin: margin; left: 10px; padding: 0 5px; color: #67c5ad; }
            QPushButton, QComboBox, QLineEdit, QSpinBox, QDoubleSpinBox { background: #303b46; border: 1px solid #526170; border-radius: 4px; padding: 6px; }
            QPushButton:hover { background: #3e4c59; }
            QPushButton:disabled { color: #84909b; }
            QPlainTextEdit { background: #151b21; border: 1px solid #42505e; }
        """)
        file_config = load_config()
        self.config = dict(file_config)
        self.storage = None
        self.storage_error = ""
        try:
            self.storage = SettingsStore()
            database_config = self.storage.load_settings()
            database_calibrations = self.storage.load_calibrations()
            self.config.update(database_config)
            self.config.update(file_config)
            calibrations = dict(database_config.get("calibrations", {}))
            calibrations.update(database_calibrations)
            calibrations.update(file_config.get("calibrations", {}))
            self.config["calibrations"] = calibrations
        except Exception as exc:
            self.storage_error = "SQLite storage unavailable: {}".format(exc)
        self.camera = Camera()
        self.link = SerialLink(self.config.get("baud_rate", 9600), self.config["servo_pan_limits"], self.config["servo_tilt_limits"])
        self.detector = self._make_detector()
        self.tracker = StableTarget(self.config.get("stability_frames", 4))
        self.paused = False
        self.latest_detection = None
        self.latest_frame_size = (int(self.config["camera_width"]), int(self.config["camera_height"]))
        self.latest_target_world = None
        self.latest_angles = None
        self.calibrations = {}
        self._load_calibrations()
        self._build_ui()
        if self.storage is not None:
            try:
                for message in self.storage.load_events(30):
                    self.log_view.appendPlainText("HIST  " + message)
            except Exception as exc:
                self.storage_error = "Could not load SQLite event history: {}".format(exc)
        self.timer = QTimer(self)
        self.timer.timeout.connect(self._update_frame)
        self.timer.start(40)
        self.log("Simulation mode active. No hardware output is enabled.")
        self.log("Fallback detector finds the configured colour marker only; it does not detect or certify real fire.")
        if self.storage_error:
            self.log(self.storage_error)
        if self.detector.last_error:
            self.log(self.detector.last_error + "; using the OpenCV marker fallback when available.")

    def _make_detector(self):
        return TargetDetector(self.config.get("detector_mode", "opencv_marker"),
            self.config.get("yolo_model", ""), self.config.get("marker_hsv_low", [0, 90, 80]),
            self.config.get("marker_hsv_high", [25, 255, 255]))

    def _load_calibrations(self):
        for plane, data in self.config.get("calibrations", {}).items():
            try:
                calibration = PlaneCalibration(plane, data["image_points"], data["plane_points"])
                self.calibrations[plane] = calibration
            except Exception:
                pass

    def _build_ui(self):
        central = QWidget()
        self.setCentralWidget(central)
        root = QVBoxLayout(central)
        header = QHBoxLayout()
        title = QLabel("ORION FIREGUARD")
        title.setStyleSheet("font-size: 20pt; font-weight: 700; color: #67c5ad;")
        header.addWidget(title)
        header.addWidget(QLabel("OFFLINE ENGINEERING DEMONSTRATOR · RSBVP 2026–27"))
        header.addStretch(1)
        root.addLayout(header)
        body = QGridLayout()
        root.addLayout(body, 1)

        camera_box = QGroupBox("Live camera · simulated-target vision")
        camera_layout = QVBoxLayout(camera_box)
        self.video = QLabel("Camera disconnected\nConnect a built-in or USB camera to preview")
        self.video.setAlignment(Qt.AlignCenter)
        self.video.setMinimumSize(420, 300)
        self.video.setStyleSheet("background:#10151a; border:1px solid #42505e;")
        camera_layout.addWidget(self.video, 1)
        camera_controls = QHBoxLayout()
        self.camera_index = QSpinBox(); self.camera_index.setRange(0, 10); self.camera_index.setValue(int(self.config["camera_index"]))
        self.cam_width = QSpinBox(); self.cam_width.setRange(160, 3840); self.cam_width.setSingleStep(160); self.cam_width.setValue(int(self.config["camera_width"]))
        self.cam_height = QSpinBox(); self.cam_height.setRange(120, 2160); self.cam_height.setSingleStep(120); self.cam_height.setValue(int(self.config["camera_height"]))
        self.cam_fps = QSpinBox(); self.cam_fps.setRange(1, 120); self.cam_fps.setValue(int(self.config["camera_fps"]))
        self.connect_camera_btn = QPushButton("Connect camera"); self.connect_camera_btn.clicked.connect(self._connect_camera)
        self.pause_btn = QPushButton("Pause preview"); self.pause_btn.clicked.connect(self._toggle_pause)
        self.reconnect_btn = QPushButton("Reconnect"); self.reconnect_btn.clicked.connect(self._connect_camera)
        camera_controls.addWidget(QLabel("Device")); camera_controls.addWidget(self.camera_index)
        camera_controls.addWidget(QLabel("W×H")); camera_controls.addWidget(self.cam_width); camera_controls.addWidget(self.cam_height)
        camera_controls.addWidget(QLabel("FPS")); camera_controls.addWidget(self.cam_fps)
        camera_controls.addWidget(self.connect_camera_btn); camera_controls.addWidget(self.pause_btn); camera_controls.addWidget(self.reconnect_btn)
        camera_layout.addLayout(camera_controls)
        manual_row = QHBoxLayout()
        self.manual_btn = QPushButton("Manual test: confirm frame centre")
        self.manual_btn.clicked.connect(self._manual_test_target)
        manual_row.addWidget(self.manual_btn)
        camera_layout.addLayout(manual_row)
        self.camera_status = QLabel("Camera: disconnected")
        camera_layout.addWidget(self.camera_status)
        body.addWidget(camera_box, 0, 0, 1, 1)

        room_box = QGroupBox("Semi-3D room mapping")
        room_layout = QVBoxLayout(room_box)
        plane_row = QHBoxLayout()
        self.plane = QComboBox(); self.plane.addItems(["back_wall", "floor", "side_wall"])
        self.plane.setCurrentText(self.config.get("active_plane", "back_wall"))
        self.plane.currentTextChanged.connect(self._plane_changed)
        plane_row.addWidget(QLabel("Surface")); plane_row.addWidget(self.plane)
        self.calibrate_btn = QPushButton("Guided plane calibration"); self.calibrate_btn.clicked.connect(self._calibrate_plane)
        plane_row.addWidget(self.calibrate_btn)
        room_layout.addLayout(plane_row)
        self.grid = RoomGrid()
        room_layout.addWidget(self.grid, 1)
        self.map_status = QLabel("Unmapped target — select a surface and calibrate it with known reference points.")
        self.map_status.setWordWrap(True)
        room_layout.addWidget(self.map_status)
        body.addWidget(room_box, 0, 1, 1, 1)

        detail = QHBoxLayout()
        body.addLayout(detail, 1, 0, 1, 2)
        detect_box = QGroupBox("Detection & geometry")
        detect_form = QFormLayout(detect_box)
        self.detection_status = QLabel("Waiting for camera")
        self.pixel_readout = QLabel("—")
        self.box_readout = QLabel("—")
        self.confidence_readout = QLabel("—")
        self.world_readout = QLabel("Unmapped")
        self.angle_readout = QLabel("—")
        detect_form.addRow("Status", self.detection_status)
        detect_form.addRow("Target centre (px)", self.pixel_readout)
        detect_form.addRow("Box (px)", self.box_readout)
        detect_form.addRow("Confidence", self.confidence_readout)
        self.desired_pixel_readout = QLabel("Not calibrated")
        self.alignment_readout = QLabel("Unavailable")
        self.tolerance_readout = QLabel("—")
        detect_form.addRow("Desired boresight pixel", self.desired_pixel_readout)
        detect_form.addRow("Pixel alignment error", self.alignment_readout)
        detect_form.addRow("Within tolerance", self.tolerance_readout)
        detect_form.addRow("Mapped target (X,Y,Z)", self.world_readout)
        detect_form.addRow("Pan / elevation", self.angle_readout)
        detail.addWidget(detect_box, 1)

        control_box = QGroupBox("Operating mode · safe outputs")
        control_layout = QVBoxLayout(control_box)
        mode_row = QHBoxLayout()
        self.mode = QComboBox(); self.mode.addItems(["SIMULATION", "DRY AIMING"])
        self.mode.currentTextChanged.connect(self._mode_changed)
        mode_row.addWidget(QLabel("Mode")); mode_row.addWidget(self.mode)
        control_layout.addLayout(mode_row)
        serial_row = QHBoxLayout()
        self.port = QComboBox(); self.port.setEditable(True); self.port.addItem("")
        try:
            from serial.tools import list_ports
            for item in list_ports.comports():
                self.port.addItem(item.device)
        except Exception:
            pass
        self.port.setEditText(self.config.get("serial_port", ""))
        self.port.lineEdit().setPlaceholderText("Select or enter COM3 / /dev/ttyUSB0")
        self.baud = QComboBox(); self.baud.addItems(["9600", "19200", "57600", "115200"]); self.baud.setCurrentText(str(self.config.get("baud_rate", 9600)))
        self.serial_btn = QPushButton("Connect Arduino"); self.serial_btn.clicked.connect(self._toggle_serial)
        serial_row.addWidget(self.port, 2); serial_row.addWidget(self.baud); serial_row.addWidget(self.serial_btn)
        control_layout.addLayout(serial_row)
        self.serial_status = QLabel("Arduino: disconnected")
        control_layout.addWidget(self.serial_status)
        self.aim_btn = QPushButton("AIM TO CALIBRATED TARGET")
        self.aim_btn.clicked.connect(self._aim_target)
        control_layout.addWidget(self.aim_btn)
        self.boresight_btn = QPushButton("Set boresight reference from current target")
        self.boresight_btn.clicked.connect(self._set_boresight_reference)
        control_layout.addWidget(self.boresight_btn)
        self.stop_btn = QPushButton("STOP / NEUTRALIZE SERVOS")
        self.stop_btn.setStyleSheet("background:#9b3038; color:white; font-size:12pt; font-weight:700; padding:12px;")
        self.stop_btn.clicked.connect(self._stop)
        control_layout.addWidget(self.stop_btn)
        self.future_label = QLabel("Future hardware mode: DISABLED. No pump command exists.")
        self.future_label.setWordWrap(True)
        control_layout.addWidget(self.future_label)
        detail.addWidget(control_box, 1)

        log_box = QGroupBox("Event / serial log")
        log_layout = QVBoxLayout(log_box)
        self.log_view = QPlainTextEdit(); self.log_view.setReadOnly(True); self.log_view.setMaximumHeight(115)
        log_layout.addWidget(self.log_view)
        self.clear_log_btn = QPushButton("Clear visible log")
        self.clear_log_btn.clicked.connect(self.log_view.clear)
        log_layout.addWidget(self.clear_log_btn)
        root.addWidget(log_box)
        self._plane_changed(self.plane.currentText())
        self._mode_changed(self.mode.currentText())

    def log(self, message):
        self.log_view.appendPlainText(message)
        if self.storage is not None:
            try:
                self.storage.log_event(message)
            except Exception:
                pass

    def _save_settings(self):
        save_config(self.config)
        if self.storage is not None:
            try:
                self.storage.save_settings(self.config)
            except Exception as exc:
                self.storage_error = "SQLite settings mirror failed: {}".format(exc)
                if hasattr(self, "log_view"):
                    self.log_view.appendPlainText(self.storage_error)

    def _connect_camera(self):
        self.config["camera_width"] = self.cam_width.value()
        self.config["camera_height"] = self.cam_height.value()
        self.config["camera_fps"] = self.cam_fps.value()
        ok = self.camera.connect(self.camera_index.value(), self.cam_width.value(), self.cam_height.value(), self.cam_fps.value())
        self.tracker.update(None)
        self.latest_detection = None
        self.latest_target_world = None
        self.latest_angles = None
        self.camera_status.setText("Camera: connected" if ok else "Camera: " + self.camera.error)
        if not ok:
            self.log(self.camera.error)
        else:
            self.config["camera_index"] = self.camera_index.value()
            self.log("Camera connected at requested {}x{} / {} fps (device may negotiate settings).".format(self.config["camera_width"], self.config["camera_height"], self.config["camera_fps"]))

    def _toggle_pause(self):
        self.paused = not self.paused
        self.pause_btn.setText("Resume preview" if self.paused else "Pause preview")
        if self.paused:
            self.tracker.update(None)
            self.latest_detection = None
            self.latest_target_world = None
            self.latest_angles = None
            self.detection_status.setText("Preview paused — target invalidated")
            self.world_readout.setText("Unmapped")
            self.angle_readout.setText("—")
            self._update_alignment(None)
            self.grid.set_target(self.plane.currentText(), self.config["grid_columns"], self.config["grid_rows"], None, [])

    def _manual_test_target(self):
        width, height = self.latest_frame_size
        cx, cy = int(width / 2), int(height / 2)
        test_target = Detection((cx - 15, cy - 15, cx + 15, cy + 15), None, "manual test point")
        self.latest_detection = test_target
        self.latest_target_world = None
        self.latest_angles = None
        self.pixel_readout.setText("{}, {} (manual)".format(cx, cy))
        self._update_alignment(test_target)
        self.box_readout.setText("30 × 30 (synthetic)")
        self.confidence_readout.setText("Not applicable")
        self.detection_status.setText("MANUAL TEST POINT · frame centre (not camera detection)")
        self._map_target(test_target)
        self.log("Manual synthetic centre point selected. It is not a detected fire or real target.")

    def _update_frame(self):
        for line in self.link.read_lines():
            self.log("RX  " + line)
        if self.paused or not self.camera.connected:
            return
        frame = self.camera.read()
        if frame is None:
            self.tracker.update(None)
            self.latest_detection = None
            self.latest_target_world = None
            self.latest_angles = None
            self.world_readout.setText("Unmapped")
            self.angle_readout.setText("—")
            self.map_status.setText("Target cleared because no camera frame is available.")
            self.grid.set_target(self.plane.currentText(), self.config["grid_columns"], self.config["grid_rows"], None, [])
            self._update_alignment(None)
            if self.camera.error:
                self.camera_status.setText("Camera: " + self.camera.error)
            return
        import cv2
        h, w, channels = frame.shape
        self.latest_frame_size = (w, h)
        self.camera_status.setText("Camera: connected · {}×{}".format(w, h))
        found = self.detector.detect(frame)
        stable = self.tracker.update(found)
        self.latest_detection = stable
        if found is not None:
            x1, y1, x2, y2 = found.box
            cv2.rectangle(frame, (x1, y1), (x2, y2), (60, 205, 165), 2)
            cv2.drawMarker(frame, found.center, (0, 190, 255), cv2.MARKER_CROSS, 18, 2)
        if found is None:
            self.detection_status.setText("No simulated marker detected")
            self.pixel_readout.setText("—"); self.box_readout.setText("—"); self.confidence_readout.setText("—")
            self._update_alignment(None)
            self.latest_target_world = None
            self.latest_angles = None
            self.map_status.setText("No current simulated marker; target mapping cleared.")
            self.grid.set_target(self.plane.currentText(), self.config["grid_columns"], self.config["grid_rows"], None, [])
        else:
            self.pixel_readout.setText("{}, {}".format(*found.center))
            self._update_alignment(found)
            self.box_readout.setText("{} × {}".format(found.box[2] - found.box[0], found.box[3] - found.box[1]))
            self.confidence_readout.setText("{:.1f}%".format(found.confidence * 100) if found.confidence is not None else "Not provided (marker heuristic)")
            self.detection_status.setText("STABLE · {} consistent frames".format(self.tracker.stable_count) if stable else "Candidate · {}/{} consistent frames".format(self.tracker.stable_count, self.tracker.required_frames))
            if stable:
                self._map_target(stable)
            else:
                self.latest_target_world = None
                self.latest_angles = None
                self.map_status.setText("Target not accepted yet — waiting for consistent successive frames.")
                self.world_readout.setText("Unmapped / unstable")
                self.angle_readout.setText("—")
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        image = QImage(rgb.data, w, h, channels * w, QImage.Format_RGB888).copy()
        self.video.setPixmap(QPixmap.fromImage(image).scaled(self.video.size(), Qt.KeepAspectRatio, Qt.SmoothTransformation))

    def _update_alignment(self, detection):
        reference = self.config.get("aim_pixel_reference")
        if not reference or detection is None:
            self.desired_pixel_readout.setText("Not calibrated" if not reference else "{} (pixel)".format(reference))
            self.alignment_readout.setText("Unavailable")
            self.tolerance_readout.setText("Requires target + boresight calibration")
            return
        reference_size = self.config.get("aim_reference_resolution")
        if reference_size != list(self.latest_frame_size):
            self.desired_pixel_readout.setText("{} (pixel)".format(reference))
            self.alignment_readout.setText("Unavailable — resolution changed")
            self.tolerance_readout.setText("Repeat boresight calibration")
            return
        dx = float(detection.center[0]) - float(reference[0])
        dy = float(detection.center[1]) - float(reference[1])
        error = math.hypot(dx, dy)
        tolerance = float(self.config.get("alignment_tolerance_pixels", 20.0))
        self.desired_pixel_readout.setText("{}, {}".format(reference[0], reference[1]))
        self.alignment_readout.setText("{:.1f} px (Δx={:.1f}, Δy={:.1f})".format(error, dx, dy))
        self.tolerance_readout.setText("{} · {:.1f}px limit".format("YES" if error <= tolerance else "NO", tolerance))

    def _set_boresight_reference(self):
        if self.latest_detection is None:
            QMessageBox.warning(self, "Target required", "Detect a target or select a manual test point first.")
            return
        answer = QMessageBox.question(self, "Calibrate camera-to-turret boresight",
            "Only confirm if the turret/nozzle reference has been physically aligned to this known target at the intended test setup.\n\n"
            "This stores a pixel reference; target centring alone does not prove nozzle alignment.",
            QMessageBox.Yes | QMessageBox.No, QMessageBox.No)
        if answer != QMessageBox.Yes:
            return
        self.config["aim_pixel_reference"] = [int(v) for v in self.latest_detection.center]
        self.config["aim_reference_resolution"] = list(self.latest_frame_size)
        self._save_settings()
        self._update_alignment(self.latest_detection)
        self.log("Pixel boresight reference saved at {}. Valid only for the measured camera/turret setup.".format(self.latest_detection.center))

    def _map_target(self, detection):
        plane = self.plane.currentText()
        calibration = self.calibrations.get(plane)
        if calibration is None or not calibration.valid:
            self.latest_target_world = None
            self.latest_angles = None
            self.map_status.setText("Unmapped target — valid {} calibration required; image pixels do not reveal depth.".format(plane.replace("_", " ")))
            self.world_readout.setText("Unmapped")
            self.angle_readout.setText("—")
            self.grid.set_target(plane, self.config["grid_columns"], self.config["grid_rows"], None, [])
            return
        try:
            dimensions = [float(self.config["room_width"]), float(self.config["room_depth"]), float(self.config["room_height"])]
            if not all(math.isfinite(value) and value > 0 for value in dimensions):
                raise ValueError("room dimensions must be positive finite centimetre values")
            calibration_data = self.config.get("calibrations", {}).get(plane, {})
            calibrated_size = calibration_data.get("image_size")
            if calibrated_size != list(self.latest_frame_size):
                raise ValueError("camera resolution differs from calibration; recalibrate this plane")
            world = calibration.map_pixel(detection.center)
            camera_position = self.config["camera_position"]
            camera_orientation = self.config.get("camera_orientation", [0.0, 0.0, 0.0])
            origin = camera_to_world(self.config["camera_to_turret_offset"], camera_position, camera_orientation)
            camera_angles = self.config.get("camera_to_turret_angles", [0.0, 0.0, 0.0])
            turret_orientation = compose_orientation(camera_orientation, camera_angles)
            local_target = world_to_turret(world, origin, turret_orientation)
            angles = pan_elevation(local_target, (0.0, 0.0, 0.0))
            self.latest_target_world, self.latest_angles = world, angles
            self.world_readout.setText("{:.1f}, {:.1f}, {:.1f} cm".format(*world))
            self.angle_readout.setText("{:.1f}° / {:.1f}°".format(*angles))
            width = self.config["room_width"]
            height = self.config["room_height"]
            if plane == "floor":
                a, b = world[0] / width, world[1] / self.config["room_depth"]
            elif plane == "back_wall":
                a, b = world[0] / width, 1.0 - world[2] / height
            else:
                a, b = world[1] / self.config["room_depth"], 1.0 - world[2] / height
            columns = max(1, int(self.config["grid_columns"]))
            rows = max(1, int(self.config["grid_rows"]))
            cell = (max(0, min(columns - 1, int(a * columns))), max(0, min(rows - 1, int(b * rows))))
            reference_world = calibration_data.get("plane_points", [])
            norm_refs = []
            for ref in reference_world:
                if plane == "floor":
                    rx, ry = ref[0] / width, ref[1] / self.config["room_depth"]
                elif plane == "back_wall":
                    rx, ry = ref[0] / width, 1.0 - ref[1] / height
                else:
                    rx, ry = ref[0] / self.config["room_depth"], 1.0 - ref[1] / height
                norm_refs.append((max(0.0, min(1.0, rx)), max(0.0, min(1.0, ry))))
            self.grid.set_target(plane, columns, rows, cell, norm_refs)
            self.map_status.setText("Mapped on calibrated {}. This is a planar estimate, not 3-D reconstruction.".format(plane.replace("_", " ")))
        except Exception as exc:
            self.latest_target_world = None
            self.latest_angles = None
            self.world_readout.setText("Unmapped")
            self.angle_readout.setText("—")
            self.grid.set_target(plane, self.config["grid_columns"], self.config["grid_rows"], None, [])
            self.map_status.setText("Unmapped target: {}".format(exc))

    def _plane_changed(self, plane):
        self.config["active_plane"] = plane
        self._map_target(self.latest_detection) if self.latest_detection else None
        if plane not in self.calibrations:
            self.map_status.setText("Unmapped target — calibrate the {} surface using four known points.".format(plane.replace("_", " ")))

    def _calibrate_plane(self):
        plane = self.plane.currentText()
        image_width, image_height = self.latest_frame_size
        instructions = ("Enter four-or-more correspondences as semicolon-separated pairs.\n"
            "Image points are raw camera-frame pixels (origin top-left), not scaled preview-widget coordinates.\n"
            "Current camera frame: {} × {} pixels.\n"
            "{} plane points in centimetres: x,y where those axes are known.\n"
            "Prefilled room values are examples only; replace all coordinates with measured corners/grid intersections.".format(image_width, image_height, plane.replace("_", " ").title()))
        image_sample = "0,0; {},0; {},{}; 0,{}".format(image_width, image_width, image_height, image_height)
        image_text, ok = QInputDialog.getText(self, "Calibration step 1/2", instructions,
            text=image_sample)
        if not ok:
            return
        plane_hint = {"floor": "X,Y", "back_wall": "X,Z", "side_wall": "Y,Z"}[plane]
        room_width = float(self.config["room_width"])
        room_depth = float(self.config["room_depth"])
        room_height = float(self.config["room_height"])
        if plane == "floor":
            sample_world = "0,0; {},0; {},{}; 0,{}".format(room_width, room_width, room_depth, room_depth)
        elif plane == "back_wall":
            sample_world = "0,{}; {},{}; {},0; 0,0".format(room_height, room_width, room_height, room_width)
        else:
            sample_world = "0,{}; {},{}; {},0; 0,0".format(room_height, room_depth, room_height, room_depth)
        world_text, ok = QInputDialog.getText(self, "Calibration step 2/2", "Enter matching {} coordinates in cm, same order:".format(plane_hint),
            text=sample_world)
        if not ok:
            return
        try:
            parse = lambda text: [[float(v.strip()) for v in pair.split(",")] for pair in text.split(";")]
            image_points, plane_points = parse(image_text), parse(world_text)
            calibration = PlaneCalibration(plane, image_points, plane_points)
            self.calibrations[plane] = calibration
            calibration_data = {"matrix": calibration.matrix.tolist(),
                "image_points": image_points, "plane_points": plane_points,
                "image_size": [image_width, image_height]}
            self.config.setdefault("calibrations", {})[plane] = calibration_data
            self._save_settings()
            if self.storage is not None:
                try:
                    self.storage.save_calibration(plane, calibration_data)
                except Exception as exc:
                    self.log("SQLite calibration table update failed: {}".format(exc))
            self.log("{} plane calibration saved. Accuracy depends on measured reference points.".format(plane.replace("_", " ").title()))
            if self.latest_detection:
                self._map_target(self.latest_detection)
        except Exception as exc:
            QMessageBox.warning(self, "Calibration not saved", str(exc))

    def _mode_changed(self, mode):
        dry = mode == "DRY AIMING"
        self.aim_btn.setText("SEND DRY AIM COMMAND" if dry else "SIMULATE AIM CALCULATION")
        self.log("Mode selected: {}. {}".format(mode, "Physical servo movement is possible." if dry else "No physical output will be sent."))

    def _toggle_serial(self):
        if self.link.connected:
            self.link.disconnect()
            self.serial_btn.setText("Connect Arduino")
            self.serial_status.setText("Arduino: disconnected")
            self.log("Serial disconnected")
            return
        self.link.baud = int(self.baud.currentText())
        self.link.pan_limits = tuple(self.config["servo_pan_limits"])
        self.link.tilt_limits = tuple(self.config["servo_tilt_limits"])
        if not self.port.currentText().strip():
            QMessageBox.warning(self, "Serial port required", "Enter a serial port name. No port is assumed.")
            return
        if self.link.connect(self.port.currentText().strip()):
            self.serial_btn.setText("Disconnect Arduino")
            self.serial_status.setText("Arduino: connected (dry pan/tilt only)")
            self.config["serial_port"] = self.port.currentText().strip()
            self.config["baud_rate"] = self.link.baud
            self._save_settings()
            self.log("Serial connected to {} at {} baud".format(self.port.currentText().strip(), self.link.baud))
        else:
            self.serial_status.setText("Arduino: connection error")
            QMessageBox.warning(self, "Serial connection failed", self.link.last_error)

    def _aim_target(self):
        if self.latest_target_world is None or self.latest_angles is None:
            QMessageBox.warning(self, "Target unavailable", "Require a stable target and valid calibration for the selected plane.")
            return
        pan, elev = self.latest_angles
        try:
            pan_servo = servo_command(pan, self.config["servo_zero_pan"], self.config["pan_inverted"], self.config["servo_pan_limits"])
            tilt_servo = servo_command(elev, self.config["servo_zero_tilt"], self.config["tilt_inverted"], self.config["servo_tilt_limits"])
        except ValueError as exc:
            QMessageBox.warning(self, "Safe limit blocked aim", str(exc))
            return
        if self.mode.currentText() == "SIMULATION":
            self.log("SIM AIM: target {} cm, geometric pan/elevation {:.1f}°/{:.1f}°, servo command {}/{} (not sent).".format(
                tuple(round(v, 1) for v in self.latest_target_world), pan, elev, pan_servo, tilt_servo))
            return
        if not self.link.connected:
            QMessageBox.warning(self, "Dry aiming unavailable", "Connect the configured Arduino first. No movement was sent.")
            return
        try:
            command = self.link.send_angles(pan_servo, tilt_servo)
            self.log("TX  " + command.strip() + " (dry aiming; pump disabled)")
        except Exception as exc:
            QMessageBox.warning(self, "Aim command failed", str(exc))

    def _stop(self):
        if self.link.connected:
            try:
                self.link.send_stop()
                self.log("TX  STOP — Arduino instructed to return to neutral")
            except Exception as exc:
                self.log("STOP send failed: {}".format(exc))
        else:
            self.log("Software stop selected; no connected hardware. Physical cutoff remains independent.")
        self.latest_angles = None

    def closeEvent(self, event):
        self.camera.disconnect()
        self.link.disconnect()
        try:
            self._save_settings()
        except Exception as exc:
            self.log("Settings were not saved: {}".format(exc))
        event.accept()
