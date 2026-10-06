-- Local Summary graph QA fixture.
-- Keeps existing tickets and adds 30 tickets to every existing project.
WITH RECURSIVE ticket_sequence(number) AS (
  VALUES (1) UNION ALL SELECT number + 1 FROM ticket_sequence WHERE number < 30
), project_base AS (
  SELECT
    projects.id,
    projects.name,
    projects.ticket_name,
    date(projects.created_at) AS project_created_day,
    projects.due_at,
    COALESCE((SELECT MAX(ticket_number) FROM tickets WHERE project_id = projects.id), 0) AS last_ticket_number,
    MAX(1, CAST(julianday(projects.due_at) - julianday(date(projects.created_at)) AS INTEGER)) AS project_days
  FROM projects
)
INSERT OR IGNORE INTO tickets (
  id,title,status,severity,environment,frequency,reproduction,content,
  created_at,updated_at,game,created_by_id,created_by_name,updated_by_id,updated_by_name,
  assignee_id,assignee,due_at,project_id,ticket_number,issue_reason
)
SELECT
  'report-qa-' || project_base.id || '-' || printf('%02d', ticket_sequence.number),
  '[' || COALESCE(project_base.ticket_name, 'QA') || '] 그래프 QA 시나리오 ' || printf('%02d', ticket_sequence.number),
  CASE ticket_sequence.number % 4 WHEN 0 THEN '신규' WHEN 1 THEN '진행' WHEN 2 THEN '완료' ELSE '이슈 아님' END,
  CASE ticket_sequence.number % 4 WHEN 0 THEN 'Critical' WHEN 1 THEN 'High' WHEN 2 THEN 'Medium' ELSE 'Low' END,
  CASE ticket_sequence.number % 4 WHEN 0 THEN '웹' WHEN 1 THEN 'iOS' WHEN 2 THEN 'Android' ELSE '관리자' END,
  CASE ticket_sequence.number % 4 WHEN 0 THEN '항상' WHEN 1 THEN '자주' WHEN 2 THEN '가끔' ELSE '한 번' END,
  printf('%d회 중 %d회', ticket_sequence.number % 5 + 1, ticket_sequence.number % 5 + 1),
  project_base.name || ' 프로젝트의 Summary 그래프 QA용 테스트 티켓입니다.',
  datetime('now', '+09:00'),
  datetime('now', '+09:00'),
  project_base.name,
  'aaf6a2fc-fd9b-4654-a2ed-c3330c9ba566','권윤기','aaf6a2fc-fd9b-4654-a2ed-c3330c9ba566','권윤기',
  CASE ticket_sequence.number % 3 WHEN 0 THEN 'aaf6a2fc-fd9b-4654-a2ed-c3330c9ba566' WHEN 1 THEN 'b6e88d66-d4f3-4ac7-a8e3-590b78c8e9dc' ELSE 'be7f7d59-b776-4eb1-9271-ef27c39fb10f' END,
  CASE ticket_sequence.number % 3 WHEN 0 THEN '권윤기' WHEN 1 THEN '모모' ELSE 'TEST' END,
  date('now', CASE ticket_sequence.number % 5 WHEN 0 THEN '-7 days' WHEN 1 THEN '+0 days' WHEN 2 THEN '+7 days' WHEN 3 THEN '+14 days' ELSE '+21 days' END),
  project_base.id,
  project_base.last_ticket_number + ticket_sequence.number,
  CASE WHEN ticket_sequence.number % 4 = 3 THEN '그래프 QA용 이슈 아님 처리' ELSE NULL END
FROM project_base CROSS JOIN ticket_sequence;
