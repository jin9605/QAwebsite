"use client";

import { FormEvent, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Extension } from "@tiptap/core";
import Color from "@tiptap/extension-color";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { TextStyle } from "@tiptap/extension-text-style";
import { LoginScreen, SessionUser } from "./login-screen";
import { ProjectPlanning } from "./project-planning";

type Ticket = { id: string; title: string; status: string; severity: string; game: string; project_id?: string | null; ticket_name?: string | null; ticket_number?: number | null; assignee_id?: string | null; assignee: string; due_at?: string | null; created_at: string; updated_at: string; created_by_id?: string; created_by_name?: string | null; issue_reason?: string | null };
type Project = { id: string; name: string; ticket_name?: string | null; start_date?: string | null; due_at: string; owner?: string | null; status: string; created_at?: string; ticket_count?: number };
type ProjectMember = { id: string; name: string; email: string; role: string };
type Attachment = { id: string; name: string; content_type: string; size: number; description: string };
type Comment = { id: string; author: string; created_by_id?: string | null; body: string; created_at: string };
type History = { actor_name: string; action: string; before_json?: string | null; after_json?: string | null; created_at: string };
type Detail = { ticket: Ticket & { environment: string; frequency: string; reproduction: string; content: string; created_by_name?: string; updated_by_name?: string }; attachments: Attachment[]; comments: Comment[]; history: History[]; can_edit_details: boolean };
type AdminHistoryItem = { actor_name: string; action: string; title: string | null; created_at: string };
type AdminData = { users: Array<{ id: string; name: string; email: string; role: string; status: string; created_at: string; last_login_at: string | null }>; logins: Array<{ name: string | null; email: string; success: number; created_at: string }>; history: AdminHistoryItem[]; createdTickets: AdminHistoryItem[]; deletedTickets: AdminHistoryItem[] };
type TrashTicket = { id: string; title: string; deleted_at: string; deleted_by_name: string | null };
type DashboardSummary = { total: number; status_new: number; status_in_progress: number; status_done: number; status_not_issue: number; severity_critical: number; severity_high: number; severity_medium: number; severity_low: number; mine: number; open: number; due_soon: number };
type TicketFilterOptions = { projects: Array<{ id: string; name: string }>; assignees: Array<{ id: string; name: string }>; creators: Array<{ id: string; name: string }> };
type TicketTemplate = { id: string; name: string; content: string; is_default: number; created_at: string; updated_at: string };

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
  const inline = (text: string, key: string) => text.split(/(\{color:#[0-9a-fA-F]{6}\}[^{}]+\{\/color\}|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\((?:https?:\/\/|mailto:)[^)]+\))/g).filter(Boolean).map((part, index) => {
    const partKey = `${key}-${index}`;
    const color = part.match(/^\{color:(#[0-9a-fA-F]{6})\}([^{}]+)\{\/color\}$/);
    if (color) return <span key={partKey} style={{ color: color[1] }}>{color[2]}</span>;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={partKey}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*")) return <em key={partKey}>{part.slice(1, -1)}</em>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={partKey}>{part.slice(1, -1)}</code>;
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    return link ? <a key={partKey} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a> : part;
  });
  const lines = value.split("\n");
  const blocks: JSX.Element[] = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    const key = `line-${index}`;
    if (!line) { index += 1; continue; }
    if (/^-\s*(?:.*)$/.test(line) || /^\d+\.\s*(?:.*)$/.test(line)) {
      const ordered = /^\d+\.\s*(?:.*)$/.test(line);
      const items: JSX.Element[] = [];
      while (index < lines.length) {
        const item = ordered ? lines[index].match(/^\d+\.\s*(.*)$/) : lines[index].match(/^-\s*(.*)$/);
        if (!item) break;
        items.push(<li key={`item-${index}`}>{inline(item[1], `item-${index}`)}</li>); index += 1;
      }
      blocks.push(ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>); continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) { const Tag = (`h${heading[1].length}`) as "h1" | "h2" | "h3"; blocks.push(<Tag key={key}>{inline(heading[2], key)}</Tag>); index += 1; continue; }
    if (line.startsWith("> ")) { blocks.push(<blockquote key={key}>{inline(line.slice(2), key)}</blockquote>); index += 1; continue; }
    blocks.push(<p key={key}>{inline(line, key)}</p>); index += 1;
  }
  return <div className="ticket-content markdown-content">{blocks}</div>;
}

const markdownInlineToHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/\{color:(#[0-9a-f]{6})\}([^{}]+)\{\/color\}/gi, '<span style="color:$1">$2</span>')
  .replace(/`([^`]+)`/g, "<code>$1</code>")
  .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  .replace(/\*([^*]+)\*/g, "<em>$1</em>")
  .replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');

const normalizeLinkUrl = (value: string) => {
  const url = value.trim();
  if (!url) return "";
  if (/^mailto:/i.test(url) || /^https?:\/\//i.test(url)) return url;
  if (/^[^\s/]+\.[^\s]+(?:\/[^\s]*)?$/i.test(url) || /^(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/[^\s]*)?$/i.test(url)) return `https://${url}`;
  return "";
};

const markdownToEditorHtml = (value: string) => {
  const lines = value.replace(/\r/g, "").split("\n");
  const blocks: string[] = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }
    const unordered = line.match(/^-\s*(.*)$/);
    const ordered = line.match(/^\d+\.\s*(.*)$/);
    if (unordered || ordered) {
      const tag = unordered ? "ul" : "ol";
      const items: string[] = [];
      while (index < lines.length) {
        const item = tag === "ul" ? lines[index].match(/^-\s*(.*)$/) : lines[index].match(/^\d+\.\s*(.*)$/);
        if (!item) break;
        items.push(`<li>${markdownInlineToHtml(item[1])}</li>`); index += 1;
      }
      blocks.push(`<${tag}>${items.join("")}</${tag}>`); continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) { const level = heading[1].length; blocks.push(`<h${level}>${markdownInlineToHtml(heading[2])}</h${level}>`); index += 1; continue; }
    if (line.startsWith("> ")) { blocks.push(`<blockquote>${markdownInlineToHtml(line.slice(2))}</blockquote>`); index += 1; continue; }
    blocks.push(`<p>${markdownInlineToHtml(line)}</p>`); index += 1;
  }
  return blocks.join("");
};

const editorHtmlToMarkdown = (html: string) => {
  const documentRoot = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html").body.firstElementChild;
  if (!documentRoot) return "";
  const content = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const element = node as HTMLElement;
    const children = () => Array.from(element.childNodes).map(content).join("");
    switch (element.tagName) {
      case "BR": return "\n";
      case "STRONG": case "B": return `**${children()}**`;
      case "EM": case "I": return `*${children()}*`;
      case "CODE": return `\`${children()}\``;
      case "FONT": { const color = element.getAttribute("color") || ""; return /^#[0-9a-f]{6}$/i.test(color) ? `{color:${color}}${children()}{/color}` : children(); }
      case "SPAN": { const color = element.style.color; const rgb = color.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/); const hex = rgb ? `#${rgb.slice(1).map(value => Number(value).toString(16).padStart(2, "0")).join("")}` : color; return /^#[0-9a-f]{6}$/i.test(hex) ? `{color:${hex}}${children()}{/color}` : children(); }
      case "A": { const href = element.getAttribute("href") || ""; return /^(https?:\/\/|mailto:)/.test(href) ? `[${children()}](${href})` : children(); }
      case "H1": return `# ${children().trim()}\n\n`;
      case "H2": return `## ${children().trim()}\n\n`;
      case "H3": return `### ${children().trim()}\n\n`;
      case "BLOCKQUOTE": return `> ${children().trim().replace(/\n/g, "\n> ")}\n\n`;
      case "UL": return `${Array.from(element.children).filter(item => item.tagName === "LI").map(item => `- ${content(item).trim()}`).join("\n")}\n\n`;
      case "OL": return `${Array.from(element.children).filter(item => item.tagName === "LI").map((item, index) => `${index + 1}. ${content(item).replace(/\u200B/g, "").trim()}`).join("\n")}\n\n`;
      case "LI": return children();
      case "DIV": case "P": return `${children().trim()}\n\n`;
      default: return children();
    }
  };
  return Array.from(documentRoot.childNodes).map(content).join("").replace(/\n{3,}/g, "\n\n").trim();
};

