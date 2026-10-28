"""Safe ASCII serial protocol for dry pan/tilt only.
Host -> Arduino: AIM,<pan 0..180>,<tilt 0..180>\n or STOP\n
Arduino -> host: STATUS,READY\n, STATUS,MOVED,<pan>,<tilt>\n, ERR,<reason>\n.
No pump or water command exists in this protocol.
"""
import math
import re

_COMMAND = re.compile(r"^AIM,([0-9]{1,3}),([0-9]{1,3})$")


def validate_angles(pan, tilt, pan_limits=(20, 160), tilt_limits=(25, 155)):
    try:
        pan, tilt = float(pan), float(tilt)
        pan_low, pan_high = float(pan_limits[0]), float(pan_limits[1])
        tilt_low, tilt_high = float(tilt_limits[0]), float(tilt_limits[1])
    except (TypeError, ValueError, IndexError):
        raise ValueError("Servo angles and limits must be numeric")
    limits = (pan_low, pan_high, tilt_low, tilt_high)
    if not all(math.isfinite(value) for value in limits):
        raise ValueError("Servo limits must be finite")
    if not (0 <= pan_low <= pan_high <= 180 and 0 <= tilt_low <= tilt_high <= 180):
        raise ValueError("Servo limits must stay within 0..180 degrees")
    if not math.isfinite(pan) or not math.isfinite(tilt):
        raise ValueError("Servo angles must be finite")
    if int(pan) != pan or int(tilt) != tilt:
        raise ValueError("Servo angles must be whole degrees")
    if not (pan_low <= pan <= pan_high and tilt_low <= tilt <= tilt_high):
        raise ValueError("Servo angle outside configured safe limits")
    return int(pan), int(tilt)


def format_aim(pan, tilt, pan_limits=(20, 160), tilt_limits=(25, 155)):
    pan, tilt = validate_angles(pan, tilt, pan_limits, tilt_limits)
    return "AIM,{:d},{:d}\n".format(pan, tilt)


def parse_message(message, pan_limits=(20, 160), tilt_limits=(25, 155)):
    """Validate incoming/logged protocol messages; return normalized tuple."""
    line = message.strip()
    match = _COMMAND.match(line)
    if match:
        return ("AIM",) + validate_angles(match.group(1), match.group(2), pan_limits, tilt_limits)
    if line == "STOP":
        return ("STOP",)
    if line == "STATUS,READY":
        return ("STATUS", "READY")
    status = re.match(r"^STATUS,MOVED,([0-9]{1,3}),([0-9]{1,3})$", line)
    if status:
        pan, tilt = validate_angles(status.group(1), status.group(2), pan_limits, tilt_limits)
        return ("STATUS", "MOVED", pan, tilt)
    error = re.match(r"^ERR,[A-Z0-9_ -]{1,40}$", line)
    if error:
        return ("ERR", line[4:])
    raise ValueError("Invalid serial protocol message")


class SerialLink(object):
    def __init__(self, baud=9600, pan_limits=(20, 160), tilt_limits=(25, 155)):
        self.baud = int(baud)
        self.pan_limits = tuple(pan_limits)
        self.tilt_limits = tuple(tilt_limits)
        self.connection = None
        self.last_error = ""
        self._rx_buffer = bytearray()

    @property
    def connected(self):
        return self.connection is not None and bool(self.connection.is_open)

    def connect(self, port):
        self.disconnect()
        self._rx_buffer = bytearray()
        try:
            import serial
            self.connection = serial.Serial(port, self.baud, timeout=0.15, write_timeout=0.5)
            return True
        except Exception as exc:
            self.connection = None
            self.last_error = str(exc)
            return False

    def disconnect(self):
        if self.connection is not None:
            try:
                self.connection.close()
            except Exception:
                pass
        self.connection = None

    def send_angles(self, pan, tilt):
        command = format_aim(pan, tilt, self.pan_limits, self.tilt_limits)
        if not self.connected:
            raise IOError("Serial device is not connected")
        self.connection.write(command.encode("ascii"))
        return command

    def send_stop(self):
        if not self.connected:
            raise IOError("Serial device is not connected")
        self.connection.write(b"STOP\n")

    def read_lines(self):
        if not self.connected:
            return []
        lines = []
        try:
            waiting = self.connection.in_waiting
            if waiting:
                self._rx_buffer.extend(self.connection.read(waiting))
            if len(self._rx_buffer) > 256 and b"\n" not in self._rx_buffer:
                self._rx_buffer = bytearray()
                self.last_error = "Serial receive buffer exceeded 256 bytes without a line ending"
                return []
            while b"\n" in self._rx_buffer:
                raw, _, remainder = self._rx_buffer.partition(b"\n")
                self._rx_buffer = bytearray(remainder)
                text = raw.decode("ascii", "replace").strip()
                if not text:
                    continue
                try:
                    parse_message(text, self.pan_limits, self.tilt_limits)
                    lines.append(text)
                except ValueError as exc:
                    self.last_error = str(exc)
                    lines.append("INVALID " + text)
        except Exception as exc:
            self.last_error = str(exc)
        return lines
