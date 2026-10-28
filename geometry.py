"""Coordinate and pan/tilt geometry in a right-handed world frame.

World axes: +X right, +Y forward from the back wall, +Z up. Angles are degrees.
"""
import math


def rotate_xyz(point, orientation_degrees):
    """Rotate a vector by roll(X), pitch(Y), yaw(Z), applied in that order."""
    x, y, z = [float(v) for v in point]
    roll, pitch, yaw = [math.radians(float(v)) for v in orientation_degrees]
    cr, sr = math.cos(roll), math.sin(roll)
    cp, sp = math.cos(pitch), math.sin(pitch)
    cy, sy = math.cos(yaw), math.sin(yaw)
    x, y, z = x, y * cr - z * sr, y * sr + z * cr
    x, y, z = x * cp + z * sp, y, -x * sp + z * cp
    return (x * cy - y * sy, x * sy + y * cy, z)


def camera_to_world(point, camera_position, camera_orientation=(0, 0, 0)):
    """Convert camera-local XYZ vector to world coordinates plus camera origin."""
    rotated = rotate_xyz(point, camera_orientation)
    return tuple(float(camera_position[i]) + rotated[i] for i in range(3))


def compose_orientation(base_degrees, local_offset_degrees):
    """Compose camera/world orientation with an offset expressed in local axes."""
    def matrix_for(angles):
        roll, pitch, yaw = [math.radians(float(v)) for v in angles]
        cr, sr = math.cos(roll), math.sin(roll)
        cp, sp = math.cos(pitch), math.sin(pitch)
        cy, sy = math.cos(yaw), math.sin(yaw)
        return ((cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr),
                (sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr),
                (-sp, cp * sr, cp * cr))

    first, second = matrix_for(base_degrees), matrix_for(local_offset_degrees)
    combined = tuple(tuple(sum(first[row][k] * second[k][col] for k in range(3))
                           for col in range(3)) for row in range(3))
    pitch = math.asin(max(-1.0, min(1.0, -combined[2][0])))
    if abs(math.cos(pitch)) > 1e-8:
        roll = math.atan2(combined[2][1], combined[2][2])
        yaw = math.atan2(combined[1][0], combined[0][0])
    else:
        roll = 0.0
        yaw = math.atan2(-combined[0][1], combined[1][1])
    return tuple(math.degrees(value) for value in (roll, pitch, yaw))


def world_to_turret(point, turret_origin, turret_orientation=(0, 0, 0)):
    """Express a world point in turret-local axes using inverse turret rotation."""
    vector = tuple(float(point[i]) - float(turret_origin[i]) for i in range(3))
    roll, pitch, yaw = [math.radians(float(v)) for v in turret_orientation]
    x, y, z = vector
    # Invert the forward transform: Rz(yaw), then Ry(pitch), then Rx(roll).
    x, y, z = x * math.cos(yaw) + y * math.sin(yaw), -x * math.sin(yaw) + y * math.cos(yaw), z
    x, y, z = x * math.cos(pitch) - z * math.sin(pitch), y, x * math.sin(pitch) + z * math.cos(pitch)
    return (x, y * math.cos(roll) + z * math.sin(roll), -y * math.sin(roll) + z * math.cos(roll))


def pan_elevation(target, turret_origin):
    """Return (pan, elevation) degrees; +Y is forward, +X is right."""
    dx = float(target[0]) - float(turret_origin[0])
    dy = float(target[1]) - float(turret_origin[1])
    dz = float(target[2]) - float(turret_origin[2])
    pan = math.degrees(math.atan2(dx, dy))
    elevation = math.degrees(math.atan2(dz, math.sqrt(dx * dx + dy * dy)))
    return pan, elevation


def servo_command(angle_degrees, zero_offset=90.0, invert=False, limits=(0.0, 180.0)):
    """Map a geometric angle to a safe servo command, rejecting unsafe limits."""
    try:
        low, high = float(limits[0]), float(limits[1])
    except (TypeError, ValueError, IndexError):
        raise ValueError("Servo limits must be a numeric pair")
    if not math.isfinite(low) or not math.isfinite(high) or low < 0 or high > 180 or low >= high:
        raise ValueError("Servo limits must satisfy 0 <= minimum < maximum <= 180")
    value = -float(angle_degrees) if invert else float(angle_degrees)
    command = float(zero_offset) + value
    if not math.isfinite(command) or command < low or command > high:
        raise ValueError("Servo command is outside configured safe limits")
    return int(round(command))
