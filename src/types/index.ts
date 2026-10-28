export interface PlaneCalibrationData {
  matrix: number[][];
  image_points: [number, number][];
  plane_points: [number, number][];
  image_size: [number, number];
}

export type PlaneType = 'back_wall' | 'floor' | 'side_wall';

export type OperatingMode = 'SIMULATION' | 'DRY AIMING';

export interface OrionConfig {
  camera_index: number;
  camera_width: number;
  camera_height: number;
  camera_fps: number;
  detector_mode: 'opencv_marker' | 'yolo';
  yolo_model: string;
  marker_hsv_low: [number, number, number];
  marker_hsv_high: [number, number, number];
  stability_frames: number;
  aim_pixel_reference: [number, number] | null;
  aim_reference_resolution: [number, number] | null;
  alignment_tolerance_pixels: number;
  active_plane: PlaneType;
  room_width: number;
  room_depth: number;
  room_height: number;
  grid_columns: number;
  grid_rows: number;
  camera_position: [number, number, number];
  camera_orientation: [number, number, number];
  camera_to_turret_offset: [number, number, number];
  camera_to_turret_angles: [number, number, number];
  servo_zero_pan: number;
  servo_zero_tilt: number;
  servo_pan_limits: [number, number];
  servo_tilt_limits: [number, number];
  pan_inverted: boolean;
  tilt_inverted: boolean;
  serial_port: string;
  baud_rate: number;
  future_hardware_enabled: boolean;
  calibrations: Record<string, PlaneCalibrationData>;
}

export interface DetectionResult {
  box: [number, number, number, number]; // [x1, y1, x2, y2]
  center: [number, number]; // [cx, cy]
  confidence: number | null;
  label: string;
}

export interface LogEntry {
  id: number;
  created: number;
  message: string;
  type?: 'HIST' | 'RX' | 'TX' | 'INFO' | 'ERR' | 'WARN';
}
