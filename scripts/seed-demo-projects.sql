-- Local QA demonstration data: five new projects, twenty tickets per project.
-- Existing projects and tickets are not modified.
WITH RECURSIVE project_numbers(number) AS (
  VALUES (1) UNION ALL SELECT number + 1 FROM project_numbers WHERE number < 5
)
INSERT OR IGNORE INTO projects (id,name,start_date,due_at,owner,status,created_by_id,created_at,updated_at)
SELECT
  printf('demo-project-%02d', number),
  printf('자동화 QA 프로젝트 %02d', number),
  '2026-09-28',
  '2026-10-26',
  '권윤기',
  'QA 진행',
  'aaf6a2fc-fd9b-4654-a2ed-c3330c9ba566',
  '2026-09-28T09:00:00.000Z',
  '2026-09-28T09:00:00.000Z'
FROM project_numbers;

WITH RECURSIVE project_numbers(number) AS (
  VALUES (1) UNION ALL SELECT number + 1 FROM project_numbers WHERE number < 5
), members(user_id, role) AS (
  VALUES
    ('aaf6a2fc-fd9b-4654-a2ed-c3330c9ba566', 'project_admin'),
    ('b6e88d66-d4f3-4ac7-a8e3-590b78c8e9dc', 'qa'),
    ('be7f7d59-b776-4eb1-9271-ef27c39fb10f', 'developer')
)
INSERT OR IGNORE INTO project_members (project_id,user_id,role,added_by_id,created_at)
SELECT printf('demo-project-%02d', project_numbers.number), members.user_id, members.role, 'aaf6a2fc-fd9b-4654-a2ed-c3330c9ba566', '2026-09-28T09:00:00.000Z'
FROM project_numbers CROSS JOIN members;

WITH RECURSIVE project_numbers(number) AS (
  VALUES (1) UNION ALL SELECT number + 1 FROM project_numbers WHERE number < 5
), ticket_numbers(number) AS (
  VALUES (1) UNION ALL SELECT number + 1 FROM ticket_numbers WHERE number < 20
)
INSERT OR IGNORE INTO tickets (id,title,status,severity,game,project_id,assignee_id,assignee,due_at,environment,frequency,reproduction,content,issue_reason,created_by_id,created_by_name,updated_by_id,updated_by_name,created_at,updated_at)
SELECT
  printf('demo-ticket-%02d-%02d', project_numbers.number, ticket_numbers.number),
  printf('[자동화] 프로젝트 %02d QA 점검 %02d', project_numbers.number, ticket_numbers.number),
  CASE (project_numbers.number + ticket_numbers.number) % 4 WHEN 0 THEN '신규' WHEN 1 THEN '진행' WHEN 2 THEN '완료' ELSE '이슈 아님' END,
  CASE (project_numbers.number * 3 + ticket_numbers.number) % 4 WHEN 0 THEN 'Critical' WHEN 1 THEN 'High' WHEN 2 THEN 'Medium' ELSE 'Low' END,
  printf('자동화 QA 프로젝트 %02d', project_numbers.number),
  printf('demo-project-%02d', project_numbers.number),
  CASE ticket_numbers.number % 3 WHEN 0 THEN 'aaf6a2fc-fd9b-4654-a2ed-c3330c9ba566' WHEN 1 THEN 'b6e88d66-d4f3-4ac7-a8e3-590b78c8e9dc' ELSE 'be7f7d59-b776-4eb1-9271-ef27c39fb10f' END,
  CASE ticket_numbers.number % 3 WHEN 0 THEN '권윤기' WHEN 1 THEN '모모' ELSE 'TEST' END,
  date('2026-09-28', '+' || ((ticket_numbers.number * 5 + project_numbers.number * 3) % 28) || ' days'),
  CASE ticket_numbers.number % 3 WHEN 0 THEN '웹' WHEN 1 THEN 'Android' ELSE 'iOS' END,
  CASE ticket_numbers.number % 4 WHEN 0 THEN '항상' WHEN 1 THEN '자주' WHEN 2 THEN '가끔' ELSE '한 번' END,
  printf('%d회 중 %d회', ticket_numbers.number % 5 + 1, ticket_numbers.number % 5 + 1),
  printf('자동 생성된 QA 테스트 티켓입니다. 프로젝트 %02d의 점검 항목 %02d입니다.', project_numbers.number, ticket_numbers.number),
  CASE WHEN (project_numbers.number + ticket_numbers.number) % 4 = 3 THEN '자동화 테스트에서 이슈가 재현되지 않았습니다.' ELSE NULL END,
  'aaf6a2fc-fd9b-4654-a2ed-c3330c9ba566', '권윤기', 'aaf6a2fc-fd9b-4654-a2ed-c3330c9ba566', '권윤기',
  printf('2026-09-%02dT09:00:00.000Z', 1 + ((project_numbers.number + ticket_numbers.number) % 28)),
  printf('2026-09-%02dT10:00:00.000Z', 1 + ((project_numbers.number + ticket_numbers.number) % 28))
FROM project_numbers CROSS JOIN ticket_numbers;

INSERT OR IGNORE INTO ticket_history (id,ticket_id,actor_id,actor_name,action,before_json,after_json,created_at)
SELECT
  'history-' || tickets.id, tickets.id,
  'aaf6a2fc-fd9b-4654-a2ed-c3330c9ba566', '권윤기', '티켓 생성', NULL,
  json_object('title',tickets.title,'status',tickets.status,'severity',tickets.severity,'project_id',tickets.project_id), tickets.created_at
FROM tickets WHERE tickets.id LIKE 'demo-ticket-%';

INSERT OR IGNORE INTO audit_logs (id,actor_id,actor_name,action,target_type,target_id,outcome,reason,ip_address,user_agent,metadata_json,created_at)
SELECT
  'audit-' || tickets.id, 'aaf6a2fc-fd9b-4654-a2ed-c3330c9ba566', '권윤기', '자동 테스트 티켓 생성', 'ticket', tickets.id, 'success', NULL, 'local-seed', 'Codex local seed',
  json_object('project_id',tickets.project_id), tickets.created_at
FROM tickets WHERE tickets.id LIKE 'demo-ticket-%';

-- 이미 생성된 자동화 티켓도 프로젝트 4주 기간 안의 서로 다른 마감일로 맞춘다.
UPDATE tickets
SET due_at = date(
  '2026-09-28',
  '+' || ((CAST(substr(id, -2) AS INTEGER) * 5 + CAST(substr(id, 13, 2) AS INTEGER) * 3) % 28) || ' days'
)
WHERE id LIKE 'demo-ticket-%';
