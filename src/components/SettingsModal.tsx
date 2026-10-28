import React, { useState } from 'react';
import { X, Save, RotateCcw, ShieldAlert } from 'lucide-react';
import { OrionConfig } from '../types';
import { DEFAULT_CONFIG } from '../core/storage';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: OrionConfig;
  onSave: (newConfig: OrionConfig) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  onSave,
}) => {
  if (!isOpen) return null;

  const [form, setForm] = useState<OrionConfig>({ ...config });

  const handleChange = (key: keyof OrionConfig, value: any) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleArrayChange = (key: keyof OrionConfig, index: number, value: number) => {
    setForm((prev) => {
      const arr = [...(prev[key] as any[])];
      arr[index] = Number(value);
      return { ...prev, [key]: arr };
    });
  };

  const handleResetDefaults = () => {
    if (confirm('Reset all parameters to default factory settings? Calibrations will be preserved.')) {
      setForm((prev) => ({
        ...DEFAULT_CONFIG,
        calibrations: prev.calibrations,
      }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-lg border border-[#42505e] bg-[#202830] shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[#303b46] px-5 py-3">
          <div>
            <h3 className="text-base font-bold text-[#67c5ad]">
              ENGINEERING PARAMETERS & CONFIGURATION
            </h3>
            <p className="text-xs text-[#84909b]">
              Calibrated dimensions, camera-to-turret transforms, servo limits, and vision thresholds
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-[#84909b] transition hover:bg-[#303b46] hover:text-[#e6edf3]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
          {/* Section 1: Room Dimensions & Grid */}
          <div className="rounded border border-[#42505e] bg-[#171d24] p-3.5">
            <h4 className="mb-2 text-xs font-bold text-[#67c5ad] uppercase tracking-wider">
              1. Room Extents & Grid Partitions
            </h4>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <div>
                <label className="text-[#84909b]">Width (cm):</label>
                <input
                  type="number"
                  value={form.room_width}
                  onChange={(e) => handleChange('room_width', Number(e.target.value))}
                  className="mt-1 w-full rounded border border-[#526170] bg-[#303b46] p-1.5 text-[#e6edf3]"
                />
              </div>
              <div>
                <label className="text-[#84909b]">Depth (cm):</label>
                <input
                  type="number"
                  value={form.room_depth}
                  onChange={(e) => handleChange('room_depth', Number(e.target.value))}
                  className="mt-1 w-full rounded border border-[#526170] bg-[#303b46] p-1.5 text-[#e6edf3]"
                />
              </div>
              <div>
                <label className="text-[#84909b]">Height (cm):</label>
                <input
                  type="number"
                  value={form.room_height}
                  onChange={(e) => handleChange('room_height', Number(e.target.value))}
                  className="mt-1 w-full rounded border border-[#526170] bg-[#303b46] p-1.5 text-[#e6edf3]"
                />
              </div>
              <div>
                <label className="text-[#84909b]">Grid Cols:</label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={form.grid_columns}
                  onChange={(e) => handleChange('grid_columns', Number(e.target.value))}
                  className="mt-1 w-full rounded border border-[#526170] bg-[#303b46] p-1.5 text-[#e6edf3]"
                />
              </div>
              <div>
                <label className="text-[#84909b]">Grid Rows:</label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={form.grid_rows}
                  onChange={(e) => handleChange('grid_rows', Number(e.target.value))}
                  className="mt-1 w-full rounded border border-[#526170] bg-[#303b46] p-1.5 text-[#e6edf3]"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Camera Position & Turret Transforms */}
          <div className="rounded border border-[#42505e] bg-[#171d24] p-3.5">
            <h4 className="mb-2 text-xs font-bold text-[#67c5ad] uppercase tracking-wider">
              2. Camera Position & Turret Transforms
            </h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-[#84909b] block mb-1">
                  Camera World Origin [X, Y, Z] cm:
                </label>
                <div className="flex gap-2">
                  {[0, 1, 2].map((idx) => (
                    <input
                      key={idx}
                      type="number"
                      value={form.camera_position[idx]}
                      onChange={(e) => handleArrayChange('camera_position', idx, Number(e.target.value))}
                      className="w-full rounded border border-[#526170] bg-[#303b46] p-1.5 text-[#e6edf3]"
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[#84909b] block mb-1">
                  Camera Orientation [roll, pitch, yaw] deg:
                </label>
                <div className="flex gap-2">
                  {[0, 1, 2].map((idx) => (
                    <input
                      key={idx}
                      type="number"
                      value={form.camera_orientation[idx]}
                      onChange={(e) => handleArrayChange('camera_orientation', idx, Number(e.target.value))}
                      className="w-full rounded border border-[#526170] bg-[#303b46] p-1.5 text-[#e6edf3]"
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[#84909b] block mb-1">
                  Camera-to-Turret Offset [dX, dY, dZ] cm:
                </label>
                <div className="flex gap-2">
                  {[0, 1, 2].map((idx) => (
                    <input
                      key={idx}
                      type="number"
                      value={form.camera_to_turret_offset[idx]}
                      onChange={(e) => handleArrayChange('camera_to_turret_offset', idx, Number(e.target.value))}
                      className="w-full rounded border border-[#526170] bg-[#303b46] p-1.5 text-[#e6edf3]"
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[#84909b] block mb-1">
                  Camera-to-Turret Angles [dRoll, dPitch, dYaw] deg:
                </label>
                <div className="flex gap-2">
                  {[0, 1, 2].map((idx) => (
                    <input
                      key={idx}
                      type="number"
                      value={form.camera_to_turret_angles[idx]}
                      onChange={(e) => handleArrayChange('camera_to_turret_angles', idx, Number(e.target.value))}
                      className="w-full rounded border border-[#526170] bg-[#303b46] p-1.5 text-[#e6edf3]"
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Safe Servo Limits & Neutral Angles */}
          <div className="rounded border border-[#42505e] bg-[#171d24] p-3.5">
            <h4 className="mb-2 text-xs font-bold text-[#67c5ad] uppercase tracking-wider">
              3. Safe Servo Limits & Hardware Offsets
            </h4>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <label className="text-[#84909b]">Neutral Pan (°):</label>
                <input
                  type="number"
                  value={form.servo_zero_pan}
                  onChange={(e) => handleChange('servo_zero_pan', Number(e.target.value))}
                  className="mt-1 w-full rounded border border-[#526170] bg-[#303b46] p-1.5 text-[#e6edf3]"
                />
              </div>

              <div>
                <label className="text-[#84909b]">Neutral Tilt (°):</label>
                <input
                  type="number"
                  value={form.servo_zero_tilt}
                  onChange={(e) => handleChange('servo_zero_tilt', Number(e.target.value))}
                  className="mt-1 w-full rounded border border-[#526170] bg-[#303b46] p-1.5 text-[#e6edf3]"
                />
              </div>

              <div>
                <label className="text-[#84909b]">Pan Limits [Min, Max]°:</label>
                <div className="flex gap-1 mt-1">
                  <input
                    type="number"
                    value={form.servo_pan_limits[0]}
                    onChange={(e) => handleArrayChange('servo_pan_limits', 0, Number(e.target.value))}
                    className="w-full rounded border border-[#526170] bg-[#303b46] p-1.5 text-[#e6edf3]"
                  />
                  <input
                    type="number"
                    value={form.servo_pan_limits[1]}
                    onChange={(e) => handleArrayChange('servo_pan_limits', 1, Number(e.target.value))}
                    className="w-full rounded border border-[#526170] bg-[#303b46] p-1.5 text-[#e6edf3]"
                  />
                </div>
              </div>

              <div>
                <label className="text-[#84909b]">Tilt Limits [Min, Max]°:</label>
                <div className="flex gap-1 mt-1">
                  <input
                    type="number"
                    value={form.servo_tilt_limits[0]}
                    onChange={(e) => handleArrayChange('servo_tilt_limits', 0, Number(e.target.value))}
                    className="w-full rounded border border-[#526170] bg-[#303b46] p-1.5 text-[#e6edf3]"
                  />
                  <input
                    type="number"
                    value={form.servo_tilt_limits[1]}
                    onChange={(e) => handleArrayChange('servo_tilt_limits', 1, Number(e.target.value))}
                    className="w-full rounded border border-[#526170] bg-[#303b46] p-1.5 text-[#e6edf3]"
                  />
                </div>
              </div>
            </div>

            <div className="mt-3 flex gap-4">
              <label className="flex items-center gap-1.5 text-[#e6edf3]">
                <input
                  type="checkbox"
                  checked={form.pan_inverted}
                  onChange={(e) => handleChange('pan_inverted', e.target.checked)}
                  className="rounded border-[#526170] bg-[#303b46]"
                />
                <span>Invert Pan Direction</span>
              </label>
              <label className="flex items-center gap-1.5 text-[#e6edf3]">
                <input
                  type="checkbox"
                  checked={form.tilt_inverted}
                  onChange={(e) => handleChange('tilt_inverted', e.target.checked)}
                  className="rounded border-[#526170] bg-[#303b46]"
                />
                <span>Invert Tilt Direction</span>
              </label>
            </div>
          </div>

          {/* Section 4: Vision & Marker Thresholds */}
          <div className="rounded border border-[#42505e] bg-[#171d24] p-3.5">
            <h4 className="mb-2 text-xs font-bold text-[#67c5ad] uppercase tracking-wider">
              4. Vision Detector & Marker HSV Bounds
            </h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-[#84909b] block mb-1">
                  Marker HSV Lower Bound [H 0..179, S 0..255, V 0..255]:
                </label>
                <div className="flex gap-2">
                  {[0, 1, 2].map((idx) => (
                    <input
                      key={idx}
                      type="number"
                      value={form.marker_hsv_low[idx]}
                      onChange={(e) => handleArrayChange('marker_hsv_low', idx, Number(e.target.value))}
                      className="w-full rounded border border-[#526170] bg-[#303b46] p-1.5 text-[#e6edf3]"
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[#84909b] block mb-1">
                  Marker HSV Upper Bound [H 0..179, S 0..255, V 0..255]:
                </label>
                <div className="flex gap-2">
                  {[0, 1, 2].map((idx) => (
                    <input
                      key={idx}
                      type="number"
                      value={form.marker_hsv_high[idx]}
                      onChange={(e) => handleArrayChange('marker_hsv_high', idx, Number(e.target.value))}
                      className="w-full rounded border border-[#526170] bg-[#303b46] p-1.5 text-[#e6edf3]"
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[#84909b]">Required Consecutive Stable Frames:</label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={form.stability_frames}
                  onChange={(e) => handleChange('stability_frames', Number(e.target.value))}
                  className="mt-1 w-full rounded border border-[#526170] bg-[#303b46] p-1.5 text-[#e6edf3]"
                />
              </div>

              <div>
                <label className="text-[#84909b]">Boresight Alignment Tolerance (px):</label>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={form.alignment_tolerance_pixels}
                  onChange={(e) => handleChange('alignment_tolerance_pixels', Number(e.target.value))}
                  className="mt-1 w-full rounded border border-[#526170] bg-[#303b46] p-1.5 text-[#e6edf3]"
                />
              </div>
            </div>
          </div>
        </form>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-[#303b46] px-5 py-3">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="flex items-center gap-1.5 rounded border border-[#526170] bg-[#303b46] px-3 py-1.5 text-xs text-[#84909b] hover:bg-[#3e4c59] hover:text-[#e6edf3]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset to Defaults</span>
          </button>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-[#526170] bg-[#303b46] px-4 py-1.5 text-xs text-[#e6edf3] hover:bg-[#3e4c59]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="flex items-center gap-1.5 rounded border border-[#67c5ad] bg-[#67c5ad] px-4 py-1.5 text-xs font-bold text-[#10151a] hover:bg-[#78d1ba]"
            >
              <Save className="h-4 w-4" />
              <span>Save Configuration</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
