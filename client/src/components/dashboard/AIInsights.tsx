import { FC } from 'react';
import { AiInsight } from '@shared/schema';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bot, RefreshCw, Loader2 } from 'lucide-react';

interface AIInsightsProps {
  insights: AiInsight[];
  isLoading: boolean;
}

const AIInsights: FC<AIInsightsProps> = ({ insights, isLoading }) => {
  // Fallback para asegurar que insights sea un array
  const displayInsights = Array.isArray(insights) ? insights : [];
  
  const getBorderColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'border-destructive';
      case 'high': return 'border-red-700';
      case 'medium': return 'border-orange-500';
      case 'low': return 'border-green-500';
      default: return 'border-blue-500';
    }
  };
  
  const getConfidenceColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-destructive';
      case 'high': return 'text-red-500';
      case 'medium': return 'text-orange-500';
      case 'low': return 'text-green-500';
      default: return 'text-blue-500';
    }
  };
  
  return (
    <Card className="h-80">
      <CardHeader className="p-4 pb-0 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-md font-medium flex items-center">
          <Bot className="h-4 w-4 mr-2 text-primary" />
          AI Insights
        </CardTitle>
        <Button variant="ghost" size="icon" className="h-7 w-7">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="p-4 overflow-y-auto h-64">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            <span>Loading insights...</span>
          </div>
        ) : displayInsights.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Bot className="h-12 w-12 mb-2 opacity-20" />
            <p>No AI insights available</p>
          </div>
        ) : (
          displayInsights.map((insight) => (
            <div 
              key={insight.id}
              className={`mb-4 p-3 bg-muted/40 rounded-lg border-l-4 ${getBorderColor(insight.severity)}`}
            >
              <p className="text-sm font-medium mb-1">{insight.title}</p>
              <p className="text-xs text-muted-foreground mb-2">{insight.description}</p>
              <div className="flex justify-between items-center mt-2">
                <span className={`text-xs ${getConfidenceColor(insight.severity)} font-medium`}>
                  Confidence: {insight.confidence}%
                </span>
                <Button variant="link" className="text-xs p-0 h-auto">
                  {insight.type === 'detection' ? 'Investigate' : 'View Details'}
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
};

export default AIInsights;
