"""JSON settings with safe defaults and tolerant loading."""
import json
import os

DEFAULTS = {
    "camera_index": 0,
    "camera_width": 640,
    "camera_height": 480,
    "camera_fps": 30,
    "detector_mode": "opencv_marker",
    "yolo_model": "",
    "marker_hsv_low": [0, 90, 80],
    "marker_hsv_high": [25, 255, 255],
    "stability_frames": 4,
    "aim_pixel_reference": None,
    "aim_reference_resolution": None,
    "alignment_tolerance_pixels": 20.0,
    "active_plane": "back_wall",
    "room_width": 400.0,
    "room_depth": 500.0,
    "room_height": 250.0,
    "grid_columns": 8,
    "grid_rows": 5,
    "camera_position": [200.0, 400.0, 120.0],
    "camera_orientation": [0.0, 0.0, 0.0],
    "camera_to_turret_offset": [0.0, 0.0, -120.0],
    "camera_to_turret_angles": [0.0, 0.0, 180.0],
    "servo_zero_pan": 90.0,
    "servo_zero_tilt": 90.0,
    "servo_pan_limits": [20, 160],
    "servo_tilt_limits": [25, 155],
    "pan_inverted": False,
    "tilt_inverted": False,
    "serial_port": "",
    "baud_rate": 9600,
    "serial_protocol": "AIM,<pan>,<tilt>\\n; reply STATUS,READY or ERR,<reason>",
    "future_hardware_enabled": False,
    "calibrations": {}
}


def load_config(path="config.json"):
    config = dict(DEFAULTS)
    if os.path.exists(path):
        try:
            with open(path, "r") as handle:
                saved = json.load(handle)
            if isinstance(saved, dict):
                config.update(saved)
        except (ValueError, IOError):
            pass
    return config


def save_config(config, path="config.json"):
    with open(path, "w") as handle:
        json.dump(config, handle, indent=2, sort_keys=True)
