-- Local test reset: project/ticket-related records only.
-- Users, sessions, login history, and immutable audit logs are intentionally retained.
BEGIN IMMEDIATE;

DELETE FROM comments;
DELETE FROM attachments;
DELETE FROM ticket_history;
DELETE FROM project_members;
DELETE FROM tickets;
DELETE FROM projects;

WITH projects(id, name, ticket_name, start_date, due_at, owner, status, sequence) AS (
  VALUES
    ('test-project-01', '네온 러너 리로드', 'NRN', '2026-09-29', '2026-10-27', '권윤기', 'QA 진행', 1),
    ('test-project-02', '쿠키 왕국 탐험대', 'CKE', '2026-10-01', '2026-10-29', '모모', '준비', 2),
    ('test-project-03', '오로라 낚시 일지', 'AFL', '2026-10-03', '2026-10-31', 'TEST', '수정 중', 3),
    ('test-project-04', '유령 호텔 매니저', 'GHM', '2026-10-05', '2026-11-02', '권윤기', 'QA 진행', 4),
    ('test-project-05', '별빛 카페 스토리', 'SCS', '2026-10-07', '2026-11-04', '모모', '출시 대기', 5),
    ('test-project-06', '드래곤 우체국', 'DPO', '2026-10-09', '2026-11-06', 'TEST', '준비', 6),
    ('test-project-07', '미니 골프 파티', 'MGP', '2026-10-11', '2026-11-08', '권윤기', 'QA 진행', 7),
    ('test-project-08', '바다 괴물 관찰소', 'SMO', '2026-10-13', '2026-11-10', '모모', '수정 중', 8),
    ('test-project-09', '로봇 공장 디펜스', 'RFD', '2026-10-15', '2026-11-12', 'TEST', '준비', 9),
    ('test-project-10', '마법 학교 방과후', 'MSA', '2026-10-17', '2026-11-14', '권윤기', 'QA 진행', 10)
)
INSERT INTO projects (id, name, ticket_name, start_date, due_at, owner, status, created_by_id, created_at, updated_at)
SELECT id, name, ticket_name, start_date, due_at, owner, status,
  'aaf6a2fc-fd9b-4654-a2ed-c3330c9ba566', start_date || 'T09:00:00.000Z', start_date || 'T09:00:00.000Z'
FROM projects;

WITH project_users(project_id, user_id, role) AS (
  SELECT id, 'aaf6a2fc-fd9b-4654-a2ed-c3330c9ba566', 'project_admin' FROM projects
  UNION ALL SELECT id, 'b6e88d66-d4f3-4ac7-a8e3-590b78c8e9dc', 'qa' FROM projects
  UNION ALL SELECT id, 'be7f7d59-b776-4eb1-9271-ef27c39fb10f', 'developer' FROM projects
)
INSERT INTO project_members (project_id, user_id, role, added_by_id, created_at)
SELECT project_id, user_id, role, 'aaf6a2fc-fd9b-4654-a2ed-c3330c9ba566', '2026-09-29T09:00:00.000Z'
FROM project_users;

