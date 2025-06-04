import { useQuery } from '@tanstack/react-query';

interface TimeSeriesParams {
  metric: string;
  period: 'hour' | 'day' | 'week' | 'month';
  from: string;
  to: string;
}

interface TopNParams {
  metric: string;
  limit?: number;
  from: string;
  to: string;
}

interface TimeSeriesDataPoint {
  tsBucket: string;
  value: Record<string, number>;
}

interface TopNDataPoint {
  name: string;
  value: number;
  tactic?: string;
  count?: number;
}

const API_BASE = '/api/analytics';

async function fetchTimeSeries(params: TimeSeriesParams): Promise<TimeSeriesDataPoint[]> {
  const searchParams = new URLSearchParams({
    metric: params.metric,
    period: params.period,
    from: params.from,
    to: params.to,
  });
  
  const response = await fetch(`${API_BASE}/timeseries?${searchParams}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch time series data: ${response.statusText}`);
  }
  
  return response.json();
}

async function fetchTopN(params: TopNParams): Promise<TopNDataPoint[]> {
  const searchParams = new URLSearchParams({
    metric: params.metric,
    from: params.from,
    to: params.to,
  });
  
  if (params.limit) {
    searchParams.append('limit', params.limit.toString());
  }
  
  const response = await fetch(`${API_BASE}/top?${searchParams}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch top N data: ${response.statusText}`);
  }
  
  return response.json();
}

export function useTimeSeries(params: TimeSeriesParams) {
  return useQuery({
    queryKey: ['analytics', 'timeseries', params],
    queryFn: () => fetchTimeSeries(params),
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
    staleTime: 2 * 60 * 1000, // Consider data stale after 2 minutes
  });
}

export function useTopN(params: TopNParams) {
  return useQuery({
    queryKey: ['analytics', 'topn', params],
    queryFn: () => fetchTopN(params),
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
    staleTime: 2 * 60 * 1000, // Consider data stale after 2 minutes
  });
}

// Hook for fetching performance metrics (MTTD, MTTR, etc.)
export function usePerformanceMetrics(params: { from: string; to: string }) {
  return useQuery({
    queryKey: ['analytics', 'performance', params],
    queryFn: async () => {
      const mttdPromise = fetchTimeSeries({
        metric: 'mttd',
        period: 'day',
        from: params.from,
        to: params.to,
      });
      
      const mttrPromise = fetchTimeSeries({
        metric: 'mttr',
        period: 'day',
        from: params.from,
        to: params.to,
      });
      
      const [mttdData, mttrData] = await Promise.all([mttdPromise, mttrPromise]);
      
      return {
        mttd: mttdData,
        mttr: mttrData,
      };
    },
    refetchInterval: 5 * 60 * 1000,
    staleTime: 2 * 60 * 1000,
  });
}

// Hook for compliance metrics
export function useComplianceMetrics(params: { from: string; to: string }) {
  return useQuery({
    queryKey: ['analytics', 'compliance', params],
    queryFn: () => fetchTopN({
      metric: 'compliance-status',
      from: params.from,
      to: params.to,
    }),
    refetchInterval: 5 * 60 * 1000,
    staleTime: 2 * 60 * 1000,
  });
}