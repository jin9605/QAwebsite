"use client";

import { FormEvent, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { LoginScreen, SessionUser } from "./login-screen";
import { ProjectPlanning } from "./project-planning";

type Ticket = { id: string; title: string; status: string; severity: string; game: string; project_id?: string | null; ticket_name?: string | null; ticket_number?: number | null; assignee_id?: string | null; assignee: string; due_at?: string | null; created_at: string; updated_at: string; created_by_id?: string; created_by_name?: string | null; issue_reason?: string | null };
type Project = { id: string; name: string; ticket_name?: string | null; start_date?: string | null; due_at: string; owner?: string | null; status: string; created_at?: string; ticket_count?: number };
type ProjectMember = { id: string; name: string; email: string; role: string };
type Attachment = { id: string; name: string; content_type: string; size: number; description: string };
type Comment = { id: string; author: string; created_by_id?: string | null; body: string; created_at: string };
type History = { actor_name: string; action: string; before_json?: string | null; after_json?: string | null; created_at: string };
type Detail = { ticket: Ticket & { environment: string; frequency: string; reproduction: string; content: string; created_by_name?: string; updated_by_name?: string }; attachments: Attachment[]; comments: Comment[]; history: History[] };
type AdminHistoryItem = { actor_name: string; action: string; title: string | null; created_at: string };
type AdminData = { users: Array<{ id: string; name: string; email: string; role: string; status: string; created_at: string; last_login_at: string | null }>; logins: Array<{ name: string | null; email: string; success: number; created_at: string }>; history: AdminHistoryItem[]; createdTickets: AdminHistoryItem[]; deletedTickets: AdminHistoryItem[] };
type TrashTicket = { id: string; title: string; deleted_at: string; deleted_by_name: string | null };
type DashboardSummary = { total: number; status_new: number; status_in_progress: number; status_done: number; status_not_issue: number; severity_critical: number; severity_high: number; severity_medium: number; severity_low: number; mine: number; open: number; due_soon: number };
type TicketFilterOptions = { projects: Array<{ id: string; name: string }>; assignees: Array<{ id: string; name: string }>; creators: Array<{ id: string; name: string }> };

const statuses = ["신규", "진행", "완료", "이슈 아님"];
const severities = ["Critical", "High", "Medium", "Low"];
const frequencies = ["항상", "자주", "가끔", "한 번"];
const ADMIN_PAGE_SIZE = 10;
const empty = { title: "", status: "신규", severity: "Medium", game: "", project_id: "", assignee_id: "", assignee: "", due_at: "", environment: "", frequency: "항상", reproduction: "", content: "", issue_reason: "" };
const formatDate = (value: string) => new Date(value).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" });
const fileSize = (value: number) => `${(value / 1024 / 1024).toFixed(value > 10 * 1024 * 1024 ? 0 : 1)}MB`;
const roleName = (role: string) => role === "admin" ? "관리자" : role === "member" ? "구성원" : "일반";
const COMPLETED_STATUSES = new Set(["완료", "이슈 아님"]);
const normalizeStatus = (status: string) => ({ "해결됨": "완료", "검증 완료": "완료", "종료": "완료", "재오픈": "진행", "보류": "진행", "중복": "이슈 아님", "거절": "이슈 아님" }[status] || status);
const normalizeTicket = <T extends Ticket>(ticket: T): T => ({ ...ticket, status: normalizeStatus(ticket.status) });
const ticketCode = (ticket: Ticket) => ticket.ticket_name && ticket.ticket_number ? `${ticket.ticket_name}-${String(ticket.ticket_number).padStart(4, "0")}` : "";
const todayInput = () => new Date().toISOString().slice(0, 10);
const toDate = (value?: string | null) => value ? new Date(`${value.slice(0, 10)}T00:00:00`) : null;
const addDays = (value: Date, days: number) => { const next = new Date(value); next.setDate(next.getDate() + days); return next; };
const startOfWeek = (value: Date) => { const next = new Date(value); const day = next.getDay() || 7; next.setHours(0, 0, 0, 0); next.setDate(next.getDate() - day + 1); return next; };
const daysBetween = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / 86400000);

type MultiFilterOption = { id: string; label: string };

function MultiFilter({ label, options, values, onChange }: { label: string; options: MultiFilterOption[]; values: string[]; onChange: (values: string[]) => void }) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeOnOutside = (event: PointerEvent) => {
      if (detailsRef.current && !detailsRef.current.contains(event.target as Node)) detailsRef.current.open = false;
    };
    document.addEventListener("pointerdown", closeOnOutside);
    return () => document.removeEventListener("pointerdown", closeOnOutside);
  }, []);
  const toggle = (id: string) => onChange(values.includes(id) ? values.filter(value => value !== id) : [...values, id]);
  return <div className="multi-filter"><span>{label}</span><details ref={detailsRef}><summary>{values.length ? `${values.length}개 선택` : "전체"}</summary><div className="multi-filter-options">{options.map(option => <label key={option.id}><input type="checkbox" checked={values.includes(option.id)} onChange={() => toggle(option.id)}/><span>{option.label}</span></label>)}</div></details></div>;
}

function StoredEvidence({ attachments, onDelete }: { attachments: Attachment[]; onDelete?: (file: Attachment) => void }) {
  const [openFile, setOpenFile] = useState<Attachment | null>(null);
  return <section className="stored-evidence"><h2>저장된 증빙 자료</h2><div className="evidence-grid">{attachments.map(file => {
    const source = `/api/attachments/${file.id}`;
    const image = file.content_type?.startsWith("image/");
    const video = file.content_type?.startsWith("video/");
    return <article className="evidence-card" key={file.id}>{image ? <button className="evidence-preview evidence-image" type="button" onClick={() => setOpenFile(file)} aria-label={`${file.name} 확대 보기`}><img src={source} alt={file.name}/></button> : video ? <button className="evidence-preview" type="button" onClick={() => setOpenFile(file)} aria-label={`${file.name} 재생`}>▶<span>동영상 재생</span></button> : <span className="evidence-preview">LOG<br/>FILE</span>}<div className="evidence-info"><b>{file.name}</b><small>{video ? "동영상" : image ? "이미지" : "로그"} · {fileSize(file.size)}</small>{file.description && <small>{file.description}</small>}<a className="download-file" href={`${source}?download=1`} download={file.name}>파일 다운로드</a>{onDelete && <button className="remove-file" type="button" onClick={() => onDelete(file)}>첨부파일 삭제</button>}</div></article>;
  })}</div>{openFile && <div className="media-modal" role="dialog" aria-modal="true" aria-label={openFile.name} onClick={() => setOpenFile(null)}><button className="modal-close" type="button" aria-label="미리보기 닫기" onClick={() => setOpenFile(null)}>×</button><div className="media-modal-body" onClick={event => event.stopPropagation()}>{openFile.content_type?.startsWith("video/") ? <video controls autoPlay preload="metadata" src={`/api/attachments/${openFile.id}`}/> : <img src={`/api/attachments/${openFile.id}`} alt={openFile.name}/>}</div></div>}</section>;
}

function MarkdownContent({ value }: { value: string }) {
  const inline = (text: string, key: string) => text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\((?:https?:\/\/|mailto:)[^)]+\))/g).filter(Boolean).map((part, index) => {
    const partKey = `${key}-${index}`;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={partKey}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*")) return <em key={partKey}>{part.slice(1, -1)}</em>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={partKey}>{part.slice(1, -1)}</code>;
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    return link ? <a key={partKey} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a> : part;
  });
  return <div className="ticket-content markdown-content">{value.split("\n").map((line, index) => {
    const key = `line-${index}`;
    if (!line) return <br key={key}/>;
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) { const Tag = (`h${heading[1].length}`) as "h1" | "h2" | "h3"; return <Tag key={key}>{inline(heading[2], key)}</Tag>; }
    if (line.startsWith("- ")) return <ul key={key}><li>{inline(line.slice(2), key)}</li></ul>;
    if (/^\d+\.\s/.test(line)) return <ol key={key}><li>{inline(line.replace(/^\d+\.\s/, ""), key)}</li></ol>;
    if (line.startsWith("> ")) return <blockquote key={key}>{inline(line.slice(2), key)}</blockquote>;
    return <p key={key}>{inline(line, key)}</p>;
  })}</div>;
}

function RichTextEditor({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);
  const updateSelection = (next: string, start: number, end: number) => { onChange(next); requestAnimationFrame(() => { textareaRef.current?.focus(); textareaRef.current?.setSelectionRange(start, end); }); };
  const wrap = (before: string, after = before, fallback = "텍스트") => {
    const textarea = textareaRef.current; if (!textarea) return;
    const start = textarea.selectionStart; const selected = value.slice(start, textarea.selectionEnd) || fallback;
    const next = `${value.slice(0, start)}${before}${selected}${after}${value.slice(textarea.selectionEnd)}`;
    updateSelection(next, start + before.length, start + before.length + selected.length);
  };
  const prefix = (marker: string, fallback = "항목") => {
    const textarea = textareaRef.current; if (!textarea) return;
    const start = textarea.selectionStart; const end = textarea.selectionEnd; const selected = value.slice(start, end) || fallback;
    const prefixed = selected.split("\n").map(line => `${marker}${line}`).join("\n");
    const next = `${value.slice(0, start)}${prefixed}${value.slice(end)}`;
    updateSelection(next, start + marker.length, start + prefixed.length);
  };
  return <div className="rich-editor"><div className="rich-toolbar" role="toolbar" aria-label="내용 서식"><select aria-label="텍스트 형식" defaultValue="본문" onChange={event => { if (event.target.value === "제목") prefix("## ", "제목"); event.currentTarget.value = "본문"; }} disabled={disabled}><option>본문</option><option>제목</option></select><button type="button" onClick={() => wrap("**")} disabled={disabled} aria-label="굵게"><b>B</b></button><button type="button" onClick={() => wrap("*")} disabled={disabled} aria-label="기울임"><i>I</i></button><button type="button" onClick={() => prefix("- ")} disabled={disabled} aria-label="글머리 목록">• 목록</button><button type="button" onClick={() => prefix("1. ")} disabled={disabled} aria-label="번호 목록">1. 목록</button><button type="button" onClick={() => prefix("> ", "인용문")} disabled={disabled} aria-label="인용문">❝</button><button type="button" onClick={() => wrap("[", "](https://)", "링크 텍스트")} disabled={disabled} aria-label="링크">↗</button><button type="button" onClick={() => wrap("`")} disabled={disabled} aria-label="코드">&lt;/&gt;</button><button className="rich-preview-toggle" type="button" onClick={() => setPreview(current => !current)} aria-pressed={preview}>{preview ? "작성" : "미리보기"}</button></div>{preview ? <div className="rich-preview"><MarkdownContent value={value || "미리볼 내용이 없습니다."}/></div> : <textarea ref={textareaRef} className="content-input" maxLength={10000} value={value} onChange={event => onChange(event.target.value)} disabled={disabled} required/>}</div>;
}

