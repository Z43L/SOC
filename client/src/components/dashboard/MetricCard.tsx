import { FC } from "react";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: number;
  subvalue?: string;
  trend?: 'up' | 'down' | 'stable';
  changePercentage?: number;
  progressPercent: number;
  severity?: 'critical' | 'high' | 'medium' | 'low' | 'info';
}

const MetricCard: FC<MetricCardProps> = ({ 
  label, 
  value, 
  subvalue, 
  trend = 'stable', 
  changePercentage = 0, 
  progressPercent,
  severity = 'info'
}) => {
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-destructive text-destructive-foreground';
      case 'high': return 'bg-red-700 text-red-500';
      case 'medium': return 'bg-orange-700 text-orange-500';
      case 'low': return 'bg-green-900 text-green-500';
      case 'info': return 'bg-blue-900 text-blue-500';
      default: return 'bg-blue-900 text-blue-500';
    }
  };
  
  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up': return <ArrowUp className="h-3 w-3 mr-1" />;
      case 'down': return <ArrowDown className="h-3 w-3 mr-1" />;
      case 'stable': return <Minus className="h-3 w-3 mr-1" />;
      default: return null;
    }
  };
  
  const getTrendColor = (trend: string, severity: string) => {
    if (severity === 'critical' || severity === 'high') {
      return trend === 'up' ? 'bg-destructive bg-opacity-20 text-destructive' : 'bg-green-900 bg-opacity-20 text-green-500';
    }
    
    if (severity === 'medium') {
      return trend === 'up' ? 'bg-orange-900 bg-opacity-20 text-orange-500' : 'bg-blue-900 bg-opacity-20 text-blue-500';
    }
    
    return trend === 'up' ? 'bg-green-900 bg-opacity-20 text-green-500' : 'bg-blue-900 bg-opacity-20 text-blue-500';
  };
  
  const getProgressGradient = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-gradient-to-r from-orange-700 via-red-700 to-destructive';
      case 'high': return 'bg-gradient-to-r from-orange-700 to-red-700';
      case 'medium': return 'bg-gradient-to-r from-green-700 to-orange-700';
      case 'low': return 'bg-green-700';
      case 'info': return 'bg-blue-700';
      default: return 'bg-blue-700';
    }
  };
  
  return (
    <div className="bg-card rounded-lg p-4 border border-border">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-muted-foreground">{label}</h3>
        {trend && changePercentage !== undefined && (
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex items-center ${getTrendColor(trend, severity)}`}>
            {getTrendIcon(trend)}
            <span>{trend === 'stable' ? 'Stable' : `${trend === 'down' ? '' : '+'}${changePercentage}%`}</span>
          </span>
        )}
      </div>
      <div className="flex items-baseline space-x-2">
        <span className="text-2xl font-semibold">{value}</span>
        {subvalue && <span className="text-sm text-muted-foreground">({subvalue})</span>}
      </div>
      <div className="mt-4 h-2 w-full bg-secondary rounded-full overflow-hidden">
        <div 
          className={`h-full ${getProgressGradient(severity)} rounded-full`} 
          style={{ width: `${progressPercent}%` }}
        ></div>
      </div>
    </div>
  );
};

export default MetricCard;
