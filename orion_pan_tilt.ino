/* ORION FIREGUARD dry pan/tilt receiver.
   Protocol (9600 baud by default): AIM,<pan 0..180>,<tilt 0..180>\n
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
  if (terminator != '\0') (*cursor)++;
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
    if (readAngle(&cursor, &pan, ',') && readAngle(&cursor, &tilt, '\0')) {
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
    if (c == '\n') {
      if (discardingLine) {
        discardingLine = false;
        inputLength = 0;
        Serial.println("ERR,LINE_TOO_LONG");
        continue;
      }
      inputLine[inputLength] = '\0';
      if (inputLength > 0 && inputLine[inputLength - 1] == '\r') inputLine[inputLength - 1] = '\0';
      processLine(inputLine);
      inputLength = 0;
    } else if (!discardingLine && inputLength < sizeof(inputLine) - 1) {
      inputLine[inputLength++] = c;
    } else {
      inputLength = 0;
      discardingLine = true;
    }
  }
}
