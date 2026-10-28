import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Camera, Video, VideoOff, Crosshair, RefreshCw, Play, Pause, Sparkles } from 'lucide-react';
import { DetectionResult, OrionConfig } from '../types';
import { TargetDetector, StableTarget, Detection } from '../core/detection';

interface CameraPanelProps {
  config: OrionConfig;
  onDetectionUpdate: (detection: DetectionResult | null, frameSize: [number, number]) => void;
  onLog: (msg: string) => void;
  onCameraStatusChange: (connected: boolean) => void;
  onManualTarget: (target: DetectionResult) => void;
}

export const CameraPanel: React.FC<CameraPanelProps> = ({
  config,
  onDetectionUpdate,
  onLog,
  onCameraStatusChange,
  onManualTarget,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hiddenVideoRef = useRef<HTMLVideoElement | null>(null);

  const [connected, setConnected] = useState<boolean>(false);
  const [paused, setPaused] = useState<boolean>(false);
  const [useSyntheticFeed, setUseSyntheticFeed] = useState<boolean>(true);
  const [cameraStatus, setCameraStatus] = useState<string>('Camera: disconnected');
  const [deviceIndex, setDeviceIndex] = useState<number>(config.camera_index);
  const [width, setWidth] = useState<number>(config.camera_width);
  const [height, setHeight] = useState<number>(config.camera_height);
  const [fps, setFps] = useState<number>(config.camera_fps);

  // Simulated target state for exhibition test without physical camera
  const [simTargetPos, setSimTargetPos] = useState<{ x: number; y: number }>({
    x: config.camera_width / 2,
    y: config.camera_height / 2,
  });
  const [simAutoMove, setSimAutoMove] = useState<boolean>(false);
  const simAngleRef = useRef<number>(0);

  // Trackers and detectors
  const detectorRef = useRef<TargetDetector>(
    new TargetDetector(
      config.detector_mode,
      config.yolo_model,
      config.marker_hsv_low,
      config.marker_hsv_high
    )
  );
  const trackerRef = useRef<StableTarget>(new StableTarget(config.stability_frames));

  // Update detector settings when config changes
  useEffect(() => {
    detectorRef.current = new TargetDetector(
      config.detector_mode,
      config.yolo_model,
      config.marker_hsv_low,
      config.marker_hsv_high
    );
    trackerRef.current = new StableTarget(config.stability_frames);
  }, [
    config.detector_mode,
    config.yolo_model,
    config.marker_hsv_low,
    config.marker_hsv_high,
    config.stability_frames,
  ]);

  // Connect / disconnect camera
  const connectCamera = useCallback(async () => {
    if (useSyntheticFeed) {
      setConnected(true);
      setCameraStatus(`Camera: connected (simulated test feed) · ${width}×${height}`);
      onCameraStatusChange(true);
      onLog(`Camera connected at requested ${width}x${height} / ${fps} fps (simulated feed).`);
      return;
    }

    try {
      if (hiddenVideoRef.current && hiddenVideoRef.current.srcObject) {
        const stream = hiddenVideoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((t) => t.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: width },
          height: { ideal: height },
          frameRate: { ideal: fps },
        },
      });

      if (hiddenVideoRef.current) {
        hiddenVideoRef.current.srcObject = stream;
        await hiddenVideoRef.current.play();
      }

      setConnected(true);
      setCameraStatus(`Camera: connected · ${width}×${height}`);
      onCameraStatusChange(true);
      onLog(`Camera connected at requested ${width}x${height} / ${fps} fps.`);
    } catch (err: any) {
      setConnected(false);
      const errMsg = `Camera connection failed: ${err.message || 'Device unavailable'}`;
      setCameraStatus(errMsg);
      onCameraStatusChange(false);
      onLog(errMsg + ' Switching to simulated marker test feed.');
      // Auto fallback to simulated feed for exhibition
      setUseSyntheticFeed(true);
      setConnected(true);
      setCameraStatus(`Camera: connected (simulated test feed) · ${width}×${height}`);
      onCameraStatusChange(true);
    }
  }, [width, height, fps, useSyntheticFeed, onCameraStatusChange, onLog]);

  const disconnectCamera = useCallback(() => {
    if (hiddenVideoRef.current && hiddenVideoRef.current.srcObject) {
      const stream = hiddenVideoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
      hiddenVideoRef.current.srcObject = null;
    }
    setConnected(false);
    setCameraStatus('Camera: disconnected');
    onCameraStatusChange(false);
    onDetectionUpdate(null, [width, height]);
  }, [width, height, onCameraStatusChange, onDetectionUpdate]);

  const togglePause = () => {
    const next = !paused;
    setPaused(next);
    if (next) {
      trackerRef.current.update(null);
      onDetectionUpdate(null, [width, height]);
      onLog('Preview paused — target invalidated');
    } else {
      onLog('Preview resumed');
    }
  };

  const handleManualCentreTest = () => {
    const cx = Math.round(width / 2);
    const cy = Math.round(height / 2);
    const manualDetection = new Detection([cx - 15, cy - 15, cx + 15, cy + 15], null, 'manual test point');
    onManualTarget(manualDetection);
    onLog('Manual synthetic centre point selected. It is not a detected fire or real target.');
  };

  // Main rendering & detection loop
  useEffect(() => {
    let animId: number | null = null;
    const intervalMs = 1000 / Math.max(1, fps);

    const timer = setInterval(() => {
      if (!connected || paused) return;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      if (useSyntheticFeed) {
        // Draw synthetic camera frame
        // Background room scene
        ctx.fillStyle = '#1c232c';
        ctx.fillRect(0, 0, width, height);

        // Perspective wall lines
        ctx.strokeStyle = '#283340';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, height * 0.7);
        ctx.lineTo(width, height * 0.7);
        ctx.moveTo(width * 0.2, 0);
        ctx.lineTo(width * 0.2, height);
        ctx.moveTo(width * 0.8, 0);
        ctx.lineTo(width * 0.8, height);
        ctx.stroke();

        // Target position
        let tx = simTargetPos.x;
        let ty = simTargetPos.y;

        if (simAutoMove) {
          simAngleRef.current += 0.03;
          tx = width / 2 + Math.cos(simAngleRef.current) * (width * 0.25);
          ty = height / 2 + Math.sin(simAngleRef.current * 1.5) * (height * 0.2);
          setSimTargetPos({ x: tx, y: ty });
        }

        // Draw bright orange/red simulated test marker
        // RGB (235, 75, 20) matches OpenCV HSV bounds [0..25, 90..255, 80..255]
        const markerRadius = 24;
        ctx.fillStyle = '#e64a19';
        ctx.beginPath();
        ctx.arc(tx, ty, markerRadius, 0, Math.PI * 2);
        ctx.fill();

        // Inner marker ring
        ctx.fillStyle = '#ff7043';
        ctx.beginPath();
        ctx.arc(tx, ty, markerRadius * 0.6, 0, Math.PI * 2);
        ctx.fill();

        // Label simulated marker
        ctx.fillStyle = '#84909b';
        ctx.font = '11px monospace';
        ctx.fillText('SIMULATED MARKER (EXHIBITION)', tx - 80, ty - markerRadius - 8);
      } else if (hiddenVideoRef.current && hiddenVideoRef.current.readyState >= 2) {
        // Draw real webcam frame
        ctx.drawImage(hiddenVideoRef.current, 0, 0, width, height);
      } else {
        return;
      }

      // Read frame pixels for HSV detection
      const imageData = ctx.getImageData(0, 0, width, height);
      const rawDetection = detectorRef.current.detect(imageData);
      const stableDetection = trackerRef.current.update(rawDetection);

      // Draw detection overlays
      if (rawDetection) {
        const [x1, y1, x2, y2] = rawDetection.box;
        const [cx, cy] = rawDetection.center;

        // Bounding box: #3cd1a5 (teal-green)
        ctx.strokeStyle = '#3cd1a5';
        ctx.lineWidth = 2;
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

        // Crosshair marker: #00beff (sky-blue)
        ctx.strokeStyle = '#00beff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - 12, cy);
        ctx.lineTo(cx + 12, cy);
        ctx.moveTo(cx, cy - 12);
        ctx.lineTo(cx, cy + 12);
        ctx.stroke();
      }

      // Desired boresight reference marker if calibrated
      if (config.aim_pixel_reference) {
        const [bx, by] = config.aim_pixel_reference;
        ctx.strokeStyle = '#a855f7';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(bx, by, config.alignment_tolerance_pixels || 20, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#c084fc';
        ctx.font = '10px monospace';
        ctx.fillText('BORESIGHT REF', bx + 6, by - 6);
      }

      onDetectionUpdate(stableDetection || rawDetection, [width, height]);
    }, intervalMs);

    return () => {
      clearInterval(timer);
      if (animId !== null) cancelAnimationFrame(animId);
    };
  }, [connected, paused, useSyntheticFeed, width, height, fps, simTargetPos, simAutoMove, config.aim_pixel_reference, config.alignment_tolerance_pixels, onDetectionUpdate]);

  // Click or drag on canvas to reposition synthetic marker
  const handleCanvasInteraction = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!useSyntheticFeed) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = width / rect.width;
    const scaleY = height / rect.height;
    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;
    setSimTargetPos({ x: clickX, y: clickY });
  };

  return (
    <div className="flex flex-col rounded-lg border border-[#42505e] bg-[#171d24] p-3 shadow">
      {/* Title */}
      <div className="mb-2 flex items-center justify-between border-b border-[#303b46] pb-2">
        <div className="flex items-center gap-2">
          <Camera className="h-4 w-4 text-[#67c5ad]" />
          <h2 className="text-sm font-semibold tracking-wide text-[#67c5ad]">
            LIVE CAMERA · SIMULATED-TARGET VISION
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setUseSyntheticFeed(!useSyntheticFeed)}
            className={`flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium transition ${
              useSyntheticFeed
                ? 'border-[#67c5ad]/40 bg-[#67c5ad]/10 text-[#67c5ad]'
                : 'border-[#526170] bg-[#303b46] text-[#84909b]'
            }`}
            title="Toggle between physical camera and simulated exhibition marker"
          >
            <Sparkles className="h-3 w-3" />
            <span>{useSyntheticFeed ? 'Simulated Target Feed' : 'Webcam Hardware'}</span>
          </button>
        </div>
      </div>

      {/* Video Viewport / Canvas */}
      <div className="relative flex aspect-4/3 w-full items-center justify-center overflow-hidden rounded border border-[#42505e] bg-[#10151a]">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          onClick={handleCanvasInteraction}
          onMouseMove={(e) => {
            if (e.buttons === 1) handleCanvasInteraction(e);
          }}
          className={`h-full w-full object-contain ${
            connected ? 'cursor-crosshair' : 'hidden'
          }`}
        />

        {!connected && (
          <div className="flex flex-col items-center justify-center p-6 text-center text-[#84909b]">
            <VideoOff className="mb-3 h-10 w-10 text-[#526170]" />
            <p className="text-sm font-medium text-[#e6edf3]">Camera disconnected</p>
            <p className="mt-1 max-w-xs text-xs text-[#84909b]">
              Connect a physical webcam or launch the simulated exhibition target to preview and test vision tracking.
            </p>
            <button
              onClick={connectCamera}
              className="mt-4 flex items-center gap-1.5 rounded border border-[#67c5ad] bg-[#67c5ad]/20 px-4 py-1.5 text-xs font-semibold text-[#67c5ad] transition hover:bg-[#67c5ad]/30"
            >
              <Video className="h-3.5 w-3.5" />
              <span>Connect Camera Feed</span>
            </button>
          </div>
        )}

        {/* Hidden video element for WebRTC camera stream */}
        <video ref={hiddenVideoRef} className="hidden" playsInline muted />
      </div>

      {/* Simulated target feed controls */}
      {connected && useSyntheticFeed && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded border border-[#303b46] bg-[#202830] px-2.5 py-1.5 text-xs text-[#84909b]">
          <span className="text-amber-400 font-medium">Click / drag on preview to move test marker</span>
          <button
            onClick={() => setSimAutoMove(!simAutoMove)}
            className={`rounded border px-2 py-0.5 text-xs font-medium transition ${
              simAutoMove
                ? 'border-amber-500/50 bg-amber-500/20 text-amber-300'
                : 'border-[#526170] bg-[#303b46] text-[#e6edf3]'
            }`}
          >
            {simAutoMove ? 'Stop Auto Orbit' : 'Auto Orbit Marker'}
          </button>
        </div>
      )}

      {/* Controls row */}
      <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
        <div className="flex items-center gap-1">
          <label className="text-[#84909b]">Device:</label>
          <input
            type="number"
            min={0}
            max={10}
            value={deviceIndex}
            onChange={(e) => setDeviceIndex(Number(e.target.value))}
            className="w-12 rounded border border-[#526170] bg-[#303b46] px-1.5 py-1 text-center text-[#e6edf3]"
          />
        </div>

        <div className="flex items-center gap-1">
          <label className="text-[#84909b]">W×H:</label>
          <input
            type="number"
            step={80}
            min={160}
            max={1920}
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
            className="w-16 rounded border border-[#526170] bg-[#303b46] px-1.5 py-1 text-center text-[#e6edf3]"
          />
          <span className="text-[#84909b]">×</span>
          <input
            type="number"
            step={60}
            min={120}
            max={1080}
            value={height}
            onChange={(e) => setHeight(Number(e.target.value))}
            className="w-16 rounded border border-[#526170] bg-[#303b46] px-1.5 py-1 text-center text-[#e6edf3]"
          />
        </div>

        <div className="flex items-center gap-1">
          <label className="text-[#84909b]">FPS:</label>
          <input
            type="number"
            min={1}
            max={60}
            value={fps}
            onChange={(e) => setFps(Number(e.target.value))}
            className="w-12 rounded border border-[#526170] bg-[#303b46] px-1.5 py-1 text-center text-[#e6edf3]"
          />
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {!connected ? (
            <button
              onClick={connectCamera}
              className="flex items-center gap-1 rounded border border-[#526170] bg-[#303b46] px-2.5 py-1 font-medium text-[#e6edf3] hover:bg-[#3e4c59]"
            >
              <Video className="h-3.5 w-3.5 text-[#67c5ad]" />
              <span>Connect camera</span>
            </button>
          ) : (
            <>
              <button
                onClick={togglePause}
                className="flex items-center gap-1 rounded border border-[#526170] bg-[#303b46] px-2.5 py-1 font-medium text-[#e6edf3] hover:bg-[#3e4c59]"
              >
                {paused ? <Play className="h-3.5 w-3.5 text-emerald-400" /> : <Pause className="h-3.5 w-3.5 text-amber-400" />}
                <span>{paused ? 'Resume preview' : 'Pause preview'}</span>
              </button>
              <button
                onClick={() => {
                  disconnectCamera();
                  setTimeout(connectCamera, 100);
                }}
                className="flex items-center gap-1 rounded border border-[#526170] bg-[#303b46] px-2.5 py-1 font-medium text-[#e6edf3] hover:bg-[#3e4c59]"
              >
                <RefreshCw className="h-3.5 w-3.5 text-sky-400" />
                <span>Reconnect</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Manual synthetic centre test button */}
      <div className="mt-2">
        <button
          onClick={handleManualCentreTest}
          className="flex w-full items-center justify-center gap-1.5 rounded border border-[#526170] bg-[#303b46] px-3 py-1.5 text-xs font-medium text-[#e6edf3] transition hover:bg-[#3e4c59]"
        >
          <Crosshair className="h-3.5 w-3.5 text-amber-400" />
          <span>Manual test: confirm frame centre</span>
        </button>
      </div>

      {/* Camera status line */}
      <div className="mt-2 text-xs font-mono text-[#84909b]">
        {cameraStatus}
      </div>
    </div>
  );
};
