/**
 * Coordinate and pan/tilt geometry in a right-handed world frame.
 * World axes: +X right, +Y forward from the back wall, +Z up. Angles are degrees.
 * Ported directly from orion/geometry.py
 */

export function rotate_xyz(
  point: [number, number, number],
  orientation_degrees: [number, number, number]
): [number, number, number] {
  let [x, y, z] = point.map(Number);
  const [roll, pitch, yaw] = orientation_degrees.map((v) => (Number(v) * Math.PI) / 180.0);

  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);

  // Roll (X)
  const y1 = y * cr - z * sr;
  const z1 = y * sr + z * cr;
  y = y1;
  z = z1;

  // Pitch (Y)
  const x2 = x * cp + z * sp;
  const z2 = -x * sp + z * cp;
  x = x2;
  z = z2;

  // Yaw (Z)
  return [x * cy - y * sy, x * sy + y * cy, z];
}

export function camera_to_world(
  point: [number, number, number],
  camera_position: [number, number, number],
  camera_orientation: [number, number, number] = [0, 0, 0]
): [number, number, number] {
  const rotated = rotate_xyz(point, camera_orientation);
  return [
    Number(camera_position[0]) + rotated[0],
    Number(camera_position[1]) + rotated[1],
    Number(camera_position[2]) + rotated[2],
  ];
}

export function compose_orientation(
  base_degrees: [number, number, number],
  local_offset_degrees: [number, number, number]
): [number, number, number] {
  function matrix_for(angles: [number, number, number]): number[][] {
    const [roll, pitch, yaw] = angles.map((v) => (Number(v) * Math.PI) / 180.0);
    const cr = Math.cos(roll);
    const sr = Math.sin(roll);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);

    return [
      [cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr],
      [sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr],
      [-sp, cp * sr, cp * cr],
    ];
  }

  const first = matrix_for(base_degrees);
  const second = matrix_for(local_offset_degrees);

  const combined: number[][] = Array.from({ length: 3 }, (_, row) =>
    Array.from({ length: 3 }, (_, col) =>
      first[row][0] * second[0][col] +
      first[row][1] * second[1][col] +
      first[row][2] * second[2][col]
    )
  );

  const pitch = Math.asin(Math.max(-1.0, Math.min(1.0, -combined[2][0])));
  let roll = 0.0;
  let yaw = 0.0;

  if (Math.abs(Math.cos(pitch)) > 1e-8) {
    roll = Math.atan2(combined[2][1], combined[2][2]);
    yaw = Math.atan2(combined[1][0], combined[0][0]);
  } else {
    roll = 0.0;
    yaw = Math.atan2(-combined[0][1], combined[1][1]);
  }

  return [(roll * 180.0) / Math.PI, (pitch * 180.0) / Math.PI, (yaw * 180.0) / Math.PI];
}

export function world_to_turret(
  point: [number, number, number],
  turret_origin: [number, number, number],
  turret_orientation: [number, number, number] = [0, 0, 0]
): [number, number, number] {
  let x = Number(point[0]) - Number(turret_origin[0]);
  let y = Number(point[1]) - Number(turret_origin[1]);
  let z = Number(point[2]) - Number(turret_origin[2]);

  const [roll, pitch, yaw] = turret_orientation.map((v) => (Number(v) * Math.PI) / 180.0);

  // Invert the forward transform: Rz(yaw), then Ry(pitch), then Rx(roll).
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);
  const cosRoll = Math.cos(roll);
  const sinRoll = Math.sin(roll);

  // Inv Yaw
  const x1 = x * cosYaw + y * sinYaw;
  const y1 = -x * sinYaw + y * cosYaw;
  x = x1;
  y = y1;

  // Inv Pitch
  const x2 = x * cosPitch - z * sinPitch;
  const z2 = x * sinPitch + z * cosPitch;
  x = x2;
  z = z2;

  // Inv Roll
  const y3 = y * cosRoll + z * sinRoll;
  const z3 = -y * sinRoll + z * cosRoll;

  return [x, y3, z3];
}

export function pan_elevation(
  target: [number, number, number],
  turret_origin: [number, number, number] = [0, 0, 0]
): [number, number] {
  const dx = Number(target[0]) - Number(turret_origin[0]);
  const dy = Number(target[1]) - Number(turret_origin[1]);
  const dz = Number(target[2]) - Number(turret_origin[2]);

  const pan = (Math.atan2(dx, dy) * 180.0) / Math.PI;
  const elevation = (Math.atan2(dz, Math.sqrt(dx * dx + dy * dy)) * 180.0) / Math.PI;
  return [pan, elevation];
}

export function servo_command(
  angle_degrees: number,
  zero_offset = 90.0,
  invert = false,
  limits: [number, number] = [0.0, 180.0]
): number {
  if (!limits || limits.length < 2) {
    throw new Error('Servo limits must be a numeric pair');
  }
  const low = Number(limits[0]);
  const high = Number(limits[1]);

  if (
    !Number.isFinite(low) ||
    !Number.isFinite(high) ||
    low < 0 ||
    high > 180 ||
    low >= high
  ) {
    throw new Error('Servo limits must satisfy 0 <= minimum < maximum <= 180');
  }

  const value = invert ? -Number(angle_degrees) : Number(angle_degrees);
  const command = Number(zero_offset) + value;

  if (!Number.isFinite(command) || command < low || command > high) {
    throw new Error('Servo command is outside configured safe limits');
  }

  return Math.round(command);
}
