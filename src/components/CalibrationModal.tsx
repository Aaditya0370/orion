import React, { useState } from 'react';
import { X, Check, AlertCircle, Info, Sparkles } from 'lucide-react';
import { PlaneType, OrionConfig } from '../types';
import { PlaneCalibration } from '../core/mapping';

interface CalibrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: OrionConfig;
  activePlane: PlaneType;
  frameSize: [number, number];
  onSaveCalibration: (plane: PlaneType, calibrationData: any) => void;
}

export const CalibrationModal: React.FC<CalibrationModalProps> = ({
  isOpen,
  onClose,
  config,
  activePlane,
  frameSize,
  onSaveCalibration,
}) => {
  if (!isOpen) return null;

  const [plane, setPlane] = useState<PlaneType>(activePlane);
  const [step, setStep] = useState<1 | 2>(1);

  const [width, height] = frameSize;
  const roomWidth = config.room_width || 400;
  const roomDepth = config.room_depth || 500;
  const roomHeight = config.room_height || 250;

  // Defaults based on plane
  const defaultImageText = `0,0; ${width},0; ${width},${height}; 0,${height}`;

  const getDefaultWorldText = (selectedPlane: PlaneType) => {
    if (selectedPlane === 'floor') {
      return `0,0; ${roomWidth},0; ${roomWidth},${roomDepth}; 0,${roomDepth}`;
    }
    if (selectedPlane === 'back_wall') {
      return `0,${roomHeight}; ${roomWidth},${roomHeight}; ${roomWidth},0; 0,0`;
    }
    return `0,${roomHeight}; ${roomDepth},${roomHeight}; ${roomDepth},0; 0,0`;
  };

  const [imagePointsText, setImagePointsText] = useState<string>(defaultImageText);
  const [worldPointsText, setWorldPointsText] = useState<string>(getDefaultWorldText(plane));
  const [error, setError] = useState<string>('');

  const planeHint = {
    floor: 'X,Y in cm (Z=0)',
    back_wall: 'X,Z in cm (Y=0)',
    side_wall: 'Y,Z in cm (X=0)',
  }[plane];

  const handlePlaneChange = (p: PlaneType) => {
    setPlane(p);
    setWorldPointsText(getDefaultWorldText(p));
  };

  const parsePoints = (text: string): [number, number][] => {
    return text
      .split(';')
      .map((pair) => pair.trim())
      .filter(Boolean)
      .map((pair) => {
        const parts = pair.split(',').map((v) => Number(v.trim()));
        if (parts.length !== 2 || parts.some((v) => isNaN(v))) {
          throw new Error(`Invalid point pair "${pair}". Must be "x,y"`);
        }
        return [parts[0], parts[1]] as [number, number];
      });
  };

  const handleApply = () => {
    setError('');
    try {
      const imagePoints = parsePoints(imagePointsText);
      const worldPoints = parsePoints(worldPointsText);

      if (imagePoints.length !== worldPoints.length) {
        throw new Error(
          `Image points count (${imagePoints.length}) must match world points count (${worldPoints.length})`
        );
      }

      if (imagePoints.length < 4) {
        throw new Error('At least four point correspondences are required');
      }

      const calibration = new PlaneCalibration(plane, imagePoints, worldPoints);
      if (!calibration.matrix) {
        throw new Error('Homography computation failed');
      }

      const calibrationData = {
        matrix: calibration.matrix,
        image_points: imagePoints,
        plane_points: worldPoints,
        image_size: [width, height],
      };

      onSaveCalibration(plane, calibrationData);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Calibration computation failed');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="flex w-full max-w-xl flex-col rounded-lg border border-[#42505e] bg-[#202830] p-5 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#303b46] pb-3">
          <div>
            <h3 className="text-base font-bold text-[#67c5ad]">
              GUIDED PLANE CALIBRATION
            </h3>
            <p className="text-xs text-[#84909b]">
              Calibrate planar homography between camera image and surveyed room coordinates
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-[#84909b] transition hover:bg-[#303b46] hover:text-[#e6edf3]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Plane Selector */}
        <div className="mt-4 flex items-center gap-3 text-xs">
          <label className="text-[#84909b] font-medium">Select Plane to Calibrate:</label>
          <div className="flex rounded border border-[#526170] bg-[#171d24] p-0.5">
            {(['back_wall', 'floor', 'side_wall'] as PlaneType[]).map((p) => (
              <button
                key={p}
                onClick={() => handlePlaneChange(p)}
                className={`rounded px-3 py-1 font-medium transition ${
                  plane === p
                    ? 'bg-[#67c5ad] text-[#10151a]'
                    : 'text-[#84909b] hover:text-[#e6edf3]'
                }`}
              >
                {p.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Step indicator */}
        <div className="mt-4 flex items-center gap-2 border-b border-[#303b46] pb-2 text-xs">
          <button
            onClick={() => setStep(1)}
            className={`font-semibold transition ${
              step === 1 ? 'text-[#67c5ad]' : 'text-[#84909b]'
            }`}
          >
            Step 1: Image Raw Pixels ({width}×{height})
          </button>
          <span className="text-[#526170]">→</span>
          <button
            onClick={() => setStep(2)}
            className={`font-semibold transition ${
              step === 2 ? 'text-[#67c5ad]' : 'text-[#84909b]'
            }`}
          >
            Step 2: World Coordinates ({planeHint})
          </button>
        </div>

        {/* Form Content */}
        <div className="mt-3 flex-1 text-xs">
          {step === 1 ? (
            <div className="space-y-3">
              <div className="rounded border border-[#42505e]/60 bg-[#171d24] p-3 text-[#84909b]">
                <p>
                  Enter four-or-more correspondences as semicolon-separated pairs (<code>u,v; u,v; ...</code>).
                </p>
                <p className="mt-1">
                  Image points are raw camera-frame pixels with origin (0,0) at top-left. Current camera frame resolution is <strong>{width} × {height}</strong> pixels.
                </p>
              </div>

              <div>
                <label className="block mb-1 font-medium text-[#e6edf3]">
                  Image Pixels (u,v; ...):
                </label>
                <textarea
                  rows={3}
                  value={imagePointsText}
                  onChange={(e) => setImagePointsText(e.target.value)}
                  className="w-full rounded border border-[#526170] bg-[#151b21] p-2 font-mono text-xs text-[#e6edf3] focus:border-[#67c5ad] focus:outline-none"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setImagePointsText(`0,0; ${width},0; ${width},${height}; 0,${height}`)}
                  className="flex items-center gap-1 rounded border border-[#526170] bg-[#303b46] px-2.5 py-1 text-[11px] text-[#e6edf3] hover:bg-[#3e4c59]"
                >
                  <Sparkles className="h-3 w-3 text-[#67c5ad]" />
                  <span>Preset: 4 Corners</span>
                </button>
                <button
                  type="button"
                  onClick={() => setImagePointsText(`40,40; ${width - 40},40; ${width - 40},${height - 40}; 40,${height - 40}`)}
                  className="rounded border border-[#526170] bg-[#303b46] px-2.5 py-1 text-[11px] text-[#e6edf3] hover:bg-[#3e4c59]"
                >
                  Preset: Inset Grid Corners
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded border border-[#42505e]/60 bg-[#171d24] p-3 text-[#84909b]">
                <p>
                  Enter matching plane points in <strong>centimetres</strong> in the exact same order ({planeHint}).
                </p>
                <p className="mt-1">
                  Current room config: Width={roomWidth}cm, Depth={roomDepth}cm, Height={roomHeight}cm.
                </p>
              </div>

              <div>
                <label className="block mb-1 font-medium text-[#e6edf3]">
                  Plane Coordinates in cm (x,y; ...):
                </label>
                <textarea
                  rows={3}
                  value={worldPointsText}
                  onChange={(e) => setWorldPointsText(e.target.value)}
                  className="w-full rounded border border-[#526170] bg-[#151b21] p-2 font-mono text-xs text-[#e6edf3] focus:border-[#67c5ad] focus:outline-none"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setWorldPointsText(getDefaultWorldText(plane))}
                  className="flex items-center gap-1 rounded border border-[#526170] bg-[#303b46] px-2.5 py-1 text-[11px] text-[#e6edf3] hover:bg-[#3e4c59]"
                >
                  <Sparkles className="h-3 w-3 text-[#67c5ad]" />
                  <span>Preset: Full Room Extents</span>
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-3 flex items-start gap-2 rounded border border-rose-500/50 bg-rose-950/40 p-2.5 text-xs text-rose-300">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer controls */}
        <div className="mt-5 flex items-center justify-between border-t border-[#303b46] pt-3 text-xs">
          {step === 1 ? (
            <button
              onClick={onClose}
              className="rounded border border-[#526170] bg-[#303b46] px-3 py-1.5 text-[#e6edf3] hover:bg-[#3e4c59]"
            >
              Cancel
            </button>
          ) : (
            <button
              onClick={() => setStep(1)}
              className="rounded border border-[#526170] bg-[#303b46] px-3 py-1.5 text-[#e6edf3] hover:bg-[#3e4c59]"
            >
              Back to Step 1
            </button>
          )}

          {step === 1 ? (
            <button
              onClick={() => setStep(2)}
              className="flex items-center gap-1 rounded border border-[#67c5ad] bg-[#67c5ad] px-4 py-1.5 font-bold text-[#10151a] hover:bg-[#78d1ba]"
            >
              <span>Next: Step 2</span>
              <span>→</span>
            </button>
          ) : (
            <button
              onClick={handleApply}
              className="flex items-center gap-1.5 rounded border border-[#67c5ad] bg-[#67c5ad] px-4 py-1.5 font-bold text-[#10151a] shadow hover:bg-[#78d1ba]"
            >
              <Check className="h-4 w-4" />
              <span>Compute & Save Homography</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
