-- Keep local Summary graph fixtures on the current day.
-- Initial creation is not treated as a later modification.
WITH fixture_projects AS (
  SELECT DISTINCT project_id FROM tickets WHERE id LIKE 'report-qa-%'
), numbered_projects AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS position FROM fixture_projects
)
UPDATE projects
SET created_at = (
  SELECT datetime(date('now', '-' || (11 - position) || ' days'), '+09:00')
  FROM numbered_projects
  WHERE numbered_projects.id = projects.id
)
WHERE id IN (SELECT id FROM numbered_projects);

WITH fixture_tickets AS (SELECT id FROM tickets WHERE id LIKE 'report-qa-%')
UPDATE tickets
SET
  created_at = datetime('now', '+09:00'),
  updated_at = datetime('now', '+09:00')
WHERE id IN (SELECT id FROM fixture_tickets);
