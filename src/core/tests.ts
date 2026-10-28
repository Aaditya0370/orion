/**
 * Interactive test runner ported from test_core.py.
 * Verifies geometry, planar mapping, fallback detection, storage, and serial protocol.
 */

import {
  pan_elevation,
  camera_to_world,
  world_to_turret,
  compose_orientation,
  servo_command,
} from './geometry';
import { PlaneCalibration } from './mapping';
import { TargetDetector, StableTarget, Detection } from './detection';
import { format_aim, parse_message, validate_angles } from './serial';
import { SettingsStore } from './storage';

export interface TestResult {
  suite: string;
  name: string;
  passed: boolean;
  error?: string;
}

export function runAllCoreTests(): TestResult[] {
  const results: TestResult[] = [];

  function assert(condition: boolean, msg: string) {
    if (!condition) throw new Error(msg);
  }

  function assertAlmostEqual(a: number, b: number, precision = 4) {
    const diff = Math.abs(a - b);
    const tol = Math.pow(10, -precision);
    if (diff > tol) {
      throw new Error(`Expected ${a} to be almost equal to ${b} (diff=${diff}, tol=${tol})`);
    }
  }

  // 1. GeometryTests
  try {
    const [pan, elevation] = pan_elevation([1, 1, 1], [0, 0, 0]);
    assertAlmostEqual(pan, 45.0);
    assertAlmostEqual(elevation, (Math.atan2(1, Math.SQRT2) * 180.0) / Math.PI);
    results.push({ suite: 'GeometryTests', name: 'test_pan_elevation_axes', passed: true });
  } catch (e: any) {
    results.push({ suite: 'GeometryTests', name: 'test_pan_elevation_axes', passed: false, error: e.message });
  }

  try {
    const p1 = camera_to_world([1, 0, 0], [2, 3, 4]);
    assert(p1[0] === 3.0 && p1[1] === 3.0 && p1[2] === 4.0, `camera_to_world translation mismatch`);

    const rotated = camera_to_world([0, 1, 0], [0, 0, 0], [0, 0, 90]);
    assertAlmostEqual(rotated[0], -1.0);
    assertAlmostEqual(rotated[1], 0.0);

    const local = world_to_turret([0, 1, 0], [0, 0, 0], [0, 0, 90]);
    assertAlmostEqual(local[0], 1.0);
    assertAlmostEqual(local[1], 0.0);

    const composed = compose_orientation([0, 0, 90], [0, 0, 90]);
    assertAlmostEqual(Math.abs(composed[2]), 180.0);
    results.push({ suite: 'GeometryTests', name: 'test_coordinate_frame_translation_and_rotation', passed: true });
  } catch (e: any) {
    results.push({ suite: 'GeometryTests', name: 'test_coordinate_frame_translation_and_rotation', passed: false, error: e.message });
  }

  try {
    const cmd = servo_command(10, 90, false, [20, 160]);
    assert(cmd === 100, `Expected servo command 100, got ${cmd}`);
    let threw = false;
    try {
      servo_command(80, 90, false, [20, 160]);
    } catch {
      threw = true;
    }
    assert(threw, `Expected servo_command out of range to throw`);
    results.push({ suite: 'GeometryTests', name: 'test_servo_safe_range', passed: true });
  } catch (e: any) {
    results.push({ suite: 'GeometryTests', name: 'test_servo_safe_range', passed: false, error: e.message });
  }

  // 2. MappingTests
  try {
    const image: [number, number][] = [[0, 0], [100, 0], [100, 100], [0, 100]];
    const world: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const calibration = new PlaneCalibration('back_wall', image, world);
    const result = calibration.map_pixel([50, 50]);
    assertAlmostEqual(result[0], 5.0);
    assertAlmostEqual(result[2], 5.0);
    assert(result[1] === 0, `Expected Y=0 on back_wall`);

    let threw = false;
    try {
      calibration.map_pixel([120, 50]);
    } catch {
      threw = true;
    }
    assert(threw, `Expected map_pixel outside hull to throw`);
    results.push({ suite: 'MappingTests', name: 'test_known_square_mapping', passed: true });
  } catch (e: any) {
    results.push({ suite: 'MappingTests', name: 'test_known_square_mapping', passed: false, error: e.message });
  }

  try {
    let threw = false;
    try {
      new PlaneCalibration('floor').map_pixel([10, 10]);
    } catch {
      threw = true;
    }
    assert(threw, `Expected missing calibration to throw`);
    results.push({ suite: 'MappingTests', name: 'test_missing_calibration_is_not_mapped', passed: true });
  } catch (e: any) {
    results.push({ suite: 'MappingTests', name: 'test_missing_calibration_is_not_mapped', passed: false, error: e.message });
  }

  // 3. FallbackTests
  try {
    const detector = new TargetDetector('yolo', '');
    assert(detector.lastError.includes('not configured'), `Expected 'not configured' in error`);
    assert(detector.detect(null) === null, `Expected null for null frame`);
    results.push({ suite: 'FallbackTests', name: 'test_unconfigured_yolo_and_disconnected_camera', passed: true });
  } catch (e: any) {
    results.push({ suite: 'FallbackTests', name: 'test_unconfigured_yolo_and_disconnected_camera', passed: false, error: e.message });
  }

  try {
    const stable = new StableTarget(3, 20);
    const point = new Detection([10, 10, 30, 30]);
    assert(stable.update(point) === null, `Frame 1 should not be stable yet`);
    assert(stable.update(new Detection([11, 10, 31, 30])) === null, `Frame 2 should not be stable yet`);
    assert(stable.update(new Detection([10, 11, 30, 31])) !== null, `Frame 3 should be stable`);
    results.push({ suite: 'FallbackTests', name: 'test_detection_stability_requires_multiple_frames', passed: true });
  } catch (e: any) {
    results.push({ suite: 'FallbackTests', name: 'test_detection_stability_requires_multiple_frames', passed: false, error: e.message });
  }

  // 4. StorageTests
  try {
    const store = new SettingsStore();
    const config = { ...store.load_settings(), active_plane: 'back_wall' as const };
    store.save_settings(config as any);
    assert(store.load_settings().active_plane === 'back_wall', `Config persistence failed`);
    store.log_event('synthetic test event');
    const logs = store.load_events(1);
    assert(logs.length > 0 && logs[logs.length - 1] === 'synthetic test event', `Event logging failed`);
    results.push({ suite: 'StorageTests', name: 'test_sqlite_settings_calibration_and_log_storage', passed: true });
  } catch (e: any) {
    results.push({ suite: 'StorageTests', name: 'test_sqlite_settings_calibration_and_log_storage', passed: false, error: e.message });
  }

  // 5. SerialTests
  try {
    assert(format_aim(90, 90) === 'AIM,90,90\n', `format_aim mismatch`);
    const ready = parse_message('STATUS,READY');
    assert(ready.type === 'STATUS' && ready.status === 'READY', `parse STATUS,READY mismatch`);
    const aim = parse_message('AIM,90,90');
    assert(aim.type === 'AIM' && aim.pan === 90 && aim.tilt === 90, `parse AIM,90,90 mismatch`);
    results.push({ suite: 'SerialTests', name: 'test_valid_protocol', passed: true });
  } catch (e: any) {
    results.push({ suite: 'SerialTests', name: 'test_valid_protocol', passed: false, error: e.message });
  }

  try {
    for (const msg of ['AIM,999,90', 'AIM,1.2,90', 'PUMP,1', 'AIM,90']) {
      let threw = false;
      try {
        parse_message(msg);
      } catch {
        threw = true;
      }
      assert(threw, `Expected '${msg}' to be rejected`);
    }

    let threw = false;
    try {
      validate_angles(10, 90);
    } catch {
      threw = true;
    }
    assert(threw, `Expected validate_angles(10, 90) out of limits to throw`);
    results.push({ suite: 'SerialTests', name: 'test_invalid_and_out_of_range_commands', passed: true });
  } catch (e: any) {
    results.push({ suite: 'SerialTests', name: 'test_invalid_and_out_of_range_commands', passed: false, error: e.message });
  }

  return results;
}
