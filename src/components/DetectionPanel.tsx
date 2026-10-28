import React from 'react';
import { Target, Activity } from 'lucide-react';
import { DetectionResult } from '../types';

interface DetectionPanelProps {
  detectionStatus: string;
  detection: DetectionResult | null;
  targetWorld: [number, number, number] | null;
  targetAngles: [number, number] | null;
  desiredBoresight: [number, number] | null;
  boresightError: { dist: number; dx: number; dy: number } | null;
  withinTolerance: boolean | null;
  toleranceLimit: number;
}

export const DetectionPanel: React.FC<DetectionPanelProps> = ({
  detectionStatus,
  detection,
  targetWorld,
  targetAngles,
  desiredBoresight,
  boresightError,
  withinTolerance,
  toleranceLimit,
}) => {
  const boxWidth = detection ? detection.box[2] - detection.box[0] : null;
  const boxHeight = detection ? detection.box[3] - detection.box[1] : null;

  return (
    <div className="flex flex-col rounded-lg border border-[#42505e] bg-[#171d24] p-3 shadow">
      {/* Title */}
      <div className="mb-2 flex items-center gap-2 border-b border-[#303b46] pb-2">
        <Target className="h-4 w-4 text-[#67c5ad]" />
        <h2 className="text-sm font-semibold tracking-wide text-[#67c5ad]">
          DETECTION & GEOMETRY
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-y-2 text-xs md:grid-cols-2 md:gap-x-4">
        {/* Status */}
        <div className="flex items-center justify-between border-b border-[#283340] py-1">
          <span className="text-[#84909b]">Status:</span>
          <span
            className={`font-semibold ${
              detectionStatus.includes('STABLE')
                ? 'text-emerald-400'
                : detectionStatus.includes('Candidate')
                ? 'text-amber-400'
                : 'text-[#e6edf3]'
            }`}
          >
            {detectionStatus}
          </span>
        </div>

        {/* Target centre */}
        <div className="flex items-center justify-between border-b border-[#283340] py-1">
          <span className="text-[#84909b]">Target centre (px):</span>
          <span className="font-mono text-[#e6edf3]">
            {detection ? `${detection.center[0]}, ${detection.center[1]}` : '—'}
          </span>
        </div>

        {/* Box */}
        <div className="flex items-center justify-between border-b border-[#283340] py-1">
          <span className="text-[#84909b]">Box (px):</span>
          <span className="font-mono text-[#e6edf3]">
            {boxWidth && boxHeight ? `${boxWidth} × ${boxHeight}` : '—'}
          </span>
        </div>

        {/* Confidence */}
        <div className="flex items-center justify-between border-b border-[#283340] py-1">
          <span className="text-[#84909b]">Confidence:</span>
          <span className="text-[#84909b]">
            {detection?.confidence != null
              ? `${(detection.confidence * 100).toFixed(1)}%`
              : 'Not provided (marker heuristic)'}
          </span>
        </div>

        {/* Desired boresight pixel */}
        <div className="flex items-center justify-between border-b border-[#283340] py-1">
          <span className="text-[#84909b]">Desired boresight pixel:</span>
          <span className="font-mono text-purple-300">
            {desiredBoresight ? `${desiredBoresight[0]}, ${desiredBoresight[1]}` : 'Not calibrated'}
          </span>
        </div>

        {/* Pixel alignment error */}
        <div className="flex items-center justify-between border-b border-[#283340] py-1">
          <span className="text-[#84909b]">Pixel alignment error:</span>
          <span className="font-mono text-[#e6edf3]">
            {boresightError
              ? `${boresightError.dist.toFixed(1)} px (Δx=${boresightError.dx.toFixed(1)}, Δy=${boresightError.dy.toFixed(1)})`
              : 'Unavailable'}
          </span>
        </div>

        {/* Within tolerance */}
        <div className="flex items-center justify-between border-b border-[#283340] py-1">
          <span className="text-[#84909b]">Within tolerance:</span>
          <span
            className={`font-semibold ${
              withinTolerance === true
                ? 'text-emerald-400'
                : withinTolerance === false
                ? 'text-rose-400'
                : 'text-[#84909b]'
            }`}
          >
            {withinTolerance !== null
              ? `${withinTolerance ? 'YES' : 'NO'} · ${toleranceLimit.toFixed(1)}px limit`
              : 'Requires target + boresight calibration'}
          </span>
        </div>

        {/* Mapped target World */}
        <div className="flex items-center justify-between border-b border-[#283340] py-1">
          <span className="text-[#84909b]">Mapped target (X,Y,Z):</span>
          <span className="font-mono text-amber-300">
            {targetWorld
              ? `${targetWorld[0].toFixed(1)}, ${targetWorld[1].toFixed(1)}, ${targetWorld[2].toFixed(1)} cm`
              : 'Unmapped'}
          </span>
        </div>

        {/* Pan / elevation */}
        <div className="col-span-1 flex items-center justify-between border-b border-[#283340] py-1 md:col-span-2">
          <span className="text-[#84909b]">Pan / elevation (geometric):</span>
          <span className="font-mono text-base font-bold text-[#67c5ad]">
            {targetAngles
              ? `${targetAngles[0].toFixed(1)}° / ${targetAngles[1].toFixed(1)}°`
              : '—'}
          </span>
        </div>
      </div>
    </div>
  );
};
