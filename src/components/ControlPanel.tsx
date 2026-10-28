import React, { useState } from 'react';
import { Sliders, Power, ShieldAlert, Cpu, Crosshair } from 'lucide-react';
import { OperatingMode, OrionConfig } from '../types';

interface ControlPanelProps {
  config: OrionConfig;
  mode: OperatingMode;
  onModeChange: (mode: OperatingMode) => void;
  arduinoConnected: boolean;
  arduinoStatus: string;
  onToggleSerial: (port: string, baud: number) => void;
  onAim: () => void;
  onBoresight: () => void;
  onStop: () => void;
  virtualPan: number;
  virtualTilt: number;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  config,
  mode,
  onModeChange,
  arduinoConnected,
  arduinoStatus,
  onToggleSerial,
  onAim,
  onBoresight,
  onStop,
  virtualPan,
  virtualTilt,
}) => {
  const [port, setPort] = useState<string>(config.serial_port || 'COM3 (Virtual Arduino)');
  const [baud, setBaud] = useState<number>(config.baud_rate || 9600);

  const isDryAiming = mode === 'DRY AIMING';

  return (
    <div className="flex flex-col rounded-lg border border-[#42505e] bg-[#171d24] p-3 shadow">
      {/* Title */}
      <div className="mb-2 flex items-center justify-between border-b border-[#303b46] pb-2">
        <div className="flex items-center gap-2">
          <Sliders className="h-4 w-4 text-[#67c5ad]" />
          <h2 className="text-sm font-semibold tracking-wide text-[#67c5ad]">
            OPERATING MODE · SAFE OUTPUTS
          </h2>
        </div>

        {/* Mode selector */}
        <div className="flex items-center gap-2 text-xs">
          <label className="text-[#84909b]">Mode:</label>
          <select
            value={mode}
            onChange={(e) => onModeChange(e.target.value as OperatingMode)}
            className={`rounded border px-2 py-1 font-semibold transition ${
              isDryAiming
                ? 'border-amber-500/50 bg-amber-500/20 text-amber-300'
                : 'border-[#526170] bg-[#303b46] text-[#e6edf3]'
            }`}
          >
            <option value="SIMULATION">SIMULATION</option>
            <option value="DRY AIMING">DRY AIMING</option>
          </select>
        </div>
      </div>

      {/* Serial Connection Row */}
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
        <div className="flex-1 min-w-[140px]">
          <input
            type="text"
            value={port}
            onChange={(e) => setPort(e.target.value)}
            placeholder="COM3 / /dev/ttyUSB0 / WebSerial"
            className="w-full rounded border border-[#526170] bg-[#303b46] px-2 py-1 text-[#e6edf3] placeholder:text-[#84909b]"
          />
        </div>

        <select
          value={baud}
          onChange={(e) => setBaud(Number(e.target.value))}
          className="rounded border border-[#526170] bg-[#303b46] px-2 py-1 text-[#e6edf3]"
        >
          <option value={9600}>9600 baud</option>
          <option value={19200}>19200 baud</option>
          <option value={57600}>57600 baud</option>
          <option value={115200}>115200 baud</option>
        </select>

        <button
          onClick={() => onToggleSerial(port, baud)}
          className={`flex items-center gap-1.5 rounded border px-3 py-1 font-medium transition ${
            arduinoConnected
              ? 'border-emerald-500/40 bg-emerald-900/30 text-emerald-300 hover:bg-emerald-900/50'
              : 'border-[#526170] bg-[#303b46] text-[#e6edf3] hover:bg-[#3e4c59]'
          }`}
        >
          <Cpu className="h-3.5 w-3.5 text-[#67c5ad]" />
          <span>{arduinoConnected ? 'Disconnect Arduino' : 'Connect Arduino'}</span>
        </button>
      </div>

      {/* Arduino Status */}
      <div className="mt-1.5 text-xs font-mono text-[#84909b]">
        {arduinoStatus}
      </div>

      {/* Virtual Servo Angles Visualizer */}
      <div className="mt-2.5 rounded border border-[#303b46] bg-[#202830] p-2">
        <div className="flex items-center justify-between text-[11px] text-[#84909b] mb-1">
          <span className="font-semibold text-[#67c5ad]">VIRTUAL SERVO POSITIONS</span>
          <span>Limits: P[{config.servo_pan_limits[0]}°..{config.servo_pan_limits[1]}°] · T[{config.servo_tilt_limits[0]}°..{config.servo_tilt_limits[1]}°]</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded bg-[#171d24] p-1.5">
            <div className="flex justify-between text-[#84909b] text-[10px]">
              <span>PAN SERVO</span>
              <span className="font-mono text-[#e6edf3]">{virtualPan}°</span>
            </div>
            <div className="relative mt-1 h-1.5 w-full rounded bg-[#303b46] overflow-hidden">
              <div
                className="h-full bg-[#67c5ad] transition-all duration-300"
                style={{ width: `${(virtualPan / 180) * 100}%` }}
              />
            </div>
          </div>
          <div className="rounded bg-[#171d24] p-1.5">
            <div className="flex justify-between text-[#84909b] text-[10px]">
              <span>TILT SERVO</span>
              <span className="font-mono text-[#e6edf3]">{virtualTilt}°</span>
            </div>
            <div className="relative mt-1 h-1.5 w-full rounded bg-[#303b46] overflow-hidden">
              <div
                className="h-full bg-amber-400 transition-all duration-300"
                style={{ width: `${(virtualTilt / 180) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mt-3 flex flex-col gap-2">
        {/* Aim button */}
        <button
          onClick={onAim}
          className={`flex items-center justify-center gap-1.5 rounded border py-2 text-xs font-bold tracking-wider transition ${
            isDryAiming
              ? 'border-amber-500 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
              : 'border-[#526170] bg-[#303b46] text-[#e6edf3] hover:bg-[#3e4c59]'
          }`}
        >
          <Crosshair className="h-4 w-4" />
          <span>{isDryAiming ? 'SEND DRY AIM COMMAND' : 'SIMULATE AIM CALCULATION'}</span>
        </button>

        {/* Set boresight reference */}
        <button
          onClick={onBoresight}
          className="flex items-center justify-center gap-1.5 rounded border border-[#526170] bg-[#303b46] py-1.5 text-xs font-medium text-[#e6edf3] transition hover:bg-[#3e4c59]"
        >
          <span>Set boresight reference from current target</span>
        </button>

        {/* STOP / NEUTRALIZE SERVOS */}
        <button
          onClick={onStop}
          className="flex items-center justify-center gap-2 rounded border border-[#b23b44] bg-[#9b3038] py-2.5 text-sm font-bold tracking-wider text-white shadow-md transition hover:bg-[#b03640] active:scale-[0.99]"
        >
          <Power className="h-4 w-4" />
          <span>STOP / NEUTRALIZE SERVOS</span>
        </button>
      </div>

      {/* Future hardware mode warning */}
      <div className="mt-3 flex items-start gap-1.5 rounded border border-[#42505e]/50 bg-[#151b21] p-2 text-[11px] text-[#84909b]">
        <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-amber-400 mt-0.5" />
        <span>
          Future hardware mode: <strong className="text-amber-300">DISABLED</strong>. No pump command exists. Any future water system requires separate engineering review, electrical isolation, and independent physical cutoff.
        </span>
      </div>
    </div>
  );
};
