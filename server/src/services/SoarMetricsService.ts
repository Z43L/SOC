// Simple Prometheus metrics implementation for SOAR
// In a real implementation, you would use the 'prom-client' library

export interface MetricLabels {
  [key: string]: string;
}

export interface SoarMetrics {
  // Counter metrics
  soar_runs_total: number;
  soar_step_failures_total: number;
  soar_action_executions_total: number;
  
  // Histogram/Summary metrics
  soar_run_duration_seconds: number[];
  soar_step_duration_seconds: number[];
  
  // Gauge metrics
  soar_active_executions: number;
  soar_queued_jobs: number;
}

class PrometheusMetricsService {
  private metrics: SoarMetrics = {
    soar_runs_total: 0,
    soar_step_failures_total: 0,
    soar_action_executions_total: 0,
    soar_run_duration_seconds: [],
    soar_step_duration_seconds: [],
    soar_active_executions: 0,
    soar_queued_jobs: 0,
  };

  private labels: Record<string, MetricLabels> = {};

  // Increment counter metrics
  incrementCounter(metricName: keyof SoarMetrics, labels: MetricLabels = {}): void {
    if (typeof this.metrics[metricName] === 'number') {
      (this.metrics[metricName] as number)++;
      this.recordLabels(metricName, labels);
    }
  }

  // Record histogram/summary values
  recordHistogram(metricName: keyof SoarMetrics, value: number, labels: MetricLabels = {}): void {
    if (Array.isArray(this.metrics[metricName])) {
      (this.metrics[metricName] as number[]).push(value);
      // Keep only last 1000 values for memory efficiency
      if ((this.metrics[metricName] as number[]).length > 1000) {
        (this.metrics[metricName] as number[]).shift();
      }
      this.recordLabels(metricName, labels);
    }
  }

  // Set gauge values
  setGauge(metricName: keyof SoarMetrics, value: number, labels: MetricLabels = {}): void {
    if (typeof this.metrics[metricName] === 'number') {
      (this.metrics[metricName] as number) = value;
      this.recordLabels(metricName, labels);
    }
  }

  // Record labels for metrics
  private recordLabels(metricName: keyof SoarMetrics, labels: MetricLabels): void {
    if (!this.labels[metricName]) {
      this.labels[metricName] = {};
    }
    Object.assign(this.labels[metricName], labels);
  }

  // Get current metrics in Prometheus format
  getPrometheusMetrics(): string {
    const lines: string[] = [];

    // Counter metrics
    lines.push('# HELP soar_runs_total Total number of SOAR playbook executions');
    lines.push('# TYPE soar_runs_total counter');
    lines.push(`soar_runs_total ${this.metrics.soar_runs_total}`);

    lines.push('# HELP soar_step_failures_total Total number of failed SOAR steps');
    lines.push('# TYPE soar_step_failures_total counter');
    lines.push(`soar_step_failures_total ${this.metrics.soar_step_failures_total}`);

    lines.push('# HELP soar_action_executions_total Total number of action executions');
    lines.push('# TYPE soar_action_executions_total counter');
    lines.push(`soar_action_executions_total ${this.metrics.soar_action_executions_total}`);

    // Histogram metrics
    lines.push('# HELP soar_run_duration_seconds Duration of SOAR playbook executions');
    lines.push('# TYPE soar_run_duration_seconds histogram');
    const runDurations = this.metrics.soar_run_duration_seconds;
    if (runDurations.length > 0) {
      const buckets = this.calculateHistogramBuckets(runDurations);
      for (const [bucket, count] of Object.entries(buckets)) {
        lines.push(`soar_run_duration_seconds_bucket{le="${bucket}"} ${count}`);
      }
      lines.push(`soar_run_duration_seconds_count ${runDurations.length}`);
      lines.push(`soar_run_duration_seconds_sum ${runDurations.reduce((a, b) => a + b, 0)}`);
    }

    lines.push('# HELP soar_step_duration_seconds Duration of individual SOAR steps');
    lines.push('# TYPE soar_step_duration_seconds histogram');
    const stepDurations = this.metrics.soar_step_duration_seconds;
    if (stepDurations.length > 0) {
      const buckets = this.calculateHistogramBuckets(stepDurations);
      for (const [bucket, count] of Object.entries(buckets)) {
        lines.push(`soar_step_duration_seconds_bucket{le="${bucket}"} ${count}`);
      }
      lines.push(`soar_step_duration_seconds_count ${stepDurations.length}`);
      lines.push(`soar_step_duration_seconds_sum ${stepDurations.reduce((a, b) => a + b, 0)}`);
    }

    // Gauge metrics
    lines.push('# HELP soar_active_executions Number of currently active SOAR executions');
    lines.push('# TYPE soar_active_executions gauge');
    lines.push(`soar_active_executions ${this.metrics.soar_active_executions}`);

    lines.push('# HELP soar_queued_jobs Number of SOAR jobs in queue');
    lines.push('# TYPE soar_queued_jobs gauge');
    lines.push(`soar_queued_jobs ${this.metrics.soar_queued_jobs}`);

    return lines.join('\n') + '\n';
  }

