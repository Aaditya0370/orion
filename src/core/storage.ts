/**
 * Offline storage for settings, plane calibrations, and event logs.
 * Mirrors the SQLite SettingsStore behavior in orion/storage.py.
 */

import { OrionConfig, PlaneCalibrationData, LogEntry } from '../types';

export const DEFAULT_CONFIG: OrionConfig = {
  camera_index: 0,
  camera_width: 640,
  camera_height: 480,
  camera_fps: 30,
  detector_mode: 'opencv_marker',
  yolo_model: '',
  marker_hsv_low: [0, 90, 80],
  marker_hsv_high: [25, 255, 255],
  stability_frames: 4,
  aim_pixel_reference: null,
  aim_reference_resolution: null,
  alignment_tolerance_pixels: 20,
  active_plane: 'back_wall',
  room_width: 400,
  room_depth: 500,
  room_height: 250,
  grid_columns: 8,
  grid_rows: 5,
  camera_position: [200, 400, 120],
  camera_orientation: [0, 0, 0],
  camera_to_turret_offset: [0, 0, -120],
  camera_to_turret_angles: [0, 0, 180],
  servo_zero_pan: 90,
  servo_zero_tilt: 90,
  servo_pan_limits: [20, 160],
  servo_tilt_limits: [25, 155],
  pan_inverted: false,
  tilt_inverted: false,
  serial_port: 'COM3 (Virtual Arduino)',
  baud_rate: 9600,
  future_hardware_enabled: false,
  calibrations: {},
};

const SETTINGS_KEY = 'orion_fireguard_settings';
const CALIBRATIONS_KEY = 'orion_fireguard_calibrations';
const EVENTS_KEY = 'orion_fireguard_events';

// In-memory fallback if localStorage is unavailable
const memoryStore = new Map<string, string>();

function getItem(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
  } catch {
    // fallback
  }
  return memoryStore.get(key) ?? null;
}

function setItem(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
      return;
    }
  } catch {
    // fallback
  }
  memoryStore.set(key, value);
}

export class SettingsStore {
  constructor() {
    this.init();
  }

  private init(): void {
    if (!getItem(SETTINGS_KEY)) {
      setItem(SETTINGS_KEY, JSON.stringify(DEFAULT_CONFIG));
    }
    if (!getItem(CALIBRATIONS_KEY)) {
      setItem(CALIBRATIONS_KEY, JSON.stringify({}));
    }
    if (!getItem(EVENTS_KEY)) {
      setItem(EVENTS_KEY, JSON.stringify([]));
    }
  }

  load_settings(): Partial<OrionConfig> {
    try {
      const data = getItem(SETTINGS_KEY);
      if (!data) return { ...DEFAULT_CONFIG };
      return JSON.parse(data);
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }

  save_settings(config: OrionConfig): void {
    try {
      setItem(SETTINGS_KEY, JSON.stringify(config));
    } catch (e) {
      console.error('Failed to save settings:', e);
    }
  }

  save_calibration(plane: string, calibrationData: PlaneCalibrationData): void {
    try {
      const calibrations = this.load_calibrations();
      calibrations[plane] = calibrationData;
      setItem(CALIBRATIONS_KEY, JSON.stringify(calibrations));
    } catch (e) {
      console.error('Failed to save calibration:', e);
    }
  }

  load_calibrations(): Record<string, PlaneCalibrationData> {
    try {
      const data = getItem(CALIBRATIONS_KEY);
      if (!data) return {};
      return JSON.parse(data);
    } catch {
      return {};
    }
  }

  log_event(message: string): void {
    try {
      const events: LogEntry[] = this.load_raw_events();
      const newEntry: LogEntry = {
        id: Date.now() + Math.random(),
        created: Date.now() / 1000,
        message,
      };
      events.push(newEntry);
      if (events.length > 1000) {
        events.shift();
      }
      setItem(EVENTS_KEY, JSON.stringify(events));
    } catch (e) {
      console.error('Failed to log event:', e);
    }
  }

  private load_raw_events(): LogEntry[] {
    try {
      const data = getItem(EVENTS_KEY);
      if (!data) return [];
      return JSON.parse(data);
    } catch {
      return [];
    }
  }


  load_events(limit = 100): string[] {
    const raw = this.load_raw_events();
    const clampedLimit = Math.max(1, Math.min(1000, limit));
    const sliced = raw.slice(-clampedLimit);
    return sliced.map((e) => e.message);
  }
}
