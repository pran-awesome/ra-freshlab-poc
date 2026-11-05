// Customer flow: login -> verify -> open cabinet (auth is mocked in Phase 1).
import { useState } from "react";
import { api } from "./api.js";

export default function Customer() {
  const [step, setStep] = useState("login"); // login | verify | open | done
  const [token, setToken] = useState(null);
  const [form, setForm] = useState({ username: "", password: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const run = (fn) => async (e) => {
    e?.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await fn();
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };

  const login = run(async () => {
    const r = await api("/auth/login", { method: "POST", body: form });
    setToken(r.token);
    setStep("verify");
  });
  const verify = run(async () => {
    const r = await api("/auth/verify", { method: "POST", token });
    setToken(r.token);
    setStep("open");
  });
  const open = run(async () => {
    await api("/cabinet/open", { method: "POST", token });
    setStep("done");
  });

  return (
    <main className="screen">
      <h1 className="brand">FreshLab</h1>
      <p className="muted">ผักสลัดสด ตู้อัตโนมัติ</p>

      {step === "login" && (
        <form className="card" onSubmit={login}>
          <h2>เข้าสู่ระบบ</h2>
          <input placeholder="ชื่อผู้ใช้" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          <input placeholder="รหัสผ่าน" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <button disabled={busy}>ถัดไป</button>
        </form>
      )}
      {step === "verify" && (
        <div className="card">
          <h2>ยืนยันตัวตน</h2>
          <p className="muted">(Phase 1: ยืนยันอัตโนมัติ)</p>
          <button onClick={verify} disabled={busy}>ยืนยันตัวตน</button>
        </div>
      )}
      {step === "open" && (
        <div className="card">
          <h2>พร้อมเปิดตู้</h2>
          <button className="big" onClick={open} disabled={busy}>เปิดตู้</button>
        </div>
      )}
      {step === "done" && (
        <div className="card ok">
          <h2>ตู้ปลดล็อกแล้ว</h2>
          <p>กรุณาหยิบสินค้าและปิดประตู</p>
          <button onClick={() => { setStep("login"); setToken(null); }}>เสร็จสิ้น</button>
        </div>
      )}
      {err && <p className="err">{err}</p>}
      <a className="muted small" href="/admin">Admin</a>
    </main>
  );
}
