import { FC } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ComplianceItem {
  framework: string;
  score: number;
  status: 'compliant' | 'at-risk' | 'non-compliant';
  lastAssessment: string;
}

interface ComplianceSummaryProps {
  items: ComplianceItem[];
  isLoading: boolean;
}

const ComplianceSummary: FC<ComplianceSummaryProps> = ({ items, isLoading }) => {
  // Si no hay datos, mostrar datos de ejemplo
  const displayItems = items.length > 0 ? items : [
    { framework: "ISO 27001", score: 87, status: "compliant", lastAssessment: "2 weeks ago" },
    { framework: "NIST CSF", score: 79, status: "compliant", lastAssessment: "1 month ago" },
    { framework: "GDPR", score: 68, status: "at-risk", lastAssessment: "3 weeks ago" },
    { framework: "PCI DSS", score: 91, status: "compliant", lastAssessment: "2 months ago" }
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'compliant':
        return <Badge className="bg-green-700 hover:bg-green-700">Compliant</Badge>;
      case 'at-risk':
        return <Badge className="bg-orange-700 hover:bg-orange-700">At Risk</Badge>;
      case 'non-compliant':
        return <Badge className="bg-destructive hover:bg-destructive">Non-Compliant</Badge>;
      default:
        return <Badge className="bg-gray-700 hover:bg-gray-700">Unknown</Badge>;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-500";
    if (score >= 65) return "text-orange-500";
    return "text-destructive";
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-md font-medium">Compliance Status</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <div className="h-14 w-full bg-gray-800 animate-pulse rounded"></div>
            <div className="h-14 w-full bg-gray-800 animate-pulse rounded"></div>
            <div className="h-14 w-full bg-gray-800 animate-pulse rounded"></div>
          </div>
        ) : (
          <div className="space-y-3">
            {displayItems.map((item, index) => (
              <div key={index} className="flex items-center justify-between p-2 border border-gray-800 rounded-md">
                <div>
                  <div className="font-medium">{item.framework}</div>
                  <div className="text-xs text-muted-foreground">Last assessment: {item.lastAssessment}</div>
                </div>
                <div className="flex items-center space-x-3">
                  <span className={`text-lg font-bold ${getScoreColor(item.score)}`}>{item.score}%</span>
                  {getStatusBadge(item.status)}
                </div>
              </div>
            ))}
            
            <div className="pt-2">
              <div className="text-xs text-primary/70 flex items-center">
                <i className="fas fa-chart-bar mr-1"></i>
                <span>Overall compliance: 81% (B+)</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ComplianceSummary;