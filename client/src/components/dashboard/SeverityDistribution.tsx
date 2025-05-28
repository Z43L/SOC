import { FC } from 'react';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Tooltip, 
  Legend,
  TooltipProps
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface SeverityData {
  name: string;
  value: number;
  color: string;
}

interface SeverityDistributionProps {
  data: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

const SeverityDistribution: FC<SeverityDistributionProps> = ({ data }) => {
  const chartData: SeverityData[] = [
    { name: 'Critical', value: data.critical || 0, color: '#DC2626' },
    { name: 'High', value: data.high || 0, color: '#F59E0B' },
    { name: 'Medium', value: data.medium || 0, color: '#3B82F6' },
    { name: 'Low', value: data.low || 0, color: '#10B981' },
  ];

  const total = chartData.reduce((sum, item) => sum + item.value, 0);

  const CustomTooltip = ({ active, payload }: TooltipProps<number, string>) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      const percentage = total > 0 ? ((data.value || 0) / total * 100).toFixed(1) : '0';
      
      return (
        <div className="bg-card border border-border rounded p-2 text-xs shadow-lg">
          <p className="font-medium" style={{ color: data.payload.color }}>
            {data.payload.name}
          </p>
          <p>Count: {data.value}</p>
          <p>Percentage: {percentage}%</p>
        </div>
      );
    }
    return null;
  };

  const CustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    if (percent < 0.05) return null; // Don't show labels for very small slices
    
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text 
        x={x} 
        y={y} 
        fill="white" 
        textAnchor={x > cx ? 'start' : 'end'} 
        dominantBaseline="central"
        fontSize={12}
        fontWeight="bold"
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    <Card className="h-80">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-md font-medium">Alert Severity Distribution</CardTitle>
        <div className="text-sm text-muted-foreground">
          Total alerts: {total}
        </div>
      </CardHeader>
      <CardContent className="p-4 h-64">
        {total > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={CustomLabel}
                outerRadius={80}
                innerRadius={40}
                fill="#8884d8"
                dataKey="value"
                stroke="none"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                formatter={(value, entry) => (
                  <span className="text-xs" style={{ color: entry.color }}>
                    {value} ({entry.payload.value})
                  </span>
                )}
                iconSize={8}
                wrapperStyle={{ fontSize: '12px' }}
              />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <p>No alert data available</p>
              <p className="text-xs mt-1">Severity distribution will appear here when alerts are detected</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SeverityDistribution;