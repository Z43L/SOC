import { ConnectorManager } from "./ConnectorManager";
import AgentConnector from "./agent/AgentConnector";
import ApiConnector from "./api/ApiConnector";
import SyslogConnector from "./syslog/SyslogConnector";
import { connectors as connectorsTable } from "@shared/schema";
import { db } from "../../db";
/**
 * Initialize and start all connectors based on DB configurations
 */
export async function initConnectors() {
    const configs = await db.select().from(connectorsTable);
    const manager = new ConnectorManager();
    for (const cfg of configs) {
        let instance;
        switch (cfg.type.toLowerCase()) {
            case 'agent':
                instance = new AgentConnector();
                break;
            case 'api':
                instance = new ApiConnector();
                break;
            case 'syslog':
                instance = new SyslogConnector();
                break;
            default:
                console.warn(`Unknown connector type: ${cfg.type}`);
                continue;
        }
        manager.register(instance);
        try {
            await instance.init(cfg.configuration || {});
        }
        catch (err) {
            console.error(`Failed to init connector ${cfg.name}`, err);
            continue;
        }
    }
    // start all registered connectors
    await manager.startAll();
    return manager;
}
