/**
 * Planar image-to-room mapping. A plane is never inferred from pixels alone.
 * Ported directly from orion/mapping.py
 */

import { PlaneType } from '../types';

export function convex_hull(points: [number, number][]): [number, number][] {
  const map = new Map<string, [number, number]>();
  for (const p of points) {
    const px = Number(p[0]);
    const py = Number(p[1]);
    map.set(`${px},${py}`, [px, py]);
  }
  const unique = Array.from(map.values()).sort((a, b) => {
    if (a[0] !== b[0]) return a[0] - b[0];
    return a[1] - b[1];
  });

  if (unique.length < 3) {
    return [];
  }

  function cross(origin: [number, number], a: [number, number], b: [number, number]): number {
    return (a[0] - origin[0]) * (b[1] - origin[1]) - (a[1] - origin[1]) * (b[0] - origin[0]);
  }

  const lower: [number, number][] = [];
  for (const point of unique) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
      lower.pop();
    }
    lower.push(point);
  }

  const upper: [number, number][] = [];
  for (let i = unique.length - 1; i >= 0; i--) {
    const point = unique[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
      upper.pop();
    }
    upper.push(point);
  }

  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

export function inside_polygon(point: [number, number], polygon: [number, number][]): boolean {
  const x = Number(point[0]);
  const y = Number(point[1]);
  let inside = false;
  const n = polygon.length;

  for (let i = 0; i < n; i++) {
    const [x1, y1] = polygon[i];
    const [x2, y2] = polygon[(i + 1) % n];

    const cross = (x - x1) * (y2 - y1) - (y - y1) * (x2 - x1);
    if (
      Math.abs(cross) < 1e-8 &&
      Math.min(x1, x2) - 1e-8 <= x &&
      x <= Math.max(x1, x2) + 1e-8 &&
      Math.min(y1, y2) - 1e-8 <= y &&
      y <= Math.max(y1, y2) + 1e-8
    ) {
      return true;
    }

    if (y1 > y !== y2 > y) {
      const intersection_x = ((x2 - x1) * (y - y1)) / (y2 - y1) + x1;
      if (x < intersection_x) {
        inside = !inside;
      }
    }
  }

  return inside;
}

/**
 * Solve for smallest right singular vector using Jacobi eigenvalue decomposition on A^T * A.
 */
function solveHomographyNullspace(rows: number[][]): number[][] {
  const n = 9;
  // Compute M = A^T * A (9x9 symmetric matrix)
  const M: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (const r of rows) {
    for (let i = 0; i < n; i++) {
      if (r[i] === 0) continue;
      for (let j = 0; j < n; j++) {
        if (r[j] === 0) continue;
        M[i][j] += r[i] * r[j];
      }
    }
  }

  // Eigenvectors initialized to identity
  const V: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
  );

  const maxSweeps = 50;
  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let maxOffDiag = 0;
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        const absVal = Math.abs(M[p][q]);
        if (absVal > maxOffDiag) maxOffDiag = absVal;

        if (absVal > 1e-15) {
          const theta = (M[q][q] - M[p][p]) / (2.0 * M[p][q]);
          let t = 1.0 / (Math.abs(theta) + Math.sqrt(theta * theta + 1.0));
          if (theta < 0) t = -t;
          const c = 1.0 / Math.sqrt(t * t + 1.0);
          const s = t * c;
          const tau = s / (1.0 + c);

          const Mpq = M[p][q];
          M[p][q] = 0;
          M[q][p] = 0;
          M[p][p] -= t * Mpq;
          M[q][q] += t * Mpq;

          for (let r = 0; r < n; r++) {
            if (r !== p && r !== q) {
              const Mrp = M[r][p];
              const Mrq = M[r][q];
              M[r][p] = Mrp - s * (Mrq + tau * Mrp);
              M[p][r] = M[r][p];
              M[r][q] = Mrq + s * (Mrp - tau * Mrq);
              M[q][r] = M[r][q];
            }
          }

          for (let r = 0; r < n; r++) {
            const Vrp = V[r][p];
            const Vrq = V[r][q];
            V[r][p] = Vrp - s * (Vrq + tau * Vrp);
            V[r][q] = Vrq + s * (Vrp - tau * Vrq);
          }
        }
      }
    }
    if (maxOffDiag < 1e-13) break;
  }

  // Find column with minimal eigenvalue M[i][i]
  let minCol = 0;
  let minVal = M[0][0];
  for (let i = 1; i < n; i++) {
    if (M[i][i] < minVal) {
      minVal = M[i][i];
      minCol = i;
    }
  }

  const h: number[] = [];
  for (let r = 0; r < n; r++) {
    h.push(V[r][minCol]);
  }

  const matrix: number[][] = [
    [h[0], h[1], h[2]],
    [h[3], h[4], h[5]],
    [h[6], h[7], h[8]],
  ];

  if (Math.abs(matrix[2][2]) > 1e-12) {
    const scale = matrix[2][2];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        matrix[r][c] /= scale;
      }
    }
  }

  return matrix;
}

