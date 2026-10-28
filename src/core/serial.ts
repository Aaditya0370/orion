/**
 * Safe ASCII serial protocol for dry pan/tilt only.
 * Host -> Arduino: AIM,<pan 0..180>,<tilt 0..180>\n or STOP\n
 * Arduino -> host: STATUS,READY\n, STATUS,MOVED,<pan>,<tilt>\n, ERR,<reason>\n.
 * Ported directly from orion/serial_link.py and matching arduino/orion_pan_tilt.ino
 */

const COMMAND_REGEX = /^AIM,([0-9]{1,3}),([0-9]{1,3})$/;

export function validate_angles(
  pan: number | string,
  tilt: number | string,
  pan_limits: [number, number] = [20, 160],
  tilt_limits: [number, number] = [25, 155]
): [number, number] {
  const panNum = Number(pan);
  const tiltNum = Number(tilt);
  const panLow = Number(pan_limits[0]);
  const panHigh = Number(pan_limits[1]);
  const tiltLow = Number(tilt_limits[0]);
  const tiltHigh = Number(tilt_limits[1]);

  const limits = [panLow, panHigh, tiltLow, tiltHigh];
  if (!limits.every((v) => Number.isFinite(v))) {
    throw new Error('Servo limits must be finite');
  }

  if (!(0 <= panLow && panLow <= panHigh && panHigh <= 180 && 0 <= tiltLow && tiltLow <= tiltHigh && tiltHigh <= 180)) {
    throw new Error('Servo limits must stay within 0..180 degrees');
  }

  if (!Number.isFinite(panNum) || !Number.isFinite(tiltNum)) {
    throw new Error('Servo angles must be finite');
  }

  if (Math.floor(panNum) !== panNum || Math.floor(tiltNum) !== tiltNum) {
    throw new Error('Servo angles must be whole degrees');
  }

  if (!(panLow <= panNum && panNum <= panHigh && tiltLow <= tiltNum && tiltNum <= tiltHigh)) {
    throw new Error('Servo angle outside configured safe limits');
  }

  return [Math.round(panNum), Math.round(tiltNum)];
}

export function format_aim(
  pan: number,
  tilt: number,
  pan_limits: [number, number] = [20, 160],
  tilt_limits: [number, number] = [25, 155]
): string {
  const [validPan, validTilt] = validate_angles(pan, tilt, pan_limits, tilt_limits);
  return `AIM,${validPan},${validTilt}\n`;
}

export type ParsedSerialMessage =
  | { type: 'AIM'; pan: number; tilt: number }
  | { type: 'STOP' }
  | { type: 'STATUS'; status: 'READY' }
  | { type: 'STATUS_MOVED'; pan: number; tilt: number }
  | { type: 'ERR'; reason: string };

export function parse_message(
  message: string,
  pan_limits: [number, number] = [20, 160],
  tilt_limits: [number, number] = [25, 155]
): ParsedSerialMessage {
  const line = message.trim();
  const match = line.match(COMMAND_REGEX);
  if (match) {
    const [pan, tilt] = validate_angles(match[1], match[2], pan_limits, tilt_limits);
    return { type: 'AIM', pan, tilt };
  }
  if (line === 'STOP') {
    return { type: 'STOP' };
  }
  if (line === 'STATUS,READY') {
    return { type: 'STATUS', status: 'READY' };
  }
  const statusMatch = line.match(/^STATUS,MOVED,([0-9]{1,3}),([0-9]{1,3})$/);
  if (statusMatch) {
    const [pan, tilt] = validate_angles(statusMatch[1], statusMatch[2], pan_limits, tilt_limits);
    return { type: 'STATUS_MOVED', pan, tilt };
  }
  const errorMatch = line.match(/^ERR,([A-Z0-9_ -]{1,40})$/);
  if (errorMatch) {
    return { type: 'ERR', reason: errorMatch[1] };
  }
  throw new Error('Invalid serial protocol message');
}

export class SerialLink {
  baud: number;
  pan_limits: [number, number];
  tilt_limits: [number, number];
  connected = false;
  last_error = '';
  portName = '';
  isVirtual = false;

  // Virtual Arduino servo state
  virtualPan = 90;
  virtualTilt = 90;

  // WebSerial objects if available
  private webSerialPort: any = null;
  private reader: any = null;
  private writer: any = null;
  private rxBuffer = '';
  private onLineCallback?: (line: string) => void;

