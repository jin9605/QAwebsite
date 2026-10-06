"use client";

import { FormEvent, useEffect, useState } from "react";
import type { SessionUser } from "./login-screen";

type Project = { id: string; name: string; due_at: string; status: string };
type StageKey = "planning" | "development" | "qa" | "release_ready" | "deployed";
type Stage = { key: StageKey; owner_id: string | null; criterion: string; completed: boolean };
type Plan = { concept: string; target_users: string; release_scope: string; success_criteria: string; stages: Stage[] };
type PlanData = { project: Project; plan: Plan; members: Array<{ id: string; name: string; role: string }>; stats: { total: number; new_count: number | null; in_progress: number | null; done: number | null; not_issue: number | null; open_critical: number | null } };

const stages: Array<{ key: StageKey; label: string }> = [
  { key: "planning", label: "기획 확정" },
  { key: "development", label: "개발" },
  { key: "qa", label: "QA" },
  { key: "release_ready", label: "출시 준비" },
  { key: "deployed", label: "배포" },
];

export function ProjectPlanning({ user, projects, onHome, onMyPage, onAdmin, onLogout }: { user: SessionUser; projects: Project[]; onHome: () => void; onMyPage: () => void; onAdmin: () => void; onLogout: () => void }) {
  const [projectId, setProjectId] = useState("");
  const [data, setData] = useState<PlanData | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const selectedProjectId = projects.some(project => project.id === projectId) ? projectId : projects[0]?.id || "";
  const selectProject = (id: string) => {
    setProjectId(id);
    setData(null);
    setPlan(null);
    setLoading(true);
    setNotice("");
  };

  useEffect(() => {
    if (!selectedProjectId) return;
    const controller = new AbortController();
    fetch(`/api/projects/${selectedProjectId}/plan`, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const result = await response.json() as PlanData & { error?: string };
        if (!response.ok) throw new Error(result.error || "기획 정보를 불러오지 못했습니다.");
        setData(result);
        setPlan(result.plan);
      })
      .catch(error => { if (!controller.signal.aborted) setNotice(error instanceof Error ? error.message : "기획 정보를 불러오지 못했습니다."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [selectedProjectId]);

  const changeStage = (key: StageKey, changes: Partial<Stage>) => setPlan(current => current ? { ...current, stages: current.stages.map(stage => stage.key === key ? { ...stage, ...changes } : stage) } : current);
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!plan || !selectedProjectId) return;
    setSaving(true); setNotice("");
    try {
      const response = await fetch(`/api/projects/${selectedProjectId}/plan`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(plan) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "저장하지 못했습니다.");
      setNotice("프로젝트 기획을 저장했습니다.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "저장하지 못했습니다."); }
    finally { setSaving(false); }
  };

  const stats = data?.stats;
  const total = stats?.total || 0;
  const done = stats?.done || 0;
  const notIssue = stats?.not_issue || 0;
  const completion = total ? Math.round((done + notIssue) / total * 100) : 0;
  const canEdit = user.role === "admin" || Boolean(data?.members.some(member => member.id === user.id && ["project_admin", "qa"].includes(member.role)));
  const completedStages = plan?.stages.filter(stage => stage.completed).length || 0;

  return <main className="project-planning"><header><div><button className="home-title workspace-title" type="button" onClick={onHome}>QA Ticket Desk</button></div><details className="user-menu"><summary>{user.name}</summary><div><button type="button" onClick={onMyPage}>마이페이지</button>{user.role === "admin" && <button type="button" onClick={onAdmin}>관리자 페이지</button>}<button type="button" onClick={onLogout}>로그아웃</button></div></details></header>
    <section className="project-planning-top"><div><h1>프로젝트 기획</h1><p>이번 게임의 방향과 출시 준비를 한 화면에서 확인합니다.</p></div><label>프로젝트<select value={selectedProjectId} onChange={event => selectProject(event.target.value)}>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label></section>
    {!projects.length ? <section className="planning-empty">접근할 수 있는 프로젝트가 없습니다.</section> : loading ? <section className="planning-empty">프로젝트 정보를 불러오는 중…</section> : !data || !plan || data.project.id !== selectedProjectId ? <section className="planning-empty" role="alert">{notice || "프로젝트 정보를 표시할 수 없습니다."}</section> : <>
      <section className="project-planning-progress"><div><span>{data.project.status} · 마감일 {data.project.due_at || "미정"}</span><strong>{completedStages}/{stages.length}단계 완료</strong></div><div className="project-planning-progress-track"><span style={{ width: `${completedStages / stages.length * 100}%` }}/></div></section>
      <form onSubmit={save}>
        <section className="project-planning-card"><h2>기획 요약</h2><p>길게 쓰기보다 팀이 이번 출시를 판단할 수 있을 만큼만 적어 주세요.</p><div className="project-planning-fields"><label>한 줄 게임 정의<textarea maxLength={1000} disabled={!canEdit} value={plan.concept} onChange={event => setPlan(current => current ? { ...current, concept: event.target.value } : current)} placeholder="어떤 재미를 주는 게임인가요?"/></label><label>대상 유저<textarea maxLength={1000} disabled={!canEdit} value={plan.target_users} onChange={event => setPlan(current => current ? { ...current, target_users: event.target.value } : current)} placeholder="누가 플레이하길 기대하나요?"/></label><label>이번 출시 범위<textarea maxLength={1000} disabled={!canEdit} value={plan.release_scope} onChange={event => setPlan(current => current ? { ...current, release_scope: event.target.value } : current)} placeholder="이번 주에 포함할 핵심 기능은 무엇인가요?"/></label><label>출시 성공 기준<textarea maxLength={1000} disabled={!canEdit} value={plan.success_criteria} onChange={event => setPlan(current => current ? { ...current, success_criteria: event.target.value } : current)} placeholder="어떤 상태여야 출시할 수 있나요?"/></label></div></section>
        <section className="project-planning-card"><h2>출시 단계</h2><p>담당자와 완료 조건을 정하고, 끝난 단계를 체크하세요.</p><div className="project-planning-stages">{stages.map((item, index) => { const stage = plan.stages[index]; return <div className="project-planning-stage" key={item.key}><label className="project-planning-check"><input type="checkbox" checked={stage.completed} disabled={!canEdit} onChange={event => changeStage(item.key, { completed: event.target.checked })}/><span>{item.label}</span></label><label>담당자<select value={stage.owner_id || ""} disabled={!canEdit} onChange={event => changeStage(item.key, { owner_id: event.target.value || null })}><option value="">미지정</option>{data.members.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label><label>완료 조건<input maxLength={500} disabled={!canEdit} value={stage.criterion} onChange={event => changeStage(item.key, { criterion: event.target.value })} placeholder="완료를 판단할 기준"/></label></div>; })}</div></section>
        {canEdit && <div className="project-planning-save"><button className="primary" type="submit" disabled={saving}>{saving ? "저장 중…" : "기획 저장"}</button>{notice && <span role="status">{notice}</span>}</div>}
      </form>
      <section className="project-planning-card"><h2>티켓 현황</h2><p>연결된 티켓을 기준으로 자동 집계합니다. 이 수치는 출시 단계 체크와 별개입니다.</p><div className="project-planning-metrics"><article><small>전체 티켓</small><strong>{total}</strong></article><article><small>처리 완료율</small><strong>{completion}%</strong></article><article><small>열린 Critical</small><strong className={stats?.open_critical ? "critical" : ""}>{stats?.open_critical || 0}</strong></article></div><div className="project-planning-statuses">{[{ label: "신규", value: stats?.new_count || 0, color: "#86aef0" }, { label: "진행", value: stats?.in_progress || 0, color: "#e9ac4b" }, { label: "완료", value: done, color: "#49b583" }, { label: "이슈 아님", value: notIssue, color: "#a7b2c2" }].map(item => <div key={item.label}><span>{item.label}</span><div><i style={{ width: `${total ? item.value / total * 100 : 0}%`, background: item.color }}/></div><b>{item.value}</b></div>)}</div></section>
    </>}
  </main>;
}
