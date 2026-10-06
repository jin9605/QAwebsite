import { createWriteStream } from "node:fs";
import { once } from "node:events";
import path from "node:path";

const origin = "https://qa-ticket-desk-jin.foamy-siren-8676.chatgpt.site";
const output = path.resolve("/Users/jin/Desktop/QA/QA-티켓-서버백업-재생수정.html");

const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]));

const readJson = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
};

const out = createWriteStream(output, { encoding: "utf8" });
const write = async (chunk) => {
  if (!out.write(chunk)) await once(out, "drain");
};

try {
  const { tickets } = await readJson(`${origin}/api/tickets`);
  const records = [];
  for (const item of tickets) {
    records.push(await readJson(`${origin}/api/tickets/${item.id}`));
  }

  await write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>QA 티켓 서버 백업</title><style>body{margin:0;background:#f3f6fb;color:#172033;font-family:Arial,"Apple SD Gothic Neo",sans-serif}.wrap{max-width:1120px;margin:auto;padding:36px 22px 72px}h1{margin:0;font-size:28px}header p{color:#64748b}.ticket{background:#fff;border:1px solid #dbe3f0;border-radius:14px;margin:20px 0;overflow:hidden}.ticket h2{margin:0;padding:22px;border-bottom:1px solid #e8edf5}.meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;padding:20px;background:#fafcff}.label{display:block;color:#64748b;font-size:13px;font-weight:700;margin-bottom:6px}.section{padding:20px;border-top:1px solid #e8edf5}.content{white-space:pre-wrap;line-height:1.65}.files{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.file{border:1px solid #dbe3f0;border-radius:10px;overflow:hidden;padding:12px}.file img,.file video{display:block;width:100%;max-height:360px;object-fit:contain;background:#111827;border-radius:7px;margin-top:10px}.open-media{margin-top:10px;border:0;border-radius:7px;background:#2563eb;color:#fff;padding:9px 12px;font-weight:700;cursor:pointer}.file a{color:#1d4ed8;font-weight:700}.comment{background:#f6f9ff;border-left:3px solid #93c5fd;padding:11px 13px;margin-top:9px}.comment time{color:#64748b;font-size:12px;float:right}@media(max-width:700px){.meta,.files{grid-template-columns:1fr}}</style></head><body><main class="wrap"><header><h1>QA 티켓 서버 백업</h1><p>생성일: ${escapeHtml(new Date().toLocaleString("ko-KR"))} · 첨부파일 포함 · 티켓 ${records.length}개</p></header>`);

  for (const record of records) {
    const { ticket, attachments, comments } = record;
    await write(`<article class="ticket"><h2>${escapeHtml(ticket.title)}</h2><div class="meta"><div><span class="label">진행상황</span>${escapeHtml(ticket.status)}</div><div><span class="label">위험도·심각도</span>${escapeHtml(ticket.severity)}</div><div><span class="label">게임</span>${escapeHtml(ticket.game || "-")}</div><div><span class="label">발생 환경</span>${escapeHtml(ticket.environment || "-")}</div><div><span class="label">발생 빈도</span>${escapeHtml(ticket.frequency || "-")}</div><div><span class="label">재현 횟수</span>${escapeHtml(ticket.reproduction || "-")}</div></div><section class="section"><span class="label">내용</span><div class="content">${escapeHtml(ticket.content || "")}</div></section><section class="section"><span class="label">증빙 자료</span><div class="files">`);
    for (const attachment of attachments) {
      const response = await fetch(`${origin}/api/attachments/${attachment.id}`);
      if (!response.ok) throw new Error(`${response.status} attachment ${attachment.name}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      const encoded = bytes.toString("base64");
      const name = escapeHtml(attachment.name);
      const description = escapeHtml(attachment.description || "설명 없음");
      const payloadId = `attachment-${attachment.id}`;
      const type = escapeHtml(attachment.content_type || "application/octet-stream");
      const kind = attachment.content_type?.startsWith("image/") ? "image" : attachment.content_type?.startsWith("video/") ? "video" : "file";
      await write(`<div class="file"><b>${name}</b><small>${description} · ${(attachment.size / 1024 / 1024).toFixed(1)}MB</small><button class="open-media" data-payload="${payloadId}" data-type="${type}" data-kind="${kind}" data-name="${name}">${kind === "video" ? "동영상 열기" : kind === "image" ? "이미지 열기" : "파일 열기"}</button><div class="media"></div><script id="${payloadId}" type="text/plain">${encoded}</script></div>`);
    }
    await write(`</div></section><section class="section"><span class="label">댓글</span>${comments.map((comment) => `<div class="comment"><b>${escapeHtml(comment.author)}</b><time>${escapeHtml(new Date(comment.created_at).toLocaleString("ko-KR"))}</time><div>${escapeHtml(comment.body)}</div></div>`).join("") || "댓글 없음"}</section></article>`);
  }
  await write(`</main><script>function blobFromBase64(text,type){const parts=[];const step=4*1024*1024;for(let i=0;i<text.length;i+=step){const bin=atob(text.slice(i,i+step));const bytes=new Uint8Array(bin.length);for(let j=0;j<bin.length;j++)bytes[j]=bin.charCodeAt(j);parts.push(bytes)}return new Blob(parts,{type:type})}document.addEventListener('click',function(event){const button=event.target.closest('[data-payload]');if(!button)return;button.disabled=true;button.textContent='불러오는 중…';const payload=document.getElementById(button.dataset.payload);try{const url=URL.createObjectURL(blobFromBase64(payload.textContent,button.dataset.type));const holder=button.nextElementSibling;const name=button.dataset.name;holder.innerHTML=button.dataset.kind==='image'?'<img src="'+url+'" alt="'+name+'">':button.dataset.kind==='video'?'<video controls preload="metadata" src="'+url+'"></video>':'<a download="'+name+'" href="'+url+'">파일 다운로드</a>';button.remove();payload.remove()}catch(error){button.disabled=false;button.textContent='열기 실패 — 다시 시도';console.error(error)}})</script></body></html>`);
  out.end();
  await once(out, "finish");
  console.log(output);
} catch (error) {
  out.destroy();
  throw error;
}
