import math
import os
import tempfile
import unittest

from orion.camera import Camera
from orion.detection import StableTarget, TargetDetector
from orion.geometry import camera_to_world, compose_orientation, pan_elevation, servo_command, world_to_turret
from orion.mapping import PlaneCalibration
from orion.serial_link import format_aim, parse_message, validate_angles
from orion.storage import SettingsStore


class GeometryTests(unittest.TestCase):
    def test_pan_elevation_axes(self):
        pan, elevation = pan_elevation((1, 1, 1), (0, 0, 0))
        self.assertAlmostEqual(pan, 45.0)
        self.assertAlmostEqual(elevation, math.degrees(math.atan2(1, math.sqrt(2))))

    def test_coordinate_frame_translation_and_rotation(self):
        self.assertEqual(camera_to_world((1, 0, 0), (2, 3, 4)), (3.0, 3.0, 4.0))
        rotated = camera_to_world((0, 1, 0), (0, 0, 0), (0, 0, 90))
        self.assertAlmostEqual(rotated[0], -1.0)
        self.assertAlmostEqual(rotated[1], 0.0)
        local = world_to_turret((0, 1, 0), (0, 0, 0), (0, 0, 90))
        self.assertAlmostEqual(local[0], 1.0)
        self.assertAlmostEqual(local[1], 0.0)
        composed = compose_orientation((0, 0, 90), (0, 0, 90))
        self.assertAlmostEqual(abs(composed[2]), 180.0)

    def test_servo_safe_range(self):
        self.assertEqual(servo_command(10, 90, False, (20, 160)), 100)
        with self.assertRaises(ValueError):
            servo_command(80, 90, False, (20, 160))


class MappingTests(unittest.TestCase):
    def test_known_square_mapping(self):
        image = [(0, 0), (100, 0), (100, 100), (0, 100)]
        world = [(0, 0), (10, 0), (10, 10), (0, 10)]
        calibration = PlaneCalibration("back_wall", image, world)
        result = calibration.map_pixel((50, 50))
        self.assertAlmostEqual(result[0], 5)
        self.assertAlmostEqual(result[2], 5)
        self.assertEqual(result[1], 0)
        with self.assertRaises(ValueError):
            calibration.map_pixel((120, 50))

    def test_missing_calibration_is_not_mapped(self):
        with self.assertRaises(ValueError):
            PlaneCalibration("floor").map_pixel((10, 10))


class FallbackTests(unittest.TestCase):
    def test_unconfigured_yolo_and_disconnected_camera(self):
        detector = TargetDetector("yolo", "")
        self.assertIn("not configured", detector.last_error)
        self.assertIsNone(detector.detect(None))
        camera = Camera()
        self.assertIsNone(camera.read())

    def test_detection_stability_requires_multiple_frames(self):
        from orion.detection import Detection
        stable = StableTarget(3, 20)
        point = Detection((10, 10, 30, 30))
        self.assertIsNone(stable.update(point))
        self.assertIsNone(stable.update(Detection((11, 10, 31, 30))))
        self.assertIsNotNone(stable.update(Detection((10, 11, 30, 31))))


class StorageTests(unittest.TestCase):
    def test_sqlite_settings_calibration_and_log_storage(self):
        with tempfile.TemporaryDirectory() as folder:
            path = os.path.join(folder, "test.db")
            store = SettingsStore(path)
            config = {"mode": "SIMULATION"}
            store.save_settings(config)
            self.assertEqual(store.load_settings(), config)
            calibration = {"matrix": [[1, 0, 0], [0, 1, 0], [0, 0, 1]]}
            store.save_calibration("floor", calibration)
            self.assertEqual(store.load_calibrations()["floor"], calibration)
            store.log_event("synthetic test event")
            self.assertEqual(store.load_events(1), ["synthetic test event"])


class SerialTests(unittest.TestCase):
    def test_valid_protocol(self):
        self.assertEqual(format_aim(90, 90), "AIM,90,90\n")
        self.assertEqual(parse_message("STATUS,READY"), ("STATUS", "READY"))
        self.assertEqual(parse_message("AIM,90,90"), ("AIM", 90, 90))

    def test_invalid_and_out_of_range_commands(self):
        for message in ("AIM,999,90", "AIM,1.2,90", "PUMP,1", "AIM,90"):
            with self.assertRaises(ValueError):
                parse_message(message)
        with self.assertRaises(ValueError):
            validate_angles(10, 90)
        with self.assertRaises(ValueError):
            validate_angles(90, 90, (-10, 200), (0, 180))


if __name__ == "__main__":
    unittest.main()
