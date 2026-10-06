"use client";

import { FormEvent, useState } from "react";

export type SessionUser = { id: string; name: string; email: string; role: "admin" | "member" | "viewer" };

export function LoginScreen({ onLogin, initialNotice = "" }: { onLogin: (user: SessionUser) => void; initialNotice?: string }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState(initialNotice);
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setNotice("");
    try {
      const response = await fetch(`/api/auth/${mode === "login" ? "login" : "register"}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, email, password }) });
      const data = await response.json().catch(() => ({})) as { error?: string; pending?: boolean; user?: SessionUser };
      if (!response.ok) return setNotice(data.error || "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      if (data.pending) { setNotice("가입 신청이 완료되었습니다. 관리자 승인 후 로그인할 수 있습니다."); setMode("login"); setPassword(""); return; }
      if (!data.user) return setNotice("로그인 정보를 확인하지 못했습니다. 다시 시도해 주세요.");
      onLogin(data.user);
    } catch {
      setNotice("네트워크 연결을 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };
  return <main className="login-page"><form className="login-card" onSubmit={submit}><p className="eyebrow">QA Ticket Desk</p><h1>{mode === "login" ? "로그인" : "회원가입 신청"}</h1><p>{mode === "login" ? "승인된 회사 계정으로 로그인하세요." : "가입 신청은 관리자 승인 후 사용할 수 있습니다."}</p><div className="auth-tabs"><button type="button" className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setNotice(""); }}>로그인</button><button type="button" className={mode === "register" ? "active" : ""} onClick={() => { setMode("register"); setNotice(""); }}>회원가입</button></div>{mode === "register" && <label>이름<input value={name} onChange={event => setName(event.target.value)} autoComplete="name" maxLength={50} placeholder="예: 홍길동" required/></label>}<label>회사 이메일<input value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" type="email" placeholder="name@company.com" required/></label><label>비밀번호<input value={password} onChange={event => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} type="password" minLength={8} placeholder="8자 이상" required/></label>{notice && <p className={notice.includes("완료") ? "auth-notice" : "auth-error"} role="alert">{notice}</p>}<button className="primary" disabled={busy}>{busy ? "처리 중…" : mode === "login" ? "로그인" : "가입 신청"}</button></form></main>;
}
