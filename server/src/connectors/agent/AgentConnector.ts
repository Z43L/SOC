import { IConnector } from "../IConnector";
import { NormalizedEvent } from "../../shared/types";
import path from "path";
import jwt from "jsonwebtoken";
import sqlite3 from "sqlite3";
import { open, Database } from "sqlite";
import { loadPackageDefinition } from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface AgentConfig {
  port: number;
  jwtSecret: string;
  bufferFile?: string;
}

export default class AgentConnector implements IConnector<AgentConfig> {
  name = "Agent";
  private server: any;
  private db!: Database<sqlite3.Database, sqlite3.Statement>;
  private config!: AgentConfig;

  async init(config: AgentConfig): Promise<void> {
    this.config = config;
    const dbPath = config.bufferFile || path.resolve(process.cwd(), "agent-buffer.sqlite");
    this.db = await open({ filename: dbPath, driver: sqlite3.Database });
    await this.db.exec(`CREATE TABLE IF NOT EXISTS buffer (event TEXT)`);
  }

  async start(): Promise<void> {
    const protoPath = path.resolve(__dirname, "agent.proto");
    const packageDef = protoLoader.loadSync(protoPath, { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true });
    const grpcObj = loadPackageDefinition(packageDef) as any;
    this.server = new grpcObj.agent.AgentService();
    // TODO: implement gRPC server logic, streaming handler, JWT verification, buffering
    console.log(`AgentConnector listening on port ${this.config.port}`);
  }

  async stop(): Promise<void> {
    if (this.server) {
      this.server.forceShutdown();
    }
    await this.db.close();
  }

  async process(rawEvent: any): Promise<NormalizedEvent[]> {
    // Verify schema, enrich with metadata
    const payload = rawEvent.payload || {};
    const event: NormalizedEvent = {
      id: rawEvent.id || crypto.randomUUID(),
      agentId: rawEvent.agentId,
      severity: rawEvent.severity || 'info',
      category: rawEvent.category || 'agent.event',
      engine: this.name,
      timestamp: Date.now(),
      ...payload,
    };
    return [event];
  }
}