function RichTextEditor({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const lastValue = useRef<string | null>(null);
  const linkSelection = useRef<{ from: number; to: number } | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [textColor, setTextColor] = useState("#17243c");
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkText, setLinkText] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const palette = ["#17243c", "#52617b", "#1769e8", "#0f9d9a", "#16835a", "#b06b00", "#d94343", "#8e52c7"];
  const continueEmptyOrderedList = useMemo(() => Extension.create({
    name: "continueEmptyOrderedList",
    priority: 1000,
    addKeyboardShortcuts() {
      return { Enter: () => {
        const { state } = this.editor;
        if (!this.editor.isActive("orderedList") || !this.editor.isActive("listItem") || !state.selection.empty || state.selection.$from.parent.textContent.replace(/\u200B/g, "").trim()) return false;
        return this.editor.chain().insertContent("\u200B").splitListItem("listItem").run();
      } };
    },
  }), []);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [continueEmptyOrderedList, StarterKit.configure({ heading: { levels: [1, 2, 3] } }), TextStyle, Color, Link.configure({ openOnClick: false, autolink: true, defaultProtocol: "https" }), Placeholder.configure({ placeholder: "티켓의 재현 방법, 기대 결과, 실제 결과를 자유롭게 작성하세요." })],
    content: markdownToEditorHtml(value),
    editorProps: { attributes: { class: "visual-editor-surface", "aria-label": "내용 입력", "data-placeholder": "티켓의 재현 방법, 기대 결과, 실제 결과를 자유롭게 작성하세요." } },
    onUpdate: ({ editor: currentEditor }) => {
      const next = editorHtmlToMarkdown(currentEditor.getHTML()).slice(0, 10000);
      lastValue.current = next;
      onChange(next);
    },
    onSelectionUpdate: ({ editor: currentEditor }) => {
      const { from, to } = currentEditor.state.selection;
      linkSelection.current = from === to ? null : { from, to };
    },
  });
  useEffect(() => {
    if (!editor || value === lastValue.current) return;
    editor.commands.setContent(markdownToEditorHtml(value), { emitUpdate: false });
    lastValue.current = value;
  }, [editor, value]);
  useEffect(() => {
    if (!editor) return;
    const captureBrowserSelection = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
      try {
        const range = selection.getRangeAt(0);
        const from = editor.view.posAtDOM(range.startContainer, range.startOffset);
        const to = editor.view.posAtDOM(range.endContainer, range.endOffset);
        if (from !== to) linkSelection.current = { from: Math.min(from, to), to: Math.max(from, to) };
      } catch { /* Selection is outside the editor. */ }
    };
    document.addEventListener("selectionchange", captureBrowserSelection);
    return () => document.removeEventListener("selectionchange", captureBrowserSelection);
  }, [editor]);
  const openLink = () => {
    if (!editor) return;
    const range = linkSelection.current || editor.state.selection;
    setLinkText(range.from === range.to ? "" : editor.state.doc.textBetween(range.from, range.to, " "));
    setLinkUrl("");
    setLinkOpen(true);
  };
  const applyLink = () => {
    const href = normalizeLinkUrl(linkUrl);
    if (!editor || !href) return;
    const range = linkSelection.current;
    if (range && range.from !== range.to) editor.chain().focus().setTextSelection(range).extendMarkRange("link").setLink({ href }).run();
    else if (linkText.trim()) editor.chain().focus().insertContent({ type: "text", text: linkText.trim(), marks: [{ type: "link", attrs: { href } }] }).run();
    linkSelection.current = null;
    setLinkOpen(false);
  };
  const applyColor = (color: string) => { setTextColor(color); editor?.chain().focus().setColor(color).run(); setPaletteOpen(false); };
  const tool = (label: string, action: () => void, active = false, className = "") => <button className={`${className}${active ? " is-active" : ""}`} type="button" onMouseDown={event => event.preventDefault()} onClick={action} disabled={disabled || !editor} aria-label={label} title={label}>{label === "굵게" ? <b>B</b> : label === "기울임" ? <i>I</i> : label}</button>;
  const captureLinkSelection = (event: React.MouseEvent<HTMLButtonElement>) => { event.preventDefault(); if (editor) linkSelection.current = { from: editor.state.selection.from, to: editor.state.selection.to }; };
  const validLink = Boolean(normalizeLinkUrl(linkUrl));
  return <div className="rich-editor"><div className="visual-editor-toolbar" role="toolbar" aria-label="내용 서식"><select className="visual-heading-select" aria-label="글자 크기 및 문단 형식" disabled={disabled || !editor} value={editor?.isActive("heading", { level: 1 }) ? "1" : editor?.isActive("heading", { level: 2 }) ? "2" : editor?.isActive("heading", { level: 3 }) ? "3" : "body"} onChange={event => { const level = Number(event.target.value); if (level === 1 || level === 2 || level === 3) editor?.chain().focus().setHeading({ level }).run(); else editor?.chain().focus().setParagraph().run(); }}><option value="body">본문</option><option value="1">큰 제목</option><option value="2">제목</option><option value="3">소제목</option></select><div className="visual-editor-group">{tool("굵게", () => editor?.chain().focus().toggleBold().run(), editor?.isActive("bold"))}{tool("기울임", () => editor?.chain().focus().toggleItalic().run(), editor?.isActive("italic"))}</div><div className="visual-editor-group">{tool("목록", () => editor?.chain().focus().toggleBulletList().run(), editor?.isActive("bulletList"))}{tool("번호 목록", () => editor?.chain().focus().toggleOrderedList().run(), editor?.isActive("orderedList"))}{tool("인용", () => editor?.chain().focus().toggleBlockquote().run(), editor?.isActive("blockquote"))}</div><div className="visual-editor-group">{tool("코드", () => editor?.chain().focus().toggleCodeBlock().run(), editor?.isActive("codeBlock"))}</div><div className="visual-color-control"><button className="visual-color-button" type="button" onMouseDown={event => event.preventDefault()} onClick={() => setPaletteOpen(open => !open)} disabled={disabled || !editor} aria-label="글자 색상" aria-expanded={paletteOpen} title="글자 색상"><b style={{ borderBottomColor: textColor }}>A</b></button>{paletteOpen && <div className="visual-color-palette" role="dialog" aria-label="글자 색상 선택">{palette.map(color => <button key={color} type="button" className={textColor === color ? "is-selected" : ""} style={{ backgroundColor: color }} onMouseDown={event => event.preventDefault()} onClick={() => applyColor(color)} aria-label={`${color} 색상`} title={color}/>) }<input type="color" value={textColor} aria-label="사용자 지정 글자 색상" onChange={event => applyColor(event.target.value)} /></div>}</div><div className="visual-link-control"><button type="button" onMouseDown={captureLinkSelection} onClick={openLink} disabled={disabled || !editor} aria-label="링크 추가" title="텍스트 링크 추가">링크</button>{linkOpen && <div className="visual-link-popover" role="dialog" aria-label="링크 추가"><label>표시할 텍스트<input value={linkText} onChange={event => setLinkText(event.target.value)} placeholder="선택한 텍스트"/></label><label>링크 주소<input value={linkUrl} onChange={event => setLinkUrl(event.target.value)} placeholder="example.com 또는 https://example.com" autoFocus/></label><div><button type="button" onClick={() => setLinkOpen(false)}>취소</button><button className="apply-link" type="button" onClick={applyLink} disabled={!linkText.trim() || !validLink}>적용</button></div></div>}</div></div><EditorContent editor={editor} /></div>;
}

type QuickDetailField = "status" | "project_id" | "assignee_id" | "severity" | "due_at" | "environment" | "frequency" | "reproduction";

