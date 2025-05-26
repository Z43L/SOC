import { FC } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  TooltipProps
} from 'recharts';
import { MoreVertical } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface ThreatDataItem {
  day: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

interface ThreatDetectionChartProps {
  data: ThreatDataItem[];
}

const ThreatDetectionChart: FC<ThreatDetectionChartProps> = ({ data }) => {
  // Asegurarse de que siempre haya datos para la gráfica
  const chartData = data && data.length > 0 ? data : [];

  const CustomTooltip = ({ active, payload, label }: TooltipProps<number, string>) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-border rounded p-2 text-xs shadow-lg">
          <p className="font-medium mb-1">{label}</p>
          {payload.map((entry) => (
            <div key={`tooltip-${entry.name}`} className="flex justify-between items-center mb-1">
              <span className="mr-2" style={{ color: entry.color }}>{entry.name}:</span>
              <span>{entry.value}</span>
            </div>
          ))}
          <p className="text-xs border-t border-border mt-1 pt-1">
            Total: {
              payload.reduce((sum, entry) => sum + (Number(entry.value) || 0), 0)
            }
          </p>
        </div>
      );
    }
  
    return null;
  };

  return (
    <Card className="h-80">
      <CardHeader className="p-4 pb-0 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-md font-medium">Threat Detection Summary</CardTitle>
        <div className="flex items-center space-x-1">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">Daily</Button>
          <Button variant="secondary" size="sm" className="h-7 px-2 text-xs">Weekly</Button>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">Monthly</Button>
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-4 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{
              top: 0,
              right: 0,
              left: -20,
              bottom: 0,
            }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
            <XAxis 
              dataKey="day" 
              tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} 
              axisLine={{ stroke: 'var(--border)' }}
            />
            <YAxis 
              tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} 
              axisLine={{ stroke: 'var(--border)' }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend 
              formatter={(value) => <span className="text-xs">{value}</span>}
              iconSize={8}
              wrapperStyle={{ fontSize: '12px', bottom: 0 }}
            />
            <Bar 
              dataKey="critical" 
              name="Critical" 
              stackId="a" 
              fill="var(--destructive)" 
              radius={[4, 4, 0, 0]}
            />
            <Bar 
              dataKey="high" 
              name="High" 
              stackId="a" 
              fill="#F44336" 
              radius={[4, 4, 0, 0]}
            />
            <Bar 
              dataKey="medium" 
              name="Medium" 
              stackId="a" 
              fill="#FFB74D" 
              radius={[4, 4, 0, 0]}
            />
            <Bar 
              dataKey="low" 
              name="Low" 
              stackId="a" 
              fill="#4CAF50" 
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

export default ThreatDetectionChart;
