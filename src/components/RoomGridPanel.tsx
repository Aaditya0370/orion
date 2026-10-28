import React, { useRef, useEffect } from 'react';
import { Compass, SlidersHorizontal, MapPin } from 'lucide-react';
import { PlaneType, OrionConfig } from '../types';

interface RoomGridPanelProps {
  config: OrionConfig;
  activePlane: PlaneType;
  onPlaneChange: (plane: PlaneType) => void;
  onOpenCalibration: () => void;
  targetCell: [number, number] | null;
  targetWorld: [number, number, number] | null;
  mapStatus: string;
}

export const RoomGridPanel: React.FC<RoomGridPanelProps> = ({
  config,
  activePlane,
  onPlaneChange,
  onOpenCalibration,
  targetCell,
  targetWorld,
  mapStatus,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const columns = Math.max(1, config.grid_columns || 8);
  const rows = Math.max(1, config.grid_rows || 5);

  const calibration = config.calibrations[activePlane];
  const refPlanePoints = calibration?.plane_points || [];

  // Render planar grid canvas matching RoomGrid paintEvent in gui.py
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Background #171d24
    ctx.fillStyle = '#171d24';
    ctx.fillRect(0, 0, width, height);

    // Grid bounds adjusted: left: 32, top: 38, right: width - 24, bottom: height - 28
    const rect = {
      left: 36,
      top: 36,
      width: width - 58,
      height: height - 60,
    };

    // Title on canvas
    ctx.fillStyle = '#d9e2ec';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(`${activePlane.replace('_', ' ').toUpperCase()} PLANE — CALIBRATED GRID VIEW`, 20, 24);

    // Draw grid lines in #536273
    ctx.strokeStyle = '#536273';
    ctx.lineWidth = 1;

    for (let col = 0; col <= columns; col++) {
      const x = rect.left + (rect.width * col) / columns;
      ctx.beginPath();
      ctx.moveTo(x, rect.top);
      ctx.lineTo(x, rect.top + rect.height);
      ctx.stroke();

      // Column labels
      ctx.fillStyle = '#84909b';
      ctx.font = '10px monospace';
      if (col < columns) {
        ctx.fillText(`C${col + 1}`, x + rect.width / columns / 2 - 8, rect.top + rect.height + 14);
      }
    }

    for (let row = 0; row <= rows; row++) {
      const y = rect.top + (rect.height * row) / rows;
      ctx.beginPath();
      ctx.moveTo(rect.left, y);
      ctx.lineTo(rect.left + rect.width, y);
      ctx.stroke();

      // Row labels
      ctx.fillStyle = '#84909b';
      ctx.font = '10px monospace';
      if (row < rows) {
        ctx.fillText(`R${row + 1}`, rect.left - 24, y + rect.height / rows / 2 + 3);
      }
    }

    // Normalized calibration reference points in #55c2a5 (teal dots)
    const roomWidth = config.room_width || 400;
    const roomDepth = config.room_depth || 500;
    const roomHeight = config.room_height || 250;

    for (const ref of refPlanePoints) {
      let rx = 0;
      let ry = 0;
      if (activePlane === 'floor') {
        rx = ref[0] / roomWidth;
        ry = ref[1] / roomDepth;
      } else if (activePlane === 'back_wall') {
        rx = ref[0] / roomWidth;
        ry = 1.0 - ref[1] / roomHeight;
      } else {
        rx = ref[0] / roomDepth;
        ry = 1.0 - ref[1] / roomHeight;
      }
      rx = Math.max(0.0, Math.min(1.0, rx));
      ry = Math.max(0.0, Math.min(1.0, ry));

      const px = rect.left + rx * rect.width;
      const py = rect.top + ry * rect.height;

      ctx.fillStyle = '#55c2a5';
      ctx.beginPath();
      ctx.arc(px, py, 4.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#10151a';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Highlight target cell if available in #f0a53c (amber)
    if (targetCell) {
      const [col, row] = targetCell;
      const cw = rect.width / columns;
      const ch = rect.height / rows;
      const cellX = rect.left + col * cw;
      const cellY = rect.top + row * ch;

      // Filled amber rectangle with alpha
      ctx.fillStyle = 'rgba(240, 165, 60, 0.45)';
      ctx.fillRect(cellX, cellY, cw, ch);

      // Amber border
      ctx.strokeStyle = '#f0a53c';
      ctx.lineWidth = 2;
      ctx.strokeRect(cellX, cellY, cw, ch);

      // Marker center dot
      ctx.fillStyle = '#ffb74d';
      ctx.beginPath();
      ctx.arc(cellX + cw / 2, cellY + ch / 2, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [activePlane, columns, rows, targetCell, refPlanePoints, config.room_width, config.room_depth, config.room_height]);

  return (
    <div className="flex flex-col rounded-lg border border-[#42505e] bg-[#171d24] p-3 shadow">
      {/* Title & Surface selector */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-[#303b46] pb-2">
        <div className="flex items-center gap-2">
          <Compass className="h-4 w-4 text-[#67c5ad]" />
          <h2 className="text-sm font-semibold tracking-wide text-[#67c5ad]">
            SEMI-3D ROOM MAPPING
          </h2>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <label className="text-[#84909b]">Surface:</label>
          <select
            value={activePlane}
            onChange={(e) => onPlaneChange(e.target.value as PlaneType)}
            className="rounded border border-[#526170] bg-[#303b46] px-2 py-1 font-medium text-[#e6edf3]"
          >
            <option value="back_wall">back_wall (X, Z)</option>
            <option value="floor">floor (X, Y)</option>
            <option value="side_wall">side_wall (Y, Z)</option>
          </select>

          <button
            onClick={onOpenCalibration}
            className="flex items-center gap-1 rounded border border-[#67c5ad] bg-[#67c5ad]/20 px-2.5 py-1 font-medium text-[#67c5ad] transition hover:bg-[#67c5ad]/30"
          >
            <SlidersHorizontal className="h-3 w-3" />
            <span>Guided plane calibration</span>
          </button>
        </div>
      </div>

      {/* Grid Canvas */}
      <div className="relative flex aspect-4/3 w-full items-center justify-center overflow-hidden rounded border border-[#42505e] bg-[#10151a]">
        <canvas
          ref={canvasRef}
          width={480}
          height={340}
          className="h-full w-full object-contain"
        />

        {/* Legend overlay */}
        <div className="absolute bottom-2 left-2 flex items-center gap-3 rounded bg-[#10151a]/80 px-2 py-1 text-[11px] text-[#84909b]">
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-[#55c2a5]" />
            <span>Calibrated refs ({refPlanePoints.length})</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm border border-[#f0a53c] bg-amber-500/50" />
            <span>Target cell</span>
          </div>
        </div>
      </div>

      {/* Target coordinates readout */}
      {targetWorld && (
        <div className="mt-2 flex items-center justify-between rounded border border-[#303b46] bg-[#202830] px-2.5 py-1.5 text-xs">
          <div className="flex items-center gap-1.5 text-[#e6edf3]">
            <MapPin className="h-3.5 w-3.5 text-amber-400" />
            <span className="font-mono">
              World: X={targetWorld[0].toFixed(1)} cm, Y={targetWorld[1].toFixed(1)} cm, Z={targetWorld[2].toFixed(1)} cm
            </span>
          </div>
          <span className="rounded bg-[#303b46] px-1.5 py-0.5 text-[10px] font-mono text-[#67c5ad]">
            CELL: {targetCell ? `[${targetCell[0] + 1}, ${targetCell[1] + 1}]` : '—'}
          </span>
        </div>
      )}

      {/* Mapping Status readout */}
      <div className="mt-2 text-xs text-[#84909b]">
        {mapStatus}
      </div>
    </div>
  );
};
