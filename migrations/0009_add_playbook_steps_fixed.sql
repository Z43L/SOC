-- Create Playbook Steps table and migrate existing JSON steps to rows
BEGIN;

-- Create playbook_steps table
CREATE TABLE IF NOT EXISTS playbook_steps (
  id SERIAL PRIMARY KEY,
  playbook_id INTEGER NOT NULL REFERENCES playbooks(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  step_key TEXT NOT NULL,
  action_id INTEGER NOT NULL REFERENCES actions(id),
  condition TEXT,
  inputs JSONB NOT NULL,
  on_error TEXT NOT NULL DEFAULT 'abort',
  timeout_ms INTEGER
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_playbook_steps_playbook_id ON playbook_steps(playbook_id);
CREATE INDEX IF NOT EXISTS idx_playbook_steps_sequence ON playbook_steps(playbook_id, sequence);

-- Migrate existing JSON steps into playbook_steps rows
-- Note: This assumes that JSON objects in playbooks.definition have keys: id (step_key), uses (action name), if (condition), with (inputs), onError, timeout
INSERT INTO playbook_steps(playbook_id, sequence, step_key, action_id, condition, inputs, on_error, timeout_ms)
SELECT
  p.id AS playbook_id,
  elem.idx AS sequence,
  (elem.value->>'id') AS step_key,
  a.id AS action_id,
  (elem.value->>'if') AS condition,
  COALESCE(elem.value->'with', '{}'::jsonb) AS inputs,
  COALESCE(elem.value->>'onError','abort') AS on_error,
  (elem.value->>'timeout')::integer AS timeout_ms
FROM playbooks p,
LATERAL jsonb_array_elements(p.definition->'steps') WITH ORDINALITY AS elem(value, idx)
LEFT JOIN actions a ON a.name = elem.value->>'uses'
WHERE p.definition ? 'steps' AND jsonb_typeof(p.definition->'steps') = 'array';

COMMIT;
