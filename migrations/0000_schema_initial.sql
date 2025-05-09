-- Initial schema creation

-- Users
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  role VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP WITH TIME ZONE
);

-- Alerts
CREATE TABLE IF NOT EXISTS alerts (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  severity VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL,
  source VARCHAR(255) NOT NULL,
  source_ip VARCHAR(255),
  destination_ip VARCHAR(255),
  assigned_to INTEGER REFERENCES users(id),
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB
);

-- Incidents
CREATE TABLE IF NOT EXISTS incidents (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  severity VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL,
  assigned_to INTEGER REFERENCES users(id),
  related_alerts JSONB,
  timeline JSONB,
  ai_analysis JSONB,
  mitre_tactics JSONB,
  evidence JSONB,
  playbooks JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  closed_at TIMESTAMP WITH TIME ZONE
);

-- Threat Intelligence
CREATE TABLE IF NOT EXISTS threat_intel (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  type VARCHAR(100) NOT NULL,
  severity VARCHAR(50) NOT NULL,
  source VARCHAR(255) NOT NULL,
  confidence INTEGER,
  iocs JSONB,
  relevance VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP WITH TIME ZONE
);

-- AI Insights
CREATE TABLE IF NOT EXISTS ai_insights (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  type VARCHAR(100) NOT NULL,
  severity VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL,
  confidence INTEGER NOT NULL,
  related_entities JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Metrics
CREATE TABLE IF NOT EXISTS metrics (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  value INTEGER NOT NULL,
  trend VARCHAR(50),
  change_percentage INTEGER,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Sessions table for Connect-PG-Simple
CREATE TABLE IF NOT EXISTS "session" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");

-- Connectors
CREATE TABLE IF NOT EXISTS connectors (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  vendor VARCHAR(255) NOT NULL,
  type VARCHAR(100) NOT NULL,
  data_volume VARCHAR(100),
  status VARCHAR(50) NOT NULL DEFAULT 'inactive',
  last_data VARCHAR(100),
  is_active BOOLEAN NOT NULL DEFAULT false,
  icon VARCHAR(50) DEFAULT 'plug',
  configuration JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_successful_connection TIMESTAMP WITH TIME ZONE
);
