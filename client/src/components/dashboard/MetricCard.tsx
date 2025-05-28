import { FC, useState } from "react";
import { ArrowDown, ArrowUp, Minus, Info, Clock, AlertTriangle, Calendar } from "lucide-react";
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";

interface MetricCardProps {
  label: string;
  value: number;
  subvalue?: string;
  trend?: 'up' | 'down' | 'stable';
  changePercentage?: number;
  progressPercent: number;
  severity?: 'critical' | 'high' | 'medium' | 'low' | 'info';
  description?: string;
  lastUpdated?: Date;
  onClick?: () => void;
}

const MetricCard: FC<MetricCardProps> = ({ 
  label, 
  value, 
  subvalue, 
  trend = 'stable', 
  changePercentage = 0, 
  progressPercent,
  severity = 'info',
  description,
  lastUpdated,
  onClick
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
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
  
  // Add a metric icon based on type
  const getMetricIcon = (label: string) => {
    if (label.includes('Alert')) return <AlertTriangle className="h-4 w-4 text-red-500" />;
    if (label.includes('Risk')) return <AlertTriangle className="h-4 w-4 text-orange-500" />;
    if (label.includes('MTTD') || label.includes('MTTR')) return <Clock className="h-4 w-4 text-blue-500" />;
    if (label.includes('Compliance')) return <Calendar className="h-4 w-4 text-green-500" />;
    return null;
  };
  
  return (
    <div 
      className={`bg-card rounded-lg p-4 border border-border hover:shadow-md transition-shadow duration-200 ${onClick ? 'cursor-pointer' : ''}`}
      onClick={() => {
        if (onClick) onClick();
        setIsExpanded(!isExpanded);
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center">
          {getMetricIcon(label)}
          <h3 className={`text-sm font-medium ${getMetricIcon(label) ? 'ml-2' : ''} ${severity === 'critical' ? 'text-destructive' : 'text-muted-foreground'}`}>
            {label}
          </h3>
        </div>
        {description && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-5 w-5 p-0" onClick={(e) => e.stopPropagation()}>
                  <Info className="h-4 w-4 text-muted-foreground" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="max-w-xs text-xs">{description}</p>
                {lastUpdated && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Updated {formatDistanceToNow(lastUpdated, { addSuffix: true })}
                  </p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      <div className="flex items-baseline space-x-2">
        <span className={`text-2xl font-semibold ${severity === 'critical' ? 'text-destructive' : ''}`}>
          {value}
        </span>
        {subvalue && <span className="text-sm text-muted-foreground">({subvalue})</span>}
      </div>
      
      <div className="mt-3 flex items-center justify-between mb-1">
        <div className="text-xs text-muted-foreground">
          {trend === 'stable' ? 'No change' : trend === 'up' ? 'Increasing' : 'Decreasing'}
        </div>
        {trend && changePercentage !== undefined && (
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex items-center ${getTrendColor(trend, severity)}`}>
            {getTrendIcon(trend)}
            <span>{trend === 'stable' ? 'Stable' : `${trend === 'down' ? '' : '+'}${changePercentage}%`}</span>
          </span>
        )}
      </div>
      
      <div className="mt-2 h-2 w-full bg-secondary rounded-full overflow-hidden">
        <div 
          className={`h-full ${getProgressGradient(severity)} rounded-full transition-all duration-500`} 
          style={{ width: `${progressPercent}%` }}
        ></div>
      </div>
      
      {isExpanded && description && (
        <div className="mt-3 text-xs text-muted-foreground border-t border-border pt-2">
          {description}
        </div>
      )}
    </div>
  );
};

export default MetricCard;

export default MetricCard;
