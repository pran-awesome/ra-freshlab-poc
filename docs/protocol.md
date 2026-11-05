# Pi ⇄ Nano serial protocol

USB serial, **115200 8N1**, ASCII lines terminated by `\n` (`\r` ignored).
One request → one reply. The Pi sends the next command only after the reply.

Replies start with `OK` or `ERR`. Lines starting with `EVT` are unsolicited
events and may arrive at any time; the Pi logs them and keeps waiting for its reply.

| Request | Reply | Notes |
|---|---|---|
| `PING` | `OK PONG fw=1.0.0 relays=4` | |
| `READ` | `OK T=26.8 H=65.1 SOIL=602 R=0100` | `T` °C, `H` %RH (`nan` if DHT read failed), `SOIL` raw ADC 0..1023 (higher = drier on MH sensors), `R` relay bits CH0..CH3 |
| `STATE` | `OK R=0100` | relay bits only |
| `RELAY <ch> 1 [max_s]` | `OK RELAY 1 1 max_s=30` | switch on; auto-off after `max_s` (clamped to the firmware's per-channel hard cap; `max_s=0` = no limit) |
| `RELAY <ch> 0` | `OK RELAY 1 0` | switch off |
| `ALLOFF` | `OK ALLOFF` | |
| anything else | `ERR unknown_command` | also `ERR bad_channel`, `ERR line_too_long`, `ERR usage ...` |

Events:

| Event | Meaning |
|---|---|
| `EVT BOOT fw=1.0.0` | Nano (re)started. Opening the serial port resets the Nano, so expect this ~2 s after open. |
| `EVT TIMEOUT <ch>` | a relay hit its max-on time and was switched off |
| `EVT FAILSAFE host_timeout` | no command from the Pi for 60 s → everything switched off |

## Safety model (hardware level, not business logic)

1. **Per-channel hard cap** in firmware (`RELAY_MAX_ON_S`): door 15 s, pump 300 s, light/fan unlimited.
2. **Per-command max_s** from the cloud (e.g. door unlock 5 s, watering 30 s).
3. **Host watchdog**: the edge polls `READ` every 5 s; if the Pi/edge dies the Nano turns all relays off after 60 s.
4. Relays boot **OFF**.

## Changing the protocol

Change firmware, `edge/app/nano.py` (`NanoLink` + `FakeSerial`), and this file in the same commit.
Bump `FW_VERSION`.