  // Calculate histogram buckets
  private calculateHistogramBuckets(values: number[]): Record<string, number> {
    const buckets = ['0.1', '0.5', '1', '5', '10', '30', '60', '300', '+Inf'];
    const result: Record<string, number> = {};
    
    for (const bucket of buckets) {
      const threshold = bucket === '+Inf' ? Infinity : parseFloat(bucket);
      result[bucket] = values.filter(v => v <= threshold).length;
    }
    
    return result;
  }

  // Get metrics as JSON
  getMetricsJSON(): any {
    return {
      counters: {
        soar_runs_total: this.metrics.soar_runs_total,
        soar_step_failures_total: this.metrics.soar_step_failures_total,
        soar_action_executions_total: this.metrics.soar_action_executions_total,
      },
      histograms: {
        soar_run_duration_seconds: {
          count: this.metrics.soar_run_duration_seconds.length,
          sum: this.metrics.soar_run_duration_seconds.reduce((a, b) => a + b, 0),
          avg: this.metrics.soar_run_duration_seconds.length > 0 
            ? this.metrics.soar_run_duration_seconds.reduce((a, b) => a + b, 0) / this.metrics.soar_run_duration_seconds.length 
            : 0,
        },
        soar_step_duration_seconds: {
          count: this.metrics.soar_step_duration_seconds.length,
          sum: this.metrics.soar_step_duration_seconds.reduce((a, b) => a + b, 0),
          avg: this.metrics.soar_step_duration_seconds.length > 0 
            ? this.metrics.soar_step_duration_seconds.reduce((a, b) => a + b, 0) / this.metrics.soar_step_duration_seconds.length 
            : 0,
        },
      },
      gauges: {
        soar_active_executions: this.metrics.soar_active_executions,
        soar_queued_jobs: this.metrics.soar_queued_jobs,
      },
      labels: this.labels,
    };
  }

  // Calculate failure rate for alerting
  getFailureRate(windowMinutes: number = 60): number {
    // In a real implementation, this would query time-series data
    // For now, return a simple calculation
    const totalRuns = this.metrics.soar_runs_total;
    const failures = this.metrics.soar_step_failures_total;
    
    if (totalRuns === 0) return 0;
    return (failures / totalRuns) * 100;
  }

  // Check if failure rate exceeds threshold for alerting
  shouldAlert(thresholdPercent: number = 30, windowMinutes: number = 60): boolean {
    const failureRate = this.getFailureRate(windowMinutes);
    return failureRate > thresholdPercent;
  }

  // Reset metrics (for testing or periodic cleanup)
  reset(): void {
    this.metrics = {
      soar_runs_total: 0,
      soar_step_failures_total: 0,
      soar_action_executions_total: 0,
      soar_run_duration_seconds: [],
      soar_step_duration_seconds: [],
      soar_active_executions: 0,
      soar_queued_jobs: 0,
    };
    this.labels = {};
  }

  // Helper methods for common metric patterns
  recordPlaybookStart(playbookId: string, organizationId: string): void {
    this.incrementCounter('soar_runs_total', { 
      playbook_id: playbookId, 
      organization_id: organizationId 
    });
    this.setGauge('soar_active_executions', this.metrics.soar_active_executions + 1);
  }

  recordPlaybookEnd(playbookId: string, organizationId: string, durationSeconds: number, success: boolean): void {
    this.recordHistogram('soar_run_duration_seconds', durationSeconds, {
      playbook_id: playbookId,
      organization_id: organizationId,
      status: success ? 'success' : 'failure',
    });
    this.setGauge('soar_active_executions', Math.max(0, this.metrics.soar_active_executions - 1));
  }

  recordStepFailure(actionName: string, playbookId: string, organizationId: string): void {
    this.incrementCounter('soar_step_failures_total', {
      action_name: actionName,
      playbook_id: playbookId,
      organization_id: organizationId,
    });
  }

  recordActionExecution(actionName: string, durationSeconds: number, success: boolean): void {
    this.incrementCounter('soar_action_executions_total', {
      action_name: actionName,
      status: success ? 'success' : 'failure',
    });
    this.recordHistogram('soar_step_duration_seconds', durationSeconds, {
      action_name: actionName,
      status: success ? 'success' : 'failure',
    });
  }
}

// Singleton instance
export const soarMetrics = new PrometheusMetricsService();

// Express middleware to expose metrics endpoint
export function metricsHandler(req: any, res: any): void {
  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.send(soarMetrics.getPrometheusMetrics());
}

// Express handler for JSON metrics
export function metricsJsonHandler(req: any, res: any): void {
  res.json(soarMetrics.getMetricsJSON());
}