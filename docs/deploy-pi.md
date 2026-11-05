# Deploy the edge on the Raspberry Pi 4 (Ubuntu Server)

## 1. Docker
```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # log out / in
```

## 2. Find the Nano
```bash
ls -l /dev/serial/by-id/     # e.g. usb-1a86_USB_Serial-if00-port0 -> ../../ttyUSB0
```
Use the `/dev/serial/by-id/...` path as `NANO_DEVICE`; it survives re-plugging.
If nothing shows up on Ubuntu, `brltty` can grab CH340 adapters: `sudo apt remove brltty`.

## 3. Configure & run
```bash
git clone https://github.com/pran-awesome/ra-freshlab-poc && cd ra-freshlab-poc/edge
cp .env.example .env && nano .env      # EDGE_API_TOKEN, NANO_DEVICE
docker compose up -d --build
curl localhost:8080/health             # nano_connected: true, firmware: 1.0.0
curl -H "Authorization: Bearer $TOKEN" localhost:8080/v1/sensors
```

## 4. Cloudflare Tunnel (WAN access without port forwarding)
1. Domain on Cloudflare (free plan is fine).
2. Zero Trust → Networks → Tunnels → **Create a tunnel** (cloudflared) → copy the token into `CLOUDFLARE_TUNNEL_TOKEN`.
3. In the tunnel → **Public hostname**: `edge.<domain>` → Service `HTTP` → `edge:8080`.
4. `docker compose --profile tunnel up -d`
5. From anywhere: `curl https://edge.<domain>/health`

Optional hardening: Zero Trust → Access → Application for `edge.<domain>` with a
**Service Token** policy, then put the id/secret in the cloud's `CF_ACCESS_CLIENT_ID/SECRET`.
The bearer token is still required either way.

Alternative: Tailscale instead of Cloudflare (works if the cloud host also joins the tailnet).
Only the `tunnel` service changes; the edge API stays the same.

## Updating
```bash
git pull && docker compose --profile tunnel up -d --build
```
Containers have `restart: unless-stopped`, so they come back after a reboot.
