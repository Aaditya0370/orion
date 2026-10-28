import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Header } from './components/Header';
import { CameraPanel } from './components/CameraPanel';
import { RoomGridPanel } from './components/RoomGridPanel';
import { DetectionPanel } from './components/DetectionPanel';
import { ControlPanel } from './components/ControlPanel';
import { LogPanel } from './components/LogPanel';
import { CalibrationModal } from './components/CalibrationModal';
import { SettingsModal } from './components/SettingsModal';
import { TestRunnerModal } from './components/TestRunnerModal';
import { ArduinoSketchModal } from './components/ArduinoSketchModal';

import { OrionConfig, OperatingMode, PlaneType, DetectionResult, PlaneCalibrationData } from './types';
import { SettingsStore, DEFAULT_CONFIG } from './core/storage';
import { SerialLink } from './core/serial';
import { PlaneCalibration } from './core/mapping';
import {
  camera_to_world,
  compose_orientation,
  world_to_turret,
  pan_elevation,
  servo_command,
} from './core/geometry';

export const App: React.FC = () => {
  const storeRef = useRef<SettingsStore>(new SettingsStore());
  const [config, setConfig] = useState<OrionConfig>(() => {
    const loaded = storeRef.current.load_settings();
    const calibrations = storeRef.current.load_calibrations();
    return {
      ...DEFAULT_CONFIG,
      ...loaded,
      calibrations: {
        ...(DEFAULT_CONFIG.calibrations || {}),
        ...(loaded.calibrations || {}),
        ...calibrations,
      },
    };
  });

  const [mode, setMode] = useState<OperatingMode>('SIMULATION');
  const [activePlane, setActivePlane] = useState<PlaneType>(config.active_plane || 'back_wall');
  const [cameraConnected, setCameraConnected] = useState<boolean>(false);
  const [arduinoConnected, setArduinoConnected] = useState<boolean>(false);
  const [arduinoStatus, setArduinoStatus] = useState<string>('Arduino: disconnected');

  // Logs
  const [logs, setLogs] = useState<string[]>(() => {
    return [
      'Simulation mode active. No hardware output is enabled.',
      'Fallback detector finds the configured colour marker only; it does not detect or certify real fire.',
      'OFFLINE ENGINEERING DEMONSTRATOR · RSBVP 2026–27',
    ];
  });

  const addLog = useCallback((msg: string) => {
    setLogs((prev) => [...prev, msg]);
    storeRef.current.log_event(msg);
  }, []);

  // Serial link
  const serialLinkRef = useRef<SerialLink>(
    new SerialLink(config.baud_rate, config.servo_pan_limits, config.servo_tilt_limits)
  );

  const [virtualPan, setVirtualPan] = useState<number>(90);
  const [virtualTilt, setVirtualTilt] = useState<number>(90);

  // Calibrations instance map
  const calibrationsRef = useRef<Record<string, PlaneCalibration>>({});

  const reloadCalibrations = useCallback((calibs: Record<string, PlaneCalibrationData>) => {
    const map: Record<string, PlaneCalibration> = {};
    for (const [p, data] of Object.entries(calibs)) {
      try {
        map[p] = new PlaneCalibration(p as PlaneType, data.image_points, data.plane_points);
      } catch {
        // ignore invalid
      }
    }
    calibrationsRef.current = map;
  }, []);

  useEffect(() => {
    reloadCalibrations(config.calibrations);
  }, [config.calibrations, reloadCalibrations]);

  // Detection and geometry state
  const [currentDetection, setCurrentDetection] = useState<DetectionResult | null>(null);
  const [latestFrameSize, setLatestFrameSize] = useState<[number, number]>([
    config.camera_width,
    config.camera_height,
  ]);
  const [detectionStatus, setDetectionStatus] = useState<string>('Waiting for camera');
  const [targetWorld, setTargetWorld] = useState<[number, number, number] | null>(null);
  const [targetAngles, setTargetAngles] = useState<[number, number] | null>(null);
  const [targetCell, setTargetCell] = useState<[number, number] | null>(null);
  const [mapStatus, setMapStatus] = useState<string>(
    'Unmapped target — select a surface and calibrate it with known reference points.'
  );

  // Setup serial link callbacks
  useEffect(() => {
    const link = serialLinkRef.current;
    link.setLineCallback((line: string) => {
      addLog(`RX  ${line}`);
      if (line.startsWith('STATUS,MOVED,')) {
        const parts = line.split(',');
        if (parts.length >= 4) {
          setVirtualPan(Number(parts[2]));
          setVirtualTilt(Number(parts[3]));
        }
      } else if (line === 'STATUS,READY') {
        setArduinoStatus('Arduino: connected (dry pan/tilt only)');
      }
    });
  }, [addLog]);

  // Target mapping computation when detection updates
  const handleDetectionUpdate = useCallback(
    (detection: DetectionResult | null, frameSize: [number, number]) => {
      setLatestFrameSize(frameSize);
      setCurrentDetection(detection);

      if (!detection) {
        setDetectionStatus('No simulated marker detected');
        setTargetWorld(null);
        setTargetAngles(null);
        setTargetCell(null);
        setMapStatus('No current simulated marker; target mapping cleared.');
        return;
      }

      setDetectionStatus(
        detection.label.includes('manual')
          ? 'MANUAL TEST POINT · frame centre (synthetic)'
          : 'STABLE · Target tracked'
      );

      // Perform planar mapping
      const calibration = calibrationsRef.current[activePlane];
      if (!calibration || !calibration.valid) {
        setTargetWorld(null);
        setTargetAngles(null);
        setTargetCell(null);
        setMapStatus(
          `Unmapped target — valid ${activePlane.replace('_', ' ')} calibration required; image pixels do not reveal depth.`
        );
        return;
      }

      try {
        const world = calibration.map_pixel(detection.center);
        const cameraPos = config.camera_position;
        const cameraOrient = config.camera_orientation || [0, 0, 0];
        const turretOrigin = camera_to_world(config.camera_to_turret_offset, cameraPos, cameraOrient);
        const turretOrientation = compose_orientation(
          cameraOrient,
          config.camera_to_turret_angles || [0, 0, 180]
        );
        const localTarget = world_to_turret(world, turretOrigin, turretOrientation);
        const angles = pan_elevation(localTarget, [0, 0, 0]);

        setTargetWorld(world);
        setTargetAngles(angles);

        // Compute grid cell
        const width = config.room_width || 400;
        const depth = config.room_depth || 500;
        const height = config.room_height || 250;
        let a = 0;
        let b = 0;

        if (activePlane === 'floor') {
          a = world[0] / width;
          b = world[1] / depth;
        } else if (activePlane === 'back_wall') {
          a = world[0] / width;
          b = 1.0 - world[2] / height;
        } else {
          a = world[1] / depth;
          b = 1.0 - world[2] / height;
        }

        const cols = Math.max(1, config.grid_columns || 8);
        const rows = Math.max(1, config.grid_rows || 5);
        const cellCol = Math.max(0, Math.min(cols - 1, Math.floor(a * cols)));
        const cellRow = Math.max(0, Math.min(rows - 1, Math.floor(b * rows)));
        setTargetCell([cellCol, cellRow]);

        setMapStatus(
          `Mapped on calibrated ${activePlane.replace('_', ' ')}. This is a planar estimate, not 3-D reconstruction.`
        );
      } catch (err: any) {
        setTargetWorld(null);
        setTargetAngles(null);
        setTargetCell(null);
        setMapStatus(`Unmapped target: ${err.message}`);
      }
    },
    [activePlane, config]
  );

  const handleManualTarget = (manualTarget: DetectionResult) => {
    handleDetectionUpdate(manualTarget, latestFrameSize);
  };

  // Boresight error computation
  let boresightError: { dist: number; dx: number; dy: number } | null = null;
  let withinTolerance: boolean | null = null;

  if (config.aim_pixel_reference && currentDetection) {
    const [bx, by] = config.aim_pixel_reference;
    const [cx, cy] = currentDetection.center;
    const dx = cx - bx;
    const dy = cy - by;
    const dist = Math.hypot(dx, dy);
    boresightError = { dist, dx, dy };
    withinTolerance = dist <= (config.alignment_tolerance_pixels || 20);
  }

  // Modals state
  const [calibrationModalOpen, setCalibrationModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [testRunnerModalOpen, setTestRunnerModalOpen] = useState(false);
  const [sketchModalOpen, setSketchModalOpen] = useState(false);

  // Aim handler
  const handleAim = () => {
    if (!targetWorld || !targetAngles) {
      alert('Target unavailable: Require a stable target and valid calibration for the selected plane.');
      return;
    }

    const [pan, elev] = targetAngles;
    let panServo: number;
    let tiltServo: number;

    try {
      panServo = servo_command(
        pan,
        config.servo_zero_pan,
        config.pan_inverted,
        config.servo_pan_limits
      );
      tiltServo = servo_command(
        elev,
        config.servo_zero_tilt,
        config.tilt_inverted,
        config.servo_tilt_limits
      );
    } catch (err: any) {
      alert(`Safe limit blocked aim: ${err.message}`);
      return;
    }

    if (mode === 'SIMULATION') {
      addLog(
        `SIM AIM: target (${targetWorld.map((v) => v.toFixed(1)).join(', ')}) cm, geometric pan/elevation ${pan.toFixed(1)}°/${elev.toFixed(1)}°, servo command ${panServo}/${tiltServo} (not sent).`
      );
      return;
    }

    if (!arduinoConnected) {
      alert('Dry aiming unavailable: Connect the configured Arduino first. No movement was sent.');
      return;
    }

    try {
      const cmd = serialLinkRef.current.send_angles(panServo, tiltServo);
      addLog(`TX  ${cmd.trim()} (dry aiming; pump disabled)`);
    } catch (err: any) {
      alert(`Aim command failed: ${err.message}`);
    }
  };

  // STOP handler
  const handleStop = () => {
    if (arduinoConnected) {
      try {
        serialLinkRef.current.send_stop();
        addLog('TX  STOP — Arduino instructed to return to neutral');
        setVirtualPan(90);
        setVirtualTilt(90);
      } catch (err: any) {
        addLog(`STOP send failed: ${err.message}`);
      }
    } else {
      addLog('Software stop selected; no connected hardware. Physical cutoff remains independent.');
      setVirtualPan(90);
      setVirtualTilt(90);
    }
    setTargetAngles(null);
  };

  // Set boresight reference
  const handleBoresight = () => {
    if (!currentDetection) {
      alert('Target required: Detect a target or select a manual test point first.');
      return;
    }

    const confirmed = confirm(
      'Calibrate camera-to-turret boresight:\n\n' +
        'Only confirm if the turret/nozzle reference has been physically aligned to this known target at the intended test setup.\n\n' +
        'This stores a pixel reference; target centring alone does not prove nozzle alignment.'
    );

    if (!confirmed) return;

    const [cx, cy] = currentDetection.center;
    const newConfig: OrionConfig = {
      ...config,
      aim_pixel_reference: [cx, cy],
      aim_reference_resolution: latestFrameSize,
    };
    setConfig(newConfig);
    storeRef.current.save_settings(newConfig);
    addLog(`Pixel boresight reference saved at [${cx}, ${cy}]. Valid only for the measured camera/turret setup.`);
  };

  // Connect / Disconnect serial
  const handleToggleSerial = async (port: string, baud: number) => {
    const link = serialLinkRef.current;
    if (link.connected) {
      link.disconnect();
      setArduinoConnected(false);
      setArduinoStatus('Arduino: disconnected');
      addLog('Serial disconnected');
      return;
    }

    link.baud = baud;
    link.pan_limits = config.servo_pan_limits;
    link.tilt_limits = config.servo_tilt_limits;

    const ok = await link.connect(port);
    if (ok) {
      setArduinoConnected(true);
      setArduinoStatus(
        link.isVirtual
          ? 'Arduino: connected (virtual orion_pan_tilt receiver)'
          : 'Arduino: connected (dry pan/tilt only)'
      );
      addLog(`Serial connected to ${port} at ${baud} baud`);
    } else {
      setArduinoConnected(false);
      setArduinoStatus('Arduino: connection error');
      alert(`Serial connection failed: ${link.last_error}`);
    }
  };

  // Save new calibration
  const handleSaveCalibration = (plane: PlaneType, calData: PlaneCalibrationData) => {
    const updated = {
      ...config.calibrations,
      [plane]: calData,
    };
    const newConfig = { ...config, calibrations: updated };
    setConfig(newConfig);
    storeRef.current.save_calibration(plane, calData);
    storeRef.current.save_settings(newConfig);
    addLog(`${plane.replace('_', ' ').toUpperCase()} plane calibration saved. Accuracy depends on measured reference points.`);
    if (currentDetection) {
      handleDetectionUpdate(currentDetection, latestFrameSize);
    }
  };

  // Save configuration settings
  const handleSaveConfig = (newConfig: OrionConfig) => {
    setConfig(newConfig);
    storeRef.current.save_settings(newConfig);
    addLog('Engineering configuration settings saved.');
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#202830] text-[#e6edf3]">
      {/* Header */}
      <Header
        mode={mode}
        cameraConnected={cameraConnected}
        arduinoConnected={arduinoConnected}
        hasTarget={currentDetection !== null}
        onOpenSettings={() => setSettingsModalOpen(true)}
        onOpenTests={() => setTestRunnerModalOpen(true)}
        onOpenSketch={() => setSketchModalOpen(true)}
      />

      {/* Main Grid Content */}
      <main className="flex-1 p-3.5 space-y-3 max-w-[1600px] mx-auto w-full">
        {/* Top Section: Camera & Room Grid */}
        <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
          <CameraPanel
            config={config}
            onDetectionUpdate={handleDetectionUpdate}
            onLog={addLog}
            onCameraStatusChange={setCameraConnected}
            onManualTarget={handleManualTarget}
          />

          <RoomGridPanel
            config={config}
            activePlane={activePlane}
            onPlaneChange={(p) => {
              setActivePlane(p);
              setConfig((prev) => ({ ...prev, active_plane: p }));
              addLog(`Active plane changed to ${p.replace('_', ' ')}`);
            }}
            onOpenCalibration={() => setCalibrationModalOpen(true)}
            targetCell={targetCell}
            targetWorld={targetWorld}
            mapStatus={mapStatus}
          />
        </div>

        {/* Middle Section: Detection & Safe Controls */}
        <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
          <DetectionPanel
            detectionStatus={detectionStatus}
            detection={currentDetection}
            targetWorld={targetWorld}
            targetAngles={targetAngles}
            desiredBoresight={config.aim_pixel_reference}
            boresightError={boresightError}
            withinTolerance={withinTolerance}
            toleranceLimit={config.alignment_tolerance_pixels || 20}
          />

          <ControlPanel
            config={config}
            mode={mode}
            onModeChange={(m) => {
              setMode(m);
              addLog(
                `Mode selected: ${m}. ${
                  m === 'DRY AIMING'
                    ? 'Physical servo movement is possible.'
                    : 'No physical output will be sent.'
                }`
              );
            }}
            arduinoConnected={arduinoConnected}
            arduinoStatus={arduinoStatus}
            onToggleSerial={handleToggleSerial}
            onAim={handleAim}
            onBoresight={handleBoresight}
            onStop={handleStop}
            virtualPan={virtualPan}
            virtualTilt={virtualTilt}
          />
        </div>

        {/* Bottom Section: Event / Serial Log */}
        <LogPanel logs={logs} onClear={() => setLogs([])} />
      </main>

      {/* Modals */}
      <CalibrationModal
        isOpen={calibrationModalOpen}
        onClose={() => setCalibrationModalOpen(false)}
        config={config}
        activePlane={activePlane}
        frameSize={latestFrameSize}
        onSaveCalibration={handleSaveCalibration}
      />

      <SettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        config={config}
        onSave={handleSaveConfig}
      />

      <TestRunnerModal
        isOpen={testRunnerModalOpen}
        onClose={() => setTestRunnerModalOpen(false)}
      />

      <ArduinoSketchModal
        isOpen={sketchModalOpen}
        onClose={() => setSketchModalOpen(false)}
      />
    </div>
  );
};