function TicketEditor({ user, detail, projects, onSaved, onRefresh, onHome }: { user: SessionUser; detail: Detail | null; projects: Project[]; onSaved: (ticketId?: string) => void; onRefresh: () => void; onHome: () => void }) {
  const [form, setForm] = useState(detail?.ticket || empty);
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [descriptions, setDescriptions] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(!detail);
  const editable = user.role !== "viewer";
  useEffect(() => {
    if (!form.project_id) return;
    fetch(`/api/projects/${form.project_id}/members`).then(response => response.ok ? response.json() : { members: [] }).then(data => setProjectMembers(data.members || []));
  }, [form.project_id]);
  useEffect(() => {
    if (!detail) return;
    const syncEditingState = () => setEditing(window.location.hash === `#ticket/${detail.ticket.id}/edit`);
    syncEditingState();
    window.addEventListener("popstate", syncEditingState);
    return () => window.removeEventListener("popstate", syncEditingState);
  }, [detail]);
  const update = (key: string, value: string) => setForm(current => key === "assignee" ? { ...current, assignee: value, assignee_id: projectMembers.find(member => member.name === value)?.id || "" } : { ...current, [key]: value });
  const chooseProject = (projectId: string) => {
    const project = projects.find(item => item.id === projectId);
    setForm(current => ({ ...current, project_id: projectId, game: project?.name || "", due_at: project?.due_at || "", assignee_id: "", assignee: "" }));
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.title.trim() || !form.content.trim() || !form.project_id) return setNotice("제목, 프로젝트, 내용은 필수 항목입니다.");
    const issueReason = form.status === "이슈 아님" && !form.issue_reason ? window.prompt("이슈 아님 처리 사유를 입력해 주세요.") || "" : form.issue_reason || "";
    if (form.status === "이슈 아님" && !issueReason.trim()) return setNotice("이슈 아님 처리 사유를 입력해 주세요.");
    const payload = { ...form, issue_reason: issueReason };
    setBusy(true); setNotice("");
    const response = await fetch(detail ? `/api/tickets/${detail.ticket.id}` : "/api/tickets", { method: detail ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json();
    if (!response.ok) { setBusy(false); return setNotice(data.error || "티켓 저장에 실패했습니다."); }
    const id = detail?.ticket.id || data.id;
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const query = new URLSearchParams({ name: file.name, description: descriptions[index] || "", initial: detail ? "0" : "1" });
      const upload = await fetch(`/api/tickets/${id}/attachments/${crypto.randomUUID()}?${query}`, { method: "PUT", headers: { "content-type": file.type || "application/octet-stream" }, body: file });
      if (!upload.ok) { setBusy(false); return setNotice(`첨부파일 “${file.name}” 저장에 실패했습니다.`); }
    }
    setBusy(false);
    if (detail) { window.history.replaceState(null, "", `#ticket/${id}`); setEditing(false); }
    onSaved(detail ? id : undefined);
  };
  const isVideoWithinLimit = (file: File) => new Promise<boolean>(resolve => {
    if (!file.type.startsWith("video/")) return resolve(true);
    const video = document.createElement("video");
    const source = URL.createObjectURL(file);
    video.preload = "metadata";
    video.onloadedmetadata = () => { URL.revokeObjectURL(source); resolve(Number.isFinite(video.duration) && video.duration <= 120); };
    video.onerror = () => { URL.revokeObjectURL(source); resolve(false); };
    video.src = source;
  });
  const addFiles = async (selected: File[]) => {
    const available = 10 - files.length;
    const sizeAllowed = selected.filter(file => file.size <= 300 * 1024 * 1024);
    const checked = await Promise.all(sizeAllowed.map(async file => ({ file, valid: await isVideoWithinLimit(file) })));
    const valid = checked.filter(item => item.valid).map(item => item.file).slice(0, available);
    setFiles(current => [...current, ...valid]); setDescriptions(current => [...current, ...valid.map(() => "")]);
    if (valid.length !== selected.length) setNotice("첨부는 최대 10개, 파일당 300MB까지이며 동영상은 2분 이하여야 합니다.");
  };
  const removeTicket = async () => {
    if (!detail || !confirm("이 티켓을 휴지통으로 이동할까요?")) return;
    setBusy(true);
    const response = await fetch(`/api/tickets/${detail.ticket.id}`, { method: "DELETE" });
    setBusy(false);
    if (!response.ok) return setNotice("티켓 삭제에 실패했습니다.");
    onSaved();
  };
  const removeAttachment = async (file: Attachment) => {
    if (!detail || !confirm(`첨부파일 “${file.name}”을(를) 삭제할까요? 삭제 즉시 반영되며 변경 이력에 기록됩니다.`)) return;
    setBusy(true); setNotice("");
    const response = await fetch(`/api/tickets/${detail.ticket.id}/attachments/${file.id}`, { method: "DELETE" });
    const data = await response.json();
    setBusy(false);
    if (!response.ok) return setNotice(data.error || "첨부파일 삭제에 실패했습니다.");
    setNotice(`첨부파일 “${file.name}”을(를) 삭제했습니다.`);
    onRefresh();
  };
  if (!detail) return <main className="ticket-editor-page">
    <header><div><button className="home-title" type="button" onClick={onHome}>QA Ticket Desk</button><span>작성자: {user.name}</span></div><button className="primary" form="ticket-form" disabled={busy}>{busy ? "저장 중…" : "저장하기"}</button></header>
    <h1 className="editor-title">티켓생성</h1>
    <form id="ticket-form" className="editor ticket-editor" onSubmit={save}>
      <fieldset disabled={!editable}>
        <div className="ticket-editor-project">
          <label>프로젝트 <i>*</i><select value={form.project_id || ""} onChange={event => chooseProject(event.target.value)} required><option value="">프로젝트를 선택하세요</option>{projects.map(project => <option value={project.id} key={project.id}>{project.name} · 마감 {project.due_at || "미설정"}</option>)}</select></label>
          <label>작성자<input className="fixed-author" value={user.name} disabled aria-label="작성자"/></label>
        </div>
        <div className="fields ticket-editor-fields">
          <label>진행상황 <i>*</i><select value={form.status} onChange={event => update("status", event.target.value)}>{statuses.map(value => <option key={value}>{value}</option>)}</select></label>
          <label>위험도·심각도 <i>*</i><select value={form.severity} onChange={event => update("severity", event.target.value)}>{severities.map(value => <option key={value}>{value}</option>)}</select></label>
          <label>담당자<select value={form.assignee_id || ""} onChange={event => update("assignee_id", event.target.value)} disabled={!form.project_id}><option value="">미지정</option>{projectMembers.map(member => <option value={member.id} key={member.id}>{member.name} · {member.role}</option>)}</select></label>
          <label>마감일<input type="date" value={form.due_at || ""} onChange={event => update("due_at", event.target.value)}/><small className="field-help">프로젝트 마감일이 기본으로 입력되며 변경할 수 있습니다.</small></label>
          <label>발생 환경<input value={form.environment || ""} onChange={event => update("environment", event.target.value)}/></label>
          <label>발생 빈도<select value={form.frequency || "항상"} onChange={event => update("frequency", event.target.value)}>{frequencies.map(value => <option key={value}>{value}</option>)}</select></label>
          <label>재현 횟수<input value={form.reproduction || ""} onChange={event => update("reproduction", event.target.value)} placeholder="예: 5회 중 5회"/></label>
          {form.status === "이슈 아님" && <label className="wide">이슈 아님 사유 <i>*</i><input value={form.issue_reason || ""} onChange={event => update("issue_reason", event.target.value)} maxLength={1000} required/></label>}
        </div>
        <div className="ticket-editor-divider"/>
        <label className="ticket-title-field">제목 <i>*</i><input maxLength={50} value={form.title} onChange={event => update("title", event.target.value)} required/></label>
        <section className="evidence"><div className="evidence-head"><div><h2>증빙 자료</h2><p>최대 10개 · 파일당 300MB · 동영상은 2분 이하</p></div><label className="upload-button">파일 추가<input type="file" multiple accept="image/*,video/*,.log,.txt,.json,.har" onChange={event => { void addFiles(Array.from(event.target.files || [])); }}/></label></div>{files.map((file, index) => <div className="pending-file" key={`${file.name}-${index}`}><span>{file.name} · {fileSize(file.size)}</span><input value={descriptions[index] || ""} onChange={event => setDescriptions(values => values.map((value, itemIndex) => itemIndex === index ? event.target.value : value))} placeholder="파일 설명"/><button type="button" onClick={() => { setFiles(values => values.filter((_, itemIndex) => itemIndex !== index)); setDescriptions(values => values.filter((_, itemIndex) => itemIndex !== index)); }}>제거</button></div>)}</section>
        <label className="wide ticket-content-field">내용 <i>*</i><RichTextEditor value={form.content || ""} onChange={value => update("content", value)} disabled={!editable}/></label>
      </fieldset>
      <div className="actions"><button className="primary" type="submit" disabled={busy}>{busy ? "저장 중…" : "티켓 저장"}</button>{notice && <span>{notice}</span>}</div>
    </form>
  </main>;
  if (detail && !editing) return <main><header><div><button className="home-title" type="button" onClick={onHome}>QA Ticket Desk</button><span>티켓 상세 · {ticketCode(detail.ticket) ? `${ticketCode(detail.ticket)} · ` : ""}작성자: {detail.ticket.created_by_name || "-"} · {formatDate(detail.ticket.created_at)}</span></div>{editable && <button className="back" type="button" onClick={event => { event.preventDefault(); window.history.pushState(null, "", `#ticket/${detail.ticket.id}/edit`); setEditing(true); }}>수정</button>}{editable && (user.role === "admin" || detail.ticket.created_by_id === user.id) && <button className="danger" type="button" disabled={busy} onClick={() => { void removeTicket(); }}>삭제</button>}</header>{notice && <p className="editor-notice">{notice}</p>}<article className="ticket-view"><h1>{detail.ticket.title}</h1><dl className="ticket-information"><div><dt>진행상황</dt><dd><span className={`pill ${detail.ticket.status}`}>{detail.ticket.status}</span></dd></div>{ticketCode(detail.ticket) && <div><dt>티켓 번호</dt><dd>{ticketCode(detail.ticket)}</dd></div>}<div><dt>위험도·심각도</dt><dd>{detail.ticket.severity}</dd></div><div><dt>프로젝트</dt><dd>{detail.ticket.game || "미지정"}</dd></div><div><dt>작성자</dt><dd>{detail.ticket.created_by_name || "-"}</dd></div><div><dt>담당자</dt><dd>{detail.ticket.assignee || "미지정"}</dd></div><div><dt>마감일</dt><dd>{detail.ticket.due_at || "미설정"}</dd></div><div><dt>발생 환경</dt><dd>{detail.ticket.environment || "-"}</dd></div><div><dt>발생 빈도</dt><dd>{detail.ticket.frequency || "-"}</dd></div><div><dt>재현 횟수</dt><dd>{detail.ticket.reproduction || "-"}</dd></div></dl>{detail.ticket.status === "이슈 아님" && detail.ticket.issue_reason && <section className="ticket-issue-reason"><h2>이슈 아님 사유</h2><p>{detail.ticket.issue_reason}</p></section>}<section><h2>내용</h2><MarkdownContent value={detail.ticket.content}/></section></article>{detail.attachments.length ? <StoredEvidence attachments={detail.attachments}/> : null}{user.role !== "viewer" && <Comments detail={detail} user={user} onRefresh={onRefresh}/>}<HistoryPanel history={detail.history}/></main>;
  return <main><header><div><button className="home-title" type="button" onClick={onHome}>QA Ticket Desk</button><span>{detail?.ticket.created_by_name ? `작성자: ${detail.ticket.created_by_name}` : `작성자: ${user.name}`} · 모든 저장은 이력에 기록됩니다.</span></div>{editable && <button className="primary" form="ticket-form" disabled={busy}>{busy ? "저장 중…" : "저장하기"}</button>}</header>{!detail && <h1 className="editor-title">티켓생성</h1>}<form id="ticket-form" className="editor" onSubmit={save}><fieldset disabled={!editable}><div className="fields"><label>제목 <i>*</i><input maxLength={50} value={form.title} onChange={event => update("title", event.target.value)} required/></label><label>진행상황 <i>*</i><select value={form.status} onChange={event => update("status", event.target.value)}>{statuses.map(value => <option key={value}>{value}</option>)}</select></label><label>위험도·심각도 <i>*</i><select value={form.severity} onChange={event => update("severity", event.target.value)}>{severities.map(value => <option key={value}>{value}</option>)}</select></label><label>담당자<input value={form.assignee || ""} onChange={event => update("assignee", event.target.value)} placeholder="예: 홍길동" maxLength={50}/></label><label>프로젝트<input value={form.game || ""} onChange={event => update("game", event.target.value)} placeholder="예: 메탈슬러그" maxLength={100}/></label><label>마감일<input type="date" value={form.due_at || ""} onChange={event => update("due_at", event.target.value)}/></label><label>발생 환경<input value={form.environment || ""} onChange={event => update("environment", event.target.value)}/></label><label>발생 빈도<select value={form.frequency || "항상"} onChange={event => update("frequency", event.target.value)}>{frequencies.map(value => <option key={value}>{value}</option>)}</select></label><label>재현 횟수<input value={form.reproduction || ""} onChange={event => update("reproduction", event.target.value)} placeholder="예: 5회 중 5회"/></label></div><label className="wide">내용 <i>*</i><textarea className="content-input" maxLength={10000} value={form.content || ""} onChange={event => update("content", event.target.value)} required/></label><section className="evidence"><div className="evidence-head"><div><h2>증빙 자료</h2><p>최대 10개 · 파일당 300MB · 동영상은 2분 이하</p></div>{editable && <label className="upload-button">파일 추가<input type="file" multiple accept="image/*,video/*,.log,.txt,.json,.har" onChange={event => { void addFiles(Array.from(event.target.files || [])); }}/></label>}</div>{files.map((file, index) => <div className="pending-file" key={`${file.name}-${index}`}><span>{file.name} · {fileSize(file.size)}</span><input value={descriptions[index] || ""} onChange={event => setDescriptions(values => values.map((value, itemIndex) => itemIndex === index ? event.target.value : value))} placeholder="파일 설명"/><button type="button" onClick={() => { setFiles(values => values.filter((_, itemIndex) => itemIndex !== index)); setDescriptions(values => values.filter((_, itemIndex) => itemIndex !== index)); }}>제거</button></div>)}</section></fieldset>{detail?.attachments.length ? <StoredEvidence attachments={detail.attachments} onDelete={editable ? removeAttachment : undefined}/> : null}{editable && <div className="actions"><button className="primary" type="submit" disabled={busy}>{busy ? "저장 중…" : "티켓 저장"}</button>{notice && <span>{notice}</span>}</div>}</form></main>;
}

