import React, { useState } from 'react';
import { X, Copy, Check, Cpu } from 'lucide-react';

interface ArduinoSketchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ARDUINO_SKETCH = `/* ORION FIREGUARD dry pan/tilt receiver.
   Protocol (9600 baud by default): AIM,<pan 0..180>,<tilt 0..180>\\n
   Replies STATUS,READY / STATUS,MOVED,<pan>,<tilt> / ERR,<reason>.
   Configure the mechanical limits and neutral angles for the actual servos.
   There is intentionally no pump output or pump command.
*/
#include <Servo.h>
#include <string.h>

const long SERIAL_BAUD = 9600;
const int PAN_PIN = 9;
const int TILT_PIN = 10;
const int PAN_MIN = 20;
const int PAN_MAX = 160;
const int TILT_MIN = 25;
const int TILT_MAX = 155;
const int PAN_NEUTRAL = 90;
const int TILT_NEUTRAL = 90;

Servo panServo;
Servo tiltServo;
char inputLine[40];
size_t inputLength = 0;
bool discardingLine = false;

void moveTo(int pan, int tilt) {
  panServo.write(constrain(pan, PAN_MIN, PAN_MAX));
  tiltServo.write(constrain(tilt, TILT_MIN, TILT_MAX));
  Serial.print("STATUS,MOVED,"); Serial.print(pan); Serial.print(','); Serial.println(tilt);
}

bool readAngle(char **cursor, int *value, char terminator) {
  int digits = 0;
  int parsed = 0;
  while (**cursor >= '0' && **cursor <= '9') {
    if (digits >= 3) return false;
    parsed = parsed * 10 + (**cursor - '0');
    (*cursor)++;
    digits++;
  }
  if (digits == 0 || **cursor != terminator) return false;
  if (terminator != '\\0') (*cursor)++;
  *value = parsed;
  return true;
}

void processLine(char *line) {
  if (strcmp(line, "STOP") == 0) {
    moveTo(PAN_NEUTRAL, TILT_NEUTRAL);
    return;
  }
  if (strncmp(line, "AIM,", 4) == 0) {
    char *cursor = line + 4;
    int pan = -1, tilt = -1;
    if (readAngle(&cursor, &pan, ',') && readAngle(&cursor, &tilt, '\\0')) {
      if (pan < PAN_MIN || pan > PAN_MAX || tilt < TILT_MIN || tilt > TILT_MAX) {
        Serial.println("ERR,ANGLE_LIMIT");
        return;
      }
      moveTo(pan, tilt);
      return;
    }
  }
  Serial.println("ERR,BAD_MESSAGE");
}

void setup() {
  Serial.begin(SERIAL_BAUD);
  panServo.attach(PAN_PIN);
  tiltServo.attach(TILT_PIN);
  panServo.write(PAN_NEUTRAL);
  tiltServo.write(TILT_NEUTRAL);
  delay(300);
  Serial.println("STATUS,READY");
}

void loop() {
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\\n') {
      if (discardingLine) {
        discardingLine = false;
        inputLength = 0;
        Serial.println("ERR,LINE_TOO_LONG");
        continue;
      }
      inputLine[inputLength] = '\\0';
      if (inputLength > 0 && inputLine[inputLength - 1] == '\\r') inputLine[inputLength - 1] = '\\0';
      processLine(inputLine);
      inputLength = 0;
    } else if (!discardingLine && inputLength < sizeof(inputLine) - 1) {
      inputLine[inputLength++] = c;
    } else {
      inputLength = 0;
      discardingLine = true;
    }
  }
}`;

export const ArduinoSketchModal: React.FC<ArduinoSketchModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const [copied, setCopied] = useState<boolean>(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(ARDUINO_SKETCH);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col rounded-lg border border-[#42505e] bg-[#202830] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#303b46] px-5 py-3">
          <div className="flex items-center gap-2">
            <Cpu className="h-5 w-5 text-sky-400" />
            <div>
              <h3 className="text-base font-bold text-[#67c5ad]">
                ARDUINO RECEIVER SKETCH (orion_pan_tilt.ino)
              </h3>
              <p className="text-xs text-[#84909b]">
                Pins: Pan=Pin 9, Tilt=Pin 10 · Baud: 9600 · Dry AIM &amp; STOP protocol
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-[#84909b] transition hover:bg-[#303b46] hover:text-[#e6edf3]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Pinout Notes */}
        <div className="border-b border-[#303b46] bg-[#171d24] px-5 py-2 text-xs text-[#84909b]">
          <span className="font-semibold text-amber-400">Wiring notes:</span> Connect Pan Servo PWM to Digital Pin 9, Tilt Servo PWM to Digital Pin 10. Power servos from external 5V/6V supply with shared ground. <strong className="text-rose-400">Never connect a pump.</strong>
        </div>

        {/* Code View */}
        <div className="relative flex-1 overflow-y-auto p-4">
          <button
            onClick={handleCopy}
            className="absolute right-6 top-6 flex items-center gap-1.5 rounded border border-[#526170] bg-[#303b46] px-3 py-1.5 text-xs text-[#e6edf3] shadow transition hover:bg-[#3e4c59]"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 text-sky-400" />}
            <span>{copied ? 'Copied!' : 'Copy Sketch'}</span>
          </button>

          <pre className="rounded border border-[#42505e] bg-[#151b21] p-4 font-mono text-xs leading-relaxed text-[#d9e2ec] overflow-x-auto">
            {ARDUINO_SKETCH}
          </pre>
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-[#303b46] px-5 py-3">
          <button
            onClick={onClose}
            className="rounded border border-[#526170] bg-[#303b46] px-4 py-1.5 text-xs text-[#e6edf3] hover:bg-[#3e4c59]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