function TicketDetailSidebar({ detail, projects, onRefresh }: { detail: Detail; projects: Project[]; onRefresh: () => void }) {
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [editingText, setEditingText] = useState<"environment" | "reproduction" | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!detail.ticket.project_id || !detail.can_edit_details) return;
    const controller = new AbortController();
    fetch(`/api/projects/${detail.ticket.project_id}/members`, { signal: controller.signal })
      .then(response => response.ok ? response.json() as Promise<{ members: ProjectMember[] }> : Promise.reject(new Error("담당자 목록을 불러오지 못했습니다.")))
      .then(data => setMembers(data.members))
      .catch(() => { if (!controller.signal.aborted) setNotice("담당자 목록을 불러오지 못했습니다."); });
    return () => controller.abort();
  }, [detail.ticket.project_id, detail.can_edit_details]);
  const updateField = async (field: QuickDetailField, value: string) => {
    if (busy) return;
    let issueReason: string | undefined;
    if (field === "status" && value === "이슈 아님") {
      const entered = window.prompt("이슈 아님 처리 사유를 입력해 주세요.", detail.ticket.issue_reason || "");
      if (!entered?.trim()) return;
      issueReason = entered.trim();
    }
    setBusy(true); setNotice("");
    try {
      const response = await fetch(`/api/tickets/${detail.ticket.id}?action=details`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ field, value, issue_reason: issueReason }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) { setNotice(result.error || "세부 정보를 저장하지 못했습니다."); return; }
      setEditingText(null);
      onRefresh();
    } catch { setNotice("세부 정보를 저장하지 못했습니다. 다시 시도해 주세요."); }
    finally { setBusy(false); }
  };
  const editable = detail.can_edit_details;
  const ticket = detail.ticket;
  const select = (label: string, field: QuickDetailField, value: string, options: Array<{ value: string; label: string }>) => <div><dt>{label}</dt><dd>{editable ? <select className="ticket-detail-inline-control" aria-label={`${label} 수정`} value={value} disabled={busy} onChange={event => { void updateField(field, event.target.value); }}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : options.find(option => option.value === value)?.label || value || "미지정"}</dd></div>;
  const textField = (label: string, field: "environment" | "reproduction", value: string) => <div><dt>{label}</dt><dd>{!editable ? value || "-" : editingText === field ? <span className="ticket-detail-text-edit"><input aria-label={`${label} 입력`} autoFocus value={draft} disabled={busy} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void updateField(field, draft); } if (event.key === "Escape") setEditingText(null); }}/><button type="button" disabled={busy} onClick={() => { void updateField(field, draft); }}>저장</button><button type="button" disabled={busy} onClick={() => setEditingText(null)}>취소</button></span> : <button className="ticket-detail-edit-trigger" type="button" onClick={() => { setDraft(value || ""); setEditingText(field); }} aria-label={`${label} 수정`}>{value || "-"}</button>}</dd></div>;
  return <aside className="ticket-detail-sidebar" aria-label="티켓 세부 정보"><h2>세부 정보</h2>{notice && <p className="ticket-detail-field-notice" role="alert">{notice}</p>}<dl className="ticket-information">
    {select("진행상황", "status", ticket.status, statuses.map(value => ({ value, label: value })))}
    {select("프로젝트", "project_id", ticket.project_id || "", projects.map(project => ({ value: project.id, label: project.name })))}
    {select("담당자", "assignee_id", ticket.assignee_id || "", [{ value: "", label: "미지정" }, ...members.map(member => ({ value: member.id, label: member.name }))])}
    <div className="ticket-detail-author"><dt>작성자</dt><dd>{ticket.created_by_name || "-"}</dd></div>
    {select("위험도·심각도", "severity", ticket.severity, severities.map(value => ({ value, label: value })))}
    <div><dt>마감일</dt><dd>{editable ? <input className="ticket-detail-inline-control" type="date" aria-label="마감일 수정" value={ticket.due_at || ""} disabled={busy} onChange={event => { void updateField("due_at", event.target.value); }}/> : ticket.due_at || "미설정"}</dd></div>
    {textField("발생 환경", "environment", ticket.environment)}
    {select("발생 빈도", "frequency", ticket.frequency || "항상", frequencies.map(value => ({ value, label: value })))}
    {textField("재현 횟수", "reproduction", ticket.reproduction)}
  </dl>{ticket.status === "이슈 아님" && ticket.issue_reason && <section className="ticket-issue-reason"><h2>이슈 아님 사유</h2><p>{ticket.issue_reason}</p></section>}</aside>;
}

