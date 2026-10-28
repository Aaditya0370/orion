"""Planar image-to-room mapping. A plane is never inferred from pixels alone."""
import numpy as np


def _convex_hull(points):
    """Monotonic-chain hull used to prevent unsupported calibration extrapolation."""
    unique = sorted(set((float(p[0]), float(p[1])) for p in points))
    if len(unique) < 3:
        return []

    def cross(origin, a, b):
        return (a[0] - origin[0]) * (b[1] - origin[1]) - (a[1] - origin[1]) * (b[0] - origin[0])

    lower = []
    for point in unique:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], point) <= 0:
            lower.pop()
        lower.append(point)
    upper = []
    for point in reversed(unique):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], point) <= 0:
            upper.pop()
        upper.append(point)
    return lower[:-1] + upper[:-1]


def _inside_polygon(point, polygon):
    x, y = float(point[0]), float(point[1])
    inside = False
    for i in range(len(polygon)):
        x1, y1 = polygon[i]
        x2, y2 = polygon[(i + 1) % len(polygon)]
        cross = (x - x1) * (y2 - y1) - (y - y1) * (x2 - x1)
        if abs(cross) < 1e-8 and min(x1, x2) - 1e-8 <= x <= max(x1, x2) + 1e-8 and min(y1, y2) - 1e-8 <= y <= max(y1, y2) + 1e-8:
            return True
        if (y1 > y) != (y2 > y):
            intersection_x = (x2 - x1) * (y - y1) / (y2 - y1) + x1
            if x < intersection_x:
                inside = not inside
    return inside


class PlaneCalibration(object):
    """Homography from image pixels to 2-D plane coordinates.

    Plane conventions: floor=(X,Y,0), back_wall=(X,0,Z), side_wall=(0,Y,Z).
    Calibration needs at least four non-collinear image/world correspondences.
    """
    def __init__(self, plane, image_points=None, plane_points=None):
        if plane not in ("floor", "back_wall", "side_wall"):
            raise ValueError("Unsupported plane")
        self.plane = plane
        self.matrix = None
        self.image_hull = []
        if image_points is not None or plane_points is not None:
            self.calibrate(image_points, plane_points)

    @property
    def valid(self):
        return self.matrix is not None

    def calibrate(self, image_points, plane_points):
        src = np.asarray(image_points, dtype=float)
        dst = np.asarray(plane_points, dtype=float)
        if src.shape != dst.shape or src.ndim != 2 or src.shape[0] < 4 or src.shape[1] != 2:
            raise ValueError("Calibration requires matching arrays of at least four 2-D points")
        if not np.all(np.isfinite(src)) or not np.all(np.isfinite(dst)):
            raise ValueError("Calibration points must be finite")
        hull = _convex_hull(src.tolist())
        if len(hull) < 3:
            raise ValueError("Calibration image points must span a non-collinear region")
        rows = []
        for (u, v), (x, y) in zip(src, dst):
            rows.append([-u, -v, -1, 0, 0, 0, x * u, x * v, x])
            rows.append([0, 0, 0, -u, -v, -1, y * u, y * v, y])
        _, _, vh = np.linalg.svd(np.asarray(rows, dtype=float))
        matrix = vh[-1].reshape((3, 3))
        if abs(matrix[2, 2]) > 1e-12:
            matrix /= matrix[2, 2]
        if not np.all(np.isfinite(matrix)) or abs(np.linalg.det(matrix)) < 1e-12:
            raise ValueError("Calibration produced an invalid homography")
        self.matrix = matrix
        self.image_hull = hull

    def map_pixel(self, pixel):
        if not self.valid:
            raise ValueError("Unmapped target: plane calibration is missing")
        if len(self.image_hull) < 3 or not _inside_polygon(pixel, self.image_hull):
            raise ValueError("Unmapped target: pixel is outside the calibrated image region")
        p = np.dot(self.matrix, np.asarray([float(pixel[0]), float(pixel[1]), 1.0]))
        if abs(p[2]) < 1e-12:
            raise ValueError("Pixel maps to an invalid plane coordinate")
        a, b = p[0] / p[2], p[1] / p[2]
        if self.plane == "floor":
            return (float(a), float(b), 0.0)
        if self.plane == "back_wall":
            return (float(a), 0.0, float(b))
        return (0.0, float(a), float(b))


def homography_from_four_points(image_points, plane_points):
    """Convenience function returning a validated 3x3 image-to-plane matrix."""
    calibration = PlaneCalibration("floor", image_points, plane_points)
    return calibration.matrix.copy()
