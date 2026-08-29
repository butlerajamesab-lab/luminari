
-- Enable vector extension for semantic search
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- LUMINARI — MIGRATION 007
-- Knowledge Backbone: Document storage with vector search
-- All platform files live here. Searchable. Permanent.
-- ============================================================

CREATE TABLE knowledge_documents (
  id              BIGSERIAL PRIMARY KEY,
  
  -- File identity
  filename        VARCHAR(512) NOT NULL,
  file_type       VARCHAR(32) NOT NULL,  -- pdf, ts, md, jsx, docx, sql, txt
  file_size       BIGINT,
  sha256_hash     VARCHAR(64),           -- deduplication
  
  -- Classification
  category        TEXT NOT NULL CHECK (category IN (
    'schema',
    'router',
    'engine',
    'spec',
    'blueprint',
    'migration',
    'seed',
    'ui_component',
    'knowledge_backbone',
    'policy',
    'legal',
    'research',
    'architecture',
    'test',
    'config',
    'other'
  )),
  
  -- Content
  raw_content     TEXT,                  -- full text content
  summary         TEXT,                  -- brief description of what this file does
  
  -- Vector embedding for semantic search (1536 dims for OpenAI, 768 for others)
  embedding       vector(1536),
  
  -- Full text search
  search_vector   TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(filename, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(raw_content, ''))
  ) STORED,
  
  -- Metadata
  tags            TEXT[],
  source_thread   VARCHAR(256),          -- which Claude thread it came from
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  
  created_at      BIGINT NOT NULL DEFAULT 0,
  updated_at      BIGINT NOT NULL DEFAULT 0
);

-- Indexes
CREATE INDEX idx_kd_category    ON knowledge_documents(category);
CREATE INDEX idx_kd_file_type   ON knowledge_documents(file_type);
CREATE INDEX idx_kd_hash        ON knowledge_documents(sha256_hash);
CREATE INDEX idx_kd_search      ON knowledge_documents USING GIN(search_vector);
CREATE INDEX idx_kd_tags        ON knowledge_documents USING GIN(tags);

-- Vector similarity search index (for semantic search)
CREATE INDEX idx_kd_embedding ON knowledge_documents 
  USING ivfflat (embedding vector_cosine_ops) 
  WITH (lists = 100);

-- Upload sessions — track bulk upload progress
CREATE TABLE knowledge_upload_sessions (
  id              BIGSERIAL PRIMARY KEY,
  session_name    VARCHAR(256),
  total_files     INT NOT NULL DEFAULT 0,
  processed_files INT NOT NULL DEFAULT 0,
  failed_files    INT NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'processing', 'complete', 'failed'
  )),
  created_at      BIGINT NOT NULL DEFAULT 0,
  completed_at    BIGINT
);
