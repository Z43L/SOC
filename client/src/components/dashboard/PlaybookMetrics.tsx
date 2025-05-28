import { FC } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  TooltipProps
} from 'recharts';
import { Play, CheckCircle, XCircle, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface PlaybookExecutionData {
  date: string;
  successful: number;
  failed: number;
  total: number;
}

interface PlaybookMetricsProps {
  data: PlaybookExecutionData[];
  todayStats: {
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
    successRate: number;
  };
}

const PlaybookMetrics: FC<PlaybookMetricsProps> = ({ data, todayStats }) => {
  const CustomTooltip = ({ active, payload, label }: TooltipProps<number, string>) => {
    if (active && payload && payload.length) {
      const total = (payload[0]?.value || 0) + (payload[1]?.value || 0);
      const successRate = total > 0 ? ((payload[0]?.value || 0) / total * 100).toFixed(1) : '0';
      
      return (
        <div className="bg-card border border-border rounded p-3 text-xs shadow-lg">
          <p className="font-medium mb-2">{label}</p>
          {payload.map((entry) => (
            <div key={`tooltip-${entry.name}`} className="flex justify-between items-center mb-1">
              <span className="mr-3" style={{ color: entry.color }}>{entry.name}:</span>
              <span>{entry.value}</span>
            </div>
          ))}
          <div className="border-t border-border mt-2 pt-2">
            <div className="flex justify-between">
              <span>Success Rate:</span>
              <span className="font-medium">{successRate}%</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  const getStatusColor = (rate: number) => {
    if (rate >= 95) return 'text-green-600';
    if (rate >= 80) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getStatusIcon = (rate: number) => {
    if (rate >= 95) return <CheckCircle className="h-4 w-4 text-green-600" />;
    if (rate >= 80) return <Clock className="h-4 w-4 text-yellow-600" />;
    return <XCircle className="h-4 w-4 text-red-600" />;
  };

  return (
    <Card className="h-80">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-md font-medium flex items-center">
          <Play className="h-4 w-4 mr-2" />
          Playbook Execution
        </CardTitle>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div className="text-center">
            <div className="text-lg font-semibold text-blue-600">
              {todayStats.totalRuns}
            </div>
            <div className="text-xs text-muted-foreground">Total Runs</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-green-600">
              {todayStats.successfulRuns}
            </div>
            <div className="text-xs text-muted-foreground">Successful</div>
          </div>
          <div className="text-center">
            <div className={`text-lg font-semibold flex items-center justify-center ${getStatusColor(todayStats.successRate)}`}>
              {getStatusIcon(todayStats.successRate)}
              <span className="ml-1">{todayStats.successRate.toFixed(1)}%</span>
            </div>
            <div className="text-xs text-muted-foreground">Success Rate</div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 h-48">
        {data && data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
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
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar 
                dataKey="successful" 
                name="Successful"
                stackId="a" 
                fill="#10B981"
                radius={[4, 4, 0, 0]}
              />
              <Bar 
                dataKey="failed" 
                name="Failed"
                stackId="a" 
                fill="#EF4444"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <Play className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No playbook execution data</p>
              <p className="text-xs mt-1">Automation metrics will appear here</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PlaybookMetrics;