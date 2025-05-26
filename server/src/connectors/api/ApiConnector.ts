import { IConnector } from "../IConnector";
import { NormalizedEvent } from "../../shared/types";
import Cron from 'node-cron';
import axios from 'axios';
import { OAuthClient } from './OAuthClient';
import { EventService } from '../../services/eventService';

export interface ApiConfig {
  clientId: string;
  clientSecret: string;
  tokenUrl: string;
  scopes: string[];
  orgSecretKey: string;
  pollInterval: string; // cron expression
  endpoint: string;
  mapperCode: string; // JS code: (data)=>NormalizedEvent[]
}

export default class ApiConnector implements IConnector<ApiConfig> {
  name = 'API';
  private oauth!: OAuthClient;
  private config!: ApiConfig;
  private task: Cron.ScheduledTask | null = null;
  private eventService = new EventService();

  async init(config: ApiConfig): Promise<void> {
    this.config = config;
    this.oauth = new OAuthClient(config);
  }

  async start(): Promise<void> {
    const interval = this.config.pollInterval || '*/5 * * * *';
    this.task = Cron.schedule(interval, () => this.poll(), { scheduled: true });
    console.log(`ApiConnector polling ${this.config.endpoint} @ ${interval}`);
  }

  async stop(): Promise<void> {
    this.task?.stop();
  }

  private async poll() {
    try {
      const { accessToken } = await this.oauth.fetchToken();
      const res = await axios.get(this.config.endpoint, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const rawData = res.data;
      // dynamic mapper
      const mapper = new Function('data', this.config.mapperCode) as (data: any)=>NormalizedEvent[];
      const events = await Promise.resolve(mapper(rawData));
      for (const ev of events) {
        await this.eventService.create(ev);
      }
    } catch (err: any) {
      console.error('API poll error', err.message || err);
      // TODO: log to connector_errors table
    }
  }

  async process(rawEvent: any): Promise<NormalizedEvent[]> {
    // not used for API connector as poll() handles full flow
    return [];
  }
}
