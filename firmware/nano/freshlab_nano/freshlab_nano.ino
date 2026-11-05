/*
 * FreshLab Nano firmware — "dumb I/O" board.
 *
 * Responsibilities (and ONLY these):
 *   - read DHT22 (air temp/humidity) and MH soil-moisture sensor (analog)
 *   - switch relay channels on/off when the Pi tells it to
 *   - hardware safety: per-channel max-on time + all-off if the Pi goes silent
 *
 * No schedules, no thresholds, no business logic. That lives in the cloud.
 *
 * Serial protocol: see docs/protocol.md (115200 baud, '\n'-terminated lines).
 *
 * Library needed: "DHT sensor library" by Adafruit (+ "Adafruit Unified Sensor").
 * Board: Arduino Nano (ATmega328P). Clones with CH340 may need
 * "ATmega328P (Old Bootloader)" in the IDE.
 */
#include <DHT.h>

#define FW_VERSION "1.0.0"
#define BAUD 115200

// ---------------- Pin map (keep in sync with docs/hardware.md) -------------
#define PIN_DHT       2      // AM2302 / DHT22 data pin (10k pull-up to 5V)
#define PIN_SOIL_AO   A0     // MH soil sensor analog out
#define DHT_TYPE      DHT22

const uint8_t RELAY_COUNT = 4;
const uint8_t RELAY_PINS[RELAY_COUNT] = {4, 5, 6, 7};   // CH0..CH3
// Most cheap relay boards are active-LOW (IN pin LOW = relay ON).
const bool RELAY_ACTIVE_LOW = true;

// Hard safety cap per channel in seconds (0 = no cap). The Pi can request a
// shorter time per command but can never exceed this.
//   CH0 door lock solenoid, CH1 water pump, CH2 grow light, CH3 fan
const uint16_t RELAY_MAX_ON_S[RELAY_COUNT] = {15, 300, 0, 0};

// If no command arrives from the Pi for this long, switch everything off.
const unsigned long HOST_TIMEOUT_MS = 60000UL;

// DHT22 must not be polled faster than every 2 s.
const unsigned long DHT_INTERVAL_MS = 2500UL;
// ---------------------------------------------------------------------------

DHT dht(PIN_DHT, DHT_TYPE);

bool relayOn[RELAY_COUNT];
unsigned long relayOffAt[RELAY_COUNT];   // 0 = no deadline
unsigned long lastHostMs = 0;
bool failsafeTripped = false;

float lastT = NAN, lastH = NAN;
unsigned long lastDhtMs = 0;

char lineBuf[48];
uint8_t lineLen = 0;

void writeRelay(uint8_t ch, bool on) {
  relayOn[ch] = on;
  bool level = RELAY_ACTIVE_LOW ? !on : on;
  digitalWrite(RELAY_PINS[ch], level ? HIGH : LOW);
  if (!on) relayOffAt[ch] = 0;
}

void allOff() {
  for (uint8_t i = 0; i < RELAY_COUNT; i++) writeRelay(i, false);
}

void printState() {
  Serial.print(F("R="));
  for (uint8_t i = 0; i < RELAY_COUNT; i++) Serial.print(relayOn[i] ? '1' : '0');
}

void printFloat(float v) {
  if (isnan(v)) Serial.print(F("nan"));
  else Serial.print(v, 1);
}

void handleLine(char *line) {
  char *cmd = strtok(line, " ");
  if (!cmd) return;
  lastHostMs = millis();
  failsafeTripped = false;

  if (!strcmp(cmd, "PING")) {
    Serial.print(F("OK PONG fw=")); Serial.print(F(FW_VERSION));
    Serial.print(F(" relays=")); Serial.println(RELAY_COUNT);

  } else if (!strcmp(cmd, "READ")) {
    Serial.print(F("OK T=")); printFloat(lastT);
    Serial.print(F(" H="));   printFloat(lastH);
    Serial.print(F(" SOIL=")); Serial.print(analogRead(PIN_SOIL_AO));
    Serial.print(' '); printState();
    Serial.println();

  } else if (!strcmp(cmd, "STATE")) {
    Serial.print(F("OK ")); printState(); Serial.println();

  } else if (!strcmp(cmd, "RELAY")) {
    char *chS = strtok(NULL, " ");
    char *onS = strtok(NULL, " ");
    char *maxS = strtok(NULL, " ");
    if (!chS || !onS) { Serial.println(F("ERR usage RELAY <ch> <0|1> [max_s]")); return; }
    int ch = atoi(chS);
    if (ch < 0 || ch >= RELAY_COUNT) { Serial.println(F("ERR bad_channel")); return; }
    bool on = onS[0] == '1';
    if (on) {
      unsigned long limit = RELAY_MAX_ON_S[ch];
      unsigned long req = maxS ? strtoul(maxS, NULL, 10) : 0;
      if (req > 0 && (limit == 0 || req < limit)) limit = req;
      writeRelay(ch, true);
      relayOffAt[ch] = limit ? millis() + limit * 1000UL : 0;
      if (relayOffAt[ch] == 0 && limit) relayOffAt[ch] = 1;  // avoid 0 sentinel on wrap
      Serial.print(F("OK RELAY ")); Serial.print(ch); Serial.print(F(" 1 max_s="));
      Serial.println(limit);
    } else {
      writeRelay(ch, false);
      Serial.print(F("OK RELAY ")); Serial.print(ch); Serial.println(F(" 0"));
    }

  } else if (!strcmp(cmd, "ALLOFF")) {
    allOff();
    Serial.println(F("OK ALLOFF"));

  } else {
    Serial.println(F("ERR unknown_command"));
  }
}

void setup() {
  for (uint8_t i = 0; i < RELAY_COUNT; i++) {
    pinMode(RELAY_PINS[i], OUTPUT);
    writeRelay(i, false);
  }
  Serial.begin(BAUD);
  dht.begin();
  lastHostMs = millis();
  Serial.print(F("EVT BOOT fw=")); Serial.println(F(FW_VERSION));
}

void loop() {
  unsigned long now = millis();

  // 1) serial input, line based
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      lineBuf[lineLen] = 0;
      if (lineLen) handleLine(lineBuf);
      lineLen = 0;
    } else if (lineLen < sizeof(lineBuf) - 1) {
      lineBuf[lineLen++] = c;
    } else {
      lineLen = 0;  // overflow: drop the line
      Serial.println(F("ERR line_too_long"));
    }
  }

  // 2) per-channel max-on timers
  for (uint8_t i = 0; i < RELAY_COUNT; i++) {
    if (relayOn[i] && relayOffAt[i] && (long)(now - relayOffAt[i]) >= 0) {
      writeRelay(i, false);
      Serial.print(F("EVT TIMEOUT ")); Serial.println(i);
    }
  }

  // 3) host watchdog
  if (!failsafeTripped && now - lastHostMs > HOST_TIMEOUT_MS) {
    allOff();
    failsafeTripped = true;
    Serial.println(F("EVT FAILSAFE host_timeout"));
  }

  // 4) cache DHT reading (slow sensor, keep it out of the command path)
  if (now - lastDhtMs >= DHT_INTERVAL_MS) {
    lastDhtMs = now;
    float h = dht.readHumidity();
    float t = dht.readTemperature();
    lastH = h; lastT = t;   // NAN on failure, reported as "nan"
  }
}