function TicketEditor({ user, detail, projects, onSaved, onRefresh, onHome, onBack, inDialog = false }: { user: SessionUser; detail: Detail | null; projects: Project[]; onSaved: (ticketId?: string) => void; onRefresh: () => void; onHome: () => void; onBack: () => void; inDialog?: boolean }) {
  const [form, setForm] = useState(detail?.ticket || empty);
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [descriptions, setDescriptions] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(!detail);
  const editable = user.role !== "viewer";
  const canEditFull = Boolean(detail && detail.can_edit_details && detail.ticket.created_by_id === user.id);
  useEffect(() => {
    if (detail) return;
    const controller = new AbortController();
    fetch("/api/auth/ticket-templates", { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("템플릿을 불러오지 못했습니다.");
      return response.json() as Promise<{ templates: TicketTemplate[] }>;
    }).then(data => { const defaultTemplate = data.templates.find(template => template.is_default === 1); if (defaultTemplate) setForm(current => current.content.trim() ? current : { ...current, content: defaultTemplate.content }); }).catch(() => { if (!controller.signal.aborted) setNotice("기본 템플릿을 불러오지 못했습니다."); });
    return () => controller.abort();
  }, [detail]);
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
        <label className="ticket-title-field">제목 <i>*</i><input maxLength={100} value={form.title} onChange={event => update("title", event.target.value)} required/></label>
        <div className="wide ticket-content-field"><span className="ticket-content-label">내용 <i>*</i></span><RichTextEditor value={form.content || ""} onChange={value => update("content", value)} disabled={!editable}/></div>
        <section className="evidence evidence-before-save"><div className="evidence-head"><div><h2>증빙 자료</h2><p>최대 10개 · 파일당 300MB · 동영상은 2분 이하</p></div><label className="upload-button">파일 추가<input type="file" multiple accept="image/*,video/*,.log,.txt,.json,.har" onChange={event => { void addFiles(Array.from(event.target.files || [])); }}/></label></div>{files.map((file, index) => <div className="pending-file" key={`${file.name}-${index}`}><span>{file.name} · {fileSize(file.size)}</span><input value={descriptions[index] || ""} onChange={event => setDescriptions(values => values.map((value, itemIndex) => itemIndex === index ? event.target.value : value))} placeholder="파일 설명"/><button type="button" onClick={() => { setFiles(values => values.filter((_, itemIndex) => itemIndex !== index)); setDescriptions(values => values.filter((_, itemIndex) => itemIndex !== index)); }}>제거</button></div>)}</section>
      </fieldset>
      <div className="actions"><button className="primary" type="submit" disabled={busy}>{busy ? "저장 중…" : "티켓 저장"}</button>{notice && <span>{notice}</span>}</div>
    </form>
  </main>;
  if (detail && (!editing || !canEditFull)) return <main className="ticket-detail-page">
    <header><div>{!inDialog && <button className="home-title" type="button" onClick={onHome}>QA Ticket Desk</button>}<span>티켓 상세</span></div>{!inDialog && <button className="back" type="button" onClick={onBack}>← 뒤로가기</button>}{canEditFull && <button className="back" type="button" onClick={event => { event.preventDefault(); setForm(detail.ticket); window.history.pushState(null, "", `#ticket/${detail.ticket.id}/edit`); setEditing(true); }}>수정</button>}{editable && (user.role === "admin" || detail.ticket.created_by_id === user.id) && <button className="danger" type="button" disabled={busy} onClick={() => { void removeTicket(); }}>삭제</button>}</header>
    {notice && <p className="editor-notice">{notice}</p>}
    <article className="ticket-view">
      <div className="ticket-detail-heading"><span className="ticket-detail-eyebrow">티켓 제목</span>{ticketCode(detail.ticket) && <span className="ticket-detail-code">{ticketCode(detail.ticket)}</span>}<h1>{detail.ticket.title}</h1><p>작성자 {detail.ticket.created_by_name || "-"} · 생성 {formatDate(detail.ticket.created_at)}</p></div>
      <div className="ticket-detail-grid">
        <div className="ticket-detail-main">
          <section className="ticket-description ticket-detail-card"><h2>설명</h2><div className="ticket-detail-card-body"><MarkdownContent value={detail.ticket.content}/></div></section>
        </div>
        <TicketDetailSidebar detail={detail} projects={projects} onRefresh={onRefresh}/>
        <div className="ticket-detail-followup">
          {detail.attachments.length ? <StoredEvidence attachments={detail.attachments}/> : null}
          <section className="ticket-detail-activity ticket-detail-card"><h2>활동</h2><div className="ticket-detail-card-body">{user.role !== "viewer" && <Comments detail={detail} user={user} onRefresh={onRefresh}/>}<HistoryPanel history={detail.history}/></div></section>
        </div>
      </div>
    </article>
  </main>;
  return <main><header><div><button className="home-title" type="button" onClick={onHome}>QA Ticket Desk</button><span>{detail?.ticket.created_by_name ? `작성자: ${detail.ticket.created_by_name}` : `작성자: ${user.name}`} · 모든 저장은 이력에 기록됩니다.</span></div>{editable && <button className="primary" form="ticket-form" disabled={busy}>{busy ? "저장 중…" : "저장하기"}</button>}</header>{!detail && <h1 className="editor-title">티켓생성</h1>}<form id="ticket-form" className="editor" onSubmit={save}><fieldset disabled={!editable}><div className="fields"><label>제목 <i>*</i><input maxLength={100} value={form.title} onChange={event => update("title", event.target.value)} required/></label><label>진행상황 <i>*</i><select value={form.status} onChange={event => update("status", event.target.value)}>{statuses.map(value => <option key={value}>{value}</option>)}</select></label><label>위험도·심각도 <i>*</i><select value={form.severity} onChange={event => update("severity", event.target.value)}>{severities.map(value => <option key={value}>{value}</option>)}</select></label><label>담당자<input value={form.assignee || ""} onChange={event => update("assignee", event.target.value)} placeholder="예: 홍길동" maxLength={50}/></label><label>프로젝트<input value={form.game || ""} onChange={event => update("game", event.target.value)} placeholder="예: 메탈슬러그" maxLength={100}/></label><label>마감일<input type="date" value={form.due_at || ""} onChange={event => update("due_at", event.target.value)}/></label><label>발생 환경<input value={form.environment || ""} onChange={event => update("environment", event.target.value)}/></label><label>발생 빈도<select value={form.frequency || "항상"} onChange={event => update("frequency", event.target.value)}>{frequencies.map(value => <option key={value}>{value}</option>)}</select></label><label>재현 횟수<input value={form.reproduction || ""} onChange={event => update("reproduction", event.target.value)} placeholder="예: 5회 중 5회"/></label></div><label className="wide">내용 <i>*</i><textarea className="content-input" maxLength={10000} value={form.content || ""} onChange={event => update("content", event.target.value)} required/></label><section className="evidence"><div className="evidence-head"><div><h2>증빙 자료</h2><p>최대 10개 · 파일당 300MB · 동영상은 2분 이하</p></div>{editable && <label className="upload-button">파일 추가<input type="file" multiple accept="image/*,video/*,.log,.txt,.json,.har" onChange={event => { void addFiles(Array.from(event.target.files || [])); }}/></label>}</div>{files.map((file, index) => <div className="pending-file" key={`${file.name}-${index}`}><span>{file.name} · {fileSize(file.size)}</span><input value={descriptions[index] || ""} onChange={event => setDescriptions(values => values.map((value, itemIndex) => itemIndex === index ? event.target.value : value))} placeholder="파일 설명"/><button type="button" onClick={() => { setFiles(values => values.filter((_, itemIndex) => itemIndex !== index)); setDescriptions(values => values.filter((_, itemIndex) => itemIndex !== index)); }}>제거</button></div>)}</section></fieldset>{detail?.attachments.length ? <StoredEvidence attachments={detail.attachments} onDelete={editable ? removeAttachment : undefined}/> : null}{editable && <div className="actions"><button className="primary" type="submit" disabled={busy}>{busy ? "저장 중…" : "티켓 저장"}</button>{notice && <span>{notice}</span>}</div>}</form></main>;
}

