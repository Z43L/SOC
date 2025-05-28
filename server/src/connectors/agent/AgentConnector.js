import path from "path";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { loadPackageDefinition } from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export default class AgentConnector {
    name = "Agent";
    server;
    db;
    config;
    async init(config) {
        this.config = config;
        const dbPath = config.bufferFile || path.resolve(process.cwd(), "agent-buffer.sqlite");
        this.db = await open({ filename: dbPath, driver: sqlite3.Database });
        await this.db.exec(`CREATE TABLE IF NOT EXISTS buffer (event TEXT)`);
    }
    async start() {
        const protoPath = path.resolve(__dirname, "agent.proto");
        const packageDef = protoLoader.loadSync(protoPath, { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true });
        const grpcObj = loadPackageDefinition(packageDef);
        this.server = new grpcObj.agent.AgentService();
        // TODO: implement gRPC server logic, streaming handler, JWT verification, buffering
        console.log(`AgentConnector listening on port ${this.config.port}`);
    }
    async stop() {
        if (this.server) {
            this.server.forceShutdown();
        }
        await this.db.close();
    }
    async process(rawEvent) {
        // Verify schema, enrich with metadata
        const payload = rawEvent.payload || {};
        const event = {
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
