import { FC } from 'react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  TooltipProps,
  ReferenceLine
} from 'recharts';
import { Clock, TrendingDown, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface MttaMetricsData {
  date: string;
  mtta: number; // Mean Time to Acknowledge (hours)
  mttr: number; // Mean Time to Resolution (hours) 
}

interface MttaMetricsProps {
  data: MttaMetricsData[];
  currentMtta: number;
  currentMttr: number;
}

const MttaMetrics: FC<MttaMetricsProps> = ({ data, currentMtta, currentMttr }) => {
  // Calculate P95 lines (95th percentile benchmark)
  const p95Mtta = 2; // 2 hours benchmark
  const p95Mttr = 4; // 4 hours benchmark

  const CustomTooltip = ({ active, payload, label }: TooltipProps<number, string>) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-border rounded p-3 text-xs shadow-lg">
          <p className="font-medium mb-2">{label}</p>
          {payload.map((entry) => (
            <div key={`tooltip-${entry.name}`} className="flex justify-between items-center mb-1">
              <span className="mr-3" style={{ color: entry.color }}>{entry.name}:</span>
              <span>{entry.value?.toFixed(1)}h</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  const getTimeDisplay = (hours: number) => {
    if (hours < 1) {
      return `${Math.round(hours * 60)}m`;
    }
    return `${hours.toFixed(1)}h`;
  };

  const getTrendIcon = (current: number, benchmark: number) => {
    if (current < benchmark) {
      return <TrendingDown className="h-4 w-4 text-green-500" />;
    }
    return <TrendingUp className="h-4 w-4 text-red-500" />;
  };

  return (
    <Card className="h-80">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-md font-medium flex items-center">
          <Clock className="h-4 w-4 mr-2" />
          Response Times (MTTA & MTTR)
        </CardTitle>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">MTTA</span>
              {getTrendIcon(currentMtta, p95Mtta)}
            </div>
            <div className="text-lg font-semibold text-blue-600">
              {getTimeDisplay(currentMtta)}
            </div>
            <div className="text-xs text-muted-foreground">
              Target: ≤{getTimeDisplay(p95Mtta)}
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">MTTR</span>
              {getTrendIcon(currentMttr, p95Mttr)}
            </div>
            <div className="text-lg font-semibold text-orange-600">
              {getTimeDisplay(currentMttr)}
            </div>
            <div className="text-xs text-muted-foreground">
              Target: ≤{getTimeDisplay(p95Mttr)}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 h-48">
        {data && data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{
                top: 5,
                right: 5,
                left: -20,
                bottom: 5,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis 
                dataKey="date" 
                tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} 
                axisLine={{ stroke: 'var(--border)' }}
              />
              <YAxis 
                tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} 
                axisLine={{ stroke: 'var(--border)' }}
                label={{ value: 'Hours', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }}
              />
              <Tooltip content={<CustomTooltip />} />
              
              {/* P95 Reference Lines */}
              <ReferenceLine 
                y={p95Mtta} 
                stroke="#3B82F6" 
                strokeDasharray="5 5" 
                label={{ value: "MTTA P95", position: "topRight", fontSize: 10 }}
              />
              <ReferenceLine 
                y={p95Mttr} 
                stroke="#F59E0B" 
                strokeDasharray="5 5"
                label={{ value: "MTTR P95", position: "topRight", fontSize: 10 }}
              />
              
              <Line 
                type="monotone" 
                dataKey="mtta" 
                name="MTTA"
                stroke="#3B82F6" 
                strokeWidth={2}
                dot={{ fill: '#3B82F6', strokeWidth: 0, r: 3 }}
                activeDot={{ r: 4 }}
              />
              <Line 
                type="monotone" 
                dataKey="mttr" 
                name="MTTR"
                stroke="#F59E0B" 
                strokeWidth={2}
                dot={{ fill: '#F59E0B', strokeWidth: 0, r: 3 }}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No timing data available</p>
              <p className="text-xs mt-1">Response time metrics will appear here</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MttaMetrics;