function Comments({ detail, user, onRefresh }: { detail: Detail; user: SessionUser; onRefresh: () => void }) {
  const [body, setBody] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [notice, setNotice] = useState("");
  const request = async (url: string, method: "POST" | "PATCH" | "DELETE", data?: { body: string }) => {
    const response = await fetch(url, { method, headers: data ? { "content-type": "application/json" } : undefined, body: data ? JSON.stringify(data) : undefined });
    const result = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) { setNotice(result.error || "댓글 처리에 실패했습니다."); return false; }
    return true;
  };
  const add = async () => { if (!body.trim()) return; setNotice(""); if (await request(`/api/tickets/${detail.ticket.id}/comments`, "POST", { body })) { setBody(""); onRefresh(); } };
  const save = async (comment: Comment) => { if (!editingBody.trim()) return setNotice("댓글을 입력해 주세요."); setNotice(""); if (await request(`/api/tickets/${detail.ticket.id}/comments/${comment.id}`, "PATCH", { body: editingBody })) { setEditingId(null); onRefresh(); } };
  const remove = async (comment: Comment) => { if (!confirm("이 댓글을 삭제할까요?")) return; setNotice(""); if (await request(`/api/tickets/${detail.ticket.id}/comments/${comment.id}`, "DELETE")) onRefresh(); };
  const canManage = (comment: Comment) => user.role === "admin" || comment.created_by_id === user.id;
  return <section className="comments"><h2>댓글</h2>{detail.comments.map(comment => <article key={comment.id}><div className="comment-head"><b>{comment.author}</b><time>{formatDate(comment.created_at)}</time>{canManage(comment) && <span className="comment-actions"><button type="button" onClick={() => { setEditingId(comment.id); setEditingBody(comment.body); setNotice(""); }}>수정</button><button type="button" className="comment-delete" onClick={() => { void remove(comment); }}>삭제</button></span>}</div>{editingId === comment.id ? <div className="comment-edit"><textarea value={editingBody} maxLength={10000} onChange={event => setEditingBody(event.target.value)} aria-label={`${comment.author} 댓글 수정`}/><div><button className="primary" type="button" onClick={() => { void save(comment); }}>저장</button><button type="button" onClick={() => { setEditingId(null); setEditingBody(""); }}>취소</button></div></div> : <p>{comment.body}</p>}</article>)}{notice && <p className="comment-notice">{notice}</p>}<div className="comment-form"><p>작성자: <b>{user.name}</b></p><textarea value={body} maxLength={10000} onChange={event => setBody(event.target.value)} placeholder="댓글을 입력하세요"/><button className="primary" type="button" onClick={() => { void add(); }}>댓글 등록</button></div></section>;
}

function HistoryPanel({ history }: { history: History[] }) {
  const labels: Record<string, string> = { title: "제목", status: "진행상황", severity: "위험도·심각도", game: "게임", assignee: "담당자", due_at: "마감일", environment: "발생 환경", frequency: "발생 빈도", reproduction: "재현 횟수", content: "내용", attachment: "첨부파일" };
  const readValues = (value?: string | null) => { try { return value ? JSON.parse(value) as Record<string, unknown> : null; } catch { return null; } };
  const displayValue = (value: unknown) => value === null || value === undefined || value === "" ? "미입력" : String(value);
  const visibleHistory = history.filter(item => !["댓글 등록", "티켓 생성", "증빙 자료 첨부"].includes(item.action));
  return <section className="history"><h2>변경 이력</h2>{visibleHistory.length ? visibleHistory.map((item, index) => { const before = readValues(item.before_json); const after = readValues(item.after_json); const changed = before && after ? Object.keys(labels).filter(key => (before[key] || "") !== (after[key] || "")) : []; return <article key={`${item.created_at}-${index}`}><div className="history-head"><b>{item.actor_name}</b><time>{formatDate(item.created_at)}</time></div><div className="history-body">{changed.length ? <><p className="history-label">수정된 사항</p><dl className="history-changes">{changed.map(key => <div key={key}><dt>{labels[key]}</dt><dd><span>{displayValue(before?.[key])} → {displayValue(after?.[key])}</span></dd></div>)}</dl></> : <p className="history-action">{item.action}</p>}</div></article>; }) : <p>기록된 변경 이력이 없습니다.</p>}</section>;
}


type WorkspaceView = "dashboard" | "board" | "list" | "timeline";

const workspaceTabs: { id: WorkspaceView; label: string }[] = [
  { id: "dashboard", label: "Summary" },
  { id: "board", label: "Board" },
  { id: "list", label: "List view" },
  { id: "timeline", label: "Timeline" },
];

function UserMenu({ user, onMyPage = () => { window.history.pushState(null, "", "#mypage"); window.dispatchEvent(new PopStateEvent("popstate")); }, onAdmin, onLogout }: { user: SessionUser; onMyPage?: () => void; onAdmin: () => void; onLogout: () => void }) {
  return <details className="user-menu"><summary>{user.name}</summary><div><button type="button" onClick={onMyPage}>마이페이지</button>{user.role === "admin" && <button type="button" onClick={onAdmin}>관리자 페이지</button>}<button type="button" onClick={onLogout}>로그아웃</button></div></details>;
}

function WorkspaceTabs({ active, onChange, onPlanning = () => { window.history.pushState(null, "", "#planning"); window.dispatchEvent(new PopStateEvent("popstate")); } }: { active: WorkspaceView; onChange: (view: WorkspaceView) => void; onPlanning?: () => void }) {
  return <nav className="workspace-tabs" aria-label="작업 화면">{workspaceTabs.map(tab => <button className={active === tab.id ? "active" : ""} type="button" key={tab.id} onClick={() => onChange(tab.id)}>{tab.label}</button>)}<button className="workspace-planning" type="button" onClick={onPlanning}>프로젝트 기획</button></nav>;
}

function ProjectFilter({ games, value, onChange }: { games: string[]; value: string; onChange: (value: string) => void }) {
  return <label className="project-filter">프로젝트<select value={value} onChange={event => onChange(event.target.value)}><option value="전체">전체 프로젝트</option>{games.map(game => <option key={game} value={game}>{game}</option>)}</select></label>;
}

type ReportTicket = { id: string; title: string };
type ProjectReport = { project: { id: string; name: string; created_at: string | null; due_at: string | null; status: string }; status_counts: Record<string, number>; severity_counts: Record<string, number>; status_by_severity: Record<string, Record<string, number>>; assignee_statuses: Array<{ name: string; counts: Record<string, number>; total: number }>; can_view_deletions: boolean; activity: Array<{ day: string; created: number; updated: number; deleted: number; created_tickets: ReportTicket[]; updated_tickets: ReportTicket[]; deleted_tickets: ReportTicket[] }> };

const reportStatuses = [{ label: "신규", color: "#4f8de8" }, { label: "진행", color: "#f0ac37" }, { label: "완료", color: "#45b77a" }, { label: "이슈 아님", color: "#97a3b6" }];