function TicketDetailDialog({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  return <div className="ticket-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><div className="ticket-modal" role="dialog" aria-modal="true" aria-label="티켓 상세"><button ref={closeRef} className="ticket-modal-close" type="button" onClick={onClose} aria-label="티켓 상세 닫기">×</button>{children}</div></div>;
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

function UserMenu({ user, onMyPage = () => { window.history.pushState(null, "", "#mypage"); window.dispatchEvent(new PopStateEvent("popstate")); }, onPlanning = () => { window.history.pushState(null, "", "#planning"); window.dispatchEvent(new PopStateEvent("popstate")); }, onAdmin, onLogout }: { user: SessionUser; onMyPage?: () => void; onPlanning?: () => void; onAdmin: () => void; onLogout: () => void }) {
  return <details className="user-menu"><summary>{user.name}</summary><div><button type="button" onClick={onMyPage}>마이페이지</button>{onPlanning && <button type="button" onClick={onPlanning}>프로젝트 기획</button>}{user.role === "admin" && <button type="button" onClick={onAdmin}>관리자 페이지</button>}<button type="button" onClick={onLogout}>로그아웃</button></div></details>;
}

function WorkspaceTabs({ active, onChange, onProjects = () => { window.history.pushState(null, "", "#projects"); window.dispatchEvent(new PopStateEvent("popstate")); }, onPlanning: _onPlanning }: { active: WorkspaceView; onChange: (view: WorkspaceView) => void; onProjects?: () => void; onPlanning?: () => void }) {
  void _onPlanning;
  return <nav className="workspace-tabs" aria-label="작업 화면">{workspaceTabs.map(tab => <button className={active === tab.id ? "active" : ""} type="button" key={tab.id} onClick={() => onChange(tab.id)}>{tab.label}</button>)}<button className="workspace-planning" type="button" onClick={onProjects}>프로젝트 생성</button></nav>;
}

function ProjectFilter({ games, value, onChange }: { games: string[]; value: string; onChange: (value: string) => void }) {
  return <label className="project-filter">프로젝트<select value={value} onChange={event => onChange(event.target.value)}><option value="전체">전체 프로젝트</option>{games.map(game => <option key={game} value={game}>{game}</option>)}</select></label>;
}

type ReportTicket = { id: string; title: string };
type ProjectReport = { project: { id: string; name: string; created_at: string | null; due_at: string | null; status: string }; status_counts: Record<string, number>; severity_counts: Record<string, number>; status_by_severity: Record<string, Record<string, number>>; assignee_statuses: Array<{ id: string | null; name: string; counts: Record<string, number>; total: number }>; can_view_deletions: boolean; activity: Array<{ day: string; created: number; updated: number; deleted: number; created_tickets: ReportTicket[]; updated_tickets: ReportTicket[]; deleted_tickets: ReportTicket[] }> };
type ReportListFilter = { projectId: string; status?: string; severity?: string; assigneeId?: string };

const reportStatuses = [{ label: "신규", color: "#4f8de8" }, { label: "진행", color: "#f0ac37" }, { label: "완료", color: "#45b77a" }, { label: "이슈 아님", color: "#97a3b6" }];

function ActivityChart({ activity, canViewDeletions, onOpenTicket }: { activity: ProjectReport["activity"]; canViewDeletions: boolean; onOpenTicket: (id: string) => void }) {
  type ActivityType = "created" | "updated" | "deleted";
  const [selectedType, setSelectedType] = useState<ActivityType>("created");
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [pinnedIndex, setPinnedIndex] = useState<number | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (pinnedIndex === null) return;
    const clearOnBlankClick = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && chartRef.current?.contains(target) && target.closest(".activity-hit-area, .activity-heatmap button, .activity-view-tabs button, .activity-day-detail")) return;
      setPinnedIndex(null);
      setHoveredIndex(null);
    };
    document.addEventListener("pointerdown", clearOnBlankClick);
    return () => document.removeEventListener("pointerdown", clearOnBlankClick);
  }, [pinnedIndex]);
  const visibleTypes: Array<{ key: ActivityType; label: string; tickets: "created_tickets" | "updated_tickets" | "deleted_tickets"; color: string }> = [
    { key: "created", label: "생성", tickets: "created_tickets", color: "#1769e8" },
    { key: "updated", label: "수정", tickets: "updated_tickets", color: "#38ae78" },
    ...(canViewDeletions ? [{ key: "deleted" as const, label: "삭제", tickets: "deleted_tickets" as const, color: "#df5858" }] : []),
  ];
  const selected = visibleTypes.find(type => type.key === selectedType) || visibleTypes[0];
  const total = activity.reduce((sum, item) => sum + item[selected.key], 0);
  const maximum = Math.max(1, ...activity.map(item => item[selected.key]));
  const axisMaximum = maximum <= 10 ? maximum : Math.ceil(maximum / 10) * 10;
  const axisStep = maximum <= 10 ? 1 : 10;
  const axisValues = Array.from({ length: axisMaximum / axisStep + 1 }, (_, index) => axisMaximum - index * axisStep);
  const x = (index: number) => index / Math.max(1, activity.length - 1) * 100;
  const y = (value: number) => 52 - value / axisMaximum * 46;
  const linePath = activity.map((item, index) => `${index ? "L" : "M"}${x(index)},${y(item[selected.key])}`).join(" ");
  const areaPath = activity.length ? `${linePath} L100,52 L0,52 Z` : "";
  const selectedIndex = pinnedIndex !== null && activity[pinnedIndex] ? pinnedIndex : hoveredIndex !== null && activity[hoveredIndex] ? hoveredIndex : null;
  const selectedDay = pinnedIndex !== null ? activity[pinnedIndex] : null;
  const dayTickets = selectedDay?.[selected.tickets] || [];
  const chartWidth = Math.max(680, activity.length * 34);
  return <div className="report-activity report-activity-focused" ref={chartRef}>
    <div className="activity-view-tabs" role="group" aria-label="티켓 활동 종류">{visibleTypes.map(type => <button key={type.key} type="button" className={selected.key === type.key ? `is-selected ${type.key}` : ""} aria-pressed={selected.key === type.key} onClick={() => { setSelectedType(type.key); setHoveredIndex(null); setPinnedIndex(null); }}><span>{type.label}</span><strong>{activity.reduce((sum, item) => sum + item[type.key], 0)}건</strong></button>)}</div>
    <div className={`activity-focused-body${selectedDay ? " has-detail" : ""}`}>
      <div className="activity-plot-scroll" onMouseLeave={() => setHoveredIndex(null)}><div className="activity-plot" style={{ minWidth: chartWidth }}>
        <div className="activity-plot-heading"><strong>{selected.label} 건수</strong>{!selectedDay && <span className="activity-range-badge" aria-live="polite"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/></svg>{selectedIndex !== null && activity[selectedIndex] ? `${activity[selectedIndex].day} · ${selected.label} ${activity[selectedIndex][selected.key]}건` : `${activity[0]?.day} ~ ${activity.at(-1)?.day}`}</span>}</div>
        <div className="report-chart-y-axis" aria-hidden="true">{axisValues.map(value => <span key={value} style={{ top: `${y(value) / 56 * 100}%` }}>{value}</span>)}</div>
        <svg viewBox="0 0 100 56" preserveAspectRatio="none" role="img" aria-label={`프로젝트 생성일부터 오늘까지의 일자별 티켓 ${selected.label} 추이`}><defs><linearGradient id="activity-selected-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={selected.color} stopOpacity=".16"/><stop offset="100%" stopColor={selected.color} stopOpacity="0"/></linearGradient></defs>{axisValues.map(value => <line key={value} x1="0" y1={y(value)} x2="100" y2={y(value)}/>)}{activity.map((item, index) => <line className="activity-day-line" key={item.day} x1={x(index)} y1="6" x2={x(index)} y2="52"/>)}<path className="activity-selected-area" d={areaPath}/><path className="activity-selected-line" d={linePath} style={{ stroke: selected.color }}/>{selectedIndex !== null && <line className="activity-active-line" x1={x(selectedIndex)} y1="6" x2={x(selectedIndex)} y2="52"/>}{activity.map((item, index) => <g key={item.day}><circle className={`activity-selected-point${selectedIndex === index ? " is-active" : ""}`} cx={x(index)} cy={y(item[selected.key])} r={selectedIndex === index ? "1" : ".55"} style={{ fill: selected.color }}/><rect className="activity-hit-area" x={`${Math.max(0, x(index) - 50 / Math.max(1, activity.length - 1))}%`} y="0" width={`${100 / Math.max(1, activity.length - 1)}%`} height="56" tabIndex={0} aria-label={`${item.day}: ${selected.label} ${item[selected.key]}건`} onMouseEnter={() => setHoveredIndex(index)} onFocus={() => setHoveredIndex(index)} onClick={() => setPinnedIndex(index)}/></g>)}</svg>
        <div className="report-chart-dates" style={{ gridTemplateColumns: `repeat(${activity.length}, minmax(0, 1fr))` }}>{activity.map(item => <span key={item.day}>{item.day.slice(5).replace("-", ".")}</span>)}</div>
        <div className="activity-heatmap" aria-label="날짜별 활동 강도" style={{ gridTemplateColumns: `repeat(${activity.length}, minmax(0, 1fr))` }}>{activity.map((item, index) => <button key={item.day} type="button" className={selectedIndex === index ? "is-active" : ""} style={{ backgroundColor: selected.color, opacity: .12 + item[selected.key] / maximum * .88 }} aria-label={`${item.day}: ${selected.label} ${item[selected.key]}건`} aria-pressed={pinnedIndex === index} onMouseEnter={() => setHoveredIndex(index)} onFocus={() => setHoveredIndex(index)} onClick={() => setPinnedIndex(index)}/>)}</div>
      </div></div>
      {selectedDay && <aside className="activity-day-detail" aria-live="polite"><h4>{selectedDay.day}</h4><span>{selected.label}</span><strong style={{ color: selected.color }}>{selectedDay[selected.key]}건</strong><p>프로젝트 기간 합계 {total}건</p><div className="activity-day-tickets"><b>{selected.label}된 티켓</b>{dayTickets.length ? <ul>{dayTickets.map(ticket => <li key={ticket.id}>{selected.key === "deleted" ? ticket.title : <button type="button" onClick={() => onOpenTicket(ticket.id)}>{ticket.title}</button>}</li>)}</ul> : <span>해당 날짜의 티켓이 없습니다.</span>}</div></aside>}
    </div>
  </div>;
}

function ReportMatrix({ title, rows, statusCounts, rowLabel, projectId, onViewTickets }: { title: string; rows: Array<{ label: string; counts: Record<string, number>; total: number; filter: Omit<ReportListFilter, "projectId" | "status"> }>; statusCounts: Record<string, number>; rowLabel: string; projectId: string; onViewTickets: (filter: ReportListFilter) => void }) {
  const countButton = (value: number, filter: Omit<ReportListFilter, "projectId">, label: string) => <button className="report-count" type="button" onClick={() => onViewTickets({ projectId, ...filter })} aria-label={`${label} 티켓 ${value}건 보기`}>{value}</button>;
  return <article className="report-matrix"><h3>{title}</h3><p>숫자를 누르면 조건에 맞는 티켓 목록을 볼 수 있습니다.</p><div className="report-table-wrap"><table><thead><tr><th scope="col">{rowLabel}</th>{reportStatuses.map(status => <th key={status.label} scope="col">{status.label}</th>)}<th scope="col">합계</th></tr></thead><tbody>{rows.length ? rows.map(row => <tr key={row.label}><th scope="row">{row.label}</th>{reportStatuses.map(status => <td key={status.label}>{countButton(row.counts[status.label] || 0, { ...row.filter, status: status.label }, `${row.label} · ${status.label}`)}</td>)}<td>{countButton(row.total, row.filter, `${row.label} · 전체`)}</td></tr>) : <tr><td colSpan={reportStatuses.length + 2}>표시할 티켓이 없습니다.</td></tr>}</tbody><tfoot><tr><th scope="row">합계</th>{reportStatuses.map(status => <td key={status.label}>{countButton(statusCounts[status.label] || 0, { status: status.label }, `${status.label} · 전체`)}</td>)}<td>{countButton(Object.values(statusCounts).reduce((sum, value) => sum + value, 0), {}, "전체")}</td></tr></tfoot></table></div></article>;
}

