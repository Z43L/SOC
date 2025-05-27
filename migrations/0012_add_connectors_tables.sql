-- 0012_add_connectors_tables.sql
-- Tabla de conectores y registros de logs de conectores

-- Creación de la tabla de conectores principales
CREATE TABLE IF NOT EXISTS connectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  type connector_type NOT NULL,
  subtype VARCHAR(100),
  config JSONB NOT NULL,
  encrypted_secrets JSONB,
  status connector_status NOT NULL DEFAULT 'active',
  last_event_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  events_per_min NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Enum para tipo de conector
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'connector_type') THEN
    CREATE TYPE connector_type AS ENUM ('syslog', 'api', 'webhook', 'file');
  END IF;
END$$;

-- Enum para estado de conector
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'connector_status') THEN
    CREATE TYPE connector_status AS ENUM ('active', 'paused', 'error', 'disabled');
  END IF;
END$$;

-- Tabla de logs de eventos de conectores, particionada por semana con pg_partman
CREATE TABLE IF NOT EXISTS connector_logs (
  id BIGSERIAL PRIMARY KEY,
  connector_id UUID NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
  ts TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  level VARCHAR(10) NOT NULL,
  message TEXT NOT NULL
) PARTITION BY RANGE (ts);

-- pg_partman: esquema y configuración de particiones semanales
-- Asumiendo que pg_partman está instalado y configurado en esquema partman
SELECT partman.create_parent(
  p_parent_table => 'public.connector_logs',
  p_control => 'ts',
  p_type => 'native',
  p_interval => 'weekly',
  p_premake => 1,
  p_start_partition => NULL,
  p_constraint_cols => 'connector_id'
);