function ActivityChart({ activity, canViewDeletions }: { activity: ProjectReport["activity"]; canViewDeletions: boolean }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const maximum = Math.max(1, ...activity.flatMap(item => canViewDeletions ? [item.created, item.updated, item.deleted] : [item.created, item.updated]));
  const axisMaximum = maximum <= 10 ? maximum : Math.ceil(maximum / 10) * 10;
  const axisStep = maximum <= 10 ? 1 : 10;
  const axisValues = Array.from({ length: axisMaximum / axisStep + 1 }, (_, index) => axisMaximum - index * axisStep);
  const x = (index: number) => index / Math.max(1, activity.length - 1) * 100;
  const y = (value: number) => 52 - value / axisMaximum * 46;
  const path = (key: "created" | "updated" | "deleted") => activity.reduce((value, item, index) => {
    if (!index) return `M${x(index)},${y(item[key])}`;
    const previous = activity[index - 1];
    const midpoint = (x(index - 1) + x(index)) / 2;
    return `${value} C${midpoint},${y(previous[key])} ${midpoint},${y(item[key])} ${x(index)},${y(item[key])}`;
  }, "");
  const areaPath = (key: "created" | "updated" | "deleted") => `${path(key)} L${x(activity.length - 1)},52 L${x(0)},52 Z`;
  const active = activeIndex === null ? null : activity[activeIndex];
  return <div className="report-activity" onMouseLeave={() => setActiveIndex(null)}><div className="report-chart-key"><span><i className="created"/>생성</span><span><i className="updated"/>수정</span>{canViewDeletions && <span><i className="deleted"/>삭제</span>}<small>{activity[0]?.day} ~ {activity.at(-1)?.day}</small></div><div className="report-chart-y-axis" aria-hidden="true">{axisValues.map(value => <span key={value} style={{ top: `${y(value) / 56 * 100}%` }}>{value}</span>)}</div><svg viewBox="0 0 100 56" preserveAspectRatio="none" role="img" aria-label="프로젝트 생성일부터 오늘까지의 티켓 활동 추이"><defs><linearGradient id="activity-created-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#1769e8" stopOpacity=".24"/><stop offset="100%" stopColor="#1769e8" stopOpacity="0"/></linearGradient></defs>{[6, 21, 36, 52].map(value => <line key={value} x1="0" y1={value} x2="100" y2={value}/>) }{activity.map((item, index) => <line className="activity-day-line" key={item.day} x1={x(index)} y1="6" x2={x(index)} y2="52"/>)}<path className="activity-created-area" d={areaPath("created")}/><path className="activity-created" d={path("created")}/><path className="activity-updated" d={path("updated")}/>{canViewDeletions && <path className="activity-deleted" d={path("deleted")}/>} {active && <line className="activity-active-line" x1={x(activeIndex || 0)} y1="6" x2={x(activeIndex || 0)} y2="52"/>}{activity.map((item, index) => <g key={`${item.day}-point`}><circle className={`activity-created-point${activeIndex === index ? " is-active" : ""}`} cx={x(index)} cy={y(item.created)} r={activeIndex === index ? "1.15" : ".55"}/><circle className={`activity-updated-point${activeIndex === index ? " is-active" : ""}`} cx={x(index)} cy={y(item.updated)} r={activeIndex === index ? "1.15" : ".55"}/>{canViewDeletions && <circle className={`activity-deleted-point${activeIndex === index ? " is-active" : ""}`} cx={x(index)} cy={y(item.deleted)} r={activeIndex === index ? "1.15" : ".55"}/>}<rect className="activity-hit-area" x={`${Math.max(0, x(index) - 50 / Math.max(1, activity.length - 1))}%`} y="0" width={`${100 / Math.max(1, activity.length - 1)}%`} height="56" tabIndex={0} aria-label={`${item.day}: 생성 ${item.created}건, 수정 ${item.updated}건${canViewDeletions ? `, 삭제 ${item.deleted}건` : ""}`} onMouseEnter={() => setActiveIndex(index)} onFocus={() => setActiveIndex(index)}/></g>)}</svg>{active && <aside className="report-tooltip" role="status"><b>{active.day}</b><div><strong>생성 {active.created}건</strong>{active.created_tickets.length ? <ul>{active.created_tickets.map(ticket => <li key={`created-${ticket.id}`}>{ticket.title}</li>)}</ul> : <span>생성된 티켓 없음</span>}</div><div><strong>수정 {active.updated}건</strong>{active.updated_tickets.length ? <ul>{active.updated_tickets.map(ticket => <li key={`updated-${ticket.id}`}>{ticket.title}</li>)}</ul> : <span>수정된 티켓 없음</span>}</div>{canViewDeletions && <div><strong>삭제 {active.deleted}건</strong>{active.deleted_tickets.length ? <ul>{active.deleted_tickets.map(ticket => <li key={`deleted-${ticket.id}`}>{ticket.title}</li>)}</ul> : <span>삭제된 티켓 없음</span>}</div>}</aside>}<div className="report-chart-dates" style={{ gridTemplateColumns: `repeat(${activity.length}, minmax(0, 1fr))` }}>{activity.map(item => <span key={item.day}>{item.day.slice(5).replace("-", ".")}</span>)}</div></div>;
}

function ReportMatrix({ title, rows, statusCounts, rowLabel }: { title: string; rows: Array<{ label: string; counts: Record<string, number>; total: number }>; statusCounts: Record<string, number>; rowLabel: string }) {
  return <article className="report-matrix"><h3>{title}</h3><div className="report-table-wrap"><table><thead><tr><th scope="col">{rowLabel}</th>{reportStatuses.map(status => <th key={status.label} scope="col">{status.label}</th>)}<th scope="col">합계</th></tr></thead><tbody>{rows.length ? rows.map(row => <tr key={row.label}><th scope="row">{row.label}</th>{reportStatuses.map(status => <td key={status.label}>{row.counts[status.label] || 0}</td>)}<td>{row.total}</td></tr>) : <tr><td colSpan={reportStatuses.length + 2}>표시할 티켓이 없습니다.</td></tr>}</tbody><tfoot><tr><th scope="row">합계</th>{reportStatuses.map(status => <td key={status.label}>{statusCounts[status.label] || 0}</td>)}<td>{Object.values(statusCounts).reduce((sum, value) => sum + value, 0)}</td></tr></tfoot></table></div></article>;
}

function ProjectReportPanel({ projects }: { projects: Project[] }) {
  const [projectId, setProjectId] = useState("");
  const [report, setReport] = useState<ProjectReport | null>(null);
  const [notice, setNotice] = useState("");
  const selectedId = projects.some(project => project.id === projectId) ? projectId : projects[0]?.id || "";
  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    fetch(`/api/projects/${selectedId}/report`, { cache: "no-store", signal: controller.signal }).then(async response => {
      const data = await response.json() as ProjectReport & { error?: string };
      if (!response.ok) throw new Error(data.error || "프로젝트 보고서를 불러오지 못했습니다.");
      setReport(data);
    }).catch(error => { if (!controller.signal.aborted) { setReport(null); setNotice(error instanceof Error ? error.message : "프로젝트 보고서를 불러오지 못했습니다."); } });
    return () => controller.abort();
  }, [selectedId]);
  const total = reportStatuses.reduce((sum, item) => sum + (report?.status_counts[item.label] || 0), 0);
  const segments = reportStatuses.reduce<{ offset: number; stops: string[] }>((current, item) => { const value = report?.status_counts[item.label] || 0; const next = current.offset + (total ? value / total * 100 : 0); current.stops.push(`${item.color} ${current.offset}% ${next}%`); current.offset = next; return current; }, { offset: 0, stops: [] });
  const severityRows = severities.map(severity => ({ label: severity, counts: report?.status_by_severity[severity] || {}, total: report?.severity_counts[severity] || 0 }));
  const assigneeRows = (report?.assignee_statuses || []).slice(0, 8).map(item => ({ label: item.name, counts: item.counts, total: item.total }));
  return <section className="dashboard-report"><div className="dashboard-report-head"><div><h2>프로젝트 결과 현황</h2><p>프로젝트 단위로 상태, 위험도, 담당자와 일자별 흐름을 바로 확인합니다.</p></div><label>프로젝트<select value={selectedId} onChange={event => { setNotice(""); setProjectId(event.target.value); }}>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label></div>{!projects.length ? <p>표시할 프로젝트가 없습니다.</p> : notice ? <p>{notice}</p> : !report ? <p>프로젝트 보고서를 불러오는 중…</p> : <div className="dashboard-report-grid"><article className="report-status"><h3>{report.project.name}</h3><p>{report.project.status} · 마감 {report.project.due_at || "미정"}</p><div className="report-status-body"><div className="report-donut" style={{ background: total ? `conic-gradient(${segments.stops.join(",")})` : "#eaf0f8" }}><strong>{total}</strong><span>티켓</span></div><dl>{reportStatuses.map(item => { const value = report.status_counts[item.label] || 0; return <div key={item.label}><dt><i style={{ background: item.color }}/>{item.label}</dt><dd>{value}<small>{total ? Math.round(value / total * 100) : 0}%</small></dd></div>; })}</dl></div></article><article className="report-trend"><h3>일자별 티켓 활동</h3><p>{report.can_view_deletions ? "생성 · 수정 · 삭제 건수 기준" : "생성 및 수정 건수 기준"}</p><ActivityChart activity={report.activity} canViewDeletions={report.can_view_deletions}/></article><ReportMatrix title="위험도 × 진행상황" rowLabel="위험도" rows={severityRows} statusCounts={report.status_counts}/><ReportMatrix title="담당자별 진행상황" rowLabel="담당자" rows={assigneeRows} statusCounts={report.status_counts}/></div>}</section>;
}

function Dashboard({ tickets, projects, summary, user, onCreate, onList, onMine, onOpen, onPlanning, onAdmin, onLogout, onHome, onViewChange }: { tickets: Ticket[]; projects: Project[]; summary: DashboardSummary; user: SessionUser; onCreate: () => void; onList: () => void; onMine: () => void; onOpen: (id: string) => void; onPlanning: () => void; onAdmin: () => void; onLogout: () => void; onHome: () => void; onViewChange: (view: WorkspaceView) => void }) {
  const statusCounts = [{ label: "신규", value: summary.status_new }, { label: "진행", value: summary.status_in_progress }, { label: "완료", value: summary.status_done }, { label: "이슈 아님", value: summary.status_not_issue }];
  const severityCounts = [{ label: "Critical", value: summary.severity_critical }, { label: "High", value: summary.severity_high }, { label: "Medium", value: summary.severity_medium }, { label: "Low", value: summary.severity_low }];
  const recent = [...tickets].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 8);
  const highest = Math.max(1, ...statusCounts.map(item => item.value), ...severityCounts.map(item => item.value));
  return <main><header><div><button className="home-title workspace-title" type="button" onClick={onHome}>QA Ticket Desk</button></div><UserMenu user={user} onAdmin={onAdmin} onLogout={onLogout}/></header><WorkspaceTabs active="dashboard" onChange={onViewChange} onPlanning={onPlanning}/><section className="dashboard-summary"><article><small>전체 티켓</small><strong>{summary.total}</strong></article><article><small>내게 할당됨</small><strong>{summary.mine}</strong></article><article><small>열린 티켓</small><strong>{summary.open}</strong></article><article><small>마감일 임박/지남</small><strong>{summary.due_soon}</strong><em>오늘부터 3일 이내</em></article></section><ProjectReportPanel projects={projects}/><section className="dashboard-actions"><h2>빠른 액션</h2><div>{user.role !== "viewer" && <button className="primary" onClick={onCreate}>+ 티켓 생성</button>}<button className="back" onClick={onMine}>내 티켓 보기</button><button className="back" onClick={onList}>티켓 목록 보기</button><span>게임명은 프로젝트로 구분합니다.</span></div></section><div className="dashboard-columns"><section className="dashboard-panel"><h2>상태별 티켓</h2>{statusCounts.map(item => <div className="metric-row" key={item.label}><span>{item.label}</span><i><b style={{ width: `${item.value / highest * 100}%` }}/></i><strong>{item.value}</strong></div>)}</section><section className="dashboard-panel"><h2>심각도별 티켓</h2>{severityCounts.map(item => <div className="metric-row" key={item.label}><span>{item.label}</span><i><b style={{ width: `${item.value / highest * 100}%` }}/></i><strong>{item.value}</strong></div>)}</section></div><section className="dashboard-panel recent-list"><h2>최근 생성·수정된 티켓</h2>{recent.length ? recent.map(ticket => <button className="recent-ticket" type="button" key={ticket.id} onClick={() => onOpen(ticket.id)}><span><b>{ticket.title}</b><small>{ticket.assignee ? `담당: ${ticket.assignee}` : "담당자 미지정"}</small></span><span className={`pill ${ticket.status}`}>{ticket.status}</span><time>{formatDate(ticket.updated_at)}</time></button>) : <p>최근 티켓이 없습니다.</p>}</section></main>;
}

