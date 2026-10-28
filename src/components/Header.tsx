import React from 'react';
import { Settings, ShieldAlert, Cpu, CheckCircle2, AlertTriangle, BookOpen } from 'lucide-react';
import { OperatingMode } from '../types';

interface HeaderProps {
  mode: OperatingMode;
  cameraConnected: boolean;
  arduinoConnected: boolean;
  hasTarget: boolean;
  onOpenSettings: () => void;
  onOpenTests: () => void;
  onOpenSketch: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  mode,
  cameraConnected,
  arduinoConnected,
  hasTarget,
  onOpenSettings,
  onOpenTests,
  onOpenSketch,
}) => {
  return (
    <header className="border-b border-[#42505e] bg-[#171d24] px-4 py-3 shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded border border-[#67c5ad]/40 bg-[#67c5ad]/10">
            <ShieldAlert className="h-6 w-6 text-[#67c5ad]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-wider text-[#67c5ad]">ORION FIREGUARD</h1>
              <span
                className={`rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wider ${
                  mode === 'DRY AIMING'
                    ? 'border border-amber-500/40 bg-amber-500/20 text-amber-300'
                    : 'border border-[#526170] bg-[#303b46] text-[#e6edf3]'
                }`}
              >
                {mode}
              </span>
            </div>
            <p className="text-xs tracking-wide text-[#84909b]">
              OFFLINE ENGINEERING DEMONSTRATOR · RSBVP 2026–27
            </p>
          </div>
        </div>

        {/* Status badges */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div
            className={`flex items-center gap-1.5 rounded border px-2.5 py-1 ${
              cameraConnected
                ? 'border-emerald-500/30 bg-emerald-950/30 text-emerald-300'
                : 'border-[#526170]/40 bg-[#202830] text-[#84909b]'
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${cameraConnected ? 'animate-pulse bg-emerald-400' : 'bg-gray-500'}`}
            />
            <span>Camera: {cameraConnected ? 'Live' : 'Standby'}</span>
          </div>

          <div
            className={`flex items-center gap-1.5 rounded border px-2.5 py-1 ${
              arduinoConnected
                ? 'border-emerald-500/30 bg-emerald-950/30 text-emerald-300'
                : 'border-[#526170]/40 bg-[#202830] text-[#84909b]'
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${arduinoConnected ? 'bg-emerald-400' : 'bg-gray-500'}`}
            />
            <span>Arduino: {arduinoConnected ? 'Linked' : 'Offline'}</span>
          </div>

          <div
            className={`flex items-center gap-1.5 rounded border px-2.5 py-1 ${
              hasTarget
                ? 'border-amber-500/30 bg-amber-950/30 text-amber-300'
                : 'border-[#526170]/40 bg-[#202830] text-[#84909b]'
            }`}
          >
            {hasTarget ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-amber-400" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5 text-gray-500" />
            )}
            <span>Target: {hasTarget ? 'Locked' : 'None'}</span>
          </div>

          {/* Action buttons */}
          <button
            onClick={onOpenTests}
            className="flex items-center gap-1.5 rounded border border-[#526170] bg-[#303b46] px-2.5 py-1 font-medium text-[#e6edf3] transition hover:bg-[#3e4c59]"
            title="Run offline verification test suite"
          >
            <Cpu className="h-3.5 w-3.5 text-[#67c5ad]" />
            <span>Unit Tests (10/10)</span>
          </button>

          <button
            onClick={onOpenSketch}
            className="flex items-center gap-1.5 rounded border border-[#526170] bg-[#303b46] px-2.5 py-1 font-medium text-[#e6edf3] transition hover:bg-[#3e4c59]"
            title="View Arduino receiver code"
          >
            <BookOpen className="h-3.5 w-3.5 text-sky-400" />
            <span>Arduino Sketch</span>
          </button>

          <button
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 rounded border border-[#526170] bg-[#303b46] px-2.5 py-1 font-medium text-[#e6edf3] transition hover:bg-[#3e4c59]"
            title="Configure room, camera, and servo parameters"
          >
            <Settings className="h-3.5 w-3.5 text-[#67c5ad]" />
            <span>Settings</span>
          </button>
        </div>
      </div>
    </header>
  );
};