WITH RECURSIVE numbers(number) AS (
  SELECT 1 UNION ALL SELECT number + 1 FROM numbers WHERE number < 10
), project_data(id, name, ticket_name, start_date, due_at, sequence, ticket_count) AS (
  SELECT id, name, ticket_name, start_date, due_at,
    CASE id
      WHEN 'test-project-01' THEN 1 WHEN 'test-project-02' THEN 2 WHEN 'test-project-03' THEN 3
      WHEN 'test-project-04' THEN 4 WHEN 'test-project-05' THEN 5 WHEN 'test-project-06' THEN 6
      WHEN 'test-project-07' THEN 7 WHEN 'test-project-08' THEN 8 WHEN 'test-project-09' THEN 9 ELSE 10
    END,
    CASE id
      WHEN 'test-project-01' THEN 5 WHEN 'test-project-02' THEN 6 WHEN 'test-project-03' THEN 7
      WHEN 'test-project-04' THEN 8 WHEN 'test-project-05' THEN 9 WHEN 'test-project-06' THEN 10
      WHEN 'test-project-07' THEN 5 WHEN 'test-project-08' THEN 6 WHEN 'test-project-09' THEN 7 ELSE 8
    END
  FROM projects
)
INSERT INTO tickets (
  id, title, status, severity, game, project_id, ticket_number,
  assignee_id, assignee, due_at, environment, frequency, reproduction, content,
  created_by_id, created_by_name, updated_by_id, updated_by_name, created_at, updated_at
)
SELECT
  printf('test-ticket-%02d-%02d', project_data.sequence, numbers.number),
  printf('[%s] %s', project_data.ticket_name,
    CASE (project_data.sequence * 7 + numbers.number) % 10
      WHEN 0 THEN '첫 실행 보상 지급 확인'
      WHEN 1 THEN '앱 재진입 후 저장 상태 확인'
      WHEN 2 THEN '튜토리얼 다음 단계 전환 확인'
      WHEN 3 THEN '상점 상품 가격 노출 확인'
      WHEN 4 THEN '배경음 설정 저장 확인'
      WHEN 5 THEN '푸시 동의 팝업 동작 확인'
      WHEN 6 THEN '로딩 화면 진행률 확인'
      WHEN 7 THEN '업적 보상 수령 확인'
      WHEN 8 THEN '네트워크 재연결 안내 확인'
      ELSE '랭킹 화면 갱신 확인'
    END),
  CASE (project_data.sequence + numbers.number) % 4
    WHEN 0 THEN '신규' WHEN 1 THEN '진행' WHEN 2 THEN '완료' ELSE '이슈 아님' END,
  CASE (project_data.sequence * 3 + numbers.number) % 4
    WHEN 0 THEN 'Critical' WHEN 1 THEN 'High' WHEN 2 THEN 'Medium' ELSE 'Low' END,
  project_data.name, project_data.id, numbers.number,
  CASE (project_data.sequence + numbers.number * 2) % 3
    WHEN 0 THEN 'aaf6a2fc-fd9b-4654-a2ed-c3330c9ba566'
    WHEN 1 THEN 'b6e88d66-d4f3-4ac7-a8e3-590b78c8e9dc'
    ELSE 'be7f7d59-b776-4eb1-9271-ef27c39fb10f' END,
  CASE (project_data.sequence + numbers.number * 2) % 3
    WHEN 0 THEN '권윤기' WHEN 1 THEN '모모' ELSE 'TEST' END,
  date(project_data.start_date, '+' || ((project_data.sequence * 2 + numbers.number * 3) % 29) || ' days'),
  CASE numbers.number % 4 WHEN 0 THEN 'Android 14 · Galaxy S24' WHEN 1 THEN 'iOS 18 · iPhone 16' WHEN 2 THEN 'Chrome · Windows 11' ELSE '관리자 웹 · Chrome' END,
  CASE numbers.number % 4 WHEN 0 THEN '항상' WHEN 1 THEN '자주' WHEN 2 THEN '가끔' ELSE '한 번' END,
  printf('%d회 중 %d회', 5 + (numbers.number % 4), 1 + ((project_data.sequence + numbers.number) % 5)),
  printf('%s 프로젝트의 자동 테스트 티켓입니다. 재현 절차와 화면 동작을 확인합니다.', project_data.name),
  CASE (project_data.sequence + numbers.number) % 3
    WHEN 0 THEN 'aaf6a2fc-fd9b-4654-a2ed-c3330c9ba566'
    WHEN 1 THEN 'b6e88d66-d4f3-4ac7-a8e3-590b78c8e9dc'
    ELSE 'be7f7d59-b776-4eb1-9271-ef27c39fb10f' END,
  CASE (project_data.sequence + numbers.number) % 3
    WHEN 0 THEN '권윤기' WHEN 1 THEN '모모' ELSE 'TEST' END,
  'aaf6a2fc-fd9b-4654-a2ed-c3330c9ba566', '권윤기',
  project_data.start_date || 'T09:00:00.000Z',
  date(project_data.start_date, '+' || ((project_data.sequence + numbers.number) % 8) || ' days') || 'T13:30:00.000Z'
FROM project_data CROSS JOIN numbers
WHERE numbers.number <= project_data.ticket_count;

COMMIT;
