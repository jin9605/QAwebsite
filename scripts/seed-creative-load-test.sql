-- Local load-test data. Existing projects and tickets are not changed.
WITH new_projects(id, name, start_date, due_at, status, sort_order) AS (
  VALUES
    ('load-project-01', '네온 러너: 야간 점검', '2026-09-28', '2026-10-26', 'QA 진행', 1),
    ('load-project-02', '달빛 푸요 연구소', '2026-10-05', '2026-11-02', '준비', 2),
    ('load-project-03', '메카 워크숍: 보스 러시', '2026-10-12', '2026-11-09', 'QA 진행', 3),
    ('load-project-04', '정글 퍼즐 원정대', '2026-10-19', '2026-11-16', '준비', 4),
    ('load-project-05', '오로라 낚시 클럽', '2026-10-26', '2026-11-23', 'QA 진행', 5),
    ('load-project-06', '우주 화물선 404', '2026-11-02', '2026-11-30', '준비', 6),
    ('load-project-07', '고양이 마법학교', '2026-11-09', '2026-12-07', 'QA 진행', 7)
)
INSERT OR IGNORE INTO projects (id,name,start_date,due_at,owner,status,created_by_id,created_at,updated_at)
SELECT id, name, start_date, due_at, '권윤기', status, 'aaf6a2fc-fd9b-4654-a2ed-c3330c9ba566', start_date || 'T09:00:00.000Z', start_date || 'T09:00:00.000Z'
FROM new_projects;

WITH new_projects(id) AS (
  VALUES ('load-project-01'), ('load-project-02'), ('load-project-03'), ('load-project-04'), ('load-project-05'), ('load-project-06'), ('load-project-07')
), members(user_id, role) AS (
  VALUES
    ('aaf6a2fc-fd9b-4654-a2ed-c3330c9ba566', 'project_admin'),
    ('b6e88d66-d4f3-4ac7-a8e3-590b78c8e9dc', 'qa'),
    ('be7f7d59-b776-4eb1-9271-ef27c39fb10f', 'developer')
)
INSERT OR IGNORE INTO project_members (project_id,user_id,role,added_by_id,created_at)
SELECT new_projects.id, members.user_id, members.role, 'aaf6a2fc-fd9b-4654-a2ed-c3330c9ba566', '2026-09-28T09:00:00.000Z'
FROM new_projects CROSS JOIN members;

