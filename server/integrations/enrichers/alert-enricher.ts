import { Alert } from '@shared/schema';

export type AlertRecord = Alert & {
  id: number;
};

export interface Enrich {
  provider: string;
  data: any;
  severity?: number;
}

export interface AlertEnricher {
  /** Unique enricher ID, e.g. 'virustotal' */
  id: string;
  /** Determine if this enricher should process the alert */
  supports(alert: AlertRecord): boolean;
  /** Enrich the alert and return zero or more Enrich objects */
  enrich(alert: AlertRecord): Promise<Enrich[]>;
}