  constructor(
    baud = 9600,
    pan_limits: [number, number] = [20, 160],
    tilt_limits: [number, number] = [25, 155]
  ) {
    this.baud = Number(baud);
    this.pan_limits = [...pan_limits];
    this.tilt_limits = [...tilt_limits];
  }

  setLineCallback(callback: (line: string) => void) {
    this.onLineCallback = callback;
  }

  async connect(portName: string): Promise<boolean> {
    this.disconnect();
    this.last_error = '';
    this.portName = portName.trim();

    if (!this.portName) {
      this.last_error = 'Serial port name is required';
      return false;
    }

    // Check if WebSerial is supported and user requested a physical port or COM port
    const hasWebSerial = typeof navigator !== 'undefined' && 'serial' in navigator;

    if (hasWebSerial && (this.portName.toLowerCase().startsWith('webserial') || this.portName.toLowerCase().startsWith('usb'))) {
      try {
        this.webSerialPort = await (navigator as any).serial.requestPort();
        await this.webSerialPort.open({ baudRate: this.baud });
        this.connected = true;
        this.isVirtual = false;
        this.startReading();
        return true;
      } catch (err: any) {
        this.last_error = `WebSerial connection failed: ${err.message || err}`;
        return false;
      }
    }

    // Default to virtual Arduino receiver matching orion_pan_tilt.ino
    this.isVirtual = true;
    this.connected = true;
    this.virtualPan = 90;
    this.virtualTilt = 90;

    // Simulate Arduino setup() delay and STATUS,READY
    setTimeout(() => {
      if (this.connected && this.onLineCallback) {
        this.onLineCallback('STATUS,READY');
      }
    }, 300);

    return true;
  }

  disconnect(): void {
    if (this.webSerialPort) {
      try {
        if (this.reader) {
          this.reader.cancel();
          this.reader.releaseLock();
        }
        if (this.writer) {
          this.writer.releaseLock();
        }
        this.webSerialPort.close();
      } catch {
        // ignore
      }
    }
    this.webSerialPort = null;
    this.connected = false;
    this.isVirtual = false;
  }

  send_angles(pan: number, tilt: number): string {
    const command = format_aim(pan, tilt, this.pan_limits, this.tilt_limits);
    if (!this.connected) {
      throw new Error('Serial device is not connected');
    }

    if (this.isVirtual) {
      // Simulate orion_pan_tilt.ino processLine()
      setTimeout(() => {
        if (!this.connected || !this.onLineCallback) return;
        if (
          pan < this.pan_limits[0] ||
          pan > this.pan_limits[1] ||
          tilt < this.tilt_limits[0] ||
          tilt > this.tilt_limits[1]
        ) {
          this.onLineCallback('ERR,ANGLE_LIMIT');
        } else {
          this.virtualPan = pan;
          this.virtualTilt = tilt;
          this.onLineCallback(`STATUS,MOVED,${pan},${tilt}`);
        }
      }, 80);
      return command;
    }

    if (this.writer) {
      const encoder = new TextEncoder();
      this.writer.write(encoder.encode(command));
    }

    return command;
  }

  send_stop(): void {
    if (!this.connected) {
      throw new Error('Serial device is not connected');
    }

    if (this.isVirtual) {
      setTimeout(() => {
        if (!this.connected || !this.onLineCallback) return;
        this.virtualPan = 90;
        this.virtualTilt = 90;
        this.onLineCallback(`STATUS,MOVED,90,90`);
      }, 80);
      return;
    }

    if (this.writer) {
      const encoder = new TextEncoder();
      this.writer.write(encoder.encode('STOP\n'));
    }
  }

  private async startReading(): Promise<void> {
    if (!this.webSerialPort) return;
    const textDecoder = new TextDecoderStream();
    this.webSerialPort.readable.pipeTo(textDecoder.writable);
    this.reader = textDecoder.readable.getReader();

    try {
      while (true) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value) {
          this.rxBuffer += value;
          const lines = this.rxBuffer.split('\n');
          this.rxBuffer = lines.pop() || '';
          for (const line of lines) {
            const clean = line.trim();
            if (clean && this.onLineCallback) {
              try {
                parse_message(clean, this.pan_limits, this.tilt_limits);
                this.onLineCallback(clean);
              } catch (e: any) {
                this.onLineCallback(`INVALID ${clean}`);
              }
            }
          }
        }
      }
    } catch {
      // Reader cancelled
    }
  }
}
