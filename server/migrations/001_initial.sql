CREATE TABLE documents (
  id uuid PRIMARY KEY,
  sha256 text NOT NULL UNIQUE,
  filename text NOT NULL,
  storage_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE extraction_runs (
  id uuid PRIMARY KEY,
  document_id uuid NOT NULL REFERENCES documents(id),
  version text NOT NULL,
  model text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','queued','processing','completed','needs_review','failed')),
  attempts integer NOT NULL DEFAULT 0,
  result jsonb,
  quality jsonb,
  pages jsonb NOT NULL DEFAULT '[]',
  error text,
  duration_ms integer,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(document_id, version, model)
);
CREATE INDEX extraction_runs_dispatch ON extraction_runs(status, updated_at);
CREATE INDEX extraction_runs_document ON extraction_runs(document_id, created_at DESC);
CREATE INDEX extraction_runs_customer ON extraction_runs ((result->'customer'->>'value'));
CREATE TABLE kpis (
  run_id uuid NOT NULL REFERENCES extraction_runs(id) ON DELETE CASCADE,
  position integer NOT NULL,
  name text,
  status text NOT NULL,
  observations jsonb NOT NULL,
  PRIMARY KEY(run_id, position)
);
CREATE TABLE action_items (
  run_id uuid NOT NULL REFERENCES extraction_runs(id) ON DELETE CASCADE,
  position integer NOT NULL,
  description text,
  owner text,
  due_date text,
  normalized_due_date text,
  details jsonb NOT NULL,
  PRIMARY KEY(run_id, position)
);
