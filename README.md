# ORION FIREGUARD

Offline-first desktop demonstration of simulated-target vision, calibrated planar room mapping, and manually commanded pan–tilt servos. It is designed for printed, high-contrast markers/LED targets in a school exhibition. **The OpenCV fallback is a colour-marker heuristic, not a real-fire detector. Do not test with an open flame.**

## Project layout

```text
main.py                    PySide6 application entry point
orion/
  camera.py                webcam connection and frame access
  config.py                settings defaults and JSON persistence
  detection.py             optional YOLO and simulated-marker detection
  geometry.py              world/turret transforms and safe angle conversion
  gui.py                   desktop dashboard and user interactions
  mapping.py               calibrated planar homographies
  serial_link.py           validated dry-aim ASCII serial protocol
  storage.py               local SQLite settings/calibration/event persistence
arduino/orion_pan_tilt.ino matching two-servo receiver; no pump output
config.json                editable room, camera, offset, and servo settings
orion_fireguard.db         local SQLite settings, calibrations, and event log (created at runtime)
tests/test_core.py         geometry, mapping, protocol, persistence, fallback tests
requirements.txt
setup_windows.bat
```

## Install and launch

Use a current 64-bit Python (3.10 or 3.11 recommended) on Windows. The core GUI needs PySide6, OpenCV, NumPy, and pySerial. `requirements.txt` contains these runtime packages. Ultralytics is optional and not required for offline marker-based operation.

1. Install the listed packages in your normal Python environment.
2. Open this project folder and start `main.py` from your Python IDE, or use `setup_windows.bat` to install the requirements and start the app on Windows.
3. Click **Connect camera**. Device index 0 is the default; width, height, and requested frame rate are configurable in the camera controls. A camera may negotiate different values or be unavailable if another application owns it.
4. Use a bright orange/red printed marker under suitable lighting. Hue limits are in `config.json` (`marker_hsv_low` / `marker_hsv_high`). This detector only finds a colour blob above a minimum area.

The source avoids newer Python language syntax where practical, but PySide6 releases do not support Python 3.6. Use a currently supported Python runtime as above. `config.json` is the editable configuration and settings are mirrored to `orion_fireguard.db` (SQLite), which also stores calibration records and event logs.

### Optional YOLO

The detection module can load an Ultralytics-compatible local model by setting `detector_mode` to `yolo` and `yolo_model` to a model file path. YOLO package/model setup is optional and not included in the core requirements. Without a usable model, the detector uses the OpenCV colour-marker fallback. No model is downloaded by the application.

## Room and calibration

Edit `config.json` for `room_width`, `room_depth`, `room_height` (centimetres), `grid_columns`, and `grid_rows`. The room axes are +X right, +Y from the back wall toward the room, +Z upward. The configured camera position/orientation and `camera_to_turret_offset` / `camera_to_turret_angles` define the turret reference relative to the camera; the position offset is in camera-local axes and angular offset is composed as a local XYZ Euler rotation. The starter values place the camera 120 cm above a turret on the floor, with the turret oriented toward the back wall, and are examples only—measure and replace them. Servo zero, inversion, and mechanical limits are also in the JSON settings.

Calibrate each surface independently using **Guided plane calibration**:

- Choose `back_wall` (known X,Z points), `floor` (X,Y), or `side_wall` (Y,Z).
- Enter at least four image pixel points and matching measured coordinates in centimetres, in the same order. Points should be spread over the visible plane and non-collinear; use measured corners/grid intersections.
- The image points correspond to the camera image resolution. Recalibrate if that resolution/camera setup changes.
- The app stores a planar homography. It maps pixels only to that selected calibrated plane, and rejects pixels outside the calibrated image-point region; it cannot infer depth or reconstruct arbitrary 3-D targets from one camera image. Missing/invalid calibration remains explicitly unmapped.

Calibration accuracy has not been established for a physical setup. No centimetre-level performance is claimed. The room panel marks the mapped cell and calibration references; any estimate depends on the surveyed points and the surface actually containing the target.

For pixel-space feedback, first physically align the camera/turret to a known target, then use **Set boresight reference from current target** and confirm the warning. This stores a desired image pixel and compares later target pixels against the configured tolerance. It is not proof of nozzle alignment at arbitrary depths or after the rig moves; repeat calibration when the setup changes. Without this measured reference, the dashboard reports alignment as unavailable.

## Safe operation

- **SIMULATION** calculates coordinates and servo angles and does not send output.
- **DRY AIMING** can send a command only after a stable target, valid selected-plane calibration, safe angle conversion, and explicit **SEND DRY AIM COMMAND** click. It moves only pan/tilt servos. Keep people clear and test with servos unloaded where possible.
- **STOP / NEUTRALIZE SERVOS** sends `STOP` to return configured Arduino neutral angles if connected. It is a software command, **not a physical emergency cutoff**; provide an independent physical power cutoff during hardware testing.
- **Future hardware mode is disabled**. This project has no pump command or pump wiring. Any future water system requires separate engineering review, electrical isolation, appropriate driver circuitry, splash protection, and an independent physical cutoff. Never connect a pump to this prototype.

### Serial protocol

Default baud rate is 9600; the user selects an enumerated port or enters one manually. No board or port is assumed.

```text
Host -> board: AIM,<pan>,<tilt>\n    (whole degrees; app and sketch enforce their configured limits)
Host -> board: STOP\n                  (return to neutral)
Board -> host: STATUS,READY\n
Board -> host: STATUS,MOVED,<pan>,<tilt>\n
Board -> host: ERR,<reason>\n
```

Update the Arduino sketch's pins, baud, neutral positions, and mechanical limits for the actual board/servos. The sketch has no pump output. Match its limits with `config.json`; the host intentionally rejects out-of-range commands. The first movement must be supervised and verified with the mechanism physically clear.

## Tests and verification status

Automated unit tests are provided for pan/elevation, coordinate transformations, safe servo limits, missing calibration, bounded planar homography mapping, detection stability, missing camera/model states, SQLite persistence, and serial command validation. They use synthetic points and do not require a camera or Arduino. Run the tests from a Python test runner/IDE using `unittest` discovery. **Tests have not been executed in this workspace, and no physical camera, Arduino, servo, or calibration measurement has been tested.**

The manual centre-point button creates a clearly labelled synthetic test point; it is not a camera detection. Use it for geometry/calibration demonstration without pretending hardware is connected.

## Troubleshooting

- **Camera unavailable / occupied:** close camera applications, verify Windows privacy permission, try another device index, then reconnect. Requested resolution/FPS may be unsupported by the camera.
- **No marker:** provide bright, even lighting; use an orange/red marker with a large solid area; tune the HSV bounds in `config.json`. This is not suitable for general fire recognition.
- **Unmapped target:** confirm the correct plane is selected and calibrated with at least four valid known points. A pixel alone has no depth.
- **Bad-looking coordinates:** confirm measured points use the plane axes and centimetres, image points use the camera's actual resolution, and room dimensions/camera-to-turret offsets are correct.
- **Serial error:** verify the configured port, baud, USB driver, sketch, and matching mechanical limits. Close other serial monitors. The board may reset on connection; wait for `STATUS,READY`.
- **Servo motion is reversed or unsafe:** disconnect servo power before changing `pan_inverted`, `tilt_inverted`, offsets, or limit settings. Verify neutral and limits on the actual mechanism before reconnecting.
- **Missing GUI/dependencies:** install the requirements in a supported Python version. YOLO is optional; no network access is needed for core features.