function WorkspaceHeader({ user, active, onHome, onPlanning = () => { window.history.pushState(null, "", "#planning"); window.dispatchEvent(new PopStateEvent("popstate")); }, onAdmin, onLogout, onCreate, onViewChange, showCreate = true }: { user: SessionUser; active: WorkspaceView; onHome: () => void; onPlanning?: () => void; onAdmin: () => void; onProjects: () => void; onLogout: () => void; onCreate: () => void; onViewChange: (view: WorkspaceView) => void; showCreate?: boolean }) {
  void onCreate; void showCreate;
  return <><header><div><button className="home-title workspace-title" type="button" onClick={onHome}>QA Ticket Desk</button></div><UserMenu user={user} onAdmin={onAdmin} onLogout={onLogout}/></header><WorkspaceTabs active={active} onChange={onViewChange} onPlanning={onPlanning}/></>;
}

function MyPage({ user, onHome, onAdmin, onProjects, onLogout }: { user: SessionUser; onHome: () => void; onAdmin: () => void; onProjects: () => void; onLogout: () => void }) {
  return <main className="my-page"><header><div><button className="home-title workspace-title" type="button" onClick={onHome}>QA Ticket Desk</button></div></header><section className="my-page-card"><h1>{user.name}</h1><dl><div><dt>이메일</dt><dd>{user.email}</dd></div><div><dt>권한</dt><dd>{roleName(user.role)}</dd></div></dl><div className="my-page-actions">{user.role === "admin" && <button className="back" type="button" onClick={onProjects}>프로젝트 관리</button>}{user.role === "admin" && <button className="back" type="button" onClick={onAdmin}>관리자 페이지</button>}<button className="danger" type="button" onClick={onLogout}>로그아웃</button></div></section></main>;
}

function BoardView({ tickets, games, project, user, onOpen, onHome, onAdmin, onProjects, onLogout, onCreate, onViewChange }: { tickets: Ticket[]; games: string[]; project: string; user: SessionUser; onOpen: (id: string) => void; onHome: () => void; onAdmin: () => void; onProjects: () => void; onLogout: () => void; onCreate: () => void; onViewChange: (view: WorkspaceView) => void }) {
  const [projectNames, setProjectNames] = useState<string[]>(project === "전체" ? [] : [project]);
  const [assignees, setAssignees] = useState<string[]>([]);
  const [selectedSeverities, setSelectedSeverities] = useState<string[]>([]);
  const [due, setDue] = useState("");
  const [mineOnly, setMineOnly] = useState(false);
  const [hideClosed, setHideClosed] = useState(false);
  const [keyword, setKeyword] = useState("");
  const projectOptions = games.map(name => ({ id: name, label: name }));
  const assigneeOptions = [...new Set(tickets.map(ticket => ticket.assignee).filter(Boolean))].sort().map(name => ({ id: name, label: name }));
  const dueLabels: Record<string, string> = { overdue: "마감 지남", three_days: "3일 이내", unassigned: "담당자 미지정" };
  const visible = tickets.filter(ticket => {
    if (projectNames.length && !projectNames.includes(ticket.game)) return false;
    if (assignees.length && !assignees.includes(ticket.assignee)) return false;
    if (selectedSeverities.length && !selectedSeverities.includes(ticket.severity)) return false;
    if (mineOnly && ticket.assignee_id !== user.id) return false;
    if (hideClosed && (ticket.status === "완료" || ticket.status === "이슈 아님")) return false;
    if (due === "unassigned" && ticket.assignee) return false;
    if (due && due !== "unassigned") {
      const dueDate = toDate(ticket.due_at);
      const today = toDate(todayInput())!;
      if (!dueDate || (due === "overdue" && dueDate >= today) || (due === "three_days" && (dueDate < today || dueDate > addDays(today, 3)))) return false;
    }
    const number = ticket.ticket_name && ticket.ticket_number ? `${ticket.ticket_name}-${String(ticket.ticket_number).padStart(4, "0")}` : "";
    return !keyword.trim() || `${ticket.title} ${ticket.game} ${ticket.assignee} ${number}`.toLowerCase().includes(keyword.trim().toLowerCase());
  });
  const clear = () => { setProjectNames([]); setAssignees([]); setSelectedSeverities([]); setDue(""); setMineOnly(false); setHideClosed(false); setKeyword(""); };
  const selected = projectNames.length || assignees.length || selectedSeverities.length || due || mineOnly || hideClosed || keyword.trim();
  return <main><WorkspaceHeader user={user} active="board" onHome={onHome} onAdmin={onAdmin} onProjects={onProjects} onLogout={onLogout} onCreate={onCreate} onViewChange={onViewChange}/><section className="board-filters" aria-label="보드 필터"><div className="board-filter-main"><MultiFilter label="프로젝트" options={projectOptions} values={projectNames} onChange={setProjectNames}/><MultiFilter label="담당자" options={assigneeOptions} values={assignees} onChange={setAssignees}/><MultiFilter label="심각도" options={severities.map(value => ({ id: value, label: value }))} values={selectedSeverities} onChange={setSelectedSeverities}/><label>빠른 조건<select value={due} onChange={event => setDue(event.target.value)}><option value="">전체</option><option value="overdue">마감 지남</option><option value="three_days">3일 이내</option><option value="unassigned">담당자 미지정</option></select></label><label className="board-search">검색<input value={keyword} onChange={event => setKeyword(event.target.value)} placeholder="제목·프로젝트·티켓 번호"/></label></div><div className="board-filter-footer"><div className="board-toggles"><label><input type="checkbox" checked={mineOnly} onChange={event => setMineOnly(event.target.checked)}/> 내 담당만 보기</label><label><input type="checkbox" checked={hideClosed} onChange={event => setHideClosed(event.target.checked)}/> 완료·이슈 아님 숨기기</label></div><button className="back" type="button" onClick={clear}>필터 초기화</button><em>{visible.length}개 티켓</em></div>{selected && <div className="applied-filters" aria-label="적용 중인 보드 필터"><b>적용 중인 필터</b>{projectNames.map(name => <button type="button" key={`project-${name}`} onClick={() => setProjectNames(values => values.filter(value => value !== name))}>프로젝트: {name} ×</button>)}{assignees.map(name => <button type="button" key={`assignee-${name}`} onClick={() => setAssignees(values => values.filter(value => value !== name))}>담당자: {name} ×</button>)}{selectedSeverities.map(value => <button type="button" key={`severity-${value}`} onClick={() => setSelectedSeverities(values => values.filter(item => item !== value))}>심각도: {value} ×</button>)}{due && <button type="button" onClick={() => setDue("")}>{dueLabels[due]} ×</button>}{mineOnly && <button type="button" onClick={() => setMineOnly(false)}>내 담당만 보기 ×</button>}{hideClosed && <button type="button" onClick={() => setHideClosed(false)}>완료·이슈 아님 숨기기 ×</button>}{keyword.trim() && <button type="button" onClick={() => setKeyword("")}>검색: {keyword.trim()} ×</button>}</div>}</section><section className="board">{statuses.map(status => { const column = visible.filter(ticket => ticket.status === status); return <section className="board-column" key={status}><h2>{status}<small>{column.length}</small></h2>{column.length ? column.map(ticket => <button className="board-card" type="button" key={ticket.id} onClick={() => onOpen(ticket.id)}><span className={`pill ${ticket.status}`}>{ticket.severity}</span><b>{ticket.title}</b><small>{ticket.game || "프로젝트 미지정"} · {ticket.assignee || "담당자 미지정"}</small>{ticket.due_at && <time>마감 {ticket.due_at}</time>}</button>) : <p>티켓 없음</p>}</section>; })}</section></main>;
}

function RoadmapTicket({ ticket, project, rangeStart, rangeEnd, weeks, todayPosition, onOpen }: { ticket: Ticket; project: Project; rangeStart: Date; rangeEnd: Date; weeks: number; todayPosition: number; onOpen: (id: string) => void }) {
  const startValue = ticket.created_at ? ticket.created_at.slice(0, 10) : ticket.due_at || project.due_at || "";
  const dueValue = ticket.due_at || project.due_at || "";
  const start = toDate(startValue);
  const due = toDate(dueValue);
  const overlaps = start && due && start <= rangeEnd && due >= rangeStart;
  const barStart = start && due ? Math.max(0, daysBetween(rangeStart, start)) : 0;
  const barEnd = start && due ? Math.min(weeks * 7 - 1, daysBetween(rangeStart, due)) : 0;
  const barStyle = { left: `${barStart / (weeks * 7) * 100}%`, width: `${Math.max(2, (barEnd - barStart + 1) / (weeks * 7) * 100)}%` };
  const period = startValue && dueValue ? `티켓 생성일 ${startValue} · 티켓 마감일 ${dueValue}` : "일정이 설정되지 않았습니다.";
  return <button className={`roadmap-ticket ${COMPLETED_STATUSES.has(ticket.status) ? "is-completed" : ""} ${ticket.severity === "Critical" ? "is-critical" : ""}`} key={ticket.id} type="button" data-period={period} onClick={() => onOpen(ticket.id)}><span className="roadmap-ticket-info"><span className={`roadmap-status-badge ${ticket.status}`} aria-label={`진행상황: ${ticket.status}`}>{ticket.status}</span><b>{ticket.title}</b><small>{ticket.severity} · {ticket.assignee || "담당자 미지정"}</small></span><span className="roadmap-ticket-track" style={{ backgroundSize: `calc(100% / ${weeks}) 100%` }}>{overlaps ? <i className={`roadmap-ticket-bar ${ticket.severity === "Critical" ? "critical" : ""}`} style={barStyle}>{ticket.status} · {ticket.title} · {ticket.severity} · {ticket.assignee || "담당자 미지정"}</i> : <em>{start && due ? "표시 기간 밖" : "일정 미설정"}</em>}{todayPosition >= 0 && todayPosition <= 100 && <b className="today-marker" aria-label="오늘" style={{ left: `${todayPosition}%` }} />}</span><span className="roadmap-ticket-open">상세</span></button>;
}