function determinant3x3(m: number[][]): number {
  return (
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  );
}

export class PlaneCalibration {
  public plane: PlaneType;
  public matrix: number[][] | null = null;
  public image_hull: [number, number][] = [];

  constructor(
    plane: PlaneType,
    image_points?: [number, number][],
    plane_points?: [number, number][]
  ) {
    if (plane !== 'floor' && plane !== 'back_wall' && plane !== 'side_wall') {
      throw new Error('Unsupported plane');
    }
    this.plane = plane;
    if (image_points && plane_points) {
      this.calibrate(image_points, plane_points);
    }
  }

  get valid(): boolean {
    return this.matrix !== null;
  }

  calibrate(image_points: [number, number][], plane_points: [number, number][]): void {
    if (
      !Array.isArray(image_points) ||
      !Array.isArray(plane_points) ||
      image_points.length !== plane_points.length ||
      image_points.length < 4
    ) {
      throw new Error('Calibration requires matching arrays of at least four 2-D points');
    }

    for (let i = 0; i < image_points.length; i++) {
      const src = image_points[i];
      const dst = plane_points[i];
      if (
        src.length !== 2 ||
        dst.length !== 2 ||
        !Number.isFinite(src[0]) ||
        !Number.isFinite(src[1]) ||
        !Number.isFinite(dst[0]) ||
        !Number.isFinite(dst[1])
      ) {
        throw new Error('Calibration points must be finite');
      }
    }

    const hull = convex_hull(image_points);
    if (hull.length < 3) {
      throw new Error('Calibration image points must span a non-collinear region');
    }

    const rows: number[][] = [];
    for (let i = 0; i < image_points.length; i++) {
      const [u, v] = image_points[i];
      const [x, y] = plane_points[i];
      rows.push([-u, -v, -1, 0, 0, 0, x * u, x * v, x]);
      rows.push([0, 0, 0, -u, -v, -1, y * u, y * v, y]);
    }

    const matrix = solveHomographyNullspace(rows);
    const det = determinant3x3(matrix);

    const isAllFinite = matrix.every((row) => row.every((val) => Number.isFinite(val)));
    if (!isAllFinite || Math.abs(det) < 1e-12) {
      throw new Error('Calibration produced an invalid homography');
    }

    this.matrix = matrix;
    this.image_hull = hull;
  }

  map_pixel(pixel: [number, number]): [number, number, number] {
    if (!this.valid || !this.matrix) {
      throw new Error('Unmapped target: plane calibration is missing');
    }

    if (this.image_hull.length < 3 || !inside_polygon(pixel, this.image_hull)) {
      throw new Error('Unmapped target: pixel is outside the calibrated image region');
    }

    const [u, v] = pixel;
    const m = this.matrix;
    const px = m[0][0] * u + m[0][1] * v + m[0][2];
    const py = m[1][0] * u + m[1][1] * v + m[1][2];
    const pz = m[2][0] * u + m[2][1] * v + m[2][2];

    if (Math.abs(pz) < 1e-12) {
      throw new Error('Pixel maps to an invalid plane coordinate');
    }

    const a = px / pz;
    const b = py / pz;

    if (this.plane === 'floor') {
      return [a, b, 0.0];
    }
    if (this.plane === 'back_wall') {
      return [a, 0.0, b];
    }
    return [0.0, a, b];
  }
}

export function homography_from_four_points(
  image_points: [number, number][],
  plane_points: [number, number][]
): number[][] {
  const calibration = new PlaneCalibration('floor', image_points, plane_points);
  if (!calibration.matrix) throw new Error('Calibration failed');
  return calibration.matrix.map((row) => [...row]);
}