WITH RECURSIVE ticket_numbers(number) AS (
  VALUES (1) UNION ALL SELECT number + 1 FROM ticket_numbers WHERE number < 30
), new_projects(id, name, start_date, due_at, sort_order) AS (
  VALUES
    ('load-project-01', '네온 러너: 야간 점검', '2026-09-28', '2026-10-26', 1),
    ('load-project-02', '달빛 푸요 연구소', '2026-10-05', '2026-11-02', 2),
    ('load-project-03', '메카 워크숍: 보스 러시', '2026-10-12', '2026-11-09', 3),
    ('load-project-04', '정글 퍼즐 원정대', '2026-10-19', '2026-11-16', 4),
    ('load-project-05', '오로라 낚시 클럽', '2026-10-26', '2026-11-23', 5),
    ('load-project-06', '우주 화물선 404', '2026-11-02', '2026-11-30', 6),
    ('load-project-07', '고양이 마법학교', '2026-11-09', '2026-12-07', 7)
)
INSERT OR IGNORE INTO tickets (id,title,status,severity,game,project_id,assignee_id,assignee,due_at,environment,frequency,reproduction,content,issue_reason,created_by_id,created_by_name,updated_by_id,updated_by_name,created_at,updated_at)
SELECT
  printf('load-ticket-%02d-%02d', new_projects.sort_order, ticket_numbers.number),
  printf('[%s] %s #%02d', new_projects.name,
    CASE ticket_numbers.number % 6 WHEN 0 THEN '첫 실행 흐름' WHEN 1 THEN '보상 연출' WHEN 2 THEN '설정 저장' WHEN 3 THEN '화면 전환' WHEN 4 THEN '난이도 밸런스' ELSE '기기 호환성' END,
    ticket_numbers.number),
  CASE (new_projects.sort_order + ticket_numbers.number) % 4 WHEN 0 THEN '신규' WHEN 1 THEN '진행' WHEN 2 THEN '완료' ELSE '이슈 아님' END,
  CASE (new_projects.sort_order * 3 + ticket_numbers.number) % 4 WHEN 0 THEN 'Critical' WHEN 1 THEN 'High' WHEN 2 THEN 'Medium' ELSE 'Low' END,
  new_projects.name,
  new_projects.id,
  CASE ((new_projects.sort_order * 3 + ticket_numbers.number * 7) % 10) WHEN 0 THEN 'be7f7d59-b776-4eb1-9271-ef27c39fb10f' WHEN 1 THEN 'b6e88d66-d4f3-4ac7-a8e3-590b78c8e9dc' WHEN 2 THEN 'b6e88d66-d4f3-4ac7-a8e3-590b78c8e9dc' WHEN 3 THEN 'b6e88d66-d4f3-4ac7-a8e3-590b78c8e9dc' WHEN 4 THEN 'b6e88d66-d4f3-4ac7-a8e3-590b78c8e9dc' ELSE 'aaf6a2fc-fd9b-4654-a2ed-c3330c9ba566' END,
  CASE ((new_projects.sort_order * 3 + ticket_numbers.number * 7) % 10) WHEN 0 THEN 'TEST' WHEN 1 THEN '모모' WHEN 2 THEN '모모' WHEN 3 THEN '모모' WHEN 4 THEN '모모' ELSE '권윤기' END,
  date(new_projects.start_date, '+' || ((new_projects.sort_order * 3 + ticket_numbers.number * 5) % 28) || ' days'),
  CASE ticket_numbers.number % 4 WHEN 0 THEN '웹' WHEN 1 THEN 'iOS' WHEN 2 THEN 'Android' ELSE '관리자' END,
  CASE ticket_numbers.number % 4 WHEN 0 THEN '항상' WHEN 1 THEN '자주' WHEN 2 THEN '가끔' ELSE '한 번' END,
  printf('%d회 중 %d회', ticket_numbers.number % 5 + 1, ticket_numbers.number % 5 + 1),
  printf('%s 프로젝트의 자동화 부하 테스트용 QA 항목입니다. %s 시나리오를 확인합니다.', new_projects.name, CASE ticket_numbers.number % 6 WHEN 0 THEN '첫 실행' WHEN 1 THEN '보상' WHEN 2 THEN '설정' WHEN 3 THEN '전환' WHEN 4 THEN '밸런스' ELSE '호환성' END),
  CASE WHEN (new_projects.sort_order + ticket_numbers.number) % 4 = 3 THEN '재현 조건에서 이슈로 판단되지 않았습니다.' ELSE NULL END,
  'aaf6a2fc-fd9b-4654-a2ed-c3330c9ba566', '권윤기', 'aaf6a2fc-fd9b-4654-a2ed-c3330c9ba566', '권윤기',
  new_projects.start_date || 'T09:00:00.000Z', new_projects.start_date || 'T10:00:00.000Z'
FROM new_projects CROSS JOIN ticket_numbers;

INSERT OR IGNORE INTO ticket_history (id,ticket_id,actor_id,actor_name,action,before_json,after_json,created_at)
SELECT 'history-' || id, id, 'aaf6a2fc-fd9b-4654-a2ed-c3330c9ba566', '권윤기', '티켓 생성', NULL,
  json_object('title',title,'status',status,'severity',severity,'project_id',project_id), created_at
FROM tickets WHERE id LIKE 'load-ticket-%';

INSERT OR IGNORE INTO audit_logs (id,actor_id,actor_name,action,target_type,target_id,outcome,reason,ip_address,user_agent,metadata_json,created_at)
SELECT 'audit-' || id, 'aaf6a2fc-fd9b-4654-a2ed-c3330c9ba566', '권윤기', '자동 부하 테스트 티켓 생성', 'ticket', id, 'success', NULL, 'local-seed', 'Codex local seed',
  json_object('project_id',project_id), created_at
FROM tickets WHERE id LIKE 'load-ticket-%';
