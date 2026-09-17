"use client";

import { FormEvent, useEffect, useState } from "react";

type Ticket = { id: string; title: string; status: string; severity: string; created_at: string; updated_at: string };
type Detail = { ticket: Ticket & { environment: string; frequency: string; reproduction: string; content: string }; attachments: any[]; comments: any[] };
const statuses = ["신규", "진행", "완료", "이슈아님"];
const severities = ["Critical", "Blocker", "Major", "Minor", "Trivial", "Non-issue"];
const frequencies = ["항상", "간헐적", "특정 조건에서만", "1회성"];
const empty = { title: "", status: "신규", severity: "Major", environment: "", frequency: "항상", reproduction: "", content: "" };
const fmt = (v: string) => new Date(v).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" });

export default function TicketDesk() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [form, setForm] = useState<any>(empty);
  const [view, setView] = useState<"list" | "create" | "detail">("list");
  const [selected, setSelected] = useState<string[]>([]);
  const [severity, setSeverity] = useState("전체");
  const [status, setStatus] = useState("전체");
  const [files, setFiles] = useState<File[]>([]);
  const [descs, setDescs] = useState<string[]>([]);
  const [author, setAuthor] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const update = (key: string, value: string) => setForm((current: any) => ({ ...current, [key]: value }));
  const load = async () => { const r = await fetch("/api/tickets", { cache: "no-store" }); if (r.ok) setTickets((await r.json()).tickets); };

  useEffect(() => { load(); const timer = setInterval(load, 4000); return () => clearInterval(timer); }, []);

  const open = async (id: string) => {
    setBusy(true); const r = await fetch(`/api/tickets/${id}`, { cache: "no-store" });
    if (r.ok) { const data = await r.json(); setDetail(data); setForm(data.ticket); setView("detail"); }
    setBusy(false);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.title.trim()) return setNotice("제목을 입력해 주세요.");
    setBusy(true); setNotice("");
    const id = detail?.ticket.id;
    const r = await fetch(id ? `/api/tickets/${id}` : "/api/tickets", { method: id ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
    if (!r.ok) { setNotice((await r.json()).error || "저장에 실패했습니다."); setBusy(false); return; }
    const ticketId = id || (await r.json()).id;
    if (files.length) {
      const fd = new FormData(); files.forEach(file => fd.append("files", file)); fd.append("descriptions", JSON.stringify(descs));
      const upload = await fetch(`/api/tickets/${ticketId}/attachments`, { method: "POST", body: fd });
      if (!upload.ok) { setNotice("티켓은 저장됐지만 첨부파일 저장에 실패했습니다."); setBusy(false); return; }
    }
    setFiles([]); setDescs([]); await load(); setDetail(null); setForm(empty); setView("list"); setBusy(false);
  };

  const remove = async () => { if (!selected.length || !confirm(`${selected.length}개 티켓을 삭제할까요?`)) return; await Promise.all(selected.map(id => fetch(`/api/tickets/${id}`, { method: "DELETE" }))); setSelected([]); await load(); };
  const addComment = async () => { if (!detail || !author.trim() || !comment.trim()) return setNotice("작성자와 댓글 내용을 입력해 주세요."); await fetch(`/api/tickets/${detail.ticket.id}/comments`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ author, body: comment }) }); setComment(""); await open(detail.ticket.id); await load(); };
  const filtered = tickets.filter(ticket => (severity === "전체" || ticket.severity === severity) && (status === "전체" || ticket.status === status));

  if (view === "list") return <main><header><div><b>QA Ticket Desk</b><span>공유형 티켓 보드 · 자동 동기화</span></div><button className="primary" onClick={() => { setForm(empty); setDetail(null); setFiles([]); setView("create"); }}>+ 티켓 생성하기</button></header><section className="toolbar"><button className="danger" disabled={!selected.length} onClick={remove}>선택 티켓 삭제하기</button><label>위험도<select value={severity} onChange={e => setSeverity(e.target.value)}><option>전체</option>{severities.map(value => <option key={value}>{value}</option>)}</select></label><label>진행상황<select value={status} onChange={e => setStatus(e.target.value)}><option>전체</option>{statuses.map(value => <option key={value}>{value}</option>)}</select></label><em>{filtered.length}개 티켓 · 4초마다 동기화</em></section><section className="table"><div className="tr head"><input aria-label="모두 선택" type="checkbox" disabled={!filtered.length} checked={!!filtered.length && selected.length === filtered.length} onChange={e => setSelected(e.target.checked ? filtered.map(ticket => ticket.id) : [])}/><b>No</b><b>제목</b><b>진행상황</b><b>작성 날짜 · 시간</b></div>{filtered.length ? filtered.map((ticket, index) => <div className="tr" key={ticket.id}><input type="checkbox" checked={selected.includes(ticket.id)} onChange={e => setSelected(e.target.checked ? [...selected, ticket.id] : selected.filter(id => id !== ticket.id))}/><span>{index + 1}</span><button className="title" onClick={() => open(ticket.id)}>{ticket.title}</button><span className={`pill ${ticket.status}`}>{ticket.status}</span><span>{fmt(ticket.created_at)}</span></div>) : <p className="empty">조회할 목록이 없습니다.</p>}</section>{busy && <div className="loading">불러오는 중…</div>}</main>;

  return <main><header><button className="back" onClick={() => { setView("list"); load(); }}>← 목록으로</button><div><b>{view === "create" ? "새 QA 티켓" : "QA 티켓 상세"}</b><span>모든 변경은 공유 URL에 바로 반영됩니다.</span></div><button className="primary" form="ticket-form" disabled={busy}>{busy ? "저장 중…" : "저장하기"}</button></header><form id="ticket-form" className="editor" onSubmit={save}><div className="fields"><label>제목 <i>*</i><input maxLength={50} value={form.title} onChange={e => update("title", e.target.value)} placeholder="최대 50자" required/></label><label>진행상황 <i>*</i><select value={form.status} onChange={e => update("status", e.target.value)}>{statuses.map(value => <option key={value}>{value}</option>)}</select></label><label>위험도·심각도 <i>*</i><select value={form.severity} onChange={e => update("severity", e.target.value)}>{severities.map(value => <option key={value}>{value}</option>)}</select></label><label>발생 환경<input value={form.environment || ""} onChange={e => update("environment", e.target.value)} placeholder="예: iOS 18.2 / Chrome 131"/></label><label>발생 빈도<select value={form.frequency || "항상"} onChange={e => update("frequency", e.target.value)}>{frequencies.map(value => <option key={value}>{value}</option>)}</select></label><label>재현 횟수<input value={form.reproduction || ""} onChange={e => update("reproduction", e.target.value)} placeholder="예: 5회 중 5회"/></label></div><label className="wide">내용 <i>*</i><textarea className="content-input" maxLength={10000} value={form.content || ""} onChange={e => update("content", e.target.value)} placeholder="이슈 현상, 재현 절차, 기대 결과를 자유롭게 작성하세요. (최대 10,000자)" required/></label><label className="wide">증빙 자료<input type="file" multiple onChange={e => { const chosen = Array.from(e.target.files || []); setFiles(chosen); setDescs(chosen.map(() => "")); }}/></label>{files.map((file, index) => <label className="file" key={index}>{file.name}<input placeholder="파일 설명" value={descs[index] || ""} onChange={e => setDescs(descs.map((value, item) => item === index ? e.target.value : value))}/></label>)}{detail?.attachments?.length ? <div className="attachments"><b>기존 증빙 자료</b>{detail.attachments.map(attachment => <a key={attachment.id} href={`/api/attachments/${attachment.id}`} target="_blank">{attachment.name}{attachment.description ? ` — ${attachment.description}` : ""}</a>)}</div> : null}<div className="actions"><button className="primary" type="submit">{busy ? "저장 중…" : "티켓 저장"}</button>{notice && <span>{notice}</span>}</div></form>{view === "detail" && detail ? <section className="comments"><h2>댓글</h2>{detail.comments.map(commentItem => <article key={commentItem.id}><b>{commentItem.author}</b><time>{fmt(commentItem.created_at)}</time><p>{commentItem.body}</p></article>)}<div className="comment-form"><label>작성자 <i>*</i><input value={author} onChange={e => setAuthor(e.target.value)} placeholder="이름을 입력하세요"/></label><textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="댓글을 입력하세요"/><button className="primary" type="button" onClick={addComment}>댓글 등록</button></div></section> : null}</main>;
}
