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
  AreaChart,
  Area
} from 'recharts';
import { Activity, Cpu, HardDrive, Wifi, WifiOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface AgentHealthData {
  timestamp: string;
  onlineAgents: number;
  totalAgents: number;
  avgCpu: number;
  avgMemory: number;
  avgLatency: number;
}

interface AgentMetricsProps {
  data: AgentHealthData[];
  currentStats: {
    onlineAgents: number;
    totalAgents: number;
    healthPercentage: number;
    avgLatency: number;
    topAgents: Array<{
      id: string;
      name: string;
      cpu: number;
      memory: number;
      status: 'online' | 'offline' | 'warning';
    }>;
  };
}

const AgentMetrics: FC<AgentMetricsProps> = ({ data, currentStats }) => {
  const CustomTooltip = ({ active, payload, label }: TooltipProps<number, string>) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-border rounded p-3 text-xs shadow-lg">
          <p className="font-medium mb-2">{label}</p>
          {payload.map((entry) => (
            <div key={`tooltip-${entry.name}`} className="flex justify-between items-center mb-1">
              <span className="mr-3" style={{ color: entry.color }}>{entry.name}:</span>
              <span>
                {entry.name?.includes('Latency') ? `${entry.value}ms` : 
                 entry.name?.includes('CPU') || entry.name?.includes('Memory') ? `${entry.value}%` :
                 entry.value}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'text-green-600';
      case 'warning': return 'text-yellow-600';
      case 'offline': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusIcon = (status: string, size = 'h-3 w-3') => {
    switch (status) {
      case 'online': return <Wifi className={`${size} text-green-600`} />;
      case 'warning': return <Activity className={`${size} text-yellow-600`} />;
      case 'offline': return <WifiOff className={`${size} text-red-600`} />;
      default: return <Activity className={`${size} text-gray-600`} />;
    }
  };

  const healthColor = currentStats.healthPercentage >= 90 ? 'text-green-600' : 
                     currentStats.healthPercentage >= 70 ? 'text-yellow-600' : 'text-red-600';

  return (
    <Card className="h-80">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-md font-medium flex items-center">
          <Activity className="h-4 w-4 mr-2" />
          Agent Health & Performance
        </CardTitle>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div className="text-center">
            <div className="text-lg font-semibold text-blue-600">
              {currentStats.onlineAgents}/{currentStats.totalAgents}
            </div>
            <div className="text-xs text-muted-foreground">Online/Total</div>
          </div>
          <div className="text-center">
            <div className={`text-lg font-semibold ${healthColor}`}>
              {currentStats.healthPercentage.toFixed(0)}%
            </div>
            <div className="text-xs text-muted-foreground">Health</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-purple-600">
              {currentStats.avgLatency}ms
            </div>
            <div className="text-xs text-muted-foreground">Avg Latency</div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 h-48">
        <div className="grid grid-cols-2 gap-4 h-full">
          {/* Performance Chart */}
          <div className="h-full">
            {data && data.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
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
                    dataKey="timestamp" 
                    tick={{ fill: 'var(--muted-foreground)', fontSize: 9 }} 
                    axisLine={{ stroke: 'var(--border)' }}
                  />
                  <YAxis 
                    tick={{ fill: 'var(--muted-foreground)', fontSize: 9 }} 
                    axisLine={{ stroke: 'var(--border)' }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area 
                    type="monotone" 
                    dataKey="avgLatency" 
                    name="Avg Latency"
                    stroke="#8B5CF6" 
                    fill="#8B5CF6"
                    fillOpacity={0.3}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
                No performance data
              </div>
            )}
          </div>

          {/* Top Agents List */}
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground mb-2">Top Resource Usage</h4>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {currentStats.topAgents.slice(0, 4).map((agent) => (
                <div key={agent.id} className="flex items-center justify-between text-xs p-2 bg-muted/50 rounded">
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(agent.status)}
                    <span className="font-medium truncate max-w-16">{agent.name}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="flex items-center space-x-1">
                      <Cpu className="h-3 w-3" />
                      <span className={agent.cpu > 80 ? 'text-red-600' : ''}>{agent.cpu}%</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <HardDrive className="h-3 w-3" />
                      <span className={agent.memory > 80 ? 'text-red-600' : ''}>{agent.memory}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {currentStats.topAgents.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-4">
                No agent data available
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default AgentMetrics;