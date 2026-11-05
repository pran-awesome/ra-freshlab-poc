# Hardware & wiring

```
[ Cloud / VPS ] ──HTTPS──▶ Cloudflare edge ◀──outbound tunnel── [ Raspberry Pi 4, Ubuntu Server, Docker ]
                                                                       │ USB (serial 115200)
                                                                       ▼
                                                             [ Arduino Nano ] ──▶ 4-ch relay board ──▶ lock / pump / light / fan
                                                                ▲      ▲
                                                           DHT22/AM2302  MH soil sensor
```

The Pi is **never** wired to mains/loads directly. Only USB to the Nano.

## Nano pin map (`firmware/nano/freshlab_nano/freshlab_nano.ino`)

| Pin | Connected to | Notes |
|---|---|---|
| D2 | AM2302 / DHT22 DATA | 10 kΩ pull-up to 5 V (many AM2302 modules already have one) |
| A0 | MH soil sensor **AO** | the module's DO pin is unused (threshold is done in the cloud) |
| D4 | Relay IN1 → CH0 `door` | lock solenoid |
| D5 | Relay IN2 → CH1 `pump` | water pump |
| D6 | Relay IN3 → CH2 `light` | grow light |
| D7 | Relay IN4 → CH3 `fan` | fan |
| 5V / GND | sensor + relay board VCC/GND | power the relay coils from a separate 5 V supply if the board has a JD-VCC jumper; share GND |

- Relay boards are assumed **active-LOW** (`RELAY_ACTIVE_LOW = true`). If a relay clicks ON at boot, flip it.
- The names (`door`, `pump`, ...) only exist on the Pi (`EDGE_RELAYS` in `edge/.env`). The Nano only knows channel numbers.
- MH soil sensors corrode if powered constantly. Later improvement: power VCC from a digital pin and switch it on only when reading.

## Flashing the Nano

Arduino IDE:
1. Library Manager → install **DHT sensor library** (Adafruit) + **Adafruit Unified Sensor**.
2. Board: *Arduino Nano*, Processor: *ATmega328P* (cheap CH340 clones: *ATmega328P (Old Bootloader)*).
3. Open `firmware/nano/freshlab_nano/freshlab_nano.ino` → Upload.
4. Serial Monitor at 115200, "Newline" line ending, type `PING` → expect `OK PONG fw=...`.

arduino-cli:
```bash
arduino-cli core install arduino:avr
arduino-cli lib install "DHT sensor library" "Adafruit Unified Sensor"
arduino-cli compile --fqbn arduino:avr:nano firmware/nano/freshlab_nano
arduino-cli upload  --fqbn arduino:avr:nano:cpu=atmega328old -p /dev/ttyUSB0 firmware/nano/freshlab_nano
```
Stop the edge container first (`docker compose stop edge`), it holds the serial port.