function ProjectReportPanel({ projects, onViewTickets, onOpenTicket }: { projects: Project[]; onViewTickets: (filter: ReportListFilter) => void; onOpenTicket: (id: string) => void }) {
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
  const severityRows = severities.map(severity => ({ label: severity, counts: report?.status_by_severity[severity] || {}, total: report?.severity_counts[severity] || 0, filter: { severity } }));
  const assigneeRows = (report?.assignee_statuses || []).slice(0, 8).map(item => ({ label: item.name, counts: item.counts, total: item.total, filter: { assigneeId: item.id || "unassigned" } }));
  return <section className="dashboard-report"><div className="dashboard-report-head"><div><h2>프로젝트 결과 현황</h2><p>프로젝트 단위로 상태, 위험도, 담당자와 일자별 흐름을 바로 확인합니다.</p></div><label>프로젝트<select value={selectedId} onChange={event => { setNotice(""); setProjectId(event.target.value); }}>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label></div>{!projects.length ? <p>표시할 프로젝트가 없습니다.</p> : notice ? <p>{notice}</p> : !report ? <p>프로젝트 보고서를 불러오는 중…</p> : <div className="dashboard-report-grid"><article className="report-status"><h3>{report.project.name}</h3><p>{report.project.status} · 마감 {report.project.due_at || "미정"}</p><div className="report-status-body"><div className="report-donut" style={{ background: total ? `conic-gradient(${segments.stops.join(",")})` : "#eaf0f8" }}><strong>{total}</strong><span>티켓</span></div><dl>{reportStatuses.map(item => { const value = report.status_counts[item.label] || 0; return <div key={item.label}><dt><i style={{ background: item.color }}/>{item.label}</dt><dd>{value}<small>{total ? Math.round(value / total * 100) : 0}%</small></dd></div>; })}</dl></div></article><article className="report-trend"><h3>일자별 티켓 활동</h3><p>{report.can_view_deletions ? "생성 · 수정 · 삭제 건수 기준" : "생성 및 수정 건수 기준"}</p><ActivityChart key={report.project.id} activity={report.activity} canViewDeletions={report.can_view_deletions} onOpenTicket={onOpenTicket}/></article><ReportMatrix title="위험도 × 진행상황" rowLabel="위험도" rows={severityRows} statusCounts={report.status_counts} projectId={report.project.id} onViewTickets={onViewTickets}/><ReportMatrix title="담당자별 진행상황" rowLabel="담당자" rows={assigneeRows} statusCounts={report.status_counts} projectId={report.project.id} onViewTickets={onViewTickets}/></div>}</section>;
}

function SeverityIcon({ severity }: { severity: string }) {
  const paths = severity === "Critical" ? ["M5 10l7-7 7 7", "M5 17l7-7 7 7"] : severity === "High" ? ["M5 15l7-7 7 7"] : severity === "Medium" ? ["M5 12h14"] : ["M5 9l7 7 7-7"];
  return <span className={`severity-icon severity-icon-${severity.toLowerCase()}`} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">{paths.map(path => <path d={path} key={path}/>)}</svg></span>;
}

function Dashboard({ tickets, projects, summary, user, onCreate, onList, onMine, onOpen, onPlanning, onAdmin, onLogout, onHome, onViewChange, onViewTickets }: { tickets: Ticket[]; projects: Project[]; summary: DashboardSummary; user: SessionUser; onCreate: () => void; onList: () => void; onMine: () => void; onOpen: (id: string) => void; onPlanning: () => void; onAdmin: () => void; onLogout: () => void; onHome: () => void; onViewChange: (view: WorkspaceView) => void; onViewTickets: (filter: ReportListFilter) => void }) {
  const statusCounts = [{ label: "신규", value: summary.status_new }, { label: "진행", value: summary.status_in_progress }, { label: "완료", value: summary.status_done }, { label: "이슈 아님", value: summary.status_not_issue }];
  const severityCounts = [{ label: "Critical", value: summary.severity_critical }, { label: "High", value: summary.severity_high }, { label: "Medium", value: summary.severity_medium }, { label: "Low", value: summary.severity_low }];
  const recent = [...tickets].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 8);
  const highest = Math.max(1, ...statusCounts.map(item => item.value), ...severityCounts.map(item => item.value));
  return <main><header><div><button className="home-title workspace-title" type="button" onClick={onHome}>QA Ticket Desk</button></div><UserMenu user={user} onAdmin={onAdmin} onLogout={onLogout}/></header><WorkspaceTabs active="dashboard" onChange={onViewChange} onPlanning={onPlanning}/><section className="dashboard-summary"><article><small>전체 티켓</small><strong>{summary.total}</strong></article><article><small>내게 할당됨</small><strong>{summary.mine}</strong></article><article><small>열린 티켓</small><strong>{summary.open}</strong></article><article><small>마감일 임박/지남</small><strong>{summary.due_soon}</strong><em>오늘부터 3일 이내</em></article></section><ProjectReportPanel projects={projects} onViewTickets={onViewTickets} onOpenTicket={onOpen}/><section className="dashboard-actions"><h2>빠른 액션</h2><div>{user.role !== "viewer" && <button className="primary" onClick={onCreate}>+ 티켓 생성</button>}<button className="back" onClick={onMine}>내 티켓 보기</button><button className="back" onClick={onList}>티켓 목록 보기</button><span>게임명은 프로젝트로 구분합니다.</span></div></section><div className="dashboard-columns"><section className="dashboard-panel"><h2>상태별 티켓</h2>{statusCounts.map(item => <div className="metric-row" key={item.label}><span>{item.label}</span><i><b style={{ width: `${item.value / highest * 100}%` }}/></i><strong>{item.value}</strong></div>)}</section><section className="dashboard-panel"><h2>심각도별 티켓</h2>{severityCounts.map(item => <div className="metric-row" key={item.label}><span>{item.label}</span><i><b style={{ width: `${item.value / highest * 100}%` }}/></i><strong>{item.value}</strong></div>)}</section></div><section className="dashboard-panel recent-list"><h2>최근 생성·수정된 티켓</h2>{recent.length ? recent.map(ticket => <button className="recent-ticket" type="button" key={ticket.id} onClick={() => onOpen(ticket.id)}><span><b>{ticket.title}</b><small>{ticket.assignee ? `담당: ${ticket.assignee}` : "담당자 미지정"}</small></span><span className={`pill ${ticket.status}`}>{ticket.status}</span><time>{formatDate(ticket.updated_at)}</time></button>) : <p>최근 티켓이 없습니다.</p>}</section></main>;
}

function WorkspaceHeader({ user, active, onHome, onPlanning = () => { window.history.pushState(null, "", "#planning"); window.dispatchEvent(new PopStateEvent("popstate")); }, onAdmin, onLogout, onCreate, onViewChange, showCreate = true }: { user: SessionUser; active: WorkspaceView; onHome: () => void; onPlanning?: () => void; onAdmin: () => void; onProjects: () => void; onLogout: () => void; onCreate: () => void; onViewChange: (view: WorkspaceView) => void; showCreate?: boolean }) {
  void onCreate; void showCreate;
  return <><header><div><button className="home-title workspace-title" type="button" onClick={onHome}>QA Ticket Desk</button></div><UserMenu user={user} onAdmin={onAdmin} onLogout={onLogout}/></header><WorkspaceTabs active={active} onChange={onViewChange} onPlanning={onPlanning}/></>;
}

