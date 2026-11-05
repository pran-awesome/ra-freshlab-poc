# HANDOFF — RA FreshLab PoC

เอกสารนี้ไว้ส่งต่องานได้ทุกเมื่อ ไม่ว่าจะเป็นคนหรือ AI agent อ่านจบแล้วควรทำงานต่อได้ทันที
(Agents: also read `CLAUDE.md`.)

_Last updated: 2026-11-05_

## ระบบนี้คืออะไร

ตู้ผักสดอัตโนมัติ: ลูกค้าเปิดตู้ผ่านเว็บ ระบบรดน้ำ/เปิดไฟ/พัดลมตามตาราง

| ส่วน | อยู่ที่ไหน | ทำอะไร |
|---|---|---|
| Cloud (`cloud/`) | VPS (Docker) หรือ Cloudflare Workers | business logic ทั้งหมด, หน้าเว็บลูกค้า + admin, ตารางเวลา |
| Edge (`edge/`) | Raspberry Pi 4, Ubuntu Server, Docker | API บางๆ: อ่านเซนเซอร์, เปิด/ปิด relay ตามคำสั่ง |
| Firmware (`firmware/nano`) | Arduino Nano ต่อ USB กับ Pi | อ่าน DHT22 + soil (analog), คุม relay 4 ช่อง, ตัดไฟเองเพื่อความปลอดภัย |

Cloud เรียก Pi ผ่าน **Cloudflare Tunnel** (`https://edge.<domain>`) เพราะ Pi อยู่หลัง router

## Status

| งาน | สถานะ |
|---|---|
| Firmware Nano (DHT22 D2, soil A0, relay D4–D7, max-on cap, watchdog 60 s) | 🟡 เขียนแล้ว, CI จะ compile ให้ (ยังไม่ได้ compile ในเครื่อง), **ยังไม่ได้ทดสอบกับบอร์ดจริง** |
| Edge API + Docker + compose + tunnel | ✅ test ผ่าน (Nano จำลอง), image build ผ่าน |
| Cloud API: auth mock, เปิดตู้, relay, ตารางเวลา, ข้ามรดน้ำถ้าดินชื้น, คาลิเบรตดิน, event log | ✅ test ผ่าน |
| Cloud web: หน้าลูกค้า + /admin | ✅ ทดสอบ end-to-end กับ edge จำลองแล้ว |
| Serverless entry (Cloudflare Workers + KV + cron) | 🟡 เขียนแล้ว ยังไม่ได้ deploy จริง |
| Deploy จริงบน Pi / VPS / Cloudflare Tunnel | ⬜ ยังไม่ได้ทำ |

## สมมติฐานที่ตั้งไว้ (ยืนยันกับเจ้าของงาน)

- Relay 4 ช่อง: CH0 `door` (ล็อกประตู), CH1 `pump`, CH2 `light`, CH3 `fan`; บอร์ด relay แบบ active-LOW
- ปลดล็อกประตูครั้งละ 5 วินาที (`DOOR_UNLOCK_SECONDS`)
- Hard cap ใน firmware: door 15 s, pump 300 s
- ลูกค้า login/verify ยังเป็น mock เหมือน Phase 1, ยังไม่มีการจ่ายเงิน
- ตู้เดียว (single cabinet). ถ้ามีหลายตู้ต้องเพิ่ม cabinet id ใน cloud + หลาย EDGE_URL

## เริ่มงานต่อ

1. อ่าน `docs/architecture.md` (5 นาที)
2. รันแบบไม่มีฮาร์ดแวร์ตาม `README.md` → Quick start
3. ติดตั้งจริง: `docs/hardware.md` (ต่อสาย + flash) → `docs/deploy-pi.md` → `docs/deploy-cloud.md`

ทดสอบฮาร์ดแวร์ทีละชั้น:
1. Serial Monitor 115200 → `PING`, `READ`, `RELAY 1 1 3`
2. บน Pi: `curl localhost:8080/v1/sensors -H "Authorization: Bearer ..."`
3. ผ่าน tunnel: `curl https://edge.<domain>/health`
4. หน้า /admin บน cloud → เห็นค่าเซนเซอร์, กดเปิด relay ได้

## Next steps (แนะนำ)

- [ ] Flash Nano + ทดสอบกับเซนเซอร์/relay จริง, ปรับ `RELAY_ACTIVE_LOW` ถ้าจำเป็น
- [ ] คาลิเบรตเซนเซอร์ดิน (ค่าแห้ง/เปียก) ผ่านหน้า admin
- [ ] Deploy edge บน Pi + Cloudflare Tunnel (+ Access service token)
- [ ] Deploy cloud บน VPS + Caddy HTTPS
- [ ] Auth จริง (OTP/LINE login), ระบบจ่ายเงิน
- [ ] Sensor ประตูปิด (reed switch) → เพิ่ม digital input ใน protocol
- [ ] เก็บประวัติค่าเซนเซอร์ (time series) ใน cloud
- [ ] เปลี่ยน `JsonFileStore` เป็น Postgres/SQLite เมื่อมีข้อมูลมากขึ้น

## Secrets (ไม่อยู่ใน repo)

| ที่ | ตัวแปร |
|---|---|
| Pi `edge/.env` | `EDGE_API_TOKEN`, `CLOUDFLARE_TUNNEL_TOKEN`, `NANO_DEVICE` |
| Cloud `cloud/.env` | `JWT_SECRET`, `ADMIN_PASSWORD`, `EDGE_URL`, `EDGE_API_TOKEN` (ต้องตรงกับ Pi), `CF_ACCESS_*` |
