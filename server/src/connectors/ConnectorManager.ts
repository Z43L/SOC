import { IConnector } from "./IConnector";

/**
 * Manages multiple connectors: registration, initialization, start/stop lifecycle.
 */
export class ConnectorManager {
  private connectors: IConnector<any>[] = [];

  /** Register a new connector instance */
  register(connector: IConnector<any>) {
    this.connectors.push(connector);
  }

  /** Initialize all connectors with their configs */
  async initializeAll(configs: Record<string, any>) {
    for (const connector of this.connectors) {
      const key = (connector as any).name || connector.constructor.name;
      const cfg = configs[key] || {};
      await connector.init(cfg);
    }
  }

  /** Start all connectors */
  async startAll() {
    for (const connector of this.connectors) {
      await connector.start();
    }
  }

  /** Stop all connectors */
  async stopAll() {
    for (const connector of this.connectors) {
      await connector.stop();
    }
  }
}
