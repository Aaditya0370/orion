/**
 * Simulated coloured-marker detector and stability tracker.
 * Ported directly from orion/detection.py
 */

import { DetectionResult } from '../types';

export class Detection implements DetectionResult {
  box: [number, number, number, number];
  center: [number, number];
  confidence: number | null;
  label: string;

  constructor(
    box: [number, number, number, number],
    confidence: number | null = null,
    label = 'simulated marker'
  ) {
    this.box = [Math.round(box[0]), Math.round(box[1]), Math.round(box[2]), Math.round(box[3])];
    this.center = [
      Math.round((this.box[0] + this.box[2]) / 2),
      Math.round((this.box[1] + this.box[3]) / 2),
    ];
    this.confidence = confidence;
    this.label = label;
  }
}

/**
 * Convert RGB (0..255) to OpenCV HSV convention:
 * H in [0..179], S in [0..255], V in [0..255].
 */
export function rgbToOpenCvHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  // Value
  const v = max;

  // Saturation
  const s = max === 0 ? 0 : Math.round((delta / max) * 255);

  // Hue
  let h = 0;
  if (delta > 0) {
    if (max === r) {
      h = 60 * ((g - b) / delta) + (g < b ? 360 : 0);
    } else if (max === g) {
      h = 60 * ((b - r) / delta) + 120;
    } else {
      h = 60 * ((r - g) / delta) + 240;
    }
  }

  // Scale 360 deg -> OpenCV 180 deg
  const openCvH = Math.round(h / 2) % 180;
  return [openCvH, s, v];
}

export class TargetDetector {
  mode: 'opencv_marker' | 'yolo';
  modelPath: string;
  hsvLow: [number, number, number];
  hsvHigh: [number, number, number];
  lastError: string;

  constructor(
    mode: 'opencv_marker' | 'yolo' = 'opencv_marker',
    modelPath = '',
    hsvLow: [number, number, number] = [0, 90, 80],
    hsvHigh: [number, number, number] = [25, 255, 255]
  ) {
    this.mode = mode;
    this.modelPath = modelPath;
    this.hsvLow = [...hsvLow];
    this.hsvHigh = [...hsvHigh];
    this.lastError = '';

    if (mode === 'yolo' && !modelPath) {
      this.lastError = 'YOLO model path is not configured';
    } else if (mode === 'yolo') {
      this.lastError = 'YOLO model is not loaded (using colour marker fallback)';
    }
  }

  /**
   * Detect simulated colour marker from canvas ImageData.
   */
  detectImageData(imageData: ImageData): Detection | null {
    const { width, height, data } = imageData;
    const [hMin, sMin, vMin] = this.hsvLow;
    const [hMax, sMax, vMax] = this.hsvHigh;

    // Binary mask array (1 for matched pixel, 0 otherwise)
    const mask = new Uint8Array(width * height);
    let matchCount = 0;

    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      const [h, s, v] = rgbToOpenCvHsv(r, g, b);
      if (h >= hMin && h <= hMax && s >= sMin && s <= sMax && v >= vMin && v <= vMax) {
        mask[p] = 1;
        matchCount++;
      }
    }

    if (matchCount < 150) {
      return null;
    }

    // Fast connected components / bounding box finding with BFS
    const visited = new Uint8Array(width * height);
    let bestArea = 0;
    let bestBox: [number, number, number, number] | null = null;

    // Scan downsampled grid to seed components quickly
    const step = 2;
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const idx = y * width + x;
        if (mask[idx] && !visited[idx]) {
          // BFS
          const queue = [idx];
          visited[idx] = 1;
          let minX = x;
          let maxX = x;
          let minY = y;
          let maxY = y;
          let area = 0;

          let head = 0;
          while (head < queue.length) {
            const curr = queue[head++];
            const cx = curr % width;
            const cy = Math.floor(curr / width);
            area++;

            if (cx < minX) minX = cx;
            if (cx > maxX) maxX = cx;
            if (cy < minY) minY = cy;
            if (cy > maxY) maxY = cy;

            // 4-neighborhood
            const neighbors = [
              cx > 0 ? curr - 1 : -1,
              cx < width - 1 ? curr + 1 : -1,
              cy > 0 ? curr - width : -1,
              cy < height - 1 ? curr + width : -1,
            ];

            for (const n of neighbors) {
              if (n >= 0 && mask[n] && !visited[n]) {
                visited[n] = 1;
                queue.push(n);
              }
            }
          }

          if (area >= 150 && area > bestArea) {
            bestArea = area;
            bestBox = [minX, minY, maxX, maxY];
          }
        }
      }
    }

    if (bestBox && bestArea >= 150) {
      return new Detection(bestBox, null, 'simulated colour marker');
    }

    return null;
  }

  detect(frame: ImageData | null): Detection | null {
    if (!frame) return null;
    return this.detectImageData(frame);
  }
}

export class StableTarget {
  required_frames: number;
  tolerance_pixels: number;
  private _candidate: Detection | null = null;
  private _count = 0;

  constructor(required_frames = 4, tolerance_pixels = 45) {
    this.required_frames = Math.max(1, Math.round(required_frames));
    this.tolerance_pixels = Math.round(tolerance_pixels);
  }

  get stable_count(): number {
    return this._count;
  }

  update(detection: Detection | null): Detection | null {
    if (detection === null) {
      this._candidate = null;
      this._count = 0;
      return null;
    }

    if (this._candidate === null) {
      this._candidate = detection;
      this._count = 1;
    } else {
      const dx = detection.center[0] - this._candidate.center[0];
      const dy = detection.center[1] - this._candidate.center[1];
      if (dx * dx + dy * dy <= this.tolerance_pixels * this.tolerance_pixels) {
        this._count += 1;
        this._candidate = detection;
      } else {
        this._candidate = detection;
        this._count = 1;
      }
    }

    return this._count >= this.required_frames ? this._candidate : null;
  }
}
