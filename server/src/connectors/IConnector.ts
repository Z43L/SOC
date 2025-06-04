// Defines the common connector interface for all data sources
import { NormalizedEvent } from "../../shared/types";

export interface IConnector<Config = any> {
  /** Initialize connector with specific configuration (credentials, queues, etc.) */
  init(config: Config): Promise<void>;

  /** Start listening or polling for raw events */
  start(): Promise<void>;

  /** Stop all active streams, cron jobs, sockets, etc. */
  stop(): Promise<void>;

  /** Process a raw event into one or more normalized SOC events */
  process(rawEvent: any): Promise<NormalizedEvent[]>;
}
