import Cron from 'node-cron';
import axios from 'axios';
import { OAuthClient } from './OAuthClient';
import { EventService } from '../../services/eventService';
export default class ApiConnector {
    name = 'API';
    oauth;
    config;
    task = null;
    eventService = new EventService();
    async init(config) {
        this.config = config;
        this.oauth = new OAuthClient(config);
    }
    async start() {
        const interval = this.config.pollInterval || '*/5 * * * *';
        this.task = Cron.schedule(interval, () => this.poll(), { scheduled: true });
        console.log(`ApiConnector polling ${this.config.endpoint} @ ${interval}`);
    }
    async stop() {
        this.task?.stop();
    }
    async poll() {
        try {
            const { accessToken } = await this.oauth.fetchToken();
            const res = await axios.get(this.config.endpoint, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const rawData = res.data;
            // dynamic mapper
            const mapper = new Function('data', this.config.mapperCode);
            const events = await Promise.resolve(mapper(rawData));
            for (const ev of events) {
                await this.eventService.create(ev);
            }
        }
        catch (err) {
            console.error('API poll error', err.message || err);
            // TODO: log to connector_errors table
        }
    }
    async process(rawEvent) {
        // not used for API connector as poll() handles full flow
        return [];
    }
}