function TicketTemplateSettings() {
  const [templates, setTemplates] = useState<TicketTemplate[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const refresh = async () => {
    const response = await fetch("/api/auth/ticket-templates", { cache: "no-store" });
    if (!response.ok) throw new Error("템플릿 목록을 불러오지 못했습니다.");
    const data = await response.json() as { templates: TicketTemplate[] };
    setTemplates(data.templates);
  };
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/ticket-templates", { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("템플릿 목록을 불러오지 못했습니다.");
      return response.json() as Promise<{ templates: TicketTemplate[] }>;
    }).then(data => setTemplates(data.templates)).catch(error => { if (!controller.signal.aborted) setNotice(error instanceof Error ? error.message : "템플릿 목록을 불러오지 못했습니다."); });
    return () => controller.abort();
  }, []);
  const clear = () => { setSelectedId(""); setName(""); setContent(""); setNotice(""); };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !content.trim()) return setNotice("템플릿 이름과 내용을 입력해 주세요.");
    setBusy(true); setNotice("");
    try {
      const response = await fetch(selectedId ? `/api/auth/ticket-templates/${selectedId}` : "/api/auth/ticket-templates", { method: selectedId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, content }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "템플릿을 저장하지 못했습니다.");
      await refresh();
      clear();
      setNotice("템플릿을 저장했습니다.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "템플릿을 저장하지 못했습니다."); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!selectedId || !window.confirm("선택한 템플릿을 삭제할까요?")) return;
    setBusy(true); setNotice("");
    try {
      const response = await fetch(`/api/auth/ticket-templates/${selectedId}`, { method: "DELETE" });
      if (!response.ok) { const data = await response.json() as { error?: string }; throw new Error(data.error || "템플릿을 삭제하지 못했습니다."); }
      await refresh();
      clear();
      setNotice("템플릿을 삭제했습니다.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "템플릿을 삭제하지 못했습니다."); }
    finally { setBusy(false); }
  };
  const selectedIsDefault = templates.some(template => template.id === selectedId && template.is_default === 1);
  const changeDefault = async () => {
    if (!selectedId) return;
    setBusy(true); setNotice("");
    try {
      const response = await fetch(`/api/auth/ticket-templates/${selectedId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_default: !selectedIsDefault }) });
      if (!response.ok) { const data = await response.json() as { error?: string }; throw new Error(data.error || "기본 설정을 변경하지 못했습니다."); }
      await refresh();
      setNotice(selectedIsDefault ? "기본 템플릿 설정을 해제했습니다." : "기본 템플릿으로 설정했습니다.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "기본 설정을 변경하지 못했습니다."); }
    finally { setBusy(false); }
  };
  return <section className="my-page-card ticket-template-settings"><div className="ticket-template-heading"><div><h2>티켓 내용 템플릿</h2><p>자주 쓰는 내용을 저장하고 기본 템플릿을 지정하면 티켓 생성 시 자동으로 입력됩니다. 최대 10개까지 저장됩니다.</p></div><button className="back" type="button" onClick={clear}>새 템플릿</button></div>{templates.length > 0 && <div className="ticket-template-list" aria-label="저장된 템플릿">{templates.map(template => <button key={template.id} type="button" className={selectedId === template.id ? "is-selected" : ""} onClick={() => { setSelectedId(template.id); setName(template.name); setContent(template.content); setNotice(""); }}>{template.name}{template.is_default === 1 ? " · 기본" : ""}</button>)}</div>}<form onSubmit={save}><label>템플릿 이름<input value={name} onChange={event => setName(event.target.value)} maxLength={50} placeholder="예: 버그 재현 보고" required/></label><div className="ticket-template-content"><span>기본 내용</span><RichTextEditor value={content} onChange={setContent}/></div><div className="ticket-template-actions"><button className="primary" type="submit" disabled={busy || (!selectedId && templates.length >= 10)}>{busy ? "처리 중…" : selectedId ? "수정 저장" : "템플릿 저장"}</button>{selectedId && <button className="back" type="button" disabled={busy} onClick={() => { void changeDefault(); }}>{selectedIsDefault ? "기본 설정 안 함" : "기본 설정"}</button>}{selectedId && <button className="danger" type="button" disabled={busy} onClick={() => { void remove(); }}>삭제</button>}</div>{notice && <p className="editor-notice" role="status">{notice}</p>}</form></section>;
}

function MyPage({ user, onHome, onAdmin, onProjects, onLogout }: { user: SessionUser; onHome: () => void; onAdmin: () => void; onProjects: () => void; onLogout: () => void }) {
  return <main className="my-page"><header><div><button className="home-title workspace-title" type="button" onClick={onHome}>QA Ticket Desk</button></div></header><section className="my-page-card"><h1>{user.name}</h1><dl><div><dt>이메일</dt><dd>{user.email}</dd></div><div><dt>권한</dt><dd>{roleName(user.role)}</dd></div></dl><div className="my-page-actions">{user.role === "admin" && <button className="back" type="button" onClick={onProjects}>프로젝트 관리</button>}{user.role === "admin" && <button className="back" type="button" onClick={onAdmin}>관리자 페이지</button>}<button className="danger" type="button" onClick={onLogout}>로그아웃</button></div></section>{user.role !== "viewer" && <TicketTemplateSettings/>}</main>;
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
  const [form, setForm] = useState({ name: "", start_date: todayInput(), due_at: "" });
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setNotice("");
    const response = await fetch("/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
    const data = await response.json();
    setBusy(false);
    if (!response.ok) return setNotice(data.error || "프로젝트 생성에 실패했습니다.");
    setForm({ name: "", start_date: todayInput(), due_at: "" });
    setNotice("프로젝트를 만들었습니다. 이제 티켓 생성에서 선택할 수 있습니다.");
    onSaved();
  };
  return <main><header><div><button className="home-title" type="button" onClick={onHome}>QA Ticket Desk</button><span>프로젝트 생성</span></div></header><section className="project-layout"><form className="editor project-form" onSubmit={save}><h1>프로젝트 만들기</h1><div className="fields"><label className="wide">프로젝트명 <i>*</i><input maxLength={100} value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} placeholder="예: 2026 여름 업데이트" required/></label><label>생성일 <i>*</i><input type="date" value={form.start_date} onChange={event => setForm(current => ({ ...current, start_date: event.target.value }))} required/></label><label>마감일 <i>*</i><input type="date" value={form.due_at} onChange={event => setForm(current => ({ ...current, due_at: event.target.value }))} required/></label></div><div className="actions"><button className="primary" type="submit" disabled={busy}>{busy ? "생성 중…" : "프로젝트 만들기"}</button>{notice && <span>{notice}</span>}</div></form><section className="project-list"><h2>프로젝트 목록</h2>{projects.length ? projects.map(project => <article key={project.id}><div><b>{project.name}</b><span>생성일 {project.start_date || project.created_at?.slice(0, 10) || "미설정"}</span></div><div><b>마감 {project.due_at || "미설정"}</b><span>연결 티켓 {project.ticket_count || 0}개</span></div></article>) : <p>생성된 프로젝트가 없습니다.</p>}</section></section></main>;
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
  const [detailOrigin, setDetailOrigin] = useState<string | null>(null);
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
    const route = detail ? `#ticket/${detail.ticket.id}` : `#${view}`;
    if (window.location.hash !== route) window.history.pushState(null, "", route);
  }, [detail, ready, routeReady, user, view]);
  useEffect(() => {
    if (!ready || !user) return;
    const restorePage = async () => {
      restoringHistory.current = true;
      const ticketId = window.location.hash.match(/^#ticket\/([^/]+)(?:\/edit)?$/)?.[1];
      if (ticketId) {
        const response = await fetch(`/api/tickets/${ticketId}`, { cache: "no-store" });
        if (response.ok) { const data = await response.json() as Detail; setDetail({ ...data, ticket: normalizeTicket(data.ticket) }); setRouteReady(true); return; }
      }
      const route = window.location.hash.replace("#", "");
      setDetail(null);
      setView(route === "tickets" || route === "list" ? "list" : route === "board" ? "board" : route === "timeline" ? "timeline" : route === "projects" ? "projects" : route === "planning" ? "planning" : route === "create" ? "create" : route === "admin" ? "admin" : route === "mypage" ? "mypage" : "dashboard");
      setRouteReady(true);
    };
    void restorePage();
    window.addEventListener("popstate", restorePage);
    return () => window.removeEventListener("popstate", restorePage);
  }, [ready, user]);
  const open = async (id: string) => { const origin = detail ? null : window.location.hash; const response = await fetch(`/api/tickets/${id}`, { cache: "no-store" }); if (!response.ok) return; const data = await response.json() as Detail; if (origin) setDetailOrigin(origin); setDetail({ ...data, ticket: normalizeTicket(data.ticket) }); };
  const remove = async () => { if (!selected.length || !confirm(`${selected.length}개 티켓을 휴지통으로 이동할까요?`)) return; await Promise.all(selected.map(id => fetch(`/api/tickets/${id}`, { method: "DELETE" }))); setSelected([]); void Promise.all([load(), loadProjects()]); };
  const boardGames = useMemo(() => [...new Set(boardTickets.map(ticket => ticket.game).filter(Boolean))].sort(), [boardTickets]);
  const filtered = tickets;
  const selectable = filtered.filter(ticket => user.role !== "viewer" && (user.role === "admin" || ticket.created_by_id === user.id));
  if (!ready) return <main className="login-page"><p>로그인 정보를 확인하는 중…</p></main>;
  if (!user) return <LoginScreen onLogin={loggedInUser => {
    window.history.replaceState(null, "", "#dashboard");
    setDetail(null);
    setView("dashboard");
    setUser(loggedInUser);
  }} initialNotice={sessionNotice}/>;
  const showWorkspace = (workspaceView: WorkspaceView) => { setView(workspaceView); if (workspaceView === "timeline") void load(200, false); else if (workspaceView === "dashboard") void load(); };
  const logout = async () => { await fetch("/api/auth/logout", { method: "POST" }); setUser(null); };
  const createTicket = () => { setDetail(null); setView("create"); };
  const home = () => { setDetailOrigin(null); setDetail(null); setView("dashboard"); void load(); };
  const admin = () => setView("admin");
  const openProjects = () => { setDetail(null); setView("projects"); void loadProjects(); };
  if (view === "admin") return <AdminPanel user={user} onHome={home}/>;
  if (view === "mypage") return <MyPage user={user} onHome={home} onAdmin={admin} onProjects={openProjects} onLogout={logout}/>;
  const planning = () => { setView("planning"); };
  const resetListFilters = () => { setListPage(1); setListProjectIds([]); setListStatuses([]); setListSeverities([]); setListAssigneeIds([]); setListCreatorIds([]); setListDue(""); setListKeyword(""); setListSort("updated"); setShowAdvancedFilters(false); };
  const viewReportTickets = (filter: ReportListFilter) => { setSelected([]); setListPage(1); setListProjectIds([filter.projectId]); setListStatuses(filter.status ? [filter.status] : []); setListSeverities(filter.severity ? [filter.severity] : []); setListAssigneeIds(filter.assigneeId ? [filter.assigneeId] : []); setListCreatorIds([]); setListDue(""); setListKeyword(""); setListSort("updated"); setShowAdvancedFilters(Boolean(filter.severity)); setView("list"); };
  const hasListFilters = Boolean(listProjectIds.length || listStatuses.length || listSeverities.length || listAssigneeIds.length || listCreatorIds.length || listDue || listKeyword.trim() || listSort !== "updated");
  const closeDetail = () => {
    const destination = detailOrigin || "#dashboard";
    setDetailOrigin(null);
    setDetail(null);
    if (!detailOrigin) setView("dashboard");
    window.history.replaceState(null, "", destination);
  };
  const refreshDetail = async () => { if (detail) await open(detail.ticket.id); await load(); };
  const withDetail = (page: React.ReactNode) => <>{page}{detail && <TicketDetailDialog onClose={closeDetail}><TicketEditor key={detail.ticket.id} user={user} detail={detail} projects={projects} inDialog onHome={home} onBack={closeDetail} onSaved={ticketId => { if (ticketId) { void open(ticketId); } else { closeDetail(); void Promise.all([load(), loadProjects()]); } }} onRefresh={() => { void refreshDetail(); }}/></TicketDetailDialog>}</>;
  if (view === "dashboard") return withDetail(<Dashboard tickets={tickets} projects={projects} summary={summary} user={user} onCreate={createTicket} onList={() => setView("list")} onMine={() => { setListPage(1); setListAssigneeIds([user.id]); setView("list"); }} onOpen={open} onPlanning={planning} onAdmin={admin} onLogout={logout} onHome={home} onViewChange={showWorkspace} onViewTickets={viewReportTickets}/>);
  if (view === "planning") return <ProjectPlanning user={user} projects={projects} onHome={home} onMyPage={() => setView("mypage")} onAdmin={admin} onLogout={logout}/>;
  if (view === "projects") return user.role === "admin" ? <ProjectPanel projects={projects} onHome={home} onSaved={() => { void Promise.all([load(), loadProjects()]); }}/> : <main><p className="empty">프로젝트 관리는 관리자만 할 수 있습니다.</p></main>;
  if (view === "board") return withDetail(<BoardView tickets={boardTickets} games={boardGames} project={game} user={user} onOpen={open} onHome={home} onAdmin={admin} onProjects={openProjects} onLogout={logout} onCreate={createTicket} onViewChange={showWorkspace}/>);
  if (view === "timeline") return withDetail(<TimelineView tickets={tickets} projects={projects} project={game} user={user} onProjectChange={setGame} onOpen={open} onHome={home} onAdmin={admin} onProjects={openProjects} onLogout={logout} onCreate={createTicket} onViewChange={showWorkspace}/>);
  if (view === "create") return <TicketEditor key="create" user={user} detail={null} projects={projects} onHome={() => { setDetail(null); setView("dashboard"); void load(); }} onBack={home} onSaved={() => { setDetail(null); setView("list"); void Promise.all([load(), loadProjects()]); }} onRefresh={() => { void refreshDetail(); }}/ >;
  return withDetail(<main>
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
    <section className="list-table" aria-label="티켓 목록"><div className="list-row list-head"><input aria-label="모두 선택" type="checkbox" disabled={!selectable.length} checked={Boolean(selectable.length) && selected.length === selectable.length} onChange={event => setSelected(event.target.checked ? selectable.map(ticket => ticket.id) : [])}/><b>요약</b><b>상태</b><b>담당자</b><b>마감일</b><b>심각도</b></div>{filtered.length ? filtered.map((ticket, index) => <div className="list-row" key={ticket.id}><input type="checkbox" aria-label={`${ticket.title} 선택`} disabled={!selectable.some(item => item.id === ticket.id)} checked={selected.includes(ticket.id)} onChange={event => setSelected(event.target.checked ? [...selected, ticket.id] : selected.filter(id => id !== ticket.id))}/><button className="list-summary" onClick={() => open(ticket.id)}><span>{ticketCode(ticket) || `#${(listPage - 1) * 50 + index + 1}`}</span><b>{ticket.title}</b><small>{ticket.game || "프로젝트 미지정"}</small></button><span className={`list-status pill ${ticket.status}`}>{ticket.status}</span><span className="list-assignee">{ticket.assignee || "미지정"}</span><time className="list-due" dateTime={ticket.due_at || undefined}>{ticket.due_at || "미정"}</time><span className={`list-severity list-severity-${ticket.severity.toLowerCase()}`}><SeverityIcon severity={ticket.severity}/>{ticket.severity}</span></div>) : <p className="empty">조회할 목록이 없습니다.</p>}</section><PageControls label="티켓 목록" page={listPage} total={listTotal} pageSize={50} onChange={setListPage}/>
  </main>);
}
