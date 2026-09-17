ALTER TABLE tickets ADD COLUMN game TEXT;
CREATE INDEX IF NOT EXISTS idx_tickets_game ON tickets(game);
