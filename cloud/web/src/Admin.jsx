// Admin: live sensors, manual relay control, watering schedules, event log.
import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";

const DAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const empty = { name: "", relay: "pump", time: "07:00", days: [], durationSec: 30, enabled: true, skipIfSoilAbovePct: "" };

function load() {
  try { return sessionStorage.getItem("adminToken"); } catch { return null; }
}

export default function Admin() {
  const [token, setToken] = useState(load);
  const [pw, setPw] = useState("");
  const [status, setStatus] = useState(null);
  const [schedules, setSchedules] = useState([]);
  const [events, setEvents] = useState([]);
  const [cal, setCal] = useState({ dryRaw: 1023, wetRaw: 300 });
  const [draft, setDraft] = useState(empty);
  const [err, setErr] = useState("");

  const call = useCallback((path, opts = {}) => api(path, { ...opts, token }), [token]);

  const refresh = useCallback(async () => {
    try {
      const [s, sc, ev, c] = await Promise.all([
        call("/admin/status"), call("/admin/schedules"), call("/admin/events"), call("/admin/soil-calibration"),
      ]);
      setStatus(s); setSchedules(sc); setEvents(ev); setCal(c); setErr("");
    } catch (e) {
      if (e.message === "unauthorized") { setToken(null); try { sessionStorage.removeItem("adminToken"); } catch {} }
      setErr(e.message);
    }
  }, [call]);

  useEffect(() => {
    if (!token) return;
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [token, refresh]);

  const act = (fn) => async (...a) => {
    try { await fn(...a); await refresh(); } catch (e) { setErr(e.message); }
  };

  if (!token) {
    return (
      <main className="screen">
        <h1 className="brand">FreshLab Admin</h1>
        <form className="card" onSubmit={async (e) => {
          e.preventDefault();
          try {
            const r = await api("/admin/login", { method: "POST", body: { password: pw } });
            try { sessionStorage.setItem("adminToken", r.token); } catch {}
            setToken(r.token);
          } catch (x) { setErr(x.message); }
        }}>
          <input type="password" placeholder="รหัสผ่านแอดมิน" value={pw} onChange={(e) => setPw(e.target.value)} />
          <button>เข้าสู่ระบบ</button>
        </form>
        {err && <p className="err">{err}</p>}
      </main>
    );
  }

  const s = status?.sensors;
  const relays = status?.relays ?? [];
  const fmt = (v, u) => (v == null ? "–" : `${v}${u}`);

  return (
    <main className="admin">
      <header>
        <h1 className="brand">FreshLab Admin</h1>
        <span className={status?.edge?.nano_connected ? "pill on" : "pill off"}>
          {status?.edge ? (status.edge.nano_connected ? "Edge + Nano online" : "Nano offline") : "Edge offline"}
        </span>
      </header>
      {(err || status?.errors?.length > 0) && <p className="err">{err || status.errors.join(" · ")}</p>}

      <section className="grid">
        <div className="card stat"><span>อุณหภูมิ</span><b>{fmt(s?.temperatureC, "°C")}</b></div>
        <div className="card stat"><span>ความชื้นอากาศ</span><b>{fmt(s?.humidityPct, "%")}</b></div>
        <div className="card stat"><span>ความชื้นดิน</span><b>{fmt(s?.soilPct, "%")}</b><small>raw {fmt(s?.soilRaw, "")}</small></div>
      </section>

      <section className="card">
        <h2>Relay</h2>
        <div className="relays">
          {relays.map((r) => (
            <div key={r.name} className="relay">
              <span className={r.on ? "dot on" : "dot"} /> {r.name}
              <button onClick={act(() => call(`/admin/relays/${r.name}`, { method: "POST", body: { on: !r.on, maxSeconds: r.name === "door" ? 5 : undefined } }))}>
                {r.on ? "ปิด" : "เปิด"}
              </button>
            </div>
          ))}
          <button className="danger" onClick={act(() => call("/admin/relays/all-off", { method: "POST" }))}>ปิดทั้งหมด</button>
        </div>
      </section>

      <section className="card">
        <h2>ตารางเวลา</h2>
        <table>
          <thead><tr><th>ชื่อ</th><th>relay</th><th>เวลา</th><th>วัน</th><th>วินาที</th><th>ข้ามถ้าดิน ≥</th><th /></tr></thead>
          <tbody>
            {schedules.map((x) => (
              <tr key={x.id} className={x.enabled ? "" : "muted"}>
                <td>{x.name}</td><td>{x.relay}</td><td>{x.time}</td>
                <td>{x.days.length ? x.days.map((d) => DAYS[d]).join(" ") : "ทุกวัน"}</td>
                <td>{x.durationSec}</td><td>{x.skipIfSoilAbovePct ?? "–"}</td>
                <td>
                  <button onClick={() => setDraft({ ...x, skipIfSoilAbovePct: x.skipIfSoilAbovePct ?? "" })}>แก้</button>
                  <button className="danger" onClick={act(() => call(`/admin/schedules/${x.id}`, { method: "DELETE" }))}>ลบ</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <form className="row" onSubmit={async (e) => {
          e.preventDefault();
          await act(() => call("/admin/schedules", {
            method: "POST",
            body: { ...draft, durationSec: Number(draft.durationSec), skipIfSoilAbovePct: draft.skipIfSoilAbovePct === "" ? null : Number(draft.skipIfSoilAbovePct) },
          }))();
          setDraft(empty);
        }}>
          <input placeholder="ชื่อ" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required />
          <select value={draft.relay} onChange={(e) => setDraft({ ...draft, relay: e.target.value })}>
            {relays.map((r) => <option key={r.name}>{r.name}</option>)}
          </select>
          <input type="time" value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} />
          <span className="days">
            {DAYS.map((d, i) => (
              <label key={i}>
                <input type="checkbox" checked={draft.days.includes(i)} onChange={(e) =>
                  setDraft({ ...draft, days: e.target.checked ? [...draft.days, i].sort() : draft.days.filter((x) => x !== i) })} />{d}
              </label>
            ))}
          </span>
          <input type="number" min="1" title="วินาที" value={draft.durationSec} onChange={(e) => setDraft({ ...draft, durationSec: e.target.value })} />
          <input type="number" min="0" max="100" placeholder="ข้ามถ้าดิน ≥ %" value={draft.skipIfSoilAbovePct} onChange={(e) => setDraft({ ...draft, skipIfSoilAbovePct: e.target.value })} />
          <label><input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />เปิดใช้</label>
          <button>{draft.id ? "บันทึก" : "เพิ่ม"}</button>
        </form>
      </section>

      <section className="card">
        <h2>คาลิเบรตเซนเซอร์ดิน</h2>
        <p className="muted small">ค่า raw ตอนแห้ง (ในอากาศ) และตอนเปียก (จุ่มน้ำ)</p>
        <div className="row">
          <label>แห้ง <input type="number" value={cal.dryRaw} onChange={(e) => setCal({ ...cal, dryRaw: e.target.value })} /></label>
          <label>เปียก <input type="number" value={cal.wetRaw} onChange={(e) => setCal({ ...cal, wetRaw: e.target.value })} /></label>
          <button onClick={act(() => call("/admin/soil-calibration", { method: "PUT", body: cal }))}>บันทึก</button>
        </div>
      </section>

      <section className="card">
        <h2>เหตุการณ์ล่าสุด</h2>
        <ul className="events">
          {events.slice(0, 50).map((e, i) => (
            <li key={i}><time>{new Date(e.at).toLocaleString("th-TH")}</time> <b>{e.kind}</b> {e.message} <span className="muted">{e.actor}</span></li>
          ))}
        </ul>
      </section>
    </main>
  );
}
