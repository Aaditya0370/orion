# ORION FIREGUARD

Offline-first web demonstration system of simulated-target computer vision, calibrated planar room mapping, and manually commanded pan–tilt servos. Designed for printed, high-contrast markers / LED targets in a school science exhibition (RSBVP 2026–27).

**The computer-vision fallback is a colour-marker heuristic, not a real-fire detector. Do not test with an open flame.**

---

## Overview

ORION FIREGUARD is rewritten as a responsive, zero-latency React + TypeScript web application that runs directly in any modern web browser without requiring complex native installations, proprietary runtimes, or paid cloud APIs.

### Core Features

1. **Live Camera & Vision Tracking**
   - Direct webcam access via HTML5 `navigator.mediaDevices.getUserMedia`.
   - Adjustable resolution (e.g. 640×480) and frame rate (up to 60 FPS).
   - High-contrast simulated color-marker detector using real-time HSV range segmentation and connected-component centroid tracking.
   - Multi-frame stability filter (`StableTarget`) requiring consecutive consistent frames before locking.
   - Interactive exhibition test mode: draggable simulated target with auto-orbit option.
   - Manual synthetic centre test target button for hardware-free demonstration.

2. **Semi-3D Room Mapper & Homography Calibration**
   - Support for three surfaces: `floor` (X–Y), `back_wall` (X–Z), and `side_wall` (Y–Z).
   - Direct Linear Transformation (DLT) 8-DOF planar homography solver computed via Jacobi SVD nullspace decomposition.
   - Convex hull boundary check preventing unsupported extrapolation outside surveyed image points.
   - 2D/3D calibrated grid canvas showing active target cell, survey references, and world coordinates in cm.

3. **Coordinate Geometry & Vector Transforms**
   - Right-handed world axes: +X right, +Y forward from back wall, +Z upward.
   - 3D Euler rotation (`rotate_xyz`) and local coordinate composition (`compose_orientation`).
   - World-to-turret transform (`world_to_turret`) using inverse rotation matrices.
   - Pan and elevation calculations:
     $$\text{Pan} = \text{atan2}(dx, dy)$$
     $$\text{Elevation} = \text{atan2}(dz, \sqrt{dx^2 + dy^2})$$
   - Safe servo mapping (`servo_command`) with strict limit verification and axis inversion flags.

4. **Arduino Interface & Safe Protocol**
   - Matching two-servo pan/tilt Arduino receiver (`orion_pan_tilt.ino`).
   - Standard dry-aim ASCII serial protocol:
     - `AIM,<pan>,<tilt>\n` (whole degrees; clamped to safe configured limits)
     - `STOP\n` (return to neutral 90°/90°)
     - `STATUS,READY\n`
     - `STATUS,MOVED,<pan>,<tilt>\n`
     - `ERR,<reason>\n`
   - Real WebSerial API connection support for physical USB Arduino boards.
   - Integrated virtual Arduino receiver emulator providing realistic servo feedback even when physical hardware is unplugged.

5. **Safe Operating Modes**
   - **SIMULATION**: Calculates target coordinates and angles without transmitting physical servo commands.
   - **DRY AIMING**: Moves dry pan/tilt servos only. Never commands a pump.
   - **FUTURE HARDWARE**: Permanently disabled. No pump output or command exists.

6. **Automated Verification Test Suite**
   - Built-in interactive test runner executing 10 unit test suites ported from `test_core.py`, verifying all geometry transformations, homography math, safe limits, fallback detectors, and protocol validation.

---

## Project Structure

```text
/
├── src/
│   ├── components/
│   │   ├── Header.tsx              Top bar with status indicators & actions
│   │   ├── CameraPanel.tsx         Webcam / synthetic feed & HSV detector
│   │   ├── RoomGridPanel.tsx       Planar room grid & cell mapping canvas
│   │   ├── DetectionPanel.tsx      Geometry & boresight error readouts
│   │   ├── ControlPanel.tsx        Mode selector, serial link & safe outputs
│   │   ├── LogPanel.tsx            Event / serial terminal log
│   │   ├── CalibrationModal.tsx    Guided 2-step plane calibration wizard
│   │   ├── SettingsModal.tsx       Room dimensions, offsets & servo limits
│   │   ├── TestRunnerModal.tsx     Automated verification test suite (10/10)
│   │   └── ArduinoSketchModal.tsx  Arduino sketch (orion_pan_tilt.ino) viewer
│   ├── core/
│   │   ├── geometry.ts             3D rotations, Euler composition, pan/elevation
│   │   ├── mapping.ts              PlaneCalibration, convex hull, SVD homography
│   │   ├── detection.ts            HSV color-marker detector & StableTarget
│   │   ├── serial.ts               ASCII dry-aim serial protocol & WebSerial
│   │   ├── storage.ts              Offline settings, calibrations & event logs
│   │   └── tests.ts                10 automated core unit tests
│   ├── types/
│   │   └── index.ts                TypeScript interfaces and type definitions
│   ├── App.tsx                     Main application coordinator
│   ├── index.css                   Tailwind CSS & dark engineering styling
│   └── main.tsx                    Vite / React entry point
├── orion_pan_tilt.ino              Matching Arduino two-servo sketch (Pins 9 & 10)
├── config.json                     Default configuration reference
├── index.html                      Web applet entry point
├── package.json                    Scripts & dependencies
├── tsconfig.json                   TypeScript compiler configuration
├── vite.config.ts                  Vite build configuration
└── metadata.json                   AI Studio applet metadata
```

---

## Quick Start

```bash
# Install dependencies
npm install

# Start development server on port 3000
npm run dev

# Build for production
npm run build
```

---

## Safety Notice

This application is strictly designed for demonstration and educational purposes at exhibitions using printed color targets or LEDs. It is **not** a life-safety fire suppression system. **Never test with an open flame.**