function TimelineView({ tickets, projects, project, user, onProjectChange, onOpen, onHome, onAdmin, onProjects, onLogout, onCreate, onViewChange }: { tickets: Ticket[]; projects: Project[]; project: string; user: SessionUser; onProjectChange: (value: string) => void; onOpen: (id: string) => void; onHome: () => void; onAdmin: () => void; onProjects: () => void; onLogout: () => void; onCreate: () => void; onViewChange: (view: WorkspaceView) => void }) {
  const [weeks, setWeeks] = useState(4);
  const [rangeStart, setRangeStart] = useState(() => startOfWeek(new Date()));
  const [hideCompleted, setHideCompleted] = useState(false);
  const [expandedProjectIds, setExpandedProjectIds] = useState<string[]>([]);
  const rangeEnd = addDays(rangeStart, weeks * 7 - 1);
  const visibleProjects = projects.filter(item => project === "전체" || item.name === project);
  const weekLabels = Array.from({ length: weeks }, (_, index) => {
    const start = addDays(rangeStart, index * 7);
    const end = addDays(start, 6);
    return `${start.getMonth() + 1}.${start.getDate()}–${end.getMonth() + 1}.${end.getDate()}`;
  });
  const projectRows = visibleProjects.map(item => {
    const projectTickets = tickets.filter(ticket => ticket.project_id === item.id || (!ticket.project_id && ticket.game === item.name));
    const listedTickets = hideCompleted ? projectTickets.filter(ticket => !COMPLETED_STATUSES.has(ticket.status)) : projectTickets;
    const activeCritical = projectTickets.some(ticket => ticket.severity === "Critical" && !COMPLETED_STATUSES.has(ticket.status));
    const completed = projectTickets.filter(ticket => COMPLETED_STATUSES.has(ticket.status)).length;
    return { project: item, projectTickets, listedTickets, activeCritical, completed };
  }).sort((left, right) => Number(right.activeCritical) - Number(left.activeCritical) || String(left.project.due_at).localeCompare(String(right.project.due_at)) || left.project.name.localeCompare(right.project.name));
  const todayPosition = daysBetween(rangeStart, new Date()) / (weeks * 7) * 100;
  const rangeLabel = `${rangeStart.getFullYear()}.${rangeStart.getMonth() + 1}.${rangeStart.getDate()} – ${rangeEnd.getFullYear()}.${rangeEnd.getMonth() + 1}.${rangeEnd.getDate()}`;
  return <main><WorkspaceHeader user={user} active="timeline" onHome={onHome} onAdmin={onAdmin} onProjects={onProjects} onLogout={onLogout} onCreate={onCreate} onViewChange={onViewChange}/><section className="roadmap-controls"><ProjectFilter games={projects.map(item => item.name)} value={project} onChange={onProjectChange}/><label>기간<select value={weeks} onChange={event => setWeeks(Number(event.target.value))}><option value={2}>2주</option><option value={4}>4주</option><option value={8}>8주</option></select></label><button className="back" type="button" onClick={() => setRangeStart(value => addDays(value, -weeks * 7))}>이전</button><button className="back" type="button" onClick={() => setRangeStart(startOfWeek(new Date()))}>오늘</button><button className="back" type="button" onClick={() => setRangeStart(value => addDays(value, weeks * 7))}>다음</button><label className="completed-toggle"><input type="checkbox" checked={hideCompleted} onChange={event => setHideCompleted(event.target.checked)}/> 완료/이슈 아님 숨기기</label></section><p className="roadmap-range">{rangeLabel} · 프로젝트를 누르면 하위 티켓의 일정 막대와 상세 정보를 확인할 수 있습니다.</p><section className="roadmap"><div className="roadmap-head"><div>프로젝트</div><div className="roadmap-scale" style={{ gridTemplateColumns: `repeat(${weeks}, 1fr)` }}>{weekLabels.map(label => <span key={label}>{label}</span>)}{todayPosition >= 0 && todayPosition <= 100 && <b className="roadmap-today-label" style={{ left: `${todayPosition}%` }}>오늘</b>}</div></div>{projectRows.length ? projectRows.map(({ project: item, projectTickets, listedTickets, activeCritical, completed }) => { const projectCreatedAt = item.created_at?.slice(0, 10) || item.start_date || item.due_at; const start = toDate(projectCreatedAt); const due = toDate(item.due_at); const overlaps = start && due && start <= rangeEnd && due >= rangeStart; const barStart = start && due ? Math.max(0, daysBetween(rangeStart, start)) : 0; const barEnd = start && due ? Math.min(weeks * 7 - 1, daysBetween(rangeStart, due)) : 0; const barStyle = { left: `${barStart / (weeks * 7) * 100}%`, width: `${Math.max(2, (barEnd - barStart + 1) / (weeks * 7) * 100)}%` }; const projectPeriod = projectCreatedAt && item.due_at ? `생성일 ${projectCreatedAt} → 마감일 ${item.due_at}` : "일정이 설정되지 않았습니다."; const completionRate = projectTickets.length ? Math.round(completed / projectTickets.length * 100) : 0; const startsBeforeRange = Boolean(start && start < rangeStart); const expanded = expandedProjectIds.includes(item.id); return <article className={`roadmap-project ${activeCritical ? "has-critical" : ""}`} key={item.id}><button className="roadmap-project-row" type="button" data-period={projectPeriod} onClick={() => setExpandedProjectIds(current => expanded ? current.filter(id => id !== item.id) : [...current, item.id])}><span className="roadmap-project-info"><b>{item.name}</b><small>{projectCreatedAt || "생성일 미설정"} → {item.due_at || "마감일 미설정"} · 티켓 {projectTickets.length}개 · 완료 {completed}개 ({completionRate}%)</small></span><span className="roadmap-track" style={{ backgroundSize: `calc(100% / ${weeks}) 100%` }}>{overlaps ? <i className={`roadmap-bar ${activeCritical ? "critical" : ""}`} style={barStyle}>{startsBeforeRange ? "◀ " : ""}{activeCritical ? "Critical · " : ""}완료 {completionRate}%</i> : <em>표시 기간 밖</em>}{todayPosition >= 0 && todayPosition <= 100 && <b className="today-marker" aria-label="오늘" style={{ left: `${todayPosition}%` }} />}</span><span className="roadmap-expand">{expanded ? "접기" : "티켓 보기"}</span></button>{expanded && <div className="roadmap-tickets">{listedTickets.length ? [...listedTickets].sort((left, right) => Number(right.severity === "Critical") - Number(left.severity === "Critical") || Number(COMPLETED_STATUSES.has(left.status)) - Number(COMPLETED_STATUSES.has(right.status)) || left.updated_at.localeCompare(right.updated_at)).map(ticket => <RoadmapTicket key={ticket.id} ticket={ticket} project={item} rangeStart={rangeStart} rangeEnd={rangeEnd} weeks={weeks} todayPosition={todayPosition} onOpen={onOpen}/>) : <p>표시할 진행 중 티켓이 없습니다.</p>}</div>}</article>; }) : <p className="empty">선택한 프로젝트가 없습니다. 관리자 페이지에서 프로젝트를 먼저 만들어 주세요.</p>}</section></main>;
}

function ProjectPanel({ projects, onHome, onSaved }: { projects: Project[]; onHome: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: "", ticket_name: "", start_date: todayInput(), due_at: "", owner: "", status: "준비" });
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const setSprintDeadline = (weeks: number) => {
    const start = toDate(form.start_date) || toDate(todayInput());
    if (!start) return;
    const due = addDays(start, weeks * 7);
    const dueAt = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`;
    setForm(current => ({ ...current, due_at: dueAt }));
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setNotice("");
    const response = await fetch("/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
    const data = await response.json();
    setBusy(false);
    if (!response.ok) return setNotice(data.error || "프로젝트 생성에 실패했습니다.");
    setForm({ name: "", ticket_name: "", start_date: todayInput(), due_at: "", owner: "", status: "준비" });
    setNotice("프로젝트를 만들었습니다. 이제 티켓 생성에서 선택할 수 있습니다.");
    onSaved();
  };
  return <main><header><div><button className="home-title" type="button" onClick={onHome}>QA Ticket Desk</button><span>프로젝트 관리 · 게임별 출시 및 QA 일정</span></div></header><section className="project-layout"><form className="editor project-form" onSubmit={save}><h1>프로젝트 만들기</h1><div className="fields"><label>게임명 <i>*</i><input maxLength={100} value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} required/></label><label>티켓명 <i>*</i><input maxLength={10} value={form.ticket_name} onChange={event => setForm(current => ({ ...current, ticket_name: event.target.value.toUpperCase() }))} placeholder="예: NRN" pattern="[A-Z][A-Z0-9]{1,9}" required/><small className="field-help">영문 대문자·숫자 2~10자 · 첫 티켓은 {form.ticket_name || "TICKET"}-0001</small></label><label>담당자<input maxLength={50} value={form.owner} onChange={event => setForm(current => ({ ...current, owner: event.target.value }))}/></label><label>시작일<input type="date" value={form.start_date} onChange={event => setForm(current => ({ ...current, start_date: event.target.value }))}/></label><label>프로젝트 마감일 <i>*</i><input type="date" value={form.due_at} onChange={event => setForm(current => ({ ...current, due_at: event.target.value }))} required/><span className="duration-shortcuts" role="group" aria-label="빠른 마감 설정"><small>시작일 기준</small>{[1, 2, 4, 8].map(weeks => <button type="button" key={weeks} onClick={() => setSprintDeadline(weeks)}>{weeks}주</button>)}</span></label><label>상태<select value={form.status} onChange={event => setForm(current => ({ ...current, status: event.target.value }))}><option>준비</option><option>QA 진행</option><option>수정 중</option><option>출시 대기</option><option>완료</option></select></label></div><div className="actions"><button className="primary" type="submit" disabled={busy}>{busy ? "생성 중…" : "프로젝트 만들기"}</button>{notice && <span>{notice}</span>}</div></form><section className="project-list"><h2>프로젝트 목록</h2>{projects.length ? projects.map(project => <article key={project.id}><div><b>{project.name}</b><span>{project.ticket_name ? `티켓명 ${project.ticket_name} · ` : ""}{project.status} · {project.owner || "담당자 미지정"}</span></div><div><b>마감 {project.due_at || "미설정"}</b><span>연결 티켓 {project.ticket_count || 0}개</span></div></article>) : <p>생성된 프로젝트가 없습니다.</p>}</section></section></main>;
}

function PageControls({ label, page, total, onChange, pageSize = ADMIN_PAGE_SIZE }: { label: string; page: number; total: number; onChange: (page: number) => void; pageSize?: number }) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (pageCount === 1) return null;
  return <nav className="page-controls" aria-label={`${label} 페이지 이동`}><button className="back" type="button" disabled={page === 1} onClick={() => onChange(page - 1)}>이전</button><span>{page} / {pageCount}</span><button className="back" type="button" disabled={page === pageCount} onClick={() => onChange(page + 1)}>다음</button></nav>;
}

function AdminPanel({ user: currentUser, onHome }: { user: SessionUser; onHome: () => void }) {
  const [data, setData] = useState<AdminData | null>(null);
  const [trash, setTrash] = useState<TrashTicket[]>([]);
  const [notice, setNotice] = useState("");
  const [trashPage, setTrashPage] = useState(1);
  const [loginPage, setLoginPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [createdTicketPage, setCreatedTicketPage] = useState(1);
  const [deletedTicketPage, setDeletedTicketPage] = useState(1);
  const load = async () => {
    const [overview, deleted] = await Promise.all([fetch("/api/admin/overview"), fetch("/api/admin/trash")]);
    if (overview.ok) {
      const nextData = await overview.json() as AdminData;
      setData(nextData);
      setLoginPage(page => Math.min(page, Math.max(1, Math.ceil(nextData.logins.length / ADMIN_PAGE_SIZE))));
      setHistoryPage(page => Math.min(page, Math.max(1, Math.ceil(nextData.history.length / ADMIN_PAGE_SIZE))));
      setCreatedTicketPage(page => Math.min(page, Math.max(1, Math.ceil(nextData.createdTickets.length / ADMIN_PAGE_SIZE))));
      setDeletedTicketPage(page => Math.min(page, Math.max(1, Math.ceil(nextData.deletedTickets.length / ADMIN_PAGE_SIZE))));
    }
    if (deleted.ok) {
      const nextTrash = (await deleted.json()).tickets as TrashTicket[];
      setTrash(nextTrash);
      setTrashPage(page => Math.min(page, Math.max(1, Math.ceil(nextTrash.length / ADMIN_PAGE_SIZE))));
    }
  };
  useEffect(() => { void Promise.resolve().then(load); }, []);
  const approve = async (id: string, status: "approved" | "rejected") => { const response = await fetch(`/api/admin/users/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) }); setNotice(response.ok ? "회원 상태를 변경했습니다." : "처리에 실패했습니다."); await load(); };
  const changeRole = async (id: string, role: "admin" | "member" | "viewer") => { const response = await fetch(`/api/admin/users/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ role }) }); const result = await response.json(); setNotice(response.ok ? "회원 등급을 변경했습니다." : result.error || "등급 변경에 실패했습니다."); await load(); };
  const changeTrash = async (ticket: TrashTicket, action: "restore" | "permanent") => { const message = action === "restore" ? `“${ticket.title}” 티켓을 복구할까요?` : `“${ticket.title}” 티켓과 첨부파일을 완전히 삭제할까요? 이 작업은 되돌릴 수 없습니다.`; if (!confirm(message)) return; const response = await fetch(`/api/tickets/${ticket.id}${action === "restore" ? "?action=restore" : "?permanent=1"}`, { method: action === "restore" ? "PATCH" : "DELETE" }); setNotice(response.ok ? (action === "restore" ? "티켓을 복구했습니다." : "티켓을 완전히 삭제했습니다.") : "처리에 실패했습니다."); await load(); };
  const pageItems = <T,>(items: T[], page: number) => items.slice((page - 1) * ADMIN_PAGE_SIZE, page * ADMIN_PAGE_SIZE);
  const pagedTrash = pageItems(trash, trashPage);
  const pagedLogins = pageItems(data?.logins || [], loginPage);
  const pagedHistory = pageItems(data?.history || [], historyPage);
  const pagedCreatedTickets = pageItems(data?.createdTickets || [], createdTicketPage);
  const pagedDeletedTickets = pageItems(data?.deletedTickets || [], deletedTicketPage);
  return <main><header><div><button className="home-title" type="button" onClick={onHome}>QA Ticket Desk</button><span>관리자 페이지 · 가입 신청, 권한 관리, 로그인 기록, 전체 변경 이력, 휴지통</span></div></header>{notice && <p className="admin-notice">{notice}</p>}<section className="admin-section"><h2>가입 신청 및 회원 등급</h2><p>관리자는 최소 1명 유지됩니다. 다른 관리자의 등급은 변경할 수 없고, 본인 등급만 관리자가 2명 이상일 때 변경할 수 있습니다.</p>{data?.users.map(user => <article className="admin-row" key={user.id}><div><b>{user.name}</b><span>{user.email} · {roleName(user.role)} · {user.status === "approved" ? "승인됨" : user.status === "pending" ? "승인 대기" : "거절됨"}</span></div><div>{user.status === "pending" && <><button className="primary" onClick={() => approve(user.id, "approved")}>승인</button><button className="danger" onClick={() => approve(user.id, "rejected")}>거절</button></>}{user.status === "approved" && (user.role !== "admin" || user.id === currentUser.id) && <select aria-label={`${user.name} 권한`} value={user.role} onChange={event => { void changeRole(user.id, event.target.value as "admin" | "member" | "viewer"); }}><option value="admin">관리자</option><option value="member">구성원</option><option value="viewer">일반</option></select>}</div></article>) || <p>불러오는 중…</p>}</section><section className="admin-section"><h2>휴지통</h2>{trash.length ? <>{pagedTrash.map(ticket => <article className="admin-row" key={ticket.id}><div><b>{ticket.title}</b><span>{ticket.deleted_by_name || "-"} · {formatDate(ticket.deleted_at)}</span></div><div><button className="back" onClick={() => { void changeTrash(ticket, "restore"); }}>복구</button><button className="danger" onClick={() => { void changeTrash(ticket, "permanent"); }}>완전 삭제</button></div></article>)}<PageControls label="휴지통" page={trashPage} total={trash.length} onChange={setTrashPage}/></> : <p>휴지통이 비어 있습니다.</p>}</section><section className="admin-section"><h2>최근 로그인 기록</h2>{pagedLogins.map((log, index) => <article className="admin-row" key={`${log.created_at}-${index}`}><b>{log.name || log.email}</b><span>{log.success ? "성공" : "실패"} · {formatDate(log.created_at)}</span></article>)}<PageControls label="로그인 기록" page={loginPage} total={data?.logins.length || 0} onChange={setLoginPage}/></section><section className="admin-section"><h2>티켓 생성 기록</h2>{pagedCreatedTickets.length ? pagedCreatedTickets.map((item, index) => <article className="admin-row" key={`${item.created_at}-${index}`}><b>{item.title || "삭제된 티켓"}</b><span>{item.actor_name} · {formatDate(item.created_at)}</span></article>) : <p>티켓 생성 기록이 없습니다.</p>}<PageControls label="티켓 생성 기록" page={createdTicketPage} total={data?.createdTickets.length || 0} onChange={setCreatedTicketPage}/></section><section className="admin-section"><h2>티켓 삭제 기록</h2>{pagedDeletedTickets.length ? pagedDeletedTickets.map((item, index) => <article className="admin-row" key={`${item.created_at}-${index}`}><b>{item.title || "완전 삭제된 티켓"}</b><span>{item.action} · {item.actor_name} · {formatDate(item.created_at)}</span></article>) : <p>티켓 삭제 기록이 없습니다.</p>}<PageControls label="티켓 삭제 기록" page={deletedTicketPage} total={data?.deletedTickets.length || 0} onChange={setDeletedTicketPage}/></section><section className="admin-section"><h2>전체 변경 이력</h2>{pagedHistory.map((item, index) => <article className="admin-row" key={`${item.created_at}-${index}`}><b>{item.actor_name}</b><span>{item.action} · {item.title || "회원 관리"} · {formatDate(item.created_at)}</span></article>)}<PageControls label="전체 변경 이력" page={historyPage} total={data?.history.length || 0} onChange={setHistoryPage}/></section></main>;
}

export default function TicketDesk() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const [sessionNotice, setSessionNotice] = useState("");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [boardTickets, setBoardTickets] = useState<Ticket[]>([]);
  const [summary, setSummary] = useState<DashboardSummary>({ total: 0, status_new: 0, status_in_progress: 0, status_done: 0, status_not_issue: 0, severity_critical: 0, severity_high: 0, severity_medium: 0, severity_low: 0, mine: 0, open: 0, due_soon: 0 });
  const [projects, setProjects] = useState<Project[]>([]);
  const [view, setView] = useState<"dashboard" | "board" | "list" | "timeline" | "projects" | "planning" | "create" | "detail" | "admin" | "mypage">("dashboard");
  const [routeReady, setRouteReady] = useState(false);
  const restoringHistory = useRef(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [game, setGame] = useState("전체");
  const [listProjectIds, setListProjectIds] = useState<string[]>([]), [listStatuses, setListStatuses] = useState<string[]>([]), [listSeverities, setListSeverities] = useState<string[]>([]), [listAssigneeIds, setListAssigneeIds] = useState<string[]>([]), [listCreatorIds, setListCreatorIds] = useState<string[]>([]), [listDue, setListDue] = useState(""), [listKeyword, setListKeyword] = useState(""), [listSort, setListSort] = useState("updated"), [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [listTotal, setListTotal] = useState(0);
  const [listFilterOptions, setListFilterOptions] = useState<TicketFilterOptions>({ projects: [], assignees: [], creators: [] });
  const [listPage, setListPage] = useState(1);
  const boardRequest = useRef(0);
  const deferredListKeyword = useDeferredValue(listKeyword);
  const load = useCallback(async (limit = 20, includeSummary = true) => { const params = new URLSearchParams({ limit: String(limit) }); if (includeSummary) params.set("include", "summary"); const response = await fetch(`/api/tickets?${params.toString()}`, { cache: "no-store" }); if (response.ok) { const data = await response.json() as { tickets: Ticket[]; summary?: DashboardSummary }; setTickets(data.tickets.map(normalizeTicket)); if (data.summary) setSummary(data.summary); } }, []);
  const loadBoard = useCallback(async () => {
    const requestId = ++boardRequest.current;
    const allTickets: Ticket[] = [];
    let page = 1;
    let hasNext = true;
    while (hasNext) {
      const response = await fetch(`/api/tickets?limit=200&page=${page}&include=pagination`, { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json() as { tickets: Ticket[]; pagination: { hasNext: boolean } };
      allTickets.push(...data.tickets.map(normalizeTicket));
      hasNext = data.pagination.hasNext;
      page += 1;
    }
    if (boardRequest.current === requestId) setBoardTickets(allTickets);
  }, []);
  const loadList = useCallback(async () => { const params = new URLSearchParams({ limit: "50", page: String(listPage), sort: listSort, include: listFilterOptions.projects.length ? "summary,pagination" : "summary,filters,pagination" }); if (listProjectIds.length) params.set("project_id", listProjectIds.join(",")); if (listStatuses.length) params.set("status", listStatuses.join(",")); if (listSeverities.length) params.set("severity", listSeverities.join(",")); if (listAssigneeIds.length) params.set("assignee_id", listAssigneeIds.join(",")); if (listCreatorIds.length) params.set("creator_id", listCreatorIds.join(",")); if (listDue) params.set("due", listDue); if (deferredListKeyword.trim()) params.set("q", deferredListKeyword.trim()); const response = await fetch(`/api/tickets?${params.toString()}`, { cache: "no-store" }); if (!response.ok) return; const data = await response.json() as { tickets: Ticket[]; pagination: { total: number }; summary?: DashboardSummary; filterOptions?: TicketFilterOptions }; setTickets(data.tickets.map(normalizeTicket)); setListTotal(data.pagination.total); if (data.summary) setSummary(data.summary); if (data.filterOptions) setListFilterOptions(data.filterOptions); }, [deferredListKeyword, listAssigneeIds, listCreatorIds, listDue, listFilterOptions.projects.length, listPage, listProjectIds, listSeverities, listSort, listStatuses]);
  const loadProjects = async () => { const response = await fetch("/api/projects", { cache: "no-store" }); if (response.ok) setProjects((await response.json()).projects); };
  useEffect(() => {
    let active = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error("session check failed");
        return response.json() as Promise<{ user: SessionUser | null }>;
      })
      .then(data => { if (active) setUser(data.user); })
      .catch(() => { if (active) setSessionNotice("로그인 상태를 확인하지 못했습니다. 다시 로그인해 주세요."); })
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => { if (!user) return; void Promise.resolve().then(() => Promise.all([load(), loadProjects()])); }, [user, load]);
  useEffect(() => { if (!user || view !== "list") return; void Promise.resolve().then(loadList); }, [user, view, loadList]);
  useEffect(() => { if (!user || view !== "board") return; void loadBoard(); }, [user, view, loadBoard]);
  useEffect(() => {
    if (!ready || !user || !routeReady) return;
    if (restoringHistory.current) { restoringHistory.current = false; return; }
    const route = view === "detail" && detail ? `#ticket/${detail.ticket.id}` : `#${view}`;
    if (window.location.hash !== route) window.history.pushState(null, "", route);
  }, [detail, ready, routeReady, user, view]);
  useEffect(() => {
    if (!ready || !user) return;
    const restorePage = async () => {
      restoringHistory.current = true;
      const ticketId = window.location.hash.match(/^#ticket\/([^/]+)(?:\/edit)?$/)?.[1];
      if (ticketId) {
        const response = await fetch(`/api/tickets/${ticketId}`, { cache: "no-store" });
        if (response.ok) { const data = await response.json() as Detail; setDetail({ ...data, ticket: normalizeTicket(data.ticket) }); setView("detail"); setRouteReady(true); return; }
      }
      const route = window.location.hash.replace("#", "");
      setView(route === "tickets" || route === "list" ? "list" : route === "board" ? "board" : route === "timeline" ? "timeline" : route === "projects" ? "projects" : route === "planning" ? "planning" : route === "create" ? "create" : route === "admin" ? "admin" : route === "mypage" ? "mypage" : "dashboard");
      setRouteReady(true);
    };
    void restorePage();
    window.addEventListener("popstate", restorePage);
    return () => window.removeEventListener("popstate", restorePage);
  }, [ready, user]);
  const open = async (id: string) => { const response = await fetch(`/api/tickets/${id}`, { cache: "no-store" }); if (!response.ok) return; const data = await response.json() as Detail; setDetail({ ...data, ticket: normalizeTicket(data.ticket) }); setView("detail"); };
  const remove = async () => { if (!selected.length || !confirm(`${selected.length}개 티켓을 휴지통으로 이동할까요?`)) return; await Promise.all(selected.map(id => fetch(`/api/tickets/${id}`, { method: "DELETE" }))); setSelected([]); void Promise.all([load(), loadProjects()]); };
  const boardGames = useMemo(() => [...new Set(boardTickets.map(ticket => ticket.game).filter(Boolean))].sort(), [boardTickets]);
  const filtered = tickets;
  const selectable = filtered.filter(ticket => user.role !== "viewer" && (user.role === "admin" || ticket.created_by_id === user.id));
  if (!ready) return <main className="login-page"><p>로그인 정보를 확인하는 중…</p></main>;
  if (!user) return <LoginScreen onLogin={setUser} initialNotice={sessionNotice}/>;
  const showWorkspace = (workspaceView: WorkspaceView) => { setView(workspaceView); if (workspaceView === "timeline") void load(200, false); else if (workspaceView === "dashboard") void load(); };
  const logout = async () => { await fetch("/api/auth/logout", { method: "POST" }); setUser(null); };
  const createTicket = () => { setDetail(null); setView("create"); };
  const home = () => { setDetail(null); setView("dashboard"); void load(); };
  const admin = () => setView("admin");
  const openProjects = () => { setDetail(null); setView("projects"); void loadProjects(); };
  if (view === "admin") return <AdminPanel user={user} onHome={home}/>;
  if (view === "mypage") return <MyPage user={user} onHome={home} onAdmin={admin} onProjects={openProjects} onLogout={logout}/>;
  const planning = () => { setView("planning"); };
  const resetListFilters = () => { setListPage(1); setListProjectIds([]); setListStatuses([]); setListSeverities([]); setListAssigneeIds([]); setListCreatorIds([]); setListDue(""); setListKeyword(""); setListSort("updated"); setShowAdvancedFilters(false); };
  const hasListFilters = Boolean(listProjectIds.length || listStatuses.length || listSeverities.length || listAssigneeIds.length || listCreatorIds.length || listDue || listKeyword.trim() || listSort !== "updated");
  if (view === "dashboard") return <Dashboard tickets={tickets} projects={projects} summary={summary} user={user} onCreate={createTicket} onList={() => setView("list")} onMine={() => { setListPage(1); setListAssigneeIds([user.id]); setView("list"); }} onOpen={open} onPlanning={planning} onAdmin={admin} onLogout={logout} onHome={home} onViewChange={showWorkspace}/>;
  if (view === "planning") return <ProjectPlanning user={user} projects={projects} onHome={home} onMyPage={() => setView("mypage")} onAdmin={admin} onLogout={logout}/>;
  if (view === "projects") return user.role === "admin" ? <ProjectPanel projects={projects} onHome={home} onSaved={() => { void Promise.all([load(), loadProjects()]); }}/> : <main><p className="empty">프로젝트 관리는 관리자만 할 수 있습니다.</p></main>;
  if (view === "board") return <BoardView tickets={boardTickets} games={boardGames} project={game} user={user} onOpen={open} onHome={home} onAdmin={admin} onProjects={openProjects} onLogout={logout} onCreate={createTicket} onViewChange={showWorkspace}/>;
  if (view === "timeline") return <TimelineView tickets={tickets} projects={projects} project={game} user={user} onProjectChange={setGame} onOpen={open} onHome={home} onAdmin={admin} onProjects={openProjects} onLogout={logout} onCreate={createTicket} onViewChange={showWorkspace}/>;
  const refreshDetail = async () => { if (detail) await open(detail.ticket.id); await load(); };
  if (view === "create" || view === "detail") return <TicketEditor key={view === "detail" ? detail?.ticket.id : "create"} user={user} detail={view === "detail" ? detail : null} projects={projects} onHome={() => { setDetail(null); setView("dashboard"); void load(); }} onSaved={ticketId => { if (ticketId) { void open(ticketId); return; } setDetail(null); setView("list"); void Promise.all([load(), loadProjects()]); }} onRefresh={() => { void refreshDetail(); }}/ >;
  return <main>
    <WorkspaceHeader user={user} active="list" onHome={home} onPlanning={planning} onAdmin={admin} onProjects={openProjects} onLogout={logout} onCreate={createTicket} onViewChange={showWorkspace} showCreate={false}/>
    <section className={`list-filters${showAdvancedFilters ? " is-expanded" : ""}`} aria-label="티켓 필터">
      <div className="list-filter-main">
        <MultiFilter label="프로젝트" values={listProjectIds} onChange={values => { setListPage(1); setListProjectIds(values); }} options={listFilterOptions.projects.map(project => ({ id: project.id, label: project.name }))}/>
        <MultiFilter label="진행상황" values={listStatuses} onChange={values => { setListPage(1); setListStatuses(values); }} options={statuses.map(value => ({ id: value, label: value }))}/>
        <MultiFilter label="담당자" values={listAssigneeIds} onChange={values => { setListPage(1); setListAssigneeIds(values); }} options={listFilterOptions.assignees.map(person => ({ id: person.id, label: person.name }))}/>
        <MultiFilter label="작성자" values={listCreatorIds} onChange={values => { setListPage(1); setListCreatorIds(values); }} options={listFilterOptions.creators.map(person => ({ id: person.id, label: person.name }))}/>
        <label>마감일<select value={listDue} onChange={event => { setListPage(1); setListDue(event.target.value); }}><option value="">전체</option><option value="overdue">지남</option><option value="today">오늘</option><option value="three_days">3일 이내</option><option value="week">이번 주</option><option value="none">미설정</option></select></label>
        <label>정렬<select value={listSort} onChange={event => { setListPage(1); setListSort(event.target.value); }}><option value="updated">최근 수정순</option><option value="created">최근 생성순</option><option value="due">마감일 임박순</option><option value="severity">심각도 높은 순</option><option value="oldest">오래된 티켓순</option></select></label>
        <label className="list-search">검색<input value={listKeyword} onChange={event => { setListPage(1); setListKeyword(event.target.value); }} placeholder="제목·내용·티켓 번호"/></label>
      </div>
      <div className="list-filter-footer"><button className="back" type="button" onClick={() => setShowAdvancedFilters(value => !value)}>{showAdvancedFilters ? "상세 필터 닫기" : "상세 필터"}</button><button className="back" type="button" onClick={resetListFilters}>필터 초기화</button>{user.role !== "viewer" && !hasListFilters && <span className="list-delete-hint">선택한 티켓은 작성자 또는 관리자만 삭제할 수 있습니다.</span>}<div className="list-ticket-actions"><button className="primary" type="button" onClick={createTicket}>+ 티켓 생성하기</button>{user.role !== "viewer" && <button className="danger" type="button" disabled={!selected.length} onClick={remove}>삭제{selected.length ? ` (${selected.length})` : ""}</button>}</div><em>{listTotal}개 티켓</em></div>
      {showAdvancedFilters && <div className="list-filter-advanced"><MultiFilter label="위험도·심각도" values={listSeverities} onChange={setListSeverities} options={severities.map(value => ({ id: value, label: value }))}/><button className="back" type="button" onClick={() => setListAssigneeIds([user.id])}>내게 할당된 티켓만</button><button className="back" type="button" onClick={() => setListAssigneeIds([])}>담당자 필터 해제</button></div>}
      {(listProjectIds.length || listStatuses.length || listAssigneeIds.length || listCreatorIds.length || listSeverities.length || listDue || listKeyword.trim()) && <div className="applied-filters" aria-label="적용 중인 필터"><b>적용 중인 필터</b>{listProjectIds.map(id => <button type="button" key={`project-${id}`} onClick={() => setListProjectIds(values => values.filter(value => value !== id))}>프로젝트: {listFilterOptions.projects.find(project => project.id === id)?.name || id} ×</button>)}{listStatuses.map(status => <button type="button" key={`status-${status}`} onClick={() => setListStatuses(values => values.filter(value => value !== status))}>진행상황: {status} ×</button>)}{listAssigneeIds.map(id => <button type="button" key={`assignee-${id}`} onClick={() => setListAssigneeIds(values => values.filter(value => value !== id))}>담당자: {listFilterOptions.assignees.find(person => person.id === id)?.name || id} ×</button>)}{listCreatorIds.map(id => <button type="button" key={`creator-${id}`} onClick={() => setListCreatorIds(values => values.filter(value => value !== id))}>작성자: {listFilterOptions.creators.find(person => person.id === id)?.name || id} ×</button>)}{listSeverities.map(severity => <button type="button" key={`severity-${severity}`} onClick={() => setListSeverities(values => values.filter(value => value !== severity))}>심각도: {severity} ×</button>)}{listDue && <button type="button" onClick={() => setListDue("")}>마감일: {{ overdue: "지남", today: "오늘", three_days: "3일 이내", week: "이번 주", none: "미설정" }[listDue]} ×</button>}{listKeyword.trim() && <button type="button" onClick={() => setListKeyword("")}>검색: {listKeyword.trim()} ×</button>}</div>}
    </section>
    <section className="table"><div className="tr head"><input aria-label="모두 선택" type="checkbox" disabled={!selectable.length} checked={Boolean(selectable.length) && selected.length === selectable.length} onChange={event => setSelected(event.target.checked ? selectable.map(ticket => ticket.id) : [])}/><b>No</b><b>제목</b><b>진행상황</b><b>프로젝트</b><b>작성 날짜 · 시간</b></div>{filtered.length ? filtered.map((ticket, index) => <div className="tr" key={ticket.id}><input type="checkbox" disabled={!selectable.some(item => item.id === ticket.id)} checked={selected.includes(ticket.id)} onChange={event => setSelected(event.target.checked ? [...selected, ticket.id] : selected.filter(id => id !== ticket.id))}/><span>{ticket.ticket_name && ticket.ticket_number ? `${ticket.ticket_name}-${String(ticket.ticket_number).padStart(4, "0")}` : (listPage - 1) * 50 + index + 1}</span><button className="title" onClick={() => open(ticket.id)}>{ticket.title}</button><span className={`pill ${ticket.status}`}>{ticket.status}</span><span>{ticket.game || "-"}</span><span>{formatDate(ticket.created_at)}</span></div>) : <p className="empty">조회할 목록이 없습니다.</p>}</section><PageControls label="티켓 목록" page={listPage} total={listTotal} pageSize={50} onChange={setListPage}/>
  </main>;
}